import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { fmt, fmtMoney, profitColor } from "../utils";
import { S } from "../styles";
import { ChevronIcon } from "../components/icons";
import StatBox from "../components/StatBox";

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
            <span style={{ flex: 1.2, textAlign: "right" }}>Net</span>
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

export default function PlayerSearchView({ sessions }) {
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
