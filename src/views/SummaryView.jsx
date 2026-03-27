import { useRef } from "react";
import { fmtMoney, fmt, profitColor } from "../utils";
import { handleShare } from "../share";
import { S } from "../styles";
import { ChevronIcon } from "../components/icons";

export default function SummaryView({ session, isAdmin, onResume, onBack }) {
  const shareRef = useRef(null);

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

  const PlayerTableRows = ({ forShare }) =>
    sorted.map((p, i) => {
      const totalBuyin = p.buyins.reduce((a, x) => a + x, 0);
      const profit = p.cashout !== null ? p.cashout - totalBuyin : null;
      return (
        <div key={p.id} style={S.summaryTableRow}>
          <span style={{ flex: 0.4, textAlign: "center", color: "#7a5030", fontSize: 12 }}>{i + 1}</span>
          <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{p.name}</span>
          <span {...(forShare ? {} : { "data-num": "1" })} style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{fmtMoney(totalBuyin)}</span>
          <span {...(forShare ? {} : { "data-num": "1" })} style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{p.cashout !== null ? fmtMoney(p.cashout) : "—"}</span>
          <span {...(forShare ? {} : { "data-num": "1" })} style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profit !== null ? profitColor(profit) : "#707070", fontSize: 15 }}>{profit !== null ? fmt(profit) : "—"}</span>
        </div>
      );
    });

  return (
    <div style={S.content}>
      {/* Hidden share card — off-screen so font swap during capture is invisible */}
      <div ref={shareRef} style={{ position: "absolute", left: -9999, top: 0, width: 420 }}>
        <div style={S.summaryCard}>
          <div style={S.summaryHeader}>
            <div>
              <h2 style={S.summaryTitle}>{/^Session \d+$/.test(session.name) ? dateStr : session.name}</h2>
              <div style={S.summarySub}>{/^Session \d+$/.test(session.name) ? "" : dateStr}</div>
            </div>
          </div>
          <div style={{ ...S.summaryTable, paddingTop: 14 }}>
            <div style={S.summaryTableHead}>
              <span style={{ flex: 0.4, textAlign: "center" }}>#</span>
              <span style={{ flex: 2 }}>Player</span>
              <span style={{ flex: 1.5, textAlign: "right" }}>Buy-in</span>
              <span style={{ flex: 1.5, textAlign: "right" }}>Cash Out</span>
              <span style={{ flex: 1.5, textAlign: "right" }}>Net</span>
            </div>
            <PlayerTableRows forShare={true} />
            <div style={S.summaryTableTotalRow}>
              <span style={{ flex: 0.4 }}/>
              <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
              <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
              <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalCashouts)}</span>
              <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#707070" }}>{allCashedOut ? fmt(balance) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visible summary card */}
      <div style={S.summaryCard}>
        <div style={S.summaryHeader}>
          <div>
            <h2 style={S.summaryTitle}>{session.name}</h2>
            <div style={S.summarySub}>{dateStr}</div>
          </div>
        </div>
        <div style={S.summaryStatsRow}>
          <div style={S.summaryStatBox}>
            <div style={S.summaryStatLabel}>Players</div>
            <div data-num="1" style={S.summaryStatVal}>{session.players.length}</div>
          </div>
          <div style={S.summaryStatBox}>
            <div style={S.summaryStatLabel}>Total Buy-in</div>
            <div data-num="1" style={S.summaryStatVal}>{fmtMoney(totalBuyins)}</div>
          </div>
          {allCashedOut && (
            <div style={S.summaryStatBox}>
              <div style={S.summaryStatLabel}>Balance</div>
              <div data-num="1" style={{ ...S.summaryStatVal, color: "#2a0a08" }}>{balance === 0 ? "✓" : fmt(balance)}</div>
            </div>
          )}
        </div>
        <div style={S.summaryTable}>
          <div style={S.summaryTableHead}>
            <span style={{ flex: 0.4, textAlign: "center" }}>#</span>
            <span style={{ flex: 2 }}>Player</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Net</span>
          </div>
          <PlayerTableRows forShare={false} />
          <div style={S.summaryTableTotalRow}>
            <span style={{ flex: 0.4 }}/>
            <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
            <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalCashouts)}</span>
            <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#707070" }}>{allCashedOut ? fmt(balance) : "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px 12px" }}>
          <span style={{ color: "#c4a882", fontSize: 16, lineHeight: 1 }}>❧</span>
          <div style={{ flex: 1, height: 1, background: "#c4a882", opacity: 0.6 }} />
          <span style={{ color: "#c4a882", fontSize: 16, lineHeight: 1 }}>☙</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={S.actionBtnAlt}><ChevronIcon dir="left" size={14}/> Home</button>
        {isAdmin && session.ended && <button onClick={onResume} style={S.actionBtnAlt}>Reopen Session</button>}
        <button onClick={() => handleShare(shareRef)} style={S.actionBtnAlt}>Share</button>
      </div>
    </div>
  );
}
