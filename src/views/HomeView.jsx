import { useMemo } from "react";
import { S, F } from "../styles";
import { fmtMoney, fmt, exportJSON } from "../utils";
import { PlusIcon } from "../components/icons";
import SessionCard from "../components/SessionCard";

export default function HomeView({ sessions, isAdmin, onNew, onOpen, precomputedStats }) {
  const activeSessions = sessions.filter(s => !s.ended);
  const recentEnded = sessions.filter(s => s.ended).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);

  const seriesStats = useMemo(() => {
    if (precomputedStats) return precomputedStats;
    const ended = sessions.filter(s => s.ended);
    const thisYear = new Date().getFullYear();

    const sessionsThisYear = ended.filter(s => new Date(s.date).getFullYear() === thisYear).length;

    const allBuyins = [];
    ended.forEach(s => s.players.forEach(p => {
      const total = p.buyins.reduce((a, x) => a + x, 0);
      if (total > 0) allBuyins.push(total);
    }));
    const sortedBuyins = [...allBuyins].sort((a, b) => a - b);
    const mid = Math.floor(sortedBuyins.length / 2);
    const typicalBuyin = sortedBuyins.length > 0
      ? sortedBuyins.length % 2 !== 0 ? sortedBuyins[mid] : (sortedBuyins[mid - 1] + sortedBuyins[mid]) / 2
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

    let biggestWin = null;
    let biggestLoss = null;
    ended.forEach(s => s.players.forEach(p => {
      if (p.cashout === null) return;
      const profit = p.cashout - p.buyins.reduce((a, x) => a + x, 0);
      if (biggestWin === null || profit > biggestWin) biggestWin = profit;
      if (biggestLoss === null || profit < biggestLoss) biggestLoss = profit;
    }));

    return { sessionsThisYear, typicalBuyin, longestSession, biggestWin, biggestLoss, thisYear };
  }, [sessions, precomputedStats]);

  const hasSeriesData = sessions.filter(s => s.ended).length > 0;

  const statLabel = {
    fontSize: 10, color: "#7a5030", textTransform: "uppercase",
    letterSpacing: "2px", fontFamily: F, marginTop: 5
  };
  const statValue = {
    fontSize: 32, fontWeight: 700, color: "#2a0a08", lineHeight: 1
  };

  return (
    <div style={S.content}>
      {hasSeriesData && (
        <div style={{ ...S.section, paddingBottom: 24, borderBottom: "1px solid rgba(212,184,152,0.6)" }}>
          <h3 style={S.sectionTitle}>Series</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 28, columnGap: 16 }}>

            <div>
              <div style={statValue}>{seriesStats.sessionsThisYear}</div>
              <div style={statLabel}>Sessions in {seriesStats.thisYear}</div>
            </div>

            <div>
              <div style={statValue}>{seriesStats.typicalBuyin !== null ? fmtMoney(Math.round(seriesStats.typicalBuyin)) : "—"}</div>
              <div style={statLabel}>Typical Buy-in</div>
            </div>

            <div>
              <div style={statValue}>{seriesStats.longestSession || "—"}</div>
              <div style={statLabel}>Longest Session</div>
            </div>

            <div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#2a0a08", lineHeight: 1 }}>
                {seriesStats.biggestWin !== null ? fmt(seriesStats.biggestWin) : "—"}
                <span style={{ fontWeight: 300, color: "#b89878", margin: "0 5px" }}>/</span>
                {seriesStats.biggestLoss !== null ? fmt(seriesStats.biggestLoss) : "—"}
              </div>
              <div style={statLabel}>Best &amp; Worst Night</div>
            </div>

          </div>
        </div>
      )}

      {activeSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Active</h3>
          {activeSessions.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} />)}
        </div>
      )}

      {recentEnded.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Recent</h3>
          {recentEnded.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} />)}
        </div>
      )}

      {sessions.length === 0 && (
        <div style={S.empty}>
          <span style={{ fontSize: 48, opacity: 0.3 }}>♠♥♣♦</span>
          <p style={{ color: "#7a5030", marginTop: 12 }}>No sessions yet. Start your first game!</p>
        </div>
      )}

      {isAdmin && <button onClick={onNew} style={{ ...S.newBtn, marginTop: 32 }}><PlusIcon size={20}/> New Session</button>}

      {isAdmin && sessions.length > 0 && (
        <div style={{ marginTop: 16, paddingBottom: 8, textAlign: "center" }}>
          <button
            onClick={() => exportJSON(sessions)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "#b89878", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", fontFamily: F, opacity: 0.7, padding: "8px 12px" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Backup Data
          </button>
        </div>
      )}
    </div>
  );
}
