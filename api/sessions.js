import { createClient } from "@supabase/supabase-js";

const DATA_KEY = "poker-sessions-v2";
const PUBLIC_KEY = "poker-public-v1";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  return createClient(url, key);
}

function computeSnapshot(sessions) {
  const ended = sessions.filter(s => s.ended);
  const thisYear = new Date().getFullYear();

  const sessionsThisYear = ended.filter(s => new Date(s.date).getFullYear() === thisYear).length;

  const allBuyins = [];
  ended.forEach(s => s.players.forEach(p => {
    const total = p.buyins.reduce((a, x) => a + x, 0);
    if (total > 0) allBuyins.push(total);
  }));
  const sorted = [...allBuyins].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const typicalBuyin = sorted.length > 0
    ? sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    : null;

  let longestMs = 0;
  ended.forEach(s => {
    if (s.date && s.endDate) {
      const ms = new Date(s.endDate) - new Date(s.date);
      if (ms > longestMs) longestMs = ms;
    }
  });
  const longestSession = longestMs > 0
    ? `${Math.floor(longestMs / 3600000)}h ${Math.floor((longestMs % 3600000) / 60000)}m`
    : null;

  let biggestWin = null, biggestLoss = null;
  ended.forEach(s => s.players.forEach(p => {
    if (p.cashout === null) return;
    const profit = p.cashout - p.buyins.reduce((a, x) => a + x, 0);
    if (biggestWin === null || profit > biggestWin) biggestWin = profit;
    if (biggestLoss === null || profit < biggestLoss) biggestLoss = profit;
  }));

  const seriesStats = { sessionsThisYear, typicalBuyin, longestSession, biggestWin, biggestLoss, thisYear };
  const recentEnded = [...ended].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  const activeSessions = sessions.filter(s => !s.ended);

  return { seriesStats, recentEnded, activeSessions, updatedAt: new Date().toISOString() };
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
  if (!adminSecret || adminSecret !== expectedSecret) {
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

    const snapshot = computeSnapshot(sessions);
    const { error: pubError } = await supabase
      .from("poker_public")
      .upsert({ key: PUBLIC_KEY, value: JSON.stringify(snapshot), updated_at: new Date().toISOString() });
    // Log but don't fail the whole save if public snapshot write fails
    if (pubError) console.error("poker_public write failed:", pubError.message);

    return res.status(200).json({ ok: true, pubError: pubError?.message || null });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
