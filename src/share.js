import html2canvas from "html2canvas";

// Render the visible summary card to a PNG and hand it to the OS share sheet.
// On iPhone this drops the scoreboard straight into a group chat as an image;
// on desktop (no Web Share for files) it falls back to a download.
export async function shareCardImage(node, filename = "poker-session.png") {
  if (!node) return;

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
