import html2canvas from "html2canvas";
import { FN } from "./styles";

// Render the visible summary card to a PNG and hand it to the OS share sheet.
// On iPhone this drops the scoreboard straight into a group chat as an image;
// on desktop (no Web Share for files) it falls back to a download.
export async function shareCardImage(node, filename = "poker-session.png", opts = {}) {
  if (!node) return;
  const { hideTitle = false, titleReplacement = "", subReplacement = "" } = opts;

  // Make sure the webfonts the card uses are ready before we rasterize.
  // Weights must match what index.html actually loads per family.
  const FONT_WEIGHTS = {
    "Oswald": ["400", "600", "700"],
    "Cormorant Garamond": ["400", "600", "700"],
    "Inter": ["400"],
  };
  try {
    await Promise.all(
      Object.entries(FONT_WEIGHTS).flatMap(([f, weights]) =>
        weights.map(w => document.fonts.load(`${w} 16px '${f}'`))
      )
    );
  } catch { /* font loading is best-effort */ }

  const canvas = await html2canvas(node, {
    backgroundColor: "#0b0b0b", // must match the card so corners disappear
    scale: 3,                   // crisp on retina / when zoomed in chat
    useCORS: true,
    // Mutate the clone only — the on-screen card is untouched.
    onclone: (doc) => {
      // The image that lands in the group chat is read at night, so it's
      // white-on-black with a three-tone hierarchy: pure white for the title
      // and totals, off-white body rows, gray metadata. The vintage parchment
      // theme stays in the app.
      const card = doc.querySelector("[data-share-card]");
      if (card) {
        card.querySelectorAll("*").forEach(el => {
          el.style.color = "#f2f2f2";
          el.style.background = "transparent";
          el.style.borderColor = "#262626"; // only recolors existing borders
        });
        card.style.background = "#0b0b0b";
        card.style.border = "none";
        card.querySelectorAll("[data-share-muted], [data-share-sub]").forEach(el => {
          el.style.color = "#8f8f8f";
          el.querySelectorAll("*").forEach(c => { c.style.color = "#8f8f8f"; });
        });
        const title = card.querySelector("[data-share-title]");
        if (title) title.style.color = "#ffffff";
        const total = card.querySelector("[data-share-total]");
        if (total) {
          total.style.background = "#161616";
          total.querySelectorAll("*").forEach(c => { c.style.color = "#ffffff"; });
        }
      }
      // Numbers render in an elegant serif on screen; swap them to a plain,
      // readable sans in the shared image. Regular weight throughout — Inter
      // bold comes out heavy and lumpy once rasterized.
      doc.querySelectorAll("[data-num]").forEach(el => {
        el.style.fontFamily = FN;
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
