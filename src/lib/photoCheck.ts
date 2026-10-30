/**
 * Catches listing photos that would show as an empty tile on the storefront:
 * a flat fill (a black placeholder, a photo taken with the lens covered) or a
 * thumbnail too small to read. One vendor's catalog went live with 22 black
 * products this way, so the picker checks before anything is uploaded.
 */

/** Shorter side, in pixels. A product photo below this is a thumbnail, not a photo. */
export const PHOTO_MIN_SIDE = 200;
/** Brightness spread (0–255) below which a photo is one flat colour. Real photos sit well above 30. */
const FLAT_SPREAD = 3;
const SAMPLE = 32;

export type PhotoProblem = 'blank' | 'small';

export const PHOTO_PROBLEM_AR: Record<PhotoProblem, string> = {
  blank: 'الصورة فارغة أو سوداء — صوّر المنتج من جديد',
  small: `الصورة صغيرة جداً — اختر صورة لا يقل عرضها عن ${PHOTO_MIN_SIDE} بكسل`,
};

/** null when the photo looks usable, or when the browser can't decode it (the server still checks the format). */
export async function photoProblem(file: Blob): Promise<PhotoProblem | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < PHOTO_MIN_SIDE) return 'small';
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let sum = 0;
    let sumSq = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      // Transparent pixels show the page behind them, so they count as flat.
      const alpha = data[i + 3] / 255;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha;
      sum += lum;
      sumSq += lum * lum;
    }
    const mean = sum / count;
    const spread = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
    return spread < FLAT_SPREAD ? 'blank' : null;
  } finally {
    bitmap.close();
  }
}

/** Content key of a photo, so the same file picked twice (under any name) is caught. */
export async function photoDigest(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
