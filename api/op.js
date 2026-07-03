import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { applyOp, makeSession } from "../src/ops.js";

// Retries when another writer lands between our read and CAS write. Ops
// re-apply cleanly against the fresh row, so a short loop is enough.
const CAS_ATTEMPTS = 3;

const OP_TYPES = new Set([
  "createSession", "addPlayer", "rebuy", "cashout", "undoCashout",
  "removePlayer", "endSession", "reopenSession", "deleteSession",
  "revokeShare", "regenerateShare",
]);

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

function rowToSession(row) {
  return { id: row.id, ...row.data };
}

// The session's derived columns (share_token, ended, updated_at) are always
// recomputed from the object itself, so no op type needs special column
// handling here.
function sessionToRow(session) {
  const { id, ...data } = session;
  return {
    id,
    data,
    share_token: session.shareToken ?? null,
    ended: !!session.ended,
    updated_at: session.updatedAt || "",
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  let op;
  try {
    op = await parseBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { opId, sessionId, type, payload } = op || {};
  if (typeof opId !== "string" || !opId ||
      typeof sessionId !== "string" || !sessionId ||
      !OP_TYPES.has(type) ||
      (payload !== undefined && (payload === null || typeof payload !== "object"))) {
    return res.status(400).json({ error: "Invalid op" });
  }

  const readSession = async () => {
    const { data, error } = await supabase
      .from("poker_sessions")
      .select("id, data, updated_at, deleted_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  // Idempotency ledger: record the op before applying it. A duplicate op_id
  // means this exact op already committed on an attempt whose response was
  // lost in transit — the whole point of the design — so just return the
  // current state instead of applying twice.
  const { error: ledgerError } = await supabase
    .from("poker_ops")
    .insert({ op_id: opId, session_id: sessionId, type, payload: payload ?? null });
  if (ledgerError) {
    if (ledgerError.code === "23505") {
      try {
        const row = await readSession();
        if (!row || row.deleted_at) return res.status(200).json({ ok: true, deleted: true });
        return res.status(200).json({ ok: true, session: rowToSession(row), version: row.updated_at });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }
    return res.status(500).json({ error: ledgerError.message });
  }

  // From here on, a failure must remove the ledger row before reporting it —
  // otherwise the client's retry would be told "already applied" for an op
  // that never landed.
  const fail = async (status, body) => {
    await supabase.from("poker_ops").delete().eq("op_id", opId);
    return res.status(status).json(body);
  };

  try {
    if (type === "createSession") {
      const session = makeSession({ sessionId, payload });
      const { error } = await supabase.from("poker_sessions").insert(sessionToRow(session));
      if (error) {
        // Row already exists: an earlier create for this id committed
        if (error.code === "23505") {
          const row = await readSession();
          if (!row || row.deleted_at) return res.status(200).json({ ok: true, deleted: true });
          return res.status(200).json({ ok: true, session: rowToSession(row), version: row.updated_at });
        }
        return fail(500, { error: error.message });
      }
      return res.status(200).json({ ok: true, session, version: session.updatedAt });
    }

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await readSession();
      if (!row) return fail(404, { error: "Session not found" });
      // Ops queued before a delete landed elsewhere are moot; tell the client
      // to drop them (and the session)
      if (row.deleted_at) return res.status(200).json({ ok: true, deleted: true });

      if (type === "deleteSession") {
        const { data: updated, error } = await supabase
          .from("poker_sessions")
          .update({ deleted_at: new Date().toISOString(), updated_at: payload?.at || new Date().toISOString() })
          .eq("id", sessionId)
          .eq("updated_at", row.updated_at)
          .select("id");
        if (error) return fail(500, { error: error.message });
        if (updated && updated.length) return res.status(200).json({ ok: true, deleted: true });
        continue; // lost the CAS race — re-read and retry
      }

      const session = applyOp(rowToSession(row), { type, payload });
      const { data: updated, error } = await supabase
        .from("poker_sessions")
        .update(sessionToRow(session))
        .eq("id", sessionId)
        .eq("updated_at", row.updated_at)
        .select("id");
      if (error) return fail(500, { error: error.message });
      if (updated && updated.length) {
        return res.status(200).json({ ok: true, session, version: session.updatedAt });
      }
      // lost the CAS race — re-read and re-apply
    }
    return fail(503, { error: "Write contention, retry" });
  } catch (e) {
    return fail(500, { error: e.message });
  }
}
