import { createClient } from "@supabase/supabase-js";

const DATA_KEY = "poker-sessions-v2";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  return createClient(url, key);
}

// Public read path for a single shared session, gated by an unguessable token.
// Uses the service key (bypasses RLS) and returns only the one matching session,
// so the table is never enumerable by anon clients.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const { data, error } = await supabase
    .from("poker_data")
    .select("value")
    .eq("key", DATA_KEY)
    .single();
  if (error && error.code !== "PGRST116") {
    return res.status(500).json({ error: error.message });
  }

  const sessions = data ? JSON.parse(data.value) : [];
  const session = sessions.find(s => s.shareToken === token);
  if (!session) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.status(200).json(session);
}
