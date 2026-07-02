import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

const DATA_KEY = "poker-sessions-v2";
const SNAP_PREFIX = `${DATA_KEY}:snap:`;
const SNAP_KEEP = 20;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  return createClient(url, key);
}

async function parseBody(req) {
  // Vercel auto-parses JSON bodies — but fall back to manual stream reading if not
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function tryParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

// The payload replaces the entire dataset, so reject anything that isn't
// plausibly a session array before it can clobber the stored copy.
function isValidSessions(x) {
  return Array.isArray(x) && x.every(s =>
    s && typeof s === "object" &&
    typeof s.id === "string" &&
    Array.isArray(s.players) &&
    s.players.every(p => p && typeof p.name === "string" && Array.isArray(p.buyins))
  );
}

export default async function handler(req, res) {
  // Admin data is per-secret, never cacheable at the edge or in the browser
  res.setHeader("Cache-Control", "no-store");

  const adminSecret = req.headers["x-admin-secret"];
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: "Server not configured: missing ADMIN_API_SECRET" });
  }
  const secretMatch = adminSecret &&
    adminSecret.length === expectedSecret.length &&
    timingSafeEqual(Buffer.from(adminSecret), Buffer.from(expectedSecret));
  if (!secretMatch) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("poker_data")
      .select("value, updated_at")
      .eq("key", DATA_KEY)
      .single();
    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      res.setHeader("X-Data-Version", "");
      return res.status(200).json([]);
    }
    const sessions = tryParse(data.value);
    if (sessions === null) {
      return res.status(500).json({ error: "Stored data is corrupted" });
    }
    res.setHeader("X-Data-Version", data.updated_at || "");
    return res.status(200).json(sessions);
  }

  if (req.method === "POST") {
    let sessions;
    try {
      sessions = await parseBody(req);
    } catch (e) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if (!isValidSessions(sessions)) {
      return res.status(400).json({ error: "Body is not a valid session array" });
    }

    const { data: cur, error: readError } = await supabase
      .from("poker_data")
      .select("value, updated_at")
      .eq("key", DATA_KEY)
      .single();
    if (readError && readError.code !== "PGRST116") {
      return res.status(500).json({ error: readError.message });
    }

    const curSessions = cur ? tryParse(cur.value) ?? [] : [];

    // A payload identical to what's stored is a no-op — succeed regardless of
    // the base version. This absorbs client retries of a save that actually
    // committed (response lost in transit) without a false conflict, and
    // avoids burning a snapshot slot on every identical save-back after load.
    if (cur && cur.value === JSON.stringify(sessions)) {
      return res.status(200).json({ ok: true, version: cur.updated_at });
    }

    // Optimistic concurrency: clients echo the version they loaded. A stale
    // base means another device saved since — reject instead of clobbering.
    // Clients that send no version (old cached bundles) keep last-write-wins.
    const base = req.headers["x-base-version"];
    if (cur && base && cur.updated_at && base !== cur.updated_at) {
      return res.status(409).json({ error: "Version conflict", sessions: curSessions, version: cur.updated_at });
    }

    // Deleting sessions one at a time can never produce this; only a client
    // holding bogus empty state can, so refuse to wipe the history.
    if (sessions.length === 0 && curSessions.length > 1) {
      return res.status(400).json({ error: "Refusing to overwrite existing sessions with an empty list" });
    }

    const newVersion = new Date().toISOString();

    if (cur) {
      // Keep the previous blob as a snapshot row so any bad write is recoverable
      const { error: snapError } = await supabase
        .from("poker_data")
        .upsert({ key: SNAP_PREFIX + (cur.updated_at || "unversioned"), value: cur.value, updated_at: cur.updated_at });
      if (snapError) return res.status(500).json({ error: snapError.message });

      // Compare-and-swap on updated_at so two saves racing between our read
      // and write can't silently overwrite each other
      let update = supabase
        .from("poker_data")
        .update({ value: JSON.stringify(sessions), updated_at: newVersion })
        .eq("key", DATA_KEY);
      update = cur.updated_at ? update.eq("updated_at", cur.updated_at) : update.is("updated_at", null);
      const { data: updated, error: writeError } = await update.select("key");
      if (writeError) return res.status(500).json({ error: writeError.message });
      if (!updated || updated.length === 0) {
        const { data: fresh } = await supabase
          .from("poker_data").select("value, updated_at").eq("key", DATA_KEY).single();
        return res.status(409).json({
          error: "Version conflict",
          sessions: fresh ? tryParse(fresh.value) ?? [] : [],
          version: fresh?.updated_at || ""
        });
      }
    } else {
      const { error: insertError } = await supabase
        .from("poker_data")
        .insert({ key: DATA_KEY, value: JSON.stringify(sessions), updated_at: newVersion });
      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    // Prune snapshots beyond the most recent SNAP_KEEP (ISO keys sort chronologically)
    const { data: snaps } = await supabase
      .from("poker_data")
      .select("key")
      .like("key", `${SNAP_PREFIX}%`)
      .order("key", { ascending: false });
    if (snaps && snaps.length > SNAP_KEEP) {
      await supabase.from("poker_data").delete().in("key", snaps.slice(SNAP_KEEP).map(s => s.key));
    }

    return res.status(200).json({ ok: true, version: newVersion });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
