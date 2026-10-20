import type { jsPDF } from 'jspdf';

/**
 * Arabic-capable font for jsPDF exports (ported from the old dashboard,
 * `usil/src/utils/pdfArabicFont.ts`).
 *
 * The built-in PDF fonts (helvetica…) have no Arabic glyphs, so Arabic text came
 * out as garbage. We embed Amiri (SIL OFL, public/fonts/) — it carries the Arabic
 * presentation forms jsPDF's built-in shaper maps to, plus Latin and digits, so
 * one font covers the mixed Arabic/English documents. The TTFs are fetched lazily
 * on first export and cached for the session.
 */

export const PDF_FONT = 'Amiri';

const FONT_FILES = {
  normal: 'Amiri-Regular.ttf',
  bold: 'Amiri-Bold.ttf',
} as const;

type FontData = Record<keyof typeof FONT_FILES, string>;

let fontDataPromise: Promise<FontData> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fontUrl(file: string): string {
  let base = '/';
  try {
    base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
  } catch {
    base = '/';
  }
  return `${base.endsWith('/') ? base : `${base}/`}fonts/${file}`;
}

async function fetchFont(file: string): Promise<string> {
  const res = await fetch(fontUrl(file));
  if (!res.ok) throw new Error(`Failed to load PDF font ${file}: HTTP ${res.status}`);
  return arrayBufferToBase64(await res.arrayBuffer());
}

/** Optional override (used by tests / node scripts) to supply the TTF bytes directly. */
export function setPdfFontData(data: FontData): void {
  fontDataPromise = Promise.resolve(data);
}

function loadFontData(): Promise<FontData> {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([fetchFont(FONT_FILES.normal), fetchFont(FONT_FILES.bold)])
      .then(([normal, bold]) => ({ normal, bold }))
      .catch((err) => {
        fontDataPromise = null; // allow a retry on the next export
        throw err;
      });
  }
  return fontDataPromise;
}

/**
 * Registers the Arabic font on `doc`, makes it the active font and installs
 * proper right-to-left line ordering for every text call on this document
 * (including the ones jspdf-autotable makes).
 */
export async function applyArabicFont(doc: jsPDF): Promise<void> {
  const data = await loadFontData();
  doc.addFileToVFS(FONT_FILES.normal, data.normal);
  doc.addFont(FONT_FILES.normal, PDF_FONT, 'normal');
  doc.addFileToVFS(FONT_FILES.bold, data.bold);
  doc.addFont(FONT_FILES.bold, PDF_FONT, 'bold');
  doc.setFont(PDF_FONT, 'normal');
  installBidi(doc);
}

// ---------------------------------------------------------------------------
// Bidi. jsPDF shapes Arabic letters (contextual forms) itself, but its built-in
// bidi pass always assumes a left-to-right paragraph, which scrambles Arabic
// lines that contain brackets, numbers or Latin words. We run a compact
// Unicode-bidi pass ourselves right after shaping (paragraph direction from the
// first strong character, numbers kept left-to-right, brackets mirrored) and
// tell jsPDF's own pass to leave the already-visual text alone.
// ---------------------------------------------------------------------------

type BidiType = 'L' | 'R' | 'EN' | 'AN' | 'CS' | 'N';

function isRtlChar(code: number): boolean {
  return (
    (code >= 0x0590 && code <= 0x08ff) ||
    (code >= 0xfb1d && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfefc)
  );
}

function classify(ch: string): BidiType {
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x0660 && code <= 0x0669) || (code >= 0x06f0 && code <= 0x06f9)) {
    return 'EN';
  }
  if (isRtlChar(code)) return 'R';
  if ('.,:/-+%'.includes(ch)) return 'CS';
  if (/\p{L}|\p{M}/u.test(ch)) return 'L';
  return 'N';
}

const MIRROR: Record<string, string> = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«',
};

/** Logical → visual order for one line (paragraph direction from its first strong char). */
export function toVisualOrder(line: string): string {
  const chars = Array.from(line);
  if (!chars.some((c) => isRtlChar(c.codePointAt(0) ?? 0))) return line; // pure LTR: nothing to do

  const types = chars.map(classify);
  const firstStrong = types.find((t) => t === 'L' || t === 'R');
  const rtl = firstStrong !== 'L';
  const base = rtl ? 1 : 0;

  // W: numbers after Arabic text become "Arabic numbers"; after Latin they act as Latin.
  let last: 'L' | 'R' = rtl ? 'R' : 'L';
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (t === 'L' || t === 'R') last = t;
    else if (t === 'EN') types[i] = last === 'R' ? 'AN' : rtl ? 'EN' : 'L';
  }
  // Separators between two digits of the same kind join the number (dates, decimals, times).
  for (let i = 1; i < types.length - 1; i++) {
    if (types[i] === 'CS' && types[i - 1] === types[i + 1] && (types[i - 1] === 'EN' || types[i - 1] === 'AN' || types[i - 1] === 'L')) {
      types[i] = types[i - 1];
    }
  }
  for (let i = 0; i < types.length; i++) if (types[i] === 'CS') types[i] = 'N';

  // N: neutrals take the surrounding direction when both sides agree, else the paragraph's.
  const dirOf = (t: BidiType): 'L' | 'R' => (t === 'L' ? 'L' : 'R');
  for (let i = 0; i < types.length; ) {
    if (types[i] !== 'N') { i++; continue; }
    let j = i;
    while (j < types.length && types[j] === 'N') j++;
    const before = i > 0 ? dirOf(types[i - 1]) : rtl ? 'R' : 'L';
    const after = j < types.length ? dirOf(types[j]) : rtl ? 'R' : 'L';
    const resolved: 'L' | 'R' = before === after ? before : rtl ? 'R' : 'L';
    for (let k = i; k < j; k++) types[k] = resolved;
    i = j;
  }

  // Implicit levels.
  const levels = types.map((t) => {
    if (base === 0) return t === 'R' ? 1 : t === 'EN' || t === 'AN' ? 2 : 0;
    return t === 'R' ? 1 : 2;
  });

  // Reverse runs from the highest level down to 1.
  const out = chars.slice();
  const lv = levels.slice();
  const maxLevel = Math.max(...lv);
  for (let level = maxLevel; level >= 1; level--) {
    for (let i = 0; i < out.length; ) {
      if (lv[i] < level) { i++; continue; }
      let j = i;
      while (j < out.length && lv[j] >= level) j++;
      const segC = out.slice(i, j).reverse();
      const segL = lv.slice(i, j).reverse();
      out.splice(i, j - i, ...segC);
      lv.splice(i, j - i, ...segL);
      i = j;
    }
  }
  // Mirror brackets that ended up in right-to-left runs.
  return out.map((c, i) => (lv[i] % 2 === 1 && MIRROR[c] ? MIRROR[c] : c)).join('');
}

type TextPayload = { text: unknown; options?: Record<string, unknown> };

function mapText(text: unknown): unknown {
  if (typeof text === 'string') return text.split('\n').map(toVisualOrder).join('\n');
  if (Array.isArray(text)) {
    return text.map((item) =>
      Array.isArray(item) ? [mapText(item[0]), ...item.slice(1)] : mapText(item)
    );
  }
  return text;
}

const bidiInstalled = new WeakSet<object>();

function installBidi(doc: jsPDF): void {
  if (bidiInstalled.has(doc)) return;
  bidiInstalled.add(doc);
  const events = (doc.internal as unknown as {
    events: { subscribe: (topic: string, cb: (payload: TextPayload) => void) => unknown };
  }).events;
  // Runs after jsPDF's built-in Arabic shaping (subscribed at construction).
  events.subscribe('preProcessText', (payload: TextPayload) => {
    payload.text = mapText(payload.text);
    // Visual in, visual out, same direction: jsPDF's own bidi pass becomes a no-op.
    payload.options = {
      ...(payload.options || {}),
      isInputVisual: true,
      isOutputVisual: true,
      isInputRtl: false,
      isOutputRtl: false,
    };
  });
}
