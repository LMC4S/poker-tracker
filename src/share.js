import html2canvas from "html2canvas";

// Render the visible summary card to a PNG and hand it to the OS share sheet.
// On iPhone this drops the scoreboard straight into a group chat as an image;
// on desktop (no Web Share for files) it falls back to a download.
export async function shareCardImage(node, filename = "poker-session.png", opts = {}) {
  if (!node) return;
  const { hideTitle = false, titleReplacement = "", subReplacement = "" } = opts;

  // Make sure the webfonts the card uses are ready before we rasterize.
  try {
    await Promise.all(
      ["Oswald", "Cormorant Garamond", "Inter"].flatMap(f =>
        ["400", "600", "700"].map(w => document.fonts.load(`${w} 16px '${f}'`))
      )
    );
  } catch { /* font loading is best-effort */ }

  const canvas = await html2canvas(node, {
    backgroundColor: "#f0e0c4", // matches S.summaryCard
    scale: 3,                   // crisp on retina / when zoomed in chat
    useCORS: true,
    // Mutate the clone only — the on-screen card is untouched.
    onclone: (doc) => {
      // Numbers render in an elegant serif on screen; swap them to a plain,
      // readable sans in the shared image. Regular weight throughout — Inter
      // bold comes out heavy and lumpy once rasterized.
      doc.querySelectorAll("[data-num]").forEach(el => {
        el.style.fontFamily = "'Inter', sans-serif";
        el.style.fontWeight = "400";
      });
      // Keep a generic "Session N" name (and the session count it leaks) out
      // of the public image by showing the date instead.
      if (hideTitle) {
        const t = doc.querySelector("[data-share-title]");
        const s = doc.querySelector("[data-share-sub]");
        if (t) t.textContent = titleReplacement;
        if (s) s.textContent = subReplacement;
      }
    },
  });

  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) return;

  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return; // user dismissed the sheet
      // fall through to download on any other failure
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
