import { useState, useEffect, useRef } from "react";
import { uid, fmtMoney } from "../utils";
import { S } from "../styles";

export default function Modal({ modal, setModal, activeSession, updateSession, startNewSession, activeId }) {
  const close = () => setModal(null);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState(modal.type === "cashout" ? "" : "20");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, [modal.type]);

  const players = activeSession?.players || [];

  const handleNewSession = () => { startNewSession(val.trim() || undefined); close(); };

  const handleAddPlayer = () => {
    const raw = val.trim();
    const name = raw.replace(/\b\w/g, c => c.toUpperCase());
    const amount = parseFloat(val2);
    if (!name) return;
    updateSession(activeId, s => {
      if (s.players.find(p => p.name.toLowerCase() === name.toLowerCase())) return s;
      s.players.push({ id: uid(), name, buyins: amount > 0 ? [amount] : [], cashout: null });
      return s;
    });
    setVal(""); setVal2("20"); inputRef.current?.focus();
  };

  const handleBuyin = () => {
    const amount = parseFloat(val2);
    if (!selectedPlayer || !amount || amount <= 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === selectedPlayer);
      if (p) p.buyins.push(amount);
      return s;
    });
    setVal2(""); close();
  };

  const handleCashout = () => {
    const amount = parseFloat(val2);
    if (!selectedPlayer || isNaN(amount) || amount < 0) return;
    updateSession(activeId, s => {
      const p = s.players.find(x => x.id === selectedPlayer);
      if (p) p.cashout = amount;
      return s;
    });
    setVal2(""); close();
  };

  const activePlayers = players.filter(p => p.cashout === null);

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
        {modal.type === "addPlayer" && (
          <>
            <h3 style={S.modalTitle}>Add Player</h3>
            <input ref={inputRef} style={S.input} placeholder="Player name" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && (val2 ? handleAddPlayer() : document.getElementById("buyin-input")?.focus())} />
            <input id="buyin-input" style={S.input} placeholder="Initial buy-in" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddPlayer()} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddPlayer} style={{ ...S.modalBtn, flex: 1 }}>Add</button>
              <button onClick={close} style={{ ...S.modalBtnAlt, flex: 1 }}>Done</button>
            </div>
          </>
        )}
        {modal.type === "buyin" && (
          <>
            <h3 style={S.modalTitle}>Buy-in / Rebuy</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Amount" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleBuyin()} />
            <button onClick={handleBuyin} style={S.modalBtn}>Add Buy-in</button>
          </>
        )}
        {modal.type === "cashout" && (
          <>
            <h3 style={S.modalTitle}>Cash Out</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({fmtMoney(p.buyins.reduce((a, x) => a + x, 0))} in)</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Cash out amount" type="number" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCashout()} />
            <button onClick={handleCashout} style={S.modalBtn}>Cash Out</button>
          </>
        )}
      </div>
    </div>
  );
}
