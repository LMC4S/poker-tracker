import { fmtMoney } from "../utils";
import { S } from "../styles";

export default function SessionCard({ session, onClick, isAdmin }) {
  const d = new Date(session.date);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const playerCount = session.players.length;
  const totalPot = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);

  return (
    <div style={S.card} onClick={onClick}>
      <div style={S.cardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.cardTitle}>{session.name}</div>
          <div style={S.cardSub}>{dateStr} · {playerCount} player{playerCount !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!session.ended && <span style={S.liveBadge}>LIVE</span>}
          <span style={S.cardPot}>{fmtMoney(totalPot)}</span>
        </div>
      </div>
    </div>
  );
}
