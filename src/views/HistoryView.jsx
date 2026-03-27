import { fmt, profitColor } from "../utils";
import { S } from "../styles";
import SessionCard from "../components/SessionCard";

export default function HistoryView({ sessions, isAdmin, onOpen, onDelete }) {
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
                <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{name}</span>
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
