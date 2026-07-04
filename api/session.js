import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  return createClient(url, key);
}

// Aggregate series stats from the full history. Only these aggregate numbers
// (no names, no per-session detail) are returned to public viewers — so unlike
// the admin's client-side mirror in src/views/HomeView.jsx, lastWinName is
// deliberately absent here. lastDate is raw: "days since" is computed on the
// client, because this function runs on a UTC clock and its response is
// edge-cached, so a precomputed day count could be stale or off by one.
function computeSeriesStats(sessions) {
  const ended = sessions.filter(s => s.ended);
  const thisYear = new Date().getFullYear();

  const endedThisYear = ended.filter(s => new Date(s.date).getFullYear() === thisYear);
  const sessionsThisYear = endedThisYear.length;

  const moneyThisYear = endedThisYear.length > 0
    ? endedThisYear.reduce((sum, s) =>
        sum + s.players.reduce((a, p) => a + p.buyins.reduce((x, y) => x + y, 0), 0), 0)
    : null;

  const last = ended.reduce((best, s) =>
    !best || new Date(s.date) > new Date(best.date) ? s : best, null);

  let lastWin = null;
  if (last) {
    last.players.forEach(p => {
      if (p.cashout === null) return;
      const profit = p.cashout - p.buyins.reduce((a, x) => a + x, 0);
      if (lastWin === null || profit > lastWin) lastWin = profit;
    });
  }

  return { sessionsThisYear, moneyThisYear, lastDate: last ? last.date : null, lastWin, thisYear };
}

// Public read path for a single shared session, gated by an unguessable token
// passed as ?token=. Uses the service key (bypasses RLS) and returns only the
// one matching session plus aggregate series stats, so the table is never
// enumerable by anon clients.
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

  // The stats need every session anyway (the table is tiny), so one query
  // serves both the token lookup and the aggregates
  const { data, error } = await supabase
    .from("poker_sessions")
    .select("id, data")
    .is("deleted_at", null);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const sessions = (data || []).map(row => ({ id: row.id, ...row.data }));
  const session = sessions.find(s => s.shareToken === token);
  if (!session) {
    // Cache misses briefly so a bot spraying bad tokens can't make every
    // request invoke this function and hit the database
    res.setHeader("Cache-Control", "public, s-maxage=15");
    return res.status(404).json({ error: "Not found" });
  }

  // Vercel's edge caches per-URL: many viewers polling the same link collapse
  // into one origin hit per window. TTLs are deliberately short and there is
  // no stale-while-revalidate — a revoked link must die within seconds, so
  // the cache lifetime is exactly how long a dead link can keep serving.
  res.setHeader(
    "Cache-Control",
    session.ended ? "public, s-maxage=30" : "public, s-maxage=5"
  );
  return res.status(200).json({ session, seriesStats: computeSeriesStats(sessions) });
}
