import { useState, useEffect } from "react";
import { fmtMoney, fmt, profitColor, logLabel, fmtDuration } from "../utils";
import { S, F } from "../styles";
import { PlusIcon, TrashIcon } from "../components/icons";
import QRModal from "../components/QRModal";
import EditableName from "../components/EditableName";
import EditableAmount from "../components/EditableAmount";

export default function ActiveView({ session, isAdmin, actions, setModal, onEnd, onRevoke, onRegenerate }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [, setTick] = useState(0);
  // Re-render every 30s so the running-session clock stays current
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const totalBuyins = session.players.reduce((a, p) => a + p.buyins.reduce((b, x) => b + x, 0), 0);
  const totalCashouts = session.players.filter(p => p.cashout !== null).reduce((a, p) => a + p.cashout, 0);
  const cashedOutCount = session.players.filter(p => p.cashout !== null).length;
  const allCashedOut = session.players.length > 0 && cashedOutCount === session.players.length;
  const balance = allCashedOut ? totalCashouts - totalBuyins : null;

  const removePlayer = (pid) => actions.removePlayer(session.id, pid);
  const undoCashout = (pid) => actions.undoCashout(session.id, pid);

  // Once everyone is cashed out the night is settled: freeze the clock at the
  // derived end (last cash-out) so a next-day reopen for bookkeeping doesn't
  // tick toward a bogus 14h. Anyone still uncashed means live play — keep ticking.
  const runningMs = allCashedOut && session.endDate
    ? new Date(session.endDate) - new Date(session.date)
    : Date.now() - new Date(session.date).getTime();

  return (
    <div style={S.content}>
      <div style={S.sessionHeader}>
        <h2 style={S.sessionName}>{session.name}</h2>
        <div style={S.sessionMeta}>{new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {session.players.length} players · ● Running {fmtDuration(runningMs)}</div>
      </div>

      <div style={S.actions}>
        {isAdmin && <button onClick={() => setModal({ type: "addPlayer" })} style={S.actionBtn}><PlusIcon size={16}/> Add Player</button>}
        {isAdmin && <button onClick={() => setModal({ type: "buyin" })} style={S.actionBtnAlt}>Rebuy</button>}
        {/* Shown even when the link is revoked — the modal is where a new one is created */}
        {isAdmin && <button onClick={() => setShowQR(true)} style={S.actionBtnAlt}>QR Code</button>}
        {showQR && <QRModal session={session} onClose={() => setShowQR(false)} onRevoke={onRevoke} onRegenerate={onRegenerate} />}
      </div>

      {session.players.length > 0 ? (
        <div style={S.table}>
          <div style={S.tableHead}>
            <span style={{ flex: 1.4 }}>Player</span>
            <span style={{ flex: 1.7, textAlign: "right" }}>Buy-in</span>
            <span style={{ flex: 1.7, textAlign: "right" }}>Cash Out</span>
            <span style={{ flex: 1.7, textAlign: "right" }}>Net</span>
            <span style={{ flex: 0.4 }}/>
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
                <EditableName name={p.name} canEdit={isAdmin} onRename={(name) => actions.renamePlayer(session.id, p.id, name)} style={{ flex: 1.4, minWidth: 0, fontWeight: 600, color: "#2a0a08", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
                <span style={{ flex: 1.7, display: "flex", flexDirection: "column", alignItems: "flex-end", color: "#2a0a08" }}>
                  <span>{fmtMoney(totalBuyin)}</span>
                  {p.buyins.length > 1 && <span style={{ color: "#7a5030", fontSize: 11, marginTop: 1, lineHeight: 1.2 }}>{p.buyins.map(b => fmtMoney(b)).join(" + ")}</span>}
                </span>
                <span style={{ flex: 1.7, textAlign: "right", color: p.cashout !== null ? "#2a0a08" : "#7a5030", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                  {p.cashout !== null ? (
                    <>
                      <EditableAmount amount={p.cashout} canEdit={isAdmin} onEdit={(amount) => actions.editCashout(session.id, p.id, amount)} />
                      {isAdmin && <button onClick={() => undoCashout(p.id)} style={{ ...S.tinyBtn, color: "#450206" }} title="Undo">↺</button>}
                    </>
                  ) : !isAdmin ? "—" : (
                    <button onClick={() => setModal({ type: "cashout", playerId: p.id })} style={S.cashoutDash} title="Cash out">—</button>
                  )}
                </span>
                <span style={{ flex: 1.7, textAlign: "right", fontWeight: 600, color: profit !== null ? profitColor(profit) : "#707070" }}>
                  {profit !== null ? fmt(profit) : "—"}
                </span>
                <span style={{ flex: 0.4, textAlign: "right" }}>
                  {isAdmin && p.cashout === null && <button onClick={() => setConfirmingId(p.id)} style={S.tinyBtn}><TrashIcon size={12} color="#707070"/></button>}
                </span>
              </div>
            );
          })}
          <div style={S.tableTotal}>
            <span style={{ flex: 1.4, fontWeight: 700 }}>Total</span>
            <span style={{ flex: 1.7, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalBuyins)}</span>
            <span style={{ flex: 1.7, textAlign: "right", fontWeight: 700 }}>{cashedOutCount > 0 ? fmtMoney(totalCashouts) : "—"}</span>
            <span style={{ flex: 1.7, textAlign: "right", fontWeight: 700, color: allCashedOut ? profitColor(balance) : "#707070" }}>{allCashedOut ? fmt(balance) : "—"}</span>
            <span style={{ flex: 0.4 }}/>
          </div>
        </div>
      ) : (
        <div style={S.empty}><p style={{ color: "#707070" }}>Add players to get started</p></div>
      )}

      {/* Once the last player cashes out the host's eyes are on the Total row,
          so the end button moves up under it (filled, unmissable). An off-by-a-
          few-dollars Net is normal for cash games — never a reason to gate. */}
      {isAdmin && allCashedOut && (
        <button onClick={onEnd} style={{ ...S.endBtn, background: "#450206", color: "#ffffff", border: "none" }}>End Session</button>
      )}

      {session.log?.length > 0 && (
        <div style={S.logWrap}>
          <button onClick={() => setShowLog(v => !v)} style={S.logToggle}>
            <span>Activity Log · {session.log.length}</span>
            <span>{showLog ? "▾" : "▸"}</span>
          </button>
          {showLog && (
            <div style={S.logList}>
              {[...session.log].reverse().map((e, i) => (
                <div key={i} style={S.logRow}>
                  <span style={S.logTime}>{new Date(e.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                  <span style={S.logText}>{logLabel(e)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {session.players.length > 0 && isAdmin && !allCashedOut && (
        <button onClick={onEnd} style={S.endBtn}>End Session</button>
      )}
    </div>
  );
}
