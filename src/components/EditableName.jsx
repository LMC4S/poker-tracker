import { useState, useRef, useEffect } from "react";

// Player name that admins tap to rename in place. Enter or blur commits;
// Escape cancels. Empty, unchanged, or duplicate names simply don't stick
// (the op layer rejects them), so there's nothing to confirm or explain.
export default function EditableName({ name, canEdit, onRename, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!canEdit) return <span style={style}>{name}</span>;

  if (editing) return (
    <span style={style}>
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => {
          const next = val.trim();
          setEditing(false);
          if (next && next !== name) onRename(next);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") e.target.blur();
          // Reset val first so the unmount-time blur commit becomes a no-op
          if (e.key === "Escape") { setVal(name); setEditing(false); }
        }}
        style={{ width: "100%", font: "inherit", fontWeight: "inherit", color: "inherit", background: "none", border: "none", borderBottom: "1px solid #7a5030", borderRadius: 0, outline: "none", padding: 0, boxSizing: "border-box" }}
      />
    </span>
  );

  return <span style={{ ...style, cursor: "text" }} onClick={() => { setVal(name); setEditing(true); }}>{name}</span>;
}
