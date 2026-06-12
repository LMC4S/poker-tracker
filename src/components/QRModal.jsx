import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { F, FB } from "../styles";

export default function QRModal({ session, onClose, onRevoke, onRegenerate }) {
  const canvasRef = useRef(null);
  // "revoke" | "regen" | null — inline confirm step for link-breaking actions
  const [confirm, setConfirm] = useState(null);
  const url = session.shareToken ? `${window.location.origin}/s/${session.shareToken}` : null;

  const dateTag = new Date(session.date).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  const safeName = session.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `qr-${safeName}-${dateTag}.png`;

  const download = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(42,10,8,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#fbf0df", borderRadius: 16, padding: "28px 28px 24px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(42,10,8,0.35)" }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "#450206", letterSpacing: "3px", textTransform: "uppercase", fontFamily: F, marginBottom: 4 }}>Share Session</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#2a0a08", letterSpacing: "0.5px", fontFamily: FB, marginBottom: 2 }}>{session.name}</div>
        <div style={{ fontSize: 11, color: "#7a5030", letterSpacing: "0.5px", marginBottom: 20 }}>
          {new Date(session.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>

        {url ? (
          <div ref={canvasRef} style={{ display: "inline-block", background: "#ffffff", padding: 12, borderRadius: 10, border: "1px solid #d4b898" }}>
            <QRCodeCanvas value={url} size={200} bgColor="#ffffff" fgColor="#2a0a08" level="M" />
          </div>
        ) : (
          <div style={{ padding: "44px 16px", border: "1px dashed #d4b898", borderRadius: 10, color: "#7a5030", fontSize: 12, letterSpacing: "0.5px", lineHeight: 1.6 }}>
            Sharing is off for this session.<br/>Previous links no longer work.
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {url && (
            <button onClick={download} style={btnPrimary}>Save QR</button>
          )}
          {!url && onRegenerate && (
            <button onClick={() => onRegenerate(session.id)} style={btnPrimary}>Create New Link</button>
          )}
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        {url && (onRevoke || onRegenerate) && (
          confirm ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: "#7a5030", letterSpacing: "0.5px", marginBottom: 10, lineHeight: 1.5 }}>
                {confirm === "revoke"
                  ? "Turn off sharing? Anyone with the link or QR loses access."
                  : "Replace the link? Old links and saved QR codes stop working."}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setConfirm(null)} style={btnGhost}>Cancel</button>
                <button
                  onClick={() => { (confirm === "revoke" ? onRevoke : onRegenerate)(session.id); setConfirm(null); }}
                  style={{ ...btnPrimary, background: "#7a1c12" }}
                >
                  {confirm === "revoke" ? "Revoke" : "Replace"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", gap: 14, justifyContent: "center" }}>
              {onRevoke && <button onClick={() => setConfirm("revoke")} style={btnLink}>Revoke Link</button>}
              {onRegenerate && <button onClick={() => setConfirm("regen")} style={btnLink}>New Link</button>}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const btnPrimary = { padding: "10px 18px", background: "#450206", color: "#ffffff", border: "none", borderRadius: 24, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: F };
const btnGhost = { padding: "10px 18px", background: "#fbf0df", color: "#450206", border: "1px solid #d4b898", borderRadius: 24, fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase", fontFamily: F };
const btnLink = { background: "none", border: "none", cursor: "pointer", padding: 4, color: "#7a5030", fontSize: 10, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: F, textDecoration: "underline", textUnderlineOffset: 3 };
