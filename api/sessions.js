import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

const DATA_KEY = "poker-sessions-v2";

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

export default async function handler(req, res) {
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
      .select("value")
      .eq("key", DATA_KEY)
      .single();
    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data ? JSON.parse(data.value) : []);
  }

  if (req.method === "POST") {
    let sessions;
    try {
      sessions = await parseBody(req);
    } catch (e) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { error: writeError } = await supabase
      .from("poker_data")
      .upsert({ key: DATA_KEY, value: JSON.stringify(sessions), updated_at: new Date().toISOString() });
    if (writeError) return res.status(500).json({ error: writeError.message });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
