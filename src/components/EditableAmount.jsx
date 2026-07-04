import { useState, useRef, useEffect } from "react";
import { fmtMoney } from "../utils";

// Cash-out amount that admins tap to correct in place. Enter or blur commits;
// Escape cancels. Invalid, negative, or unchanged input simply doesn't stick,
// matching EditableName. The correction keeps the original cash-out time.
export default function EditableAmount({ amount, canEdit, onEdit, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!canEdit) return <span style={style}>{fmtMoney(amount)}</span>;

  if (editing) return (
    <input
      ref={inputRef}
      type="number"
      inputMode="decimal"
      step="any"
      min="0"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        const next = parseFloat(val);
        setEditing(false);
        if (Number.isFinite(next) && next >= 0 && next !== amount) onEdit(next);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") e.target.blur();
        // Reset val first so the unmount-time blur commit becomes a no-op
        if (e.key === "Escape") { setVal(String(amount)); setEditing(false); }
      }}
      style={{ ...style, width: 64, font: "inherit", fontWeight: "inherit", color: "inherit", textAlign: "right", background: "none", border: "none", borderBottom: "1px solid #7a5030", borderRadius: 0, outline: "none", padding: 0, boxSizing: "border-box" }}
    />
  );

  return <span style={{ ...style, cursor: "text" }} onClick={() => { setVal(String(amount)); setEditing(true); }}>{fmtMoney(amount)}</span>;
}
