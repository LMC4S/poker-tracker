import html2canvas from "html2canvas";

export async function handleShare(ref) {
  if (!ref.current) return;
  await Promise.all(["400","500","600","700"].map(w => document.fonts.load(`${w} 16px 'Inter'`)));
  const els = [ref.current, ...ref.current.querySelectorAll("*")];
  const saved = els.map(e => e.style.fontFamily);
  els.forEach(e => { e.style.fontFamily = "'Inter', sans-serif"; });
  const canvas = await html2canvas(ref.current, {
    backgroundColor: "#000",
    scale: 3,
    onclone: (_, el) => {
      const walk = (node) => {
        if (node.nodeType !== 1) return;
        const s = node.style;
        if (s.background) s.background = "#000";
        if (s.backgroundColor) s.backgroundColor = "#000";
        if (s.color) s.color = "#fff";
        if (s.border) s.border = "1px solid #222";
        if (s.borderBottom) s.borderBottom = "1px solid #1a1a1a";
        if (s.fontWeight === "700") s.fontWeight = "500";
        else if (s.fontWeight === "600") s.fontWeight = "400";
        [...node.children].forEach(walk);
      };
      walk(el);
    }
  });
  els.forEach((e, i) => { e.style.fontFamily = saved[i]; });
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "poker-session.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "poker-session.png"; a.click();
      URL.revokeObjectURL(url);
    }
  });
}
