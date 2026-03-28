export const STORAGE_KEY = "poker-sessions-v2";
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
