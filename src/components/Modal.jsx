import { useState, useEffect, useRef, useMemo } from "react";
import { uid, fmtMoney } from "../utils";
import { S } from "../styles";

export default function Modal({ modal, setModal, sessions, activeSession, updateSession, startNewSession, activeId }) {
  const close = () => setModal(null);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState(modal.type === "cashout" ? "" : "20");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
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
      return s;
    });
    setVal(""); setVal2("20"); setShowSuggestions(false);
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
          const filtered = val
            ? frequentPlayers.filter(n => n.toLowerCase().includes(val.toLowerCase()))
            : frequentPlayers;
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ ...S.modalTitle, margin: 0 }}>Add Player</h3>
                <div style={{ fontSize: 12, color: "#7a5030", opacity: confirmVisible ? 1 : 0, transition: "opacity 0.4s ease", whiteSpace: "nowrap" }}>
                  ✓ {lastAdded} added
                </div>
              </div>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  ref={inputRef}
                  style={{ ...S.input, marginBottom: 0, paddingRight: 40 }}
                  placeholder="Search or type new"
                  value={val}
                  onChange={e => { setVal(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={e => e.key === "Enter" && (val2 ? handleAddPlayer() : document.getElementById("buyin-input")?.focus())}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  autoComplete="nope"
                />
                {frequentPlayers.length > 0 && (
                  <button
                    tabIndex={-1}
                    onMouseDown={e => { e.preventDefault(); setShowSuggestions(s => !s); }}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, background: "none", border: "none", cursor: "pointer", color: "#7a5030", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >▾</button>
                )}
                {showSuggestions && filtered.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fbf0df", border: "1px solid #d4b898", borderRadius: 8, zIndex: 10, maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 12px rgba(42,10,8,0.15)" }}>
                    {filtered.map(name => (
                      <div
                        key={name}
                        onMouseDown={e => { e.preventDefault(); setVal(name); setShowSuggestions(false); }}
                        style={{ padding: "12px 14px", fontSize: 16, color: "#2a0a08", borderBottom: "1px solid rgba(212,184,152,0.5)", cursor: "pointer" }}
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
            <h3 style={S.modalTitle}>Cash Out</h3>
            <select style={S.select} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
              <option value="">Select player</option>
              {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({fmtMoney(p.buyins.reduce((a, x) => a + x, 0))} in)</option>)}
            </select>
            <input ref={inputRef} style={S.input} placeholder="Cash out amount" type="number" inputMode="decimal" step="any" min="0" value={val2} onChange={e => setVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCashout()} />
            <button onClick={handleCashout} style={S.modalBtn}>Cash Out</button>
          </>
        )}
      </div>
    </div>
  );
}
