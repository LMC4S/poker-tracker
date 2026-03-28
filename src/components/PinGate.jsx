import { useState, useEffect } from "react";
import { SESSION_KEY, LOCKOUT_KEY, MAX_ATTEMPTS, LOCKOUT_MS, sha256, ADMIN_HASH, VIEW_HASH } from "../utils";
import { S, F, FB } from "../styles";

export default function PinGate({ children }) {
  const [role, setRole] = useState(() => sessionStorage.getItem(SESSION_KEY) || null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(() => {
    const d = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || "{}");
    if (d.until && Date.now() < d.until) return MAX_ATTEMPTS;
    if (d.until && Date.now() >= d.until) { localStorage.removeItem(LOCKOUT_KEY); }
    return d.attempts || 0;
  });
  const [lockedUntil, setLockedUntil] = useState(() => {
    const d = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || "{}");
    return d.until && Date.now() < d.until ? d.until : null;
  });

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        setAttempts(0);
        localStorage.removeItem(LOCKOUT_KEY);
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const submit = async () => {
    if (lockedUntil) return;
    const hash = await sha256(input);
    if (hash === ADMIN_HASH) {
      sessionStorage.setItem(SESSION_KEY, "admin");
      localStorage.removeItem(LOCKOUT_KEY);
      setRole("admin");
    } else if (hash === VIEW_HASH) {
      sessionStorage.setItem(SESSION_KEY, "view");
      localStorage.removeItem(LOCKOUT_KEY);
      setRole("view");
    } else {
      const newAttempts = attempts + 1;
      setInput("");
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: newAttempts, until }));
        setLockedUntil(until);
        setError(`Too many attempts. Locked for 15 minutes.`);
      } else {
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: newAttempts }));
        setAttempts(newAttempts);
        setError(`Incorrect password. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining.`);
        setTimeout(() => setError(""), 2000);
      }
    }
  };

  if (role) return children(role !== "view");

  const remaining = lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 1000) : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
      <div style={{ background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 16, padding: "48px 36px", width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5030", letterSpacing: "4px", textTransform: "uppercase", marginBottom: 6, fontFamily: FB }}>Home Game</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: "#2a0a08", letterSpacing: "4px", textTransform: "uppercase", marginBottom: 32, fontFamily: FB }}>Tracker</div>
        <input
          autoFocus
          type="password"
          autoComplete="one-time-code"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          disabled={!!lockedUntil}
          placeholder="Password"
          style={{
            width: "100%", padding: "14px", fontSize: 16,
            background: "#fbf0df", border: `1px solid ${error ? "#c0392b" : "#d4b898"}`,
            borderRadius: 8, color: "#2a0a08", outline: "none", boxSizing: "border-box",
            marginBottom: 12, transition: "border-color 0.2s", opacity: lockedUntil ? 0.4 : 1,
            fontFamily: F, letterSpacing: "2px"
          }}
        />
        {error && <div style={{ color: "#c0392b", fontSize: 11, marginBottom: 10, lineHeight: 1.5, letterSpacing: "0.5px" }}>{error}{remaining ? ` (${remaining}s)` : ""}</div>}
        <button
          onClick={submit}
          disabled={!!lockedUntil || !input}
          style={{
            width: "100%", padding: "13px",
            background: lockedUntil ? "#f0e0c4" : "#450206",
            color: lockedUntil ? "#7a5030" : "#ffffff",
            border: lockedUntil ? "1px solid #d4b898" : "none",
            borderRadius: 24, fontSize: 11, fontWeight: 700, cursor: lockedUntil ? "not-allowed" : "pointer",
            letterSpacing: "3px", textTransform: "uppercase", fontFamily: F
          }}
        >
          {lockedUntil ? `Locked (${remaining}s)` : "Enter"}
        </button>
      </div>
    </div>
  );
}
