import { useRef, useState } from "react";
import { fmtMoney, fmt, profitColor } from "../utils";
import { handleShare } from "../share";
import { S, F } from "../styles";
import { PlusIcon, TrashIcon } from "../components/icons";
import StatBox from "../components/StatBox";

export default function ActiveView({ session, isAdmin, updateSession, setModal, onEnd }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const totalBuyins = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);
  const totalCashouts = session.players.filter(p => p.cashout !== null).reduce((a, p) => a + p.cashout, 0);
  const cashedOutCount = session.players.filter(p => p.cashout !== null).length;
  const allCashedOut = session.players.length > 0 && cashedOutCount === session.players.length;
  const balance = allCashedOut ? totalCashouts - totalBuyins : null;
  const cardRef = useRef(null);

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

  const dateStr = new Date(session.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const sorted = [...session.players].sort((a, b) => {
    const pa = a.cashout !== null ? a.cashout - a.buyins.reduce((s, x) => s + x, 0) : -Infinity;
    const pb = b.cashout !== null ? b.cashout - b.buyins.reduce((s, x) => s + x, 0) : -Infinity;
    return pb - pa;
  });

  return (
    <div style={S.content}>
      {/* Hidden share card */}
      <div ref={cardRef} style={{ position: "absolute", left: -9999, top: 0, width: 420 }}>
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
            {sorted.map((p, i) => {
              const totalBuyin = p.buyins.reduce((a, x) => a + x, 0);
              const profit = p.cashout !== null ? p.cashout - totalBuyin : null;
              return (
                <div key={p.id} style={S.summaryTableRow}>
                  <span style={{ flex: 0.4, textAlign: "center", color: "#7a5030", fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{p.name}</span>
                  <span data-num="1" style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{fmtMoney(totalBuyin)}</span>
                  <span data-num="1" style={{ flex: 1.5, textAlign: "right", color: "#2a0a08" }}>{p.cashout !== null ? fmtMoney(p.cashout) : "—"}</span>
                  <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700, color: profitColor(profit), fontSize: 15 }}>{profit !== null ? fmt(profit) : "—"}</span>
                </div>
              );
            })}
            <div style={S.summaryTableTotalRow}>
              <span style={{ flex: 0.4 }}/>
              <span style={{ flex: 2, fontWeight: 700 }}>Total</span>
              <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
              <span data-num="1" style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>{cashedOutCount > 0 ? fmtMoney(totalCashouts) : "—"}</span>
              <span style={{ flex: 1.5, textAlign: "right", fontWeight: 700 }}>—</span>
            </div>
          </div>
        </div>
      </div>

      <div style={S.sessionHeader}>
        <h2 style={S.sessionName}>{session.name}</h2>
        <div style={S.sessionMeta}>{new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {session.players.length} players</div>
      </div>

      <div style={S.statsRow}>
        <StatBox label="Total Buy-in" value={fmtMoney(totalBuyins)} />
        <StatBox label="Cashed Out" value={`${cashedOutCount}/${session.players.length}`} />
        {allCashedOut && <StatBox label="Balance" value={balance === 0 ? "✓ OK" : fmt(balance)} color="#ffffff" />}
      </div>

      <div style={S.actions}>
        {isAdmin && <button onClick={() => setModal({ type: "addPlayer" })} style={S.actionBtn}><PlusIcon size={16}/> Add Player</button>}
        {isAdmin && <button onClick={() => setModal({ type: "buyin" })} style={S.actionBtnAlt}>Rebuy</button>}
        {isAdmin && <button onClick={() => setModal({ type: "cashout" })} style={S.actionBtnAlt}>Cash Out</button>}
        {session.players.length > 0 && <button onClick={() => handleShare(cardRef)} style={S.actionBtnAlt}>Share</button>}
      </div>

      {session.players.length > 0 ? (
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ flex: 2 }}>Player</span>
            <span style={{ flex: 2, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>Net</span>
            <span style={{ flex: 0.5 }}/>
          </div>
          {session.players.map(p => {
            const totalBuyin = p.buyins.reduce((a, x) => a + x, 0);
            const profit = p.cashout !== null ? p.cashout - totalBuyin : null;
            const isConfirming = confirmingId === p.id;

            if (isConfirming) return (
              <div key={p.id} style={{ ...S.tableRow, borderBottom: "1px solid rgba(69,2,6,0.3)" }}>
                <span style={{ flex: 1, fontWeight: 600, color: "#2a0a08" }}>{p.name}</span>
                <span style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setConfirmingId(null)} style={{ background: "none", border: "1px solid #d4b898", borderRadius: 20, padding: "5px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer", color: "#7a5030", letterSpacing: "1px", textTransform: "uppercase", fontFamily: F }}>Cancel</button>
                  <button onClick={() => { removePlayer(p.id); setConfirmingId(null); }} style={{ background: "#450206", border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", color: "#ffffff", letterSpacing: "1px", textTransform: "uppercase", fontFamily: F }}>Delete</button>
                </span>
              </div>
            );

            return (
              <div key={p.id} style={S.tableRow}>
                <span style={{ flex: 2, fontWeight: 600, color: "#2a0a08" }}>{p.name}</span>
                <span style={{ flex: 2, textAlign: "right", color: "#2a0a08" }}>
                  {fmtMoney(totalBuyin)}
                  {p.buyins.length > 1 && <span style={{ color: "#7a5030", fontSize: 11, marginLeft: 4 }}>({p.buyins.map(b => fmtMoney(b)).join(" + ")})</span>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", color: p.cashout !== null ? "#2a0a08" : "#7a5030" }}>
                  {p.cashout !== null ? fmtMoney(p.cashout) : "—"}
                  {isAdmin && p.cashout !== null && <button onClick={() => undoCashout(p.id)} style={{ ...S.tinyBtn, marginLeft: 4, color: "#450206" }} title="Undo">↺</button>}
                </span>
                <span style={{ flex: 1.5, textAlign: "right", fontWeight: 600, color: profit !== null ? profitColor(profit) : "#707070" }}>
                  {profit !== null ? fmt(profit) : "—"}
                </span>
                <span style={{ flex: 0.5, textAlign: "right" }}>
                  {isAdmin && p.cashout === null && <button onClick={() => setConfirmingId(p.id)} style={S.tinyBtn}><TrashIcon size={12} color="#707070"/></button>}
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
