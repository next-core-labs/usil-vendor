/**
 * Real, scannable QR codes without a new dependency: html5-qrcode ships the
 * full ZXing build, which includes the QR *encoder*. It is loaded lazily so
 * the ~1 MB bundle is only fetched the first time a QR is drawn.
 *
 * Ported from the old dashboard (`usil/src/utils/qrMatrix.ts`), plus the SVG
 * and PNG exporters the store-link QR downloads with.
 */

type ZxingByteMatrix = { getWidth(): number; getHeight(): number; get(x: number, y: number): number };
type ZxingModule = {
  QRCodeEncoder: { encode(content: string, ecLevel: unknown, hints: unknown): { getMatrix(): ZxingByteMatrix } };
  QRCodeDecoderErrorCorrectionLevel: { L: unknown; M: unknown; Q: unknown; H: unknown };
};

let zxingPromise: Promise<ZxingModule> | null = null;

function loadZxing(): Promise<ZxingModule> {
  if (!zxingPromise) {
    // @ts-ignore -- UMD bundle without usable typings; the shape is declared above.
    zxingPromise = import('html5-qrcode/third_party/zxing-js.umd.js')
      .then((mod: unknown) => {
        const m = mod as { default?: ZxingModule } & Partial<ZxingModule>;
        return (m.QRCodeEncoder ? m : m.default) as ZxingModule;
      })
      .catch((error: unknown) => {
        zxingPromise = null; // allow a retry (e.g. a flaky connection while lazy-loading)
        throw error;
      });
  }
  return zxingPromise as Promise<ZxingModule>;
}

/** QR module matrix for `text` (true = dark), without the quiet zone. */
export async function encodeQrMatrix(text: string): Promise<boolean[][]> {
  const zx = await loadZxing();
  const qr = zx.QRCodeEncoder.encode(text, zx.QRCodeDecoderErrorCorrectionLevel.M, null);
  const m = qr.getMatrix();
  const rows: boolean[][] = [];
  for (let y = 0; y < m.getHeight(); y++) {
    const row: boolean[] = [];
    for (let x = 0; x < m.getWidth(); x++) row.push(m.get(x, y) === 1);
    rows.push(row);
  }
  return rows;
}

/** Modules of white border kept around the code — scanners need it. */
export const QR_QUIET_ZONE = 2;

/**
 * One SVG path for all the dark modules (a rect per module bloats the file and
 * the DOM). Coordinates are in modules, quiet zone included.
 */
export function qrPath(matrix: boolean[][], quiet = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join('');
}

/** A standalone SVG document — what «تحميل SVG» saves. Always black on white. */
export function qrSvgMarkup(matrix: boolean[][], size = 512, quiet = QR_QUIET_ZONE): string {
  const n = matrix.length + quiet * 2;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#ffffff"/>` +
    `<path d="${qrPath(matrix, quiet)}" fill="#000000"/>` +
    `</svg>`
  );
}

/** PNG of the code, drawn module by module on a canvas (crisp at any size). */
export function qrPngBlob(matrix: boolean[][], size = 1024, quiet = QR_QUIET_ZONE): Promise<Blob> {
  const n = matrix.length + quiet * 2;
  const cell = Math.max(1, Math.floor(size / n));
  const px = cell * n;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('تعذر رسم رمز QR في هذا المتصفح.'));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
    }),
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('تعذر تجهيز صورة QR.'))), 'image/png'),
  );
}

/** Save a blob under `filename` through a temporary link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
