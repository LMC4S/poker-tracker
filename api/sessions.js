import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

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
      .from("poker_sessions")
      .select("id, data, updated_at")
      .is("deleted_at", null);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    const sessions = (data || [])
      .map(row => ({ id: row.id, ...row.data }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    // Pre-v3 clients echo this as their base version; give them the newest
    // per-row stamp so their change detection still works
    const maxVersion = (data || []).reduce((m, r) => r.updated_at > m ? r.updated_at : m, "");
    res.setHeader("X-Data-Version", maxVersion);
    return res.status(200).json(sessions);
  }

  // Transitional write path for pre-v3 bundles still open on a phone: they
  // POST the whole session array. Translate it into per-row upserts guarded
  // by each session's own updatedAt, and never delete anything — a stale tab
  // can add or update, but cannot wipe rows it doesn't know about. Remove
  // this path once every device has loaded the v3 bundle.
  if (req.method === "POST") {
    let sessions;
    try {
      sessions = await parseBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if (!isValidSessions(sessions)) {
      return res.status(400).json({ error: "Body is not a valid session array" });
    }

    const { data: rows, error: readError } = await supabase
      .from("poker_sessions")
      .select("id, updated_at, deleted_at");
    if (readError) {
      return res.status(500).json({ error: readError.message });
    }
    const existing = new Map((rows || []).map(r => [r.id, r]));

    for (const s of sessions) {
      const { id, ...data } = s;
      const cur = existing.get(id);
      // Deleted rows stay deleted — a stale blob must not resurrect them
      if (cur?.deleted_at) continue;
      const stamp = s.updatedAt || "";
      if (cur && stamp <= cur.updated_at) continue;
      const row = { id, data, share_token: s.shareToken ?? null, ended: !!s.ended, updated_at: stamp };
      const write = cur
        ? supabase.from("poker_sessions").update(row).eq("id", id).eq("updated_at", cur.updated_at)
        : supabase.from("poker_sessions").insert(row);
      const { error: writeError } = await write;
      if (writeError) {
        return res.status(500).json({ error: writeError.message });
      }
    }
    return res.status(200).json({ ok: true, version: new Date().toISOString() });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
