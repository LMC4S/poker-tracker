import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { supabase } from "./lib/supabase";

const STORAGE_KEY = "poker-sessions-v2";

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
const profitColor = (n) => (n > 0 ? "#4ade80" : n < 0 ? "#f87171" : "#a1a1aa");

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
    return [];
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

// ─── CSV Export ───
function exportCSV(sessions) {
  const ended = sessions.filter(s => s.ended).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (ended.length === 0) return;
  const rows = [["Session", "Date", "Player", "Buy-in", "Buy-in Breakdown", "Cash Out", "Profit"]];
  ended.forEach(s => {
    const d = new Date(s.date).toLocaleDateString();
    s.players.forEach(p => {
      const buyin = p.buyins.reduce((a, x) => a + x, 0);
      const breakdown = p.buyins.join(" + ");
      const co = p.cashout !== null ? p.cashout : "";
      const profit = p.cashout !== null ? p.cashout - buyin : "";
      rows.push([s.name, d, p.name, buyin, breakdown, co, profit]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `poker_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
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

// ─── Main App ───
export default function PokerTracker() {
  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [summaryId, setSummaryId] = useState(null);

  useEffect(() => { loadSessions().then(s => { setSessions(s); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveSessions(sessions); }, [sessions, loaded]);

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

  if (!loaded) return <div style={S.loading}><div style={S.spinner}/></div>;

  return (
    <div style={S.app}>
      <Header view={view} setView={setView} activeId={activeId} hasEnded={sessions.some(s => s.ended)} />
      {view === "home" && <HomeView sessions={sessions} onNew={() => setModal({ type: "newSession" })} onOpen={(id) => { const s = sessions.find(x=>x.id===id); if(s.ended){ setSummaryId(id); setView("summary"); } else { setActiveId(id); setView("active"); }}} onDelete={deleteSession} />}
      {view === "active" && activeSession && <ActiveView session={activeSession} updateSession={updateSession} setModal={setModal} onEnd={() => endSession(activeId)} />}
      {view === "summary" && summarySession && <SummaryView session={summarySession} onResume={() => resumeSession(summaryId)} onBack={() => setView("home")} />}
      {view === "history" && <HistoryView sessions={sessions} onOpen={(id) => { setSummaryId(id); setView("summary"); }} onDelete={deleteSession} />}
      {view === "analytics" && <AnalyticsView sessions={sessions} onExport={() => exportCSV(sessions)} />}
      {modal && <Modal modal={modal} setModal={setModal} sessions={sessions} activeSession={activeSession} updateSession={updateSession} startNewSession={startNewSession} activeId={activeId} />}
    </div>
  );
}

// ─── Header ───
function Header({ view, setView, activeId, hasEnded }) {
  return (
    <div style={S.header}>
      <div style={S.headerLeft}>
        <span style={S.logo}>♠</span>
        <span style={S.title}>Poker Tracker</span>
      </div>
      <div style={S.nav}>
        <NavBtn label="Home" active={view === "home"} onClick={() => setView("home")} />
        {activeId && <NavBtn label="Session" active={view === "active"} onClick={() => setView("active")} />}
        <NavBtn label="History" active={view === "history"} onClick={() => setView("history")} />
        {hasEnded && <NavBtn label="Stats" active={view === "analytics"} onClick={() => setView("analytics")} />}
      </div>
    </div>
  );
}

function NavBtn({ label, active, onClick }) {
  return <button onClick={onClick} style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }}>{label}</button>;
}

// ─── Home View ───
function HomeView({ sessions, onNew, onOpen, onDelete }) {
  const activeSessions = sessions.filter(s => !s.ended);
  const recentEnded = sessions.filter(s => s.ended).slice(0, 3);
  return (
    <div style={S.content}>
      <button onClick={onNew} style={S.newBtn}><PlusIcon size={20}/> New Session</button>
      {activeSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Active Sessions</h3>
          {activeSessions.map(s => <SessionCard key={s.id} session={s} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {recentEnded.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Recent</h3>
          {recentEnded.map(s => <SessionCard key={s.id} session={s} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {sessions.length === 0 && (
        <div style={S.empty}>
          <span style={{ fontSize: 48, opacity: 0.3 }}>♠♥♣♦</span>
          <p style={{ color: "#9ca3af", marginTop: 12 }}>No sessions yet. Start your first game!</p>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onClick, onDelete }) {
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
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={S.iconBtn}><TrashIcon size={14} color="#6b7280"/></button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Session View ───
function ActiveView({ session, updateSession, setModal, onEnd }) {
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
        <StatBox label="Total Pot" value={fmtMoney(totalBuyins)} />
        <StatBox label="Cashed Out" value={`${cashedOutCount}/${session.players.length}`} />
        {allCashedOut && <StatBox label="Balance" value={balance === 0 ? "✓ OK" : `⚠ ${fmt(balance)}`} color={balance === 0 ? "#4ade80" : "#f59e0b"} />}
      </div>

      <div style={S.actions}>
        <button onClick={() => setModal({ type: "addPlayer" })} style={S.actionBtn}><PlusIcon size={16}/> Add Player</button>
        <button onClick={() => setModal({ type: "buyin" })} style={S.actionBtnAlt}>Buy-in / Rebuy</button>
        <button onClick={() => setModal({ type: "cashout" })} style={S.actionBtnAlt}>Cash Out</button>
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
                <span style={{ flex: 2, fontWeight: 600, color: "#e5e7eb" }}>{p.name}</span>
                <span style={{ flex: 2, textAlign: "right", color: "#d1d5db" }}>
                  {fmtMoney(totalBuyin)}
                  {p.buyins.length > 1 && <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 4 }}>({p.buyins.map(b => fmtMoney(b)).join(" + ")})</span>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", color: p.cashout !== null ? "#d1d5db" : "#4b5563" }}>
                  {p.cashout !== null ? fmtMoney(p.cashout) : "—"}
                  {p.cashout !== null && <button onClick={() => undoCashout(p.id)} style={{ ...S.tinyBtn, marginLeft: 4 }} title="Undo">↩</button>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 600, color: profit !== null ? profitColor(profit) : "#4b5563" }}>
                  {profit !== null ? fmt(profit) : "—"}
                </span>
                <span style={{ flex: 0.5, textAlign: "right" }}>
                  {p.cashout === null && <button onClick={() => removePlayer(p.id)} style={S.tinyBtn}><TrashIcon size={12} color="#6b7280"/></button>}
                </span>
              </div>
            );
          })}
          <div style={S.tableTotal}>
            <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
            <span style={{ flex: 2, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{cashedOutCount > 0 ? fmtMoney(totalCashouts) : "—"}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#4b5563" }}>{allCashedOut ? fmt(balance) : "—"}</span>
            <span style={{ flex: 0.5 }}/>
          </div>
        </div>
      ) : (
        <div style={S.empty}><p style={{ color: "#6b7280" }}>Add players to get started</p></div>
      )}

      {session.players.length > 0 && (
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
function SummaryView({ session, onResume, onBack }) {
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
            <div style={S.summaryStatLabel}>Total Pot</div>
            <div style={S.summaryStatVal}>{fmtMoney(totalBuyins)}</div>
          </div>
          {allCashedOut && (
            <div style={S.summaryStatBox}>
              <div style={S.summaryStatLabel}>Balance</div>
              <div style={{ ...S.summaryStatVal, color: balance === 0 ? "#4ade80" : "#f59e0b" }}>{balance === 0 ? "✓" : `⚠ ${fmt(balance)}`}</div>
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
              <div key={p.id} style={{ ...S.summaryTableRow, ...(i === 0 && profit > 0 ? { background: "rgba(74,222,128,0.06)" } : {}), ...(i === sorted.length - 1 && profit < 0 ? { background: "rgba(248,113,113,0.06)" } : {}) }}>
                <span style={{ flex: 0.4, textAlign: "center", color: "#6b7280", fontSize: 12 }}>{i + 1}</span>
                <span style={{ flex: 2, fontWeight: 600, color: "#e5e7eb" }}>
                  {p.name}{i === 0 && profit > 0 && <span style={{ marginLeft: 6, fontSize: 12 }}>👑</span>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", color: "#9ca3af" }}>{fmtMoney(totalBuyin)}</span>
                <span style={{ flex: 1.5, textAlign: "right", color: "#9ca3af" }}>{p.cashout !== null ? fmtMoney(p.cashout) : "—"}</span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profit !== null ? profitColor(profit) : "#4b5563", fontSize: 15 }}>{profit !== null ? fmt(profit) : "—"}</span>
              </div>
            );
          })}
          <div style={S.summaryTableTotalRow}>
            <span style={{ flex: 0.4 }}/>
            <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalCashouts)}</span>
            <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#4b5563" }}>{allCashedOut ? fmt(balance) : "—"}</span>
          </div>
        </div>
        <div style={S.summaryFooter}>Poker Tracker · {new Date(session.date).toLocaleDateString()}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={S.actionBtnAlt}><ChevronIcon dir="left" size={14}/> Home</button>
        {session.ended && <button onClick={onResume} style={S.actionBtnAlt}>Reopen Session</button>}
      </div>
    </div>
  );
}

// ─── History View ───
function HistoryView({ sessions, onOpen, onDelete }) {
  const ended = sessions.filter(s => s.ended);
  if (ended.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#6b7280" }}>No completed sessions yet</p></div></div>
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
                <span style={{ flex: 0.3, textAlign: "center", color: "#6b7280" }}>{i + 1}</span>
                <span style={{ flex: 2, fontWeight: 600, color: "#e5e7eb" }}>{name}{i === 0 && " 👑"}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#9ca3af" }}>{st.sessions}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#9ca3af" }}>{Math.round(st.wins / st.sessions * 100)}%</span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profitColor(st.totalProfit) }}>{fmt(st.totalProfit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>Past Sessions</h3>
        {ended.map(s => <SessionCard key={s.id} session={s} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
      </div>
    </div>
  );
}

// ─── Analytics View ───
function AnalyticsView({ sessions, onExport }) {
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
      <div style={{ background: "#1a1f2b", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "#e5e7eb", marginBottom: 6 }}>{point?.fullLabel || point?.label || label}</div>
        {point?.date && <div style={{ color: "#6b7280", marginBottom: 6 }}>{point.date}</div>}
        {payload.sort((a, b) => b.value - a.value).map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color, marginBottom: 2 }}>
            <span>{p.dataKey}</span>
            <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (ended.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#6b7280" }}>Need completed sessions for analytics</p></div></div>
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
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#1f2937" }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#1f2937" }} tickLine={false} tickFormatter={v => v === 0 ? "0" : fmt(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid #1f2937" }}>
              {regulars.map((name, i) => {
                const isHidden = hiddenPlayers.has(name);
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <button
                    key={name}
                    onClick={() => togglePlayer(name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 6, border: "1px solid #2d3748",
                      background: isHidden ? "transparent" : "rgba(255,255,255,0.04)",
                      cursor: "pointer", fontSize: 12, color: isHidden ? "#4b5563" : "#d1d5db",
                      opacity: isHidden ? 0.5 : 1, transition: "all 0.15s"
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: isHidden ? "#4b5563" : color, display: "inline-block" }} />
                    {name}
                  </button>
                );
              })}
            </div>
            {regulars.length < allPlayerNames.length && (
              <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
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
                <span style={{ flex: 1.8, fontWeight: 600, color: "#e5e7eb" }}>{i === 0 && "👑 "}{st.name}</span>
                <span style={{ flex: 0.7, textAlign: "right", color: "#9ca3af" }}>{st.sessions}</span>
                <span style={{ flex: 0.8, textAlign: "right", color: "#9ca3af" }}>{Math.round(st.wins / st.sessions * 100)}%</span>
                <span style={{ flex: 1.2, textAlign: "right", fontWeight: 700, color: profitColor(st.totalProfit) }}>{fmt(st.totalProfit)}</span>
                <span style={{ flex: 1, textAlign: "right", color: profitColor(st.totalProfit / st.sessions) }}>{fmt(Math.round(st.totalProfit / st.sessions * 100) / 100)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#4ade80" }}>{st.biggestWin > 0 ? fmt(st.biggestWin) : "—"}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#f87171" }}>{st.biggestLoss < 0 ? fmt(st.biggestLoss) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={onExport} style={S.exportBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export All Sessions (CSV)
        </button>
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
    const name = val.trim();
    const amount = parseFloat(val2);
    if (!name) return;
    updateSession(activeId, s => {
      if (s.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return s;
      s.players.push({ id: uid(), name, buyins: amount > 0 ? [amount] : [], cashout: null });
      return s;
    });
    setVal(""); setVal2(""); inputRef.current?.focus();
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
const S = {
  app: { fontFamily: "'SF Pro Display', 'Segoe UI', -apple-system, sans-serif", background: "#0c0f14", color: "#d1d5db", minHeight: "100vh", maxWidth: 600, margin: "0 auto", paddingBottom: 40 },
  loading: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  spinner: { width: 32, height: 32, border: "3px solid #1f2937", borderTopColor: "#4ade80", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #1a1f2b", position: "sticky", top: 0, background: "#0c0f14", zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  logo: { fontSize: 24, color: "#4ade80", fontWeight: 800 },
  title: { fontSize: 17, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.3px" },
  nav: { display: "flex", gap: 2 },
  navBtn: { background: "none", border: "none", color: "#6b7280", padding: "6px 10px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  navBtnActive: { background: "#1a2332", color: "#4ade80" },
  content: { padding: "16px" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, margin: 0, marginBottom: 10 },
  newBtn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #166534, #15803d)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  card: { background: "#141820", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#e5e7eb" },
  cardSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  cardPot: { fontSize: 15, fontWeight: 700, color: "#4ade80" },
  liveBadge: { background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: 0.5 },
  sessionHeader: { marginBottom: 16 },
  sessionName: { fontSize: 22, fontWeight: 700, color: "#e5e7eb", margin: 0 },
  sessionMeta: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  statsRow: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  statBox: { flex: 1, background: "#141820", border: "1px solid #1f2937", borderRadius: 10, padding: "12px 14px", minWidth: 90 },
  statLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8 },
  statValue: { fontSize: 20, fontWeight: 700, color: "#e5e7eb", marginTop: 4 },
  actions: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  actionBtn: { padding: "10px 14px", background: "#166534", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  actionBtnAlt: { padding: "10px 14px", background: "#1a2332", color: "#d1d5db", border: "1px solid #1f2937", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  table: { background: "#141820", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" },
  tableHead: { display: "flex", padding: "10px 14px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid #1f2937" },
  tableRow: { display: "flex", padding: "11px 14px", alignItems: "center", borderBottom: "1px solid rgba(31,41,55,0.5)", fontSize: 13 },
  tableTotal: { display: "flex", padding: "11px 14px", alignItems: "center", fontSize: 13, color: "#e5e7eb", background: "rgba(31,41,55,0.3)" },
  tinyBtn: { background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.6, display: "inline-flex" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.5, display: "inline-flex", borderRadius: 4 },
  endBtn: { width: "100%", padding: "14px", background: "none", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 20 },
  empty: { textAlign: "center", padding: "48px 20px" },
  chartCard: { background: "#141820", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 12px" },
  exportBtn: { width: "100%", padding: "14px", background: "#1a2332", color: "#d1d5db", border: "1px solid #1f2937", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  summaryCard: { background: "linear-gradient(180deg, #111827, #0c1017)", border: "1px solid #1f2937", borderRadius: 16, overflow: "hidden" },
  summaryHeader: { display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 0" },
  summaryLogo: { fontSize: 32, color: "#4ade80", fontWeight: 800 },
  summaryTitle: { fontSize: 20, fontWeight: 700, color: "#e5e7eb", margin: 0 },
  summarySub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  summaryStatsRow: { display: "flex", gap: 10, padding: "16px 20px", flexWrap: "wrap" },
  summaryStatBox: { flex: 1, background: "rgba(31,41,55,0.4)", borderRadius: 10, padding: "12px", minWidth: 80, textAlign: "center" },
  summaryStatLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 },
  summaryStatVal: { fontSize: 22, fontWeight: 700, color: "#e5e7eb" },
  summaryTable: { margin: "0 12px" },
  summaryTableHead: { display: "flex", padding: "8px 10px", fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid #1f2937" },
  summaryTableRow: { display: "flex", padding: "10px 10px", alignItems: "center", fontSize: 13, borderBottom: "1px solid rgba(31,41,55,0.4)" },
  summaryTableTotalRow: { display: "flex", padding: "10px 10px", alignItems: "center", fontSize: 13, color: "#e5e7eb", background: "rgba(31,41,55,0.3)", borderRadius: "0 0 8px 8px" },
  summaryFooter: { textAlign: "center", padding: "14px", fontSize: 11, color: "#374151", letterSpacing: 0.5 },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 },
  modal: { background: "#1a1f2b", border: "1px solid #2d3748", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 },
  modalTitle: { fontSize: 17, fontWeight: 700, color: "#e5e7eb", margin: "0 0 16px" },
  input: { width: "100%", padding: "12px 14px", background: "#0c0f14", border: "1px solid #2d3748", borderRadius: 8, color: "#e5e7eb", fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "12px 14px", background: "#0c0f14", border: "1px solid #2d3748", borderRadius: 8, color: "#e5e7eb", fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" },
  modalBtn: { width: "100%", padding: "12px", background: "#166534", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  modalBtnAlt: { width: "100%", padding: "12px", background: "#1f2937", color: "#d1d5db", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
};

if (typeof document !== "undefined") {
  const el = document.createElement("style");
  el.textContent = `@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} body{margin:0;background:#0c0f14} .recharts-surface{overflow:visible}`;
  document.head.appendChild(el);
}
