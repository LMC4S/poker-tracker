import { createClient } from "@supabase/supabase-js";

const DATA_KEY = "poker-sessions-v2";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  return createClient(url, key);
}

// Aggregate series stats from the full history. Only these aggregate numbers
// (no names, no per-session detail) are returned to public viewers.
function computeSeriesStats(sessions) {
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

  return { sessionsThisYear, typicalBuyin, longestSession, biggestWin, biggestLoss, thisYear };
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

  return res.status(200).json({ session, seriesStats: computeSeriesStats(sessions) });
}
