import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { fmt, fmtMoney, profitColor, corrColor, CHART_COLORS } from "../utils";
import { S, F } from "../styles";

// ─── Highlight Card ───
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

// ─── Export Button ───
function ExportBtn({ onExport }) {
  return (
    <div style={{ marginTop: 24 }}>
      <button onClick={onExport} style={S.exportBtn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Backup All Sessions (JSON)
      </button>
    </div>
  );
}

// ─── Limited Stats View (admin + view-only) ───
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

  if (window4.length === 0) return (
    <div style={S.content}><div style={S.empty}><p style={{ color: "#707070" }}>Need completed sessions for stats</p></div></div>
  );

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

      {isAdmin && <ExportBtn onExport={onExport} />}
    </div>
  );
}

// ─── Analytics View (superadmin) ───
export default function AnalyticsView({ sessions, isAdmin, isSuperAdmin, onExport }) {
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
            {detailedStats.map((st) => (
              <div key={st.name} style={S.tableRow}>
                <span style={{ flex: 1.8, fontWeight: 600, color: "#2a0a08" }}>{st.name}</span>
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

      {isAdmin && <ExportBtn onExport={onExport} />}
    </div>
  );
}
