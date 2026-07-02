export const SESSION_KEY = "poker-unlocked";
export const LOCKOUT_KEY = "poker-lockout";
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const fmt = (n) => {
  const v = Math.abs(n);
  const s = v % 1 === 0 ? v.toString() : v.toFixed(2);
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : "0";
};

export const fmtMoney = (n) => {
  const v = Math.abs(n);
  return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`;
};

export const profitColor = () => "#2a0a08";

// "1h 22m" / "47m" from a millisecond span
export const fmtDuration = (ms) => {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

const TIME_OPTS = { hour: "numeric", minute: "2-digit" };
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, TIME_OPTS);

// Derives a session's endDate from the latest cash-out still in effect (mutates & returns).
// Players forget to hit "End Session", so the real end time is when the last player cashed out.
export const recomputeEndDate = (s) => {
  const times = s.players.filter(p => p.cashout !== null && p.cashoutAt).map(p => p.cashoutAt).sort();
  s.endDate = times.length ? times[times.length - 1] : null;
  return s;
};

// Appends a timestamped event to a session's log (mutates & returns the session)
export const logEvent = (s, type, player, amount) => {
  s.log = [...(s.log || []), { t: new Date().toISOString(), type, player, ...(amount != null ? { amount } : {}) }];
  return s;
};

// Human-readable description of a log entry
export const logLabel = (e) => {
  switch (e.type) {
    case "join":    return e.amount ? `${e.player} joined · ${fmtMoney(e.amount)}` : `${e.player} joined`;
    case "buyin":   return `${e.player} rebuy · ${fmtMoney(e.amount)}`;
    case "cashout": return `${e.player} cashed out · ${fmtMoney(e.amount)}`;
    case "undo":    return `${e.player} cash-out undone`;
    case "remove":  return `${e.player} removed`;
    default:        return e.player;
  }
};

// Interpolates red(r=-1) → beige(r=0) → green(r=+1), matching app palette
export const corrColor = (r) => {
  if (r === null) return "#e8d8c0";
  const t = (r + 1) / 2;
  const from = t < 0.5 ? [[220,100,90],[240,220,190]] : [[240,220,190],[130,190,130]];
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const rgb = from[0].map((c, i) => Math.round(c + (from[1][i] - c) * u));
  return `rgb(${rgb.join(",")})`;
};

export const CHART_COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#f87171", "#a78bfa", "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#fbbf24"];

export function exportJSON(sessions) {
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `poker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// Reconciles local and server session lists after a version conflict, at
// whole-session granularity. For a session present on both sides the newer
// per-session updatedAt stamp wins (a copy never touched locally has no stamp
// and defers to the server). Sessions only one side knows about are kept —
// except server copies of sessions deleted in this tab, which stay deleted.
// This can resurrect a session deleted on another device inside the conflict
// window; that beats silently losing an entry that was just typed in.
export const mergeSessions = (local, server, deletedIds) => {
  const merged = new Map();
  for (const s of server) {
    if (!deletedIds.has(s.id)) merged.set(s.id, s);
  }
  for (const s of local) {
    const remote = merged.get(s.id);
    if (!remote || (s.updatedAt || "") > (remote.updatedAt || "")) merged.set(s.id, s);
  }
  return [...merged.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
};
