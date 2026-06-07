import { useState, useEffect, useRef, useMemo } from "react";
import { uid, logEvent, recomputeEndDate } from "../utils";
import { S } from "../styles";

export default function Modal({ modal, setModal, sessions, activeSession, updateSession, startNewSession, activeId }) {
  const close = () => setModal(null);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState(modal.type === "cashout" ? "" : "20");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [lastAdded, setLastAdded] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, [modal.type]);

  const players = activeSession?.players || [];

  const handleNewSession = () => { startNewSession(val.trim() || undefined); close(); };

  const handleAddPlayer = () => {
    const raw = val.trim();
    const name = raw.replace(/\b\w/g, c => c.toUpperCase());
    const amount = parseFloat(val2);
    if (!name) return;
    if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) return;
    updateSession(activeId, s => {
      if (s.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return s;
      s.players.push({ id: uid(), name, buyins: amount > 0 ? [amount] : [], cashout: null });
      return logEvent(s, "join", name, amount > 0 ? amount : null);
    });
    setVal(""); setVal2("20");
    setLastAdded(name);
    setConfirmVisible(true);
    setTimeout(() => setConfirmVisible(false), 1200);
    setTimeout(() => setLastAdded(null), 1700);
  };

  const handleBuyin = () => {
    const amount = parseFloat(val2);
    if (!selectedPlayer || !amount || amount <= 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === selectedPlayer);
      if (p) { p.buyins.push(amount); return logEvent(s, "buyin", p.name, amount); }
      return s;
    });
    setVal2(""); close();
  };

  const handleCashout = () => {
    const amount = parseFloat(val2);
    if (isNaN(amount) || amount < 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === modal.playerId);
      if (p) { p.cashout = amount; p.cashoutAt = new Date().toISOString(); logEvent(s, "cashout", p.name, amount); return recomputeEndDate(s); }
      return s;
    });
    setVal2(""); close();
  };

  const cashoutPlayer = modal.type === "cashout" ? players.find(p => p.id === modal.playerId) : null;

  const frequentPlayers = useMemo(() => {
    const currentNames = new Set(players.map(p => p.name.toLowerCase()));
    const counts = {};
    (sessions || []).filter(s => s.ended).forEach(s => {
      s.players.forEach(p => {
        if (!currentNames.has(p.name.toLowerCase())) {
          counts[p.name] = (counts[p.name] || 0) + 1;
        }
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [sessions, players]);

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
        {modal.type === "addPlayer" && (() => {
          const filtered = (val
            ? frequentPlayers.filter(n => n.toLowerCase().includes(val.toLowerCase()))
            : frequentPlayers).slice(0, 10);
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ ...S.modalTitle, margin: 0 }}>Add Player</h3>
                <div style={{ fontSize: 12, color: "#7a5030", opacity: confirmVisible ? 1 : 0, transition: "opacity 0.4s ease", whiteSpace: "nowrap" }}>
                  ✓ {lastAdded} added
                </div>
              </div>
              <input
                ref={inputRef}
                style={S.input}
                placeholder="Search or type new name"
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (val2 ? handleAddPlayer() : document.getElementById("buyin-input")?.focus())}
                autoComplete="off"
              />
              {filtered.length > 0 && (
                <div style={S.chipRow}>
                  {filtered.map(name => (
                    <button
                      key={name}
                      tabIndex={-1}
                      onClick={() => setVal(name)}
                      style={val.toLowerCase() === name.toLowerCase() ? { ...S.chip, ...S.chipActive } : S.chip}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <input id="buyin-input" style={S.input} placeholder="Initial buy-in" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddPlayer()} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddPlayer} style={{ ...S.modalBtn, flex: 1 }}>Add Player</button>
                <button onClick={close} style={{ ...S.modalBtnAlt, flex: 1 }}>Close</button>
              </div>
            </>
          );
        })()}
        {modal.type === "buyin" && (
          <>
            <h3 style={S.modalTitle}>Rebuy</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Amount" type="number" inputMode="decimal" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleBuyin()} />
            <button onClick={handleBuyin} style={S.modalBtn}>Rebuy</button>
          </>
        )}
        {modal.type === "cashout" && (
          <>
            <h3 style={S.modalTitle}>Cash Out · {cashoutPlayer?.name}</h3>
            <input ref={inputRef} style={{ ...S.input, fontSize: 22, textAlign: "center", padding: "16px 14px" }} placeholder="Amount" type="number" inputMode="decimal" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCashout()} />
            <button onClick={handleCashout} style={S.modalBtn}>Confirm</button>
          </>
        )}
      </div>
    </div>
  );
}
