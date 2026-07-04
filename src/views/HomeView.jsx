import { useMemo } from "react";
import { S, F } from "../styles";
import { fmtMoney, fmt, exportJSON } from "../utils";
import { PlusIcon } from "../components/icons";
import SessionCard from "../components/SessionCard";

export default function HomeView({ sessions, isAdmin, onNew, onOpen, precomputedStats, seriesOnly = false }) {
  // The homepage is admin-only, so the full history is shown (share viewers
  // only ever see their own session via /s/<token>)
  const activeSessions = sessions.filter(s => !s.ended);
  const endedSessions = sessions.filter(s => s.ended).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Mirrors computeSeriesStats in api/session.js (share viewers get that one as
  // precomputedStats, minus lastWinName — names never leave the server)
  const seriesStats = useMemo(() => {
    if (precomputedStats) return precomputedStats;
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

    let lastWin = null, lastWinName = null;
    if (last) {
      last.players.forEach(p => {
        if (p.cashout === null) return;
        const profit = p.cashout - p.buyins.reduce((a, x) => a + x, 0);
        if (lastWin === null || profit > lastWin) { lastWin = profit; lastWinName = p.name; }
      });
    }

    return { sessionsThisYear, moneyThisYear, lastDate: last ? last.date : null, lastWin, lastWinName, thisYear };
  }, [sessions, precomputedStats]);

  // Day math stays client-side (the server clock is UTC and its response is
  // edge-cached, so a precomputed "days since" could be stale or off by one)
  const daysSinceLast = (() => {
    if (!seriesStats.lastDate) return null;
    const d0 = new Date(seriesStats.lastDate); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(); d1.setHours(0, 0, 0, 0);
    return Math.round((d1 - d0) / 86400000);
  })();

  const hasSeriesData = precomputedStats ? true : sessions.filter(s => s.ended).length > 0;

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
              <div style={statValue}>
                {daysSinceLast === null ? "—"
                  : daysSinceLast <= 0 ? "Tonight"
                  : `${daysSinceLast} ${daysSinceLast === 1 ? "day" : "days"}`}
              </div>
              <div style={statLabel}>Since Last Night</div>
            </div>

            <div>
              <div style={statValue}>{seriesStats.moneyThisYear !== null ? fmtMoney(seriesStats.moneyThisYear) : "—"}</div>
              <div style={statLabel}>On the Table in {seriesStats.thisYear}</div>
            </div>

            <div>
              <div style={statValue}>
                {seriesStats.lastWin !== null ? fmt(seriesStats.lastWin) : "—"}
                {seriesStats.lastWinName && (
                  <span style={{ fontWeight: 300, fontSize: 16, color: "#7a5030", marginLeft: 8 }}>{seriesStats.lastWinName}</span>
                )}
              </div>
              <div style={statLabel}>Last Night's Top Win</div>
            </div>

          </div>
        </div>
      )}

      {!seriesOnly && activeSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Active</h3>
          {activeSessions.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} />)}
        </div>
      )}

      {!seriesOnly && endedSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>History</h3>
          {/* Fixed-height scroll area: the page itself must not grow with the
              history, so New Session / Backup stay reachable at the bottom */}
          <div style={{ maxHeight: "min(45vh, 380px)", overflowY: "auto", WebkitOverflowScrolling: "touch", paddingRight: 4 }}>
            {endedSessions.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} />)}
          </div>
        </div>
      )}

      {!seriesOnly && sessions.length === 0 && (
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
