/**
 * Brand images (logo, stamp) for jsPDF. jsPDF only embeds PNG/JPEG reliably, and
 * uploads may be WEBP, so every image is redrawn on a canvas as PNG first. Any
 * failure (missing file, offline, a browser without canvas) yields null — the
 * document is then simply drawn without that image, never aborted.
 */
export type PdfImage = { dataUrl: string; width: number; height: number };

export async function loadPdfImage(url: string | undefined | null, maxPx = 600): Promise<PdfImage | null> {
  const src = String(url || '').trim();
  if (!src || typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  try {
    const response = await fetch(src, { credentials: 'include' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } catch {
    return null;
  }
}

/** Fit `image` inside a `box`×`box` square, keeping its aspect ratio. */
export function fitInBox(image: PdfImage, box: number): { w: number; h: number } {
  const ratio = image.width / image.height;
  return ratio >= 1 ? { w: box, h: box / ratio } : { w: box * ratio, h: box };
}
