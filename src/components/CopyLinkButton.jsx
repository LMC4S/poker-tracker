import { useState } from "react";
import { S } from "../styles";

export default function CopyLinkButton({ token }) {
  const [copied, setCopied] = useState(false);
  if (!token) return null;

  const copy = async () => {
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers without clipboard API (or non-secure contexts)
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return <button onClick={copy} style={S.actionBtnAlt}>{copied ? "Link Copied ✓" : "Copy Link"}</button>;
}
