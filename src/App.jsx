import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { supabase } from "./lib/supabase";

const STORAGE_KEY = "poker-sessions-v2";
const SUPER_ADMIN_HASH = import.meta.env.VITE_APP_SUPER_ADMIN_HASH || "";
const ADMIN_HASH = import.meta.env.VITE_APP_ADMIN_HASH || "";
const VIEW_HASH  = import.meta.env.VITE_APP_VIEW_HASH  || "";
const SESSION_KEY = "poker-unlocked";
const LOCKOUT_KEY = "poker-lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Helpers ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => {
  const v = Math.abs(n);
  const s = v % 1 === 0 ? v.toString() : v.toFixed(2);
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : "0";
};
const fmtMoney = (n) => {
  const v = Math.abs(n);
  return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`;
};
const profitColor = () => "#2a0a08";

// Interpolates red(r=-1) → beige(r=0) → green(r=+1), matching app palette
const corrColor = (r) => {
  if (r === null) return "#e8d8c0";
  const t = (r + 1) / 2;
  const from = t < 0.5 ? [[220,100,90],[240,220,190]] : [[240,220,190],[130,190,130]];
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const rgb = from[0].map((c, i) => Math.round(c + (from[1][i] - c) * u));
  return `rgb(${rgb.join(",")})`;
};

const CHART_COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#f87171", "#a78bfa", "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#fbbf24"];

// ─── Storage (Supabase with localStorage fallback) ───
async function loadSessions() {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("poker_data")
        .select("value")
        .eq("key", STORAGE_KEY)
        .single();
      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows found
      return data ? JSON.parse(data.value) : [];
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) {
    console.error("Load failed:", e);
    return null; // null = load error, distinct from [] = genuinely empty
  }
}

async function saveSessions(sessions) {
  try {
    if (supabase) {
      const { error } = await supabase
        .from("poker_data")
        .upsert({ key: STORAGE_KEY, value: JSON.stringify(sessions), updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (e) {
    console.error("Save failed:", e);
  }
}

// ─── Export / Restore ───
function exportJSON(sessions) {
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `poker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}


// ─── Icons ───
const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);
const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p}/>;
const TrashIcon = (p) => <Icon d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12zM10 11v6M14 11v6" {...p}/>;
const ChevronIcon = ({ dir = "right", ...p }) => {
  const ds = { right: "M9 18l6-6-6-6", left: "M15 18l-6-6 6-6", down: "M6 9l6 6 6-6" };
  return <Icon d={ds[dir]} {...p}/>;
};

// ─── Pin Gate ───
function PinGate({ children }) {
  const [role, setRole] = useState(() => sessionStorage.getItem(SESSION_KEY) || null); // "admin" | "view" | null
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
    if (SUPER_ADMIN_HASH && hash === SUPER_ADMIN_HASH) {
      sessionStorage.setItem(SESSION_KEY, "superadmin");
      localStorage.removeItem(LOCKOUT_KEY);
      setRole("superadmin");
    } else if (hash === ADMIN_HASH) {
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

  if (role) return children(role !== "view", role === "superadmin");

  const remaining = lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 1000) : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
      <div style={{ background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 16, padding: "48px 36px", width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5030", letterSpacing: "4px", textTransform: "uppercase", marginBottom: 6, fontFamily: FB }}>Home Game</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: "#2a0a08", letterSpacing: "4px", textTransform: "uppercase", marginBottom: 32, fontFamily: FB }}>Tracker</div>
        <input
          autoFocus
          type="password"
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

// ─── Main App ───
export default function PokerTracker() {
  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [modal, setModal] = useState(null);
  const [summaryId, setSummaryId] = useState(null);

  useEffect(() => {
    loadSessions().then(s => {
      if (s !== null) { setSessions(s); setSaveEnabled(true); }
      setLoaded(true);
    });
  }, []);
  useEffect(() => { if (saveEnabled) saveSessions(sessions); }, [sessions, saveEnabled]);

  const activeSession = sessions.find(s => s.id === activeId);
  const summarySession = sessions.find(s => s.id === summaryId);

  const updateSession = useCallback((id, fn) => {
    setSessions(prev => prev.map(s => s.id === id ? fn({ ...s, players: s.players.map(p => ({ ...p, buyins: [...p.buyins] })) }) : s));
  }, []);

  const startNewSession = (name) => {
    const s = { id: uid(), name: name || `Session ${sessions.length + 1}`, date: new Date().toISOString(), players: [], ended: false };
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setView("active");
  };

  const endSession = (id) => {
    updateSession(id, s => ({ ...s, ended: true, endDate: new Date().toISOString() }));
    setSummaryId(id);
    setView("summary");
  };

  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setView("home"); }
    if (summaryId === id) { setSummaryId(null); setView("home"); }
  };

  const resumeSession = (id) => {
    updateSession(id, s => ({ ...s, ended: false }));
    setActiveId(id);
    setView("active");
  };

  if (!loaded) return <PinGate>{() => <div style={S.loading}><div style={S.spinner}/></div>}</PinGate>;

  return (
    <PinGate>
      {(isAdmin, isSuperAdmin) => (
        <div style={S.app}>
          <Header view={view} setView={setView} activeId={activeId} hasEnded={sessions.some(s => s.ended)} isSuperAdmin={isSuperAdmin} />
          {view === "home" && <HomeView sessions={sessions} isAdmin={isAdmin} onNew={() => setModal({ type: "newSession" })} onOpen={(id) => { const s = sessions.find(x=>x.id===id); if(s.ended){ setSummaryId(id); setView("summary"); } else { setActiveId(id); setView("active"); }}} onDelete={deleteSession} />}
          {view === "active" && activeSession && <ActiveView session={activeSession} isAdmin={isAdmin} updateSession={updateSession} setModal={setModal} onEnd={() => endSession(activeId)} />}
          {view === "summary" && summarySession && <SummaryView session={summarySession} isAdmin={isAdmin} onResume={() => resumeSession(summaryId)} onBack={() => setView("home")} />}
          {view === "history" && isSuperAdmin && <HistoryView sessions={sessions} isAdmin={isAdmin} onOpen={(id) => { setSummaryId(id); setView("summary"); }} onDelete={deleteSession} />}
          {view === "players" && isSuperAdmin && <PlayerSearchView sessions={sessions} />}
          {view === "analytics" && <AnalyticsView sessions={sessions} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} onExport={() => exportJSON(sessions)} />}
          {isAdmin && modal && <Modal modal={modal} setModal={setModal} sessions={sessions} activeSession={activeSession} updateSession={updateSession} startNewSession={startNewSession} activeId={activeId} />}
        </div>
      )}
    </PinGate>
  );
}

// ─── Header ───
function Header({ view, setView, activeId, hasEnded, isSuperAdmin }) {
  return (
    <div style={S.header}>
      <div style={S.headerLeft}>
        <span style={S.title}>Home Game Tracker</span>
      </div>
      <div style={S.nav}>
        <NavBtn label="Home" active={view === "home"} onClick={() => setView("home")} />
        {activeId && <NavBtn label="Session" active={view === "active"} onClick={() => setView("active")} />}
        {isSuperAdmin && <NavBtn label="History" active={view === "history"} onClick={() => setView("history")} />}
        {isSuperAdmin && <NavBtn label="Players" active={view === "players"} onClick={() => setView("players")} />}
        {isSuperAdmin && hasEnded && <NavBtn label="Stats" active={view === "analytics"} onClick={() => setView("analytics")} />}
      </div>
    </div>
  );
}

function NavBtn({ label, active, onClick }) {
  return <button onClick={onClick} style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }}>{label}</button>;
}

// ─── Home View ───
function HomeView({ sessions, isAdmin, onNew, onOpen, onDelete }) {
  const activeSessions = sessions.filter(s => !s.ended);
  const recentEnded = sessions.filter(s => s.ended).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  return (
    <div style={S.content}>
      {isAdmin && <button onClick={onNew} style={S.newBtn}><PlusIcon size={20}/> New Session</button>}
      {activeSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Active Sessions</h3>
          {activeSessions.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {recentEnded.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Recent</h3>
          {recentEnded.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {sessions.length === 0 && (
        <div style={S.empty}>
          <span style={{ fontSize: 48, opacity: 0.3 }}>♠♥♣♦</span>
          <p style={{ color: "#7a5030", marginTop: 12 }}>No sessions yet. Start your first game!</p>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onClick, onDelete, isAdmin }) {
  const d = new Date(session.date);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const playerCount = session.players.length;
  const totalPot = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);
  return (
    <div style={S.card} onClick={onClick}>
      <div style={S.cardHeader}>
        <div>
          <div style={S.cardTitle}>{session.name}</div>
          <div style={S.cardSub}>{dateStr} · {playerCount} player{playerCount !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!session.ended && <span style={S.liveBadge}>LIVE</span>}
          <span style={S.cardPot}>{fmtMoney(totalPot)}</span>
          {isAdmin && <button onClick={e => { e.stopPropagation(); onDelete(); }} style={S.iconBtn}><TrashIcon size={14} color="#707070"/></button>}
        </div>
      </div>
    </div>
  );
}

// ─── Active Session View ───
function ActiveView({ session, isAdmin, updateSession, setModal, onEnd }) {
  const totalBuyins = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);
  const totalCashouts = session.players.filter(p => p.cashout !== null).reduce((a, p) => a + p.cashout, 0);
  const cashedOutCount = session.players.filter(p => p.cashout !== null).length;
  const allCashedOut = session.players.length > 0 && cashedOutCount === session.players.length;
  const balance = allCashedOut ? totalCashouts - totalBuyins : null;

  const removePlayer = (pid) => {
    updateSession(session.id, s => ({ ...s, players: s.players.filter(p => p.id !== pid) }));
  };

  const undoCashout = (pid) => {
    updateSession(session.id, s => {
      const p = s.players.find(x => x.id === pid);
      if (p) p.cashout = null;
      return s;
    });
  };

  return (
    <div style={S.content}>
      <div style={S.sessionHeader}>
        <h2 style={S.sessionName}>{session.name}</h2>
        <div style={S.sessionMeta}>{new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {session.players.length} players</div>
      </div>

      <div style={S.statsRow}>
        <StatBox label="Total Buy-in" value={fmtMoney(totalBuyins)} />
        <StatBox label="Cashed Out" value={`${cashedOutCount}/${session.players.length}`} />
        {allCashedOut && <StatBox label="Balance" value={balance === 0 ? "✓ OK" : `⚠ ${fmt(balance)}`} color="#ffffff" />}
      </div>

      <div style={S.actions}>
        {isAdmin && <button onClick={() => setModal({ type: "addPlayer" })} style={S.actionBtn}><PlusIcon size={16}/> Add Player</button>}
        {isAdmin && <button onClick={() => setModal({ type: "buyin" })} style={S.actionBtnAlt}>Buy-in / Rebuy</button>}
        {isAdmin && <button onClick={() => setModal({ type: "cashout" })} style={S.actionBtnAlt}>Cash Out</button>}
      </div>

      {session.players.length > 0 ? (
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ flex: 2 }}>Player</span>
            <span style={{ flex: 2, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Profit</span>
            <span style={{ flex: 0.5 }}/>
          </div>
          {session.players.map(p => {
            const totalBuyin = p.buyins.reduce((a, x) => a + x, 0);
            const profit = p.cashout !== null ? p.cashout - totalBuyin : null;
            return (
              <div key={p.id} style={S.tableRow}>
                <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{p.name}</span>
                <span style={{ flex: 2, textAlign: "right", color: "#2a0a08" }}>
                  {fmtMoney(totalBuyin)}
                  {p.buyins.length > 1 && <span style={{ color: "#7a5030", fontSize: 11, marginLeft: 4 }}>({p.buyins.map(b => fmtMoney(b)).join(" + ")})</span>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", color: p.cashout !== null ? "#2a0a08" : "#7a5030" }}>
                  {p.cashout !== null ? fmtMoney(p.cashout) : "—"}
                  {isAdmin && p.cashout !== null && <button onClick={() => undoCashout(p.id)} style={{ ...S.tinyBtn, marginLeft: 4 }} title="Undo">↩</button>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 600, color: profit !== null ? profitColor(profit) : "#707070" }}>
                  {profit !== null ? fmt(profit) : "—"}
                </span>
                <span style={{ flex: 0.5, textAlign: "right" }}>
                  {isAdmin && p.cashout === null && <button onClick={() => removePlayer(p.id)} style={S.tinyBtn}><TrashIcon size={12} color="#707070"/></button>}
                </span>
              </div>
            );
          })}
          <div style={S.tableTotal}>
            <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
            <span style={{ flex: 2, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{cashedOutCount > 0 ? fmtMoney(totalCashouts) : "—"}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#707070" }}>{allCashedOut ? fmt(balance) : "—"}</span>
            <span style={{ flex: 0.5 }}/>
          </div>
        </div>
      ) : (
        <div style={S.empty}><p style={{ color: "#707070" }}>Add players to get started</p></div>
      )}

      {session.players.length > 0 && isAdmin && (
        <button onClick={onEnd} style={S.endBtn}>End Session</button>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={S.statBox}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, ...(color ? { color } : {}) }}>{value}</div>
    </div>
  );
}

// ─── Summary View ───
function SummaryView({ session, isAdmin, onResume, onBack }) {
  const sorted = [...session.players].sort((a, b) => {
    const pa = a.cashout !== null ? a.cashout - a.buyins.reduce((s, x) => s + x, 0) : -Infinity;
    const pb = b.cashout !== null ? b.cashout - b.buyins.reduce((s, x) => s + x, 0) : -Infinity;
    return pb - pa;
  });
  const totalBuyins = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);
  const totalCashouts = session.players.filter(p => p.cashout !== null).reduce((a, p) => a + p.cashout, 0);
  const allCashedOut = session.players.length > 0 && session.players.every(p => p.cashout !== null);
  const balance = allCashedOut ? totalCashouts - totalBuyins : null;
  const dateStr = new Date(session.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={S.content}>
      <div style={S.summaryCard}>
        <div style={S.summaryHeader}>
          <span style={S.summaryLogo}>♠</span>
          <div>
            <h2 style={S.summaryTitle}>{session.name}</h2>
            <div style={S.summarySub}>{dateStr}</div>
          </div>
        </div>
        <div style={S.summaryStatsRow}>
          <div style={S.summaryStatBox}>
            <div style={S.summaryStatLabel}>Players</div>
            <div style={S.summaryStatVal}>{session.players.length}</div>
          </div>
          <div style={S.summaryStatBox}>
            <div style={S.summaryStatLabel}>Total Buy-in</div>
            <div style={S.summaryStatVal}>{fmtMoney(totalBuyins)}</div>
          </div>
          {allCashedOut && (
            <div style={S.summaryStatBox}>
              <div style={S.summaryStatLabel}>Balance</div>
              <div style={{ ...S.summaryStatVal, color: "#2a0a08" }}>{balance === 0 ? "✓" : `⚠ ${fmt(balance)}`}</div>
            </div>
          )}
        </div>
        <div style={S.summaryTable}>
          <div style={S.summaryTableHead}>
            <span style={{ flex: 0.4, textAlign: "center" }}>#</span>
            <span style={{ flex: 2 }}>Player</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Profit</span>
          </div>
          {sorted.map((p, i) => {
            const totalBuyin = p.buyins.reduce((a, x) => a + x, 0);
            const profit = p.cashout !== null ? p.cashout - totalBuyin : null;
            return (
              <div key={p.id} style={S.summaryTableRow}>
                <span style={{ flex: 0.4, textAlign: "center", color: "#7a5030", fontSize: 12 }}>{i + 1}</span>
                <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>
                  {p.name}{i === 0 && profit > 0 && <span style={{ marginLeft: 6, fontSize: 12 }}>👑</span>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{fmtMoney(totalBuyin)}</span>
                <span style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{p.cashout !== null ? fmtMoney(p.cashout) : "—"}</span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profit !== null ? profitColor(profit) : "#707070", fontSize: 15 }}>{profit !== null ? fmt(profit) : "—"}</span>
              </div>
            );
          })}
          <div style={S.summaryTableTotalRow}>
            <span style={{ flex: 0.4 }}/>
            <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalCashouts)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#707070" }}>{allCashedOut ? fmt(balance) : "—"}</span>
          </div>
        </div>
        <div style={S.summaryFooter}>Home Game Tracker · {new Date(session.date).toLocaleDateString()}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={S.actionBtnAlt}><ChevronIcon dir="left" size={14}/> Home</button>
        {isAdmin && session.ended && <button onClick={onResume} style={S.actionBtnAlt}>Reopen Session</button>}
      </div>
    </div>
  );
}

// ─── History View ───
function HistoryView({ sessions, isAdmin, onOpen, onDelete }) {
  const ended = sessions.filter(s => s.ended);
  if (ended.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#707070" }}>No completed sessions yet</p></div></div>
  );

  const playerStats = {};
  ended.forEach(s => {
    s.players.forEach(p => {
      if (p.cashout === null) return;
      if (!playerStats[p.name]) playerStats[p.name] = { sessions: 0, totalProfit: 0, totalBuyin: 0, wins: 0 };
      const buyin = p.buyins.reduce((a, x) => a + x, 0);
      const profit = p.cashout - buyin;
      playerStats[p.name].sessions++;
      playerStats[p.name].totalProfit += profit;
      playerStats[p.name].totalBuyin += buyin;
      if (profit > 0) playerStats[p.name].wins++;
    });
  });
  const leaderboard = Object.entries(playerStats).sort((a, b) => b[1].totalProfit - a[1].totalProfit);

  return (
    <div style={S.content}>
      {leaderboard.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Leaderboard (All Time)</h3>
          <div style={S.table}>
            <div style={S.tableHead}>
              <span style={{ flex: 0.3, textAlign: "center" }}>#</span>
              <span style={{ flex: 2 }}>Player</span>
              <span style={{ flex: 1, textAlign: "right" }}>Sessions</span>
              <span style={{ flex: 1, textAlign: "right" }}>Win %</span>
              <span style={{ flex: 1.5, textAlign: "right" }}>Net</span>
            </div>
            {leaderboard.map(([name, st], i) => (
              <div key={name} style={S.tableRow}>
                <span style={{ flex: 0.3, textAlign: "center", color: "#7a5030" }}>{i + 1}</span>
                <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{name}{i === 0 && " 👑"}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#2a0a08" }}>{st.sessions}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#2a0a08" }}>{Math.round(st.wins / st.sessions * 100)}%</span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profitColor(st.totalProfit) }}>{fmt(st.totalProfit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>Past Sessions</h3>
        {ended.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
      </div>
    </div>
  );
}

// ─── Limited Stats View (admin + view-only) ───
function HighlightCard({ emoji, label, value }) {
  return (
    <div style={{ background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 24 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 11, color: "#7a5030", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: F }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#450206", marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function LimitedStatsView({ sessions, isAdmin, onExport }) {
  const window4 = useMemo(() =>
    sessions.filter(s => s.ended)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-8),
    [sessions]
  );

  const { playerStats, allPlayerNames } = useMemo(() => {
    const stats = {};
    window4.forEach(s => {
      s.players.forEach(p => {
        if (p.cashout === null) return;
        if (!stats[p.name]) stats[p.name] = { sessions: 0, totalProfit: 0, totalBuyin: 0, wins: 0 };
        const buyin = p.buyins.reduce((a, x) => a + x, 0);
        const profit = p.cashout - buyin;
        stats[p.name].sessions++;
        stats[p.name].totalProfit += profit;
        stats[p.name].totalBuyin += buyin;
        if (profit > 0) stats[p.name].wins++;
      });
    });
    return { playerStats: stats, allPlayerNames: Object.keys(stats) };
  }, [window4]);

  // Per-player profits in order across the window
  const sessionProfits = useMemo(() => {
    const map = {};
    allPlayerNames.forEach(name => {
      map[name] = window4.map(s => {
        const p = s.players.find(x => x.name === name && x.cashout !== null);
        return p ? p.cashout - p.buyins.reduce((a, x) => a + x, 0) : null;
      });
    });
    return map;
  }, [window4, allPlayerNames]);

  const highlights = useMemo(() => {
    if (allPlayerNames.length === 0) return null;

    // Hot streak: consecutive wins ending at their most recent session
    let hotPlayer = ""; let hotCount = 0;
    allPlayerNames.forEach(name => {
      const sp = sessionProfits[name];
      let cur = 0;
      for (let i = sp.length - 1; i >= 0; i--) {
        if (sp[i] === null) continue; // didn't attend, skip
        if (sp[i] > 0) cur++;
        else break; // lost, streak ends
      }
      if (cur > hotCount) { hotCount = cur; hotPlayer = name; }
    });

    // Best single session win
    let bestPlayer = ""; let bestAmount = -Infinity;
    allPlayerNames.forEach(name => {
      const sp = sessionProfits[name].filter(x => x !== null);
      if (!sp.length) return;
      const best = Math.max(...sp);
      if (best > bestAmount) { bestAmount = best; bestPlayer = name; }
    });

    // Most consistent: lowest std dev (2+ sessions)
    let consistentPlayer = ""; let lowestStd = Infinity;
    allPlayerNames.forEach(name => {
      const sp = sessionProfits[name].filter(x => x !== null);
      if (sp.length < 2) return;
      const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
      const std = Math.sqrt(sp.reduce((a, b) => a + (b - mean) ** 2, 0) / sp.length);
      if (std < lowestStd) { lowestStd = std; consistentPlayer = name; }
    });

    // Buy-in monster: highest total buyin
    let buyinPlayer = ""; let buyinTotal = 0;
    allPlayerNames.forEach(name => {
      if (playerStats[name].totalBuyin > buyinTotal) { buyinTotal = playerStats[name].totalBuyin; buyinPlayer = name; }
    });

    return { hotPlayer, hotCount, bestPlayer, bestAmount, consistentPlayer, buyinPlayer, buyinTotal };
  }, [allPlayerNames, sessionProfits, playerStats]);

  if (window4.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#707070" }}>Need completed sessions for stats</p></div></div>
  );

  const correlationData = useMemo(() => {
    const regulars = allPlayerNames
      .filter(name => playerStats[name].sessions >= 2)
      .sort((a, b) => playerStats[b].sessions - playerStats[a].sessions);

    const matrix = {};
    regulars.forEach(a => {
      matrix[a] = {};
      regulars.forEach(b => {
        if (a === b) { matrix[a][b] = 1; return; }
        const pairs = window4.map(s => {
          const pa = s.players.find(x => x.name === a && x.cashout !== null);
          const pb = s.players.find(x => x.name === b && x.cashout !== null);
          if (!pa || !pb) return null;
          return [pa.cashout - pa.buyins.reduce((s, x) => s + x, 0), pb.cashout - pb.buyins.reduce((s, x) => s + x, 0)];
        }).filter(Boolean);
        if (pairs.length < 2) { matrix[a][b] = null; return; }
        const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
        const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
        matrix[a][b] = den === 0 ? null : +(num / den).toFixed(2);
      });
    });

    let topAllied = null, topAlliedR = -Infinity, topRival = null, topRivalR = Infinity;
    for (let i = 0; i < regulars.length; i++) {
      for (let j = i + 1; j < regulars.length; j++) {
        const r = matrix[regulars[i]][regulars[j]];
        if (r === null) continue;
        if (r > topAlliedR) { topAlliedR = r; topAllied = `${regulars[i]} & ${regulars[j]}`; }
        if (r < topRivalR)  { topRivalR = r;  topRival  = `${regulars[i]} & ${regulars[j]}`; }
      }
    }
    return { regulars, matrix, topAllied: topAlliedR > 0.3 ? topAllied : null, topRival: topRivalR < -0.3 ? topRival : null };
  }, [allPlayerNames, playerStats, window4]);

  return (
    <div style={S.content}>
      {highlights && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Highlights · Last {window4.length} Session{window4.length !== 1 ? "s" : ""}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <HighlightCard emoji="🔥" label="Hot Streak" value={highlights.hotCount > 0 ? `${highlights.hotPlayer} — ${highlights.hotCount} in a row` : "—"} />
            <HighlightCard emoji="🏆" label="Best Single Win" value={highlights.bestAmount > 0 ? `${highlights.bestPlayer} — ${fmt(highlights.bestAmount)}` : "—"} />
            <HighlightCard emoji="🎯" label="Most Consistent" value={highlights.consistentPlayer ? highlights.consistentPlayer : "—"} />
            <HighlightCard emoji="📅" label="Buy-in Monster" value={highlights.buyinPlayer ? `${highlights.buyinPlayer} — ${fmtMoney(highlights.buyinTotal)}` : "—"} />
          </div>
        </div>
      )}

      <div style={S.section}>
        <h3 style={S.sectionTitle}>Profit Correlation · Last {window4.length} Sessions</h3>
        <p style={{ fontSize: 12, color: "#7a5030", margin: "0 0 12px" }}>Regulars only (2+ sessions). Green = tend to win/lose together · Red = natural rivals · Grey = too few shared sessions</p>
        {correlationData.regulars.length < 2 ? (
          <p style={{ color: "#707070", fontSize: 14 }}>Not enough data yet</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 72 }} />
                    {correlationData.regulars.map(name => (
                      <th key={name} style={{ minWidth: 44, padding: "2px 4px", textAlign: "center", color: "#7a5030", fontWeight: 600, fontSize: 11 }}>
                        {name.length > 5 ? name.slice(0, 4) + "." : name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correlationData.regulars.map(a => (
                    <tr key={a}>
                      <td style={{ paddingRight: 8, fontWeight: 600, color: "#2a0a08", fontSize: 12, whiteSpace: "nowrap" }}>{a}</td>
                      {correlationData.regulars.map(b => {
                        const r = correlationData.matrix[a][b];
                        const isDiag = a === b;
                        return (
                          <td key={b} style={{
                            width: 44, height: 34, background: isDiag ? "#d4b898" : corrColor(r),
                            textAlign: "center", color: "#2a0a08", fontWeight: isDiag ? 700 : 500,
                            fontSize: 11, borderRadius: 4, padding: "2px 4px",
                          }}>
                            {isDiag ? "—" : r === null ? "·" : (r >= 0 ? "+" : "") + r.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(correlationData.topAllied || correlationData.topRival) && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {correlationData.topAllied && <span style={{ background: "#c8e6c9", borderRadius: 8, padding: "5px 12px", fontSize: 13, color: "#2a0a08" }}>🤝 Allies: {correlationData.topAllied}</span>}
                {correlationData.topRival  && <span style={{ background: "#ffcdd2", borderRadius: 8, padding: "5px 12px", fontSize: 13, color: "#2a0a08" }}>⚔️ Rivals: {correlationData.topRival}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 24 }}>
          <button onClick={onExport} style={S.exportBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Backup All Sessions (JSON)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Analytics View ───
function AnalyticsView({ sessions, isAdmin, isSuperAdmin, onExport }) {
  const ended = useMemo(() => sessions.filter(s => s.ended).sort((a, b) => new Date(a.date) - new Date(b.date)), [sessions]);
  const [hiddenPlayers, setHiddenPlayers] = useState(new Set());

  const { playerStats, allPlayerNames } = useMemo(() => {
    const stats = {};
    ended.forEach(s => {
      s.players.forEach(p => {
        if (p.cashout === null) return;
        if (!stats[p.name]) stats[p.name] = { sessions: 0, totalProfit: 0, totalBuyin: 0, wins: 0, biggestWin: -Infinity, biggestLoss: Infinity, profits: [] };
        const buyin = p.buyins.reduce((a, x) => a + x, 0);
        const profit = p.cashout - buyin;
        stats[p.name].sessions++;
        stats[p.name].totalProfit += profit;
        stats[p.name].totalBuyin += buyin;
        stats[p.name].profits.push(profit);
        if (profit > 0) stats[p.name].wins++;
        if (profit > stats[p.name].biggestWin) stats[p.name].biggestWin = profit;
        if (profit < stats[p.name].biggestLoss) stats[p.name].biggestLoss = profit;
      });
    });
    return { playerStats: stats, allPlayerNames: Object.keys(stats) };
  }, [ended]);

  const regulars = useMemo(() => {
    return allPlayerNames
      .filter(n => playerStats[n].sessions >= 2)
      .sort((a, b) => playerStats[b].sessions - playerStats[a].sessions)
      .slice(0, 9);
  }, [allPlayerNames, playerStats]);

  const cumulativeData = useMemo(() => {
    const cumulative = {};
    regulars.forEach(n => { cumulative[n] = 0; });
    const data = [{ label: "Start", ...Object.fromEntries(regulars.map(n => [n, 0])) }];
    ended.forEach(s => {
      s.players.forEach(p => {
        if (p.cashout === null) return;
        if (cumulative[p.name] !== undefined) {
          const buyin = p.buyins.reduce((a, x) => a + x, 0);
          cumulative[p.name] += (p.cashout - buyin);
        }
      });
      const label = s.name.length > 10 ? s.name.slice(0, 10) + "…" : s.name;
      const point = { label, fullLabel: s.name, date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
      regulars.forEach(n => { point[n] = Math.round(cumulative[n] * 100) / 100; });
      data.push(point);
    });
    return data;
  }, [ended, regulars]);

  const togglePlayer = (name) => {
    setHiddenPlayers(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const visibleRegulars = regulars.filter(n => !hiddenPlayers.has(n));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    return (
      <div style={{ background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "#2a0a08", marginBottom: 6 }}>{point?.fullLabel || point?.label || label}</div>
        {point?.date && <div style={{ color: "#707070", marginBottom: 6 }}>{point.date}</div>}
        {payload.sort((a, b) => b.value - a.value).map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color, marginBottom: 2 }}>
            <span>{p.dataKey}</span>
            <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!isSuperAdmin) return <LimitedStatsView sessions={sessions} isAdmin={isAdmin} onExport={onExport} />;

  if (ended.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#707070" }}>Need completed sessions for analytics</p></div></div>
  );

  const detailedStats = allPlayerNames
    .map(name => ({ name, ...playerStats[name] }))
    .sort((a, b) => b.totalProfit - a.totalProfit);

  return (
    <div style={S.content}>
      {regulars.length > 0 && cumulativeData.length > 2 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Cumulative Winnings</h3>
          <div style={S.chartCard}>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={cumulativeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: "#707070", fontSize: 11 }} axisLine={{ stroke: "#3d1515" }} tickLine={false} />
                  <YAxis tick={{ fill: "#707070", fontSize: 11 }} axisLine={{ stroke: "#3d1515" }} tickLine={false} tickFormatter={v => v === 0 ? "0" : fmt(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#3d1515" strokeDasharray="3 3" />
                  {visibleRegulars.map((name) => (
                    <Line
                      key={name}
                      type="linear"
                      dataKey={name}
                      stroke={CHART_COLORS[regulars.indexOf(name) % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid #d4b898" }}>
              {regulars.map((name, i) => {
                const isHidden = hiddenPlayers.has(name);
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <button
                    key={name}
                    onClick={() => togglePlayer(name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 6, border: "1px solid #d4b898",
                      background: isHidden ? "transparent" : "rgba(69,2,6,0.08)",
                      cursor: "pointer", fontSize: 13, color: isHidden ? "#9a7060" : "#2a0a08",
                      opacity: isHidden ? 0.5 : 1, transition: "all 0.15s"
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: isHidden ? "#707070" : color, display: "inline-block" }} />
                    {name}
                  </button>
                );
              })}
            </div>
            {regulars.length < allPlayerNames.length && (
              <div style={{ fontSize: 11, color: "#707070", marginTop: 8 }}>
                Showing {regulars.length} regulars (2+ sessions). {allPlayerNames.length - regulars.length} one-time player{allPlayerNames.length - regulars.length > 1 ? "s" : ""} hidden.
              </div>
            )}
          </div>
        </div>
      )}

      <div style={S.section}>
        <h3 style={S.sectionTitle}>Player Stats</h3>
        <div style={{ overflowX: "auto" }}>
          <div style={{ ...S.table, minWidth: 520 }}>
            <div style={S.tableHead}>
              <span style={{ flex: 1.8 }}>Player</span>
              <span style={{ flex: 0.7, textAlign: "right" }}>Sess.</span>
              <span style={{ flex: 0.8, textAlign: "right" }}>Win %</span>
              <span style={{ flex: 1.2, textAlign: "right" }}>Net</span>
              <span style={{ flex: 1, textAlign: "right" }}>Avg</span>
              <span style={{ flex: 1, textAlign: "right" }}>Best</span>
              <span style={{ flex: 1, textAlign: "right" }}>Worst</span>
            </div>
            {detailedStats.map((st, i) => (
              <div key={st.name} style={S.tableRow}>
                <span style={{ flex: 1.8, fontWeight: 600, color: "#2a0a08" }}>{i === 0 && "👑 "}{st.name}</span>
                <span style={{ flex: 0.7, textAlign: "right", color: "#2a0a08" }}>{st.sessions}</span>
                <span style={{ flex: 0.8, textAlign: "right", color: "#2a0a08" }}>{Math.round(st.wins / st.sessions * 100)}%</span>
                <span style={{ flex: 1.2, textAlign: "right", fontWeight: 700, color: profitColor(st.totalProfit) }}>{fmt(st.totalProfit)}</span>
                <span style={{ flex: 1, textAlign: "right", color: profitColor(st.totalProfit / st.sessions) }}>{fmt(Math.round(st.totalProfit / st.sessions * 100) / 100)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#2a0a08" }}>{st.biggestWin > 0 ? fmt(st.biggestWin) : "—"}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#c0392b" }}>{st.biggestLoss < 0 ? fmt(st.biggestLoss) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 24 }}>
          <button onClick={onExport} style={S.exportBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Backup All Sessions (JSON)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Player Search View ───
function PlayerSearchView({ sessions }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const allPlayers = useMemo(() => {
    const names = new Set();
    sessions.filter(s => s.ended).forEach(s => s.players.forEach(p => names.add(p.name)));
    return [...names].sort();
  }, [sessions]);

  const filtered = allPlayers.filter(n => n.toLowerCase().includes(query.toLowerCase()));

  if (selected) return <PlayerProfile name={selected} sessions={sessions} onBack={() => setSelected(null)} />;

  return (
    <div style={S.content}>
      <input
        autoFocus
        style={{ ...S.input, marginBottom: 4 }}
        placeholder="Search player..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {filtered.length === 0 && <div style={S.empty}><p style={{ color: "#707070" }}>No players found</p></div>}
      <div style={S.section}>
        {filtered.map(name => (
          <div key={name} style={{ ...S.card, cursor: "pointer" }} onClick={() => setSelected(name)}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>{name}</span>
              <ChevronIcon dir="right" color="#707070" size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerProfile({ name, sessions, onBack }) {
  const ended = useMemo(() =>
    sessions.filter(s => s.ended).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [sessions]
  );

  const playerSessions = useMemo(() =>
    ended.map(s => {
      const p = s.players.find(x => x.name === name);
      if (!p) return null;
      const buyin = p.buyins.reduce((a, x) => a + x, 0);
      const profit = p.cashout !== null ? p.cashout - buyin : null;
      return { sessionName: s.name, date: s.date, buyin, cashout: p.cashout, profit };
    }).filter(Boolean),
    [ended, name]
  );

  const stats = useMemo(() => {
    const completed = playerSessions.filter(s => s.profit !== null);
    if (!completed.length) return null;
    const totalProfit = completed.reduce((a, s) => a + s.profit, 0);
    const wins = completed.filter(s => s.profit > 0).length;
    const profits = completed.map(s => s.profit);
    return {
      sessions: completed.length,
      totalProfit,
      totalBuyin: completed.reduce((a, s) => a + s.buyin, 0),
      winRate: Math.round(wins / completed.length * 100),
      avg: totalProfit / completed.length,
      best: Math.max(...profits),
      worst: Math.min(...profits),
    };
  }, [playerSessions]);

  const chartData = useMemo(() => {
    let cum = 0;
    const data = [{ label: "Start", value: 0 }];
    playerSessions.filter(s => s.profit !== null).forEach(s => {
      cum += s.profit;
      data.push({
        label: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        fullLabel: s.sessionName,
        value: Math.round(cum * 100) / 100,
      });
    });
    return data;
  }, [playerSessions]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    return (
      <div style={{ background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "#2a0a08", marginBottom: 4 }}>{point?.fullLabel || point?.label}</div>
        <div style={{ color: profitColor(payload[0].value), fontWeight: 600 }}>{fmt(payload[0].value)}</div>
      </div>
    );
  };

  return (
    <div style={S.content}>
      <button onClick={onBack} style={{ ...S.actionBtnAlt, marginBottom: 16, display: "inline-flex" }}><ChevronIcon dir="left" size={14}/> All Players</button>
      <h2 style={{ ...S.sessionName, marginBottom: 4 }}>{name}</h2>
      <div style={{ fontSize: 13, color: "#707070", marginBottom: 16 }}>{playerSessions.length} session{playerSessions.length !== 1 ? "s" : ""}</div>

      {stats && (
        <>
          <div style={{ ...S.statsRow, flexWrap: "wrap" }}>
            <StatBox label="Net" value={fmt(stats.totalProfit)} color={profitColor(stats.totalProfit)} />
            <StatBox label="Sessions" value={stats.sessions} />
            <StatBox label="Win Rate" value={`${stats.winRate}%`} />
            <StatBox label="Avg / Session" value={fmt(Math.round(stats.avg * 100) / 100)} color={profitColor(stats.avg)} />
            <StatBox label="Best Win" value={stats.best > 0 ? fmt(stats.best) : "—"} color="#ffffff" />
            <StatBox label="Worst Loss" value={stats.worst < 0 ? fmt(stats.worst) : "—"} color="#f87171" />
          </div>

          {chartData.length > 2 && (
            <div style={{ ...S.chartCard, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#707070", marginBottom: 10 }}>Cumulative winnings</div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: "#707070", fontSize: 11 }} axisLine={{ stroke: "#3d1515" }} tickLine={false} />
                    <YAxis tick={{ fill: "#707070", fontSize: 11 }} axisLine={{ stroke: "#3d1515" }} tickLine={false} tickFormatter={v => v === 0 ? "0" : fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="#3d1515" strokeDasharray="3 3" />
                    <Line type="linear" dataKey="value" stroke="#c9a84c" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      <div style={S.section}>
        <h3 style={S.sectionTitle}>Session History</h3>
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ flex: 2 }}>Session</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>Profit</span>
          </div>
          {[...playerSessions].reverse().map((s, i) => (
            <div key={i} style={S.tableRow}>
              <span style={{ flex: 2 }}>
                <div style={{ fontWeight: 600, color: "#2a0a08", fontSize: 13 }}>{s.sessionName}</div>
                <div style={{ color: "#7a5030", fontSize: 11 }}>{new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
              </span>
              <span style={{ flex: 1.2, textAlign: "right", color: "#2a0a08" }}>{fmtMoney(s.buyin)}</span>
              <span style={{ flex: 1.2, textAlign: "right", color: "#2a0a08" }}>{s.cashout !== null ? fmtMoney(s.cashout) : "—"}</span>
              <span style={{ flex: 1.2, textAlign: "right", fontWeight: 700, color: s.profit !== null ? profitColor(s.profit) : "#707070" }}>{s.profit !== null ? fmt(s.profit) : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modal System ───
function Modal({ modal, setModal, activeSession, updateSession, startNewSession, activeId }) {
  const close = () => setModal(null);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState(modal.type === "cashout" ? "" : "20");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, [modal.type]);

  const players = activeSession?.players || [];

  const handleNewSession = () => { startNewSession(val.trim() || undefined); close(); };

  const handleAddPlayer = () => {
    const raw = val.trim();
    const name = raw.replace(/\b\w/g, c => c.toUpperCase());
    const amount = parseFloat(val2);
    if (!name) return;
    updateSession(activeId, s => {
      if (s.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return s;
      s.players.push({ id: uid(), name, buyins: amount > 0 ? [amount] : [], cashout: null });
      return s;
    });
    setVal(""); setVal2("20"); inputRef.current?.focus();
  };

  const handleBuyin = () => {
    const amount = parseFloat(val2);
    if (!selectedPlayer || !amount || amount <= 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === selectedPlayer);
      if (p) p.buyins.push(amount);
      return s;
    });
    setVal2(""); close();
  };

  const handleCashout = () => {
    const amount = parseFloat(val2);
    if (!selectedPlayer || isNaN(amount) || amount < 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === selectedPlayer);
      if (p) p.cashout = amount;
      return s;
    });
    setVal2(""); close();
  };

  const activePlayers = players.filter(p => p.cashout === null);

  return (
    <div style={S.overlay} onClick={close}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {modal.type === "newSession" && (
          <>
            <h3 style={S.modalTitle}>New Session</h3>
            <input ref={inputRef} style={S.input} placeholder="Session name (optional)" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleNewSession()} />
            <button onClick={handleNewSession} style={S.modalBtn}>Start Game</button>
          </>
        )}
        {modal.type === "addPlayer" && (
          <>
            <h3 style={S.modalTitle}>Add Player</h3>
            <input ref={inputRef} style={S.input} placeholder="Player name" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && (val2 ? handleAddPlayer() : document.getElementById("buyin-input")?.focus())} />
            <input id="buyin-input" style={S.input} placeholder="Initial buy-in" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddPlayer()} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddPlayer} style={{ ...S.modalBtn, flex: 1 }}>Add</button>
              <button onClick={close} style={{ ...S.modalBtnAlt, flex: 1 }}>Done</button>
            </div>
          </>
        )}
        {modal.type === "buyin" && (
          <>
            <h3 style={S.modalTitle}>Buy-in / Rebuy</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Amount" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleBuyin()} />
            <button onClick={handleBuyin} style={S.modalBtn}>Add Buy-in</button>
          </>
        )}
        {modal.type === "cashout" && (
          <>
            <h3 style={S.modalTitle}>Cash Out</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({fmtMoney(p.buyins.reduce((a, x) => a + x, 0))} in)</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Cash out amount" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCashout()} />
            <button onClick={handleCashout} style={S.modalBtn}>Cash Out</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───
const F = "'Oswald', sans-serif";
const FB = "'Cormorant Garamond', Georgia, serif";
const S = {
  app: { fontFamily: FB, background: "#fbf0df", color: "#2a0a08", minHeight: "100vh", maxWidth: 600, margin: "0 auto", paddingBottom: 40 },
  loading: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  spinner: { width: 32, height: 32, border: "3px solid #d4b898", borderTopColor: "#450206", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #5a1010", position: "sticky", top: 0, background: "#450206", zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  logo: { fontSize: 24, color: "#fbf0df", fontWeight: 900 },
  title: { fontSize: 17, fontWeight: 700, color: "#ffffff", letterSpacing: "2px", textTransform: "uppercase", fontFamily: FB },
  nav: { display: "flex", gap: 2 },
  navBtn: { background: "none", border: "none", color: "rgba(251,240,223,0.6)", padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase", fontFamily: F },
  navBtnActive: { background: "rgba(0,0,0,0.2)", color: "#ffffff" },
  content: { padding: "16px" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: "#450206", textTransform: "uppercase", letterSpacing: 2.5, margin: 0, marginBottom: 12, fontFamily: F },
  newBtn: { width: "100%", padding: "15px", background: "#450206", color: "#ffffff", border: "none", borderRadius: 24, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "2px", textTransform: "uppercase", fontFamily: F },
  card: { background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 10, padding: "14px 16px", marginBottom: 8, cursor: "pointer" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: 600, color: "#2a0a08", letterSpacing: "0.5px" },
  cardSub: { fontSize: 13, color: "#5c3020", marginTop: 2, letterSpacing: "0.5px" },
  cardPot: { fontSize: 15, fontWeight: 700, color: "#450206" },
  liveBadge: { background: "rgba(69,2,6,0.12)", color: "#450206", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, letterSpacing: 1.5, border: "1px solid rgba(69,2,6,0.3)", textTransform: "uppercase", fontFamily: F },
  sessionHeader: { marginBottom: 16 },
  sessionName: { fontSize: 24, fontWeight: 700, color: "#2a0a08", margin: 0, letterSpacing: "1px" },
  sessionMeta: { fontSize: 11, color: "#7a5030", marginTop: 4, letterSpacing: "0.5px" },
  statsRow: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  statBox: { flex: 1, background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 10, padding: "12px 14px", minWidth: 90 },
  statLabel: { fontSize: 9, color: "#7a5030", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: F },
  statValue: { fontSize: 24, fontWeight: 700, color: "#2a0a08", marginTop: 4 },
  actions: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  actionBtn: { padding: "10px 16px", background: "#450206", color: "#ffffff", border: "none", borderRadius: 24, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: F },
  actionBtnAlt: { padding: "10px 14px", background: "#fbf0df", color: "#450206", border: "1px solid #d4b898", borderRadius: 24, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, letterSpacing: "1px", textTransform: "uppercase", fontFamily: F },
  table: { background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 10, overflow: "hidden" },
  tableHead: { display: "flex", padding: "10px 14px", fontSize: 9, color: "#7a5030", textTransform: "uppercase", letterSpacing: 1.5, borderBottom: "1px solid #d4b898", fontFamily: F },
  tableRow: { display: "flex", padding: "11px 14px", alignItems: "center", borderBottom: "1px solid rgba(212,184,152,0.6)", fontSize: 15 },
  tableTotal: { display: "flex", padding: "11px 14px", alignItems: "center", fontSize: 15, color: "#2a0a08", background: "rgba(69,2,6,0.06)" },
  tinyBtn: { background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.6, display: "inline-flex" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.5, display: "inline-flex", borderRadius: 4 },
  endBtn: { width: "100%", padding: "14px", background: "none", color: "#c0392b", border: "1px solid rgba(192,57,43,0.35)", borderRadius: 24, fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 20, letterSpacing: "2px", textTransform: "uppercase", fontFamily: F },
  empty: { textAlign: "center", padding: "48px 20px" },
  chartCard: { background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 10, padding: "16px 12px" },
  exportBtn: { width: "100%", padding: "14px", background: "#fbf0df", color: "#450206", border: "1px solid #d4b898", borderRadius: 24, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: F },
  summaryCard: { background: "#f0e0c4", border: "1px solid #d4b898", borderRadius: 14, overflow: "hidden" },
  summaryHeader: { display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 0" },
  summaryLogo: { fontSize: 32, color: "#450206", fontWeight: 900 },
  summaryTitle: { fontSize: 22, fontWeight: 700, color: "#2a0a08", margin: 0, letterSpacing: "1px" },
  summarySub: { fontSize: 11, color: "#7a5030", marginTop: 2, letterSpacing: "0.5px" },
  summaryStatsRow: { display: "flex", gap: 10, padding: "16px 20px", flexWrap: "wrap" },
  summaryStatBox: { flex: 1, background: "rgba(69,2,6,0.06)", border: "1px solid rgba(69,2,6,0.2)", borderRadius: 10, padding: "12px", minWidth: 80, textAlign: "center" },
  summaryStatLabel: { fontSize: 9, color: "#7a5030", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: F },
  summaryStatVal: { fontSize: 26, fontWeight: 700, color: "#2a0a08" },
  summaryTable: { margin: "0 12px" },
  summaryTableHead: { display: "flex", padding: "8px 10px", fontSize: 9, color: "#7a5030", textTransform: "uppercase", letterSpacing: 1.5, borderBottom: "1px solid #d4b898", fontFamily: F },
  summaryTableRow: { display: "flex", padding: "10px 10px", alignItems: "center", fontSize: 15, borderBottom: "1px solid rgba(212,184,152,0.5)" },
  summaryTableTotalRow: { display: "flex", padding: "10px 10px", alignItems: "center", fontSize: 15, color: "#2a0a08", background: "rgba(69,2,6,0.06)", borderRadius: "0 0 8px 8px" },
  summaryFooter: { textAlign: "center", padding: "14px", fontSize: 9, color: "#c0a080", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: F },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(42,10,8,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 },
  modal: { background: "#f5e6cc", border: "1px solid #d4b898", borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 },
  modalTitle: { fontSize: 14, fontWeight: 700, color: "#2a0a08", margin: "0 0 16px", letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: F },
  input: { width: "100%", padding: "12px 14px", background: "#fbf0df", border: "1px solid #d4b898", borderRadius: 8, color: "#2a0a08", fontSize: 16, marginBottom: 10, outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "12px 14px", background: "#fbf0df", border: "1px solid #d4b898", borderRadius: 8, color: "#2a0a08", fontSize: 16, marginBottom: 10, outline: "none", boxSizing: "border-box" },
  modalBtn: { width: "100%", padding: "12px", background: "#450206", color: "#ffffff", border: "none", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "2px", textTransform: "uppercase", fontFamily: F },
  modalBtnAlt: { width: "100%", padding: "12px", background: "#fbf0df", color: "#450206", border: "1px solid #d4b898", borderRadius: 24, fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase", fontFamily: F },
};

if (typeof document !== "undefined") {
  const el = document.createElement("style");
  el.textContent = `@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} body{margin:0;background:#fbf0df} .recharts-surface{overflow:visible}`;
  document.head.appendChild(el);
}
