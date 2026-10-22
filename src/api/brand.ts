import { api } from './client.ts';
import { office } from './office.ts';
import type { VendorFile } from './types.ts';

/**
 * «الهوية والفواتير» — the vendor's invoice branding, kept in the back office
 * as `brandSettings` (shape: `VendorBrandSettings` in `../usil backend/core/types.ts`).
 * Every field is optional on read: an office saved by the old dashboard, or a
 * brand-new vendor, may have none of them.
 */
export type VendorBrandSettings = {
  brandName: string;
  slogan: string;
  logoUrl: string;
  stampUrl?: string;
  crNumber: string;
  vatNumber: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  primaryColor: string;
  bankName: string;
  accountHolder: string;
  iban: string;
  invoiceHeaderNote: string;
  invoiceFooterNotes: string;
  showWatermark: boolean;
  responseTime?: string;
  aiTrustBadge?: string;
  fulfillment?: string[];
};

export const DEFAULT_BRAND_COLOR = '#0A1A33';

export const BRAND_COLOR_PRESETS = [
  { name: 'كحلي', value: '#0A1A33' },
  { name: 'أزرق ملكي', value: '#155EEF' },
  { name: 'ذهبي', value: '#99732B' },
  { name: 'زمردي', value: '#065F46' },
  { name: 'عنابي', value: '#831843' },
  { name: 'فحمي', value: '#1E293B' },
];

export function emptyBrandSettings(): VendorBrandSettings {
  return {
    brandName: '',
    slogan: '',
    logoUrl: '',
    stampUrl: '',
    crNumber: '',
    vatNumber: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    primaryColor: DEFAULT_BRAND_COLOR,
    bankName: '',
    accountHolder: '',
    iban: '',
    invoiceHeaderNote: '',
    invoiceFooterNotes: '',
    showWatermark: false,
  };
}

const TEXT_KEYS = [
  'brandName',
  'slogan',
  'logoUrl',
  'stampUrl',
  'crNumber',
  'vatNumber',
  'phone',
  'email',
  'city',
  'address',
  'primaryColor',
  'bankName',
  'accountHolder',
  'iban',
  'invoiceHeaderNote',
  'invoiceFooterNotes',
] as const;

/**
 * Whatever is stored, as a complete settings object. Unknown keys (e.g.
 * `responseTime`, `fulfillment` from the old dashboard) are carried through so
 * a save from here never drops them.
 */
export function normalizeBrandSettings(raw: unknown): VendorBrandSettings {
  const base = emptyBrandSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...input, ...base };
  for (const key of TEXT_KEYS) {
    const value = input[key];
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number') out[key] = String(value);
  }
  out.showWatermark = input.showWatermark === true;
  if (!isHexColor(String(out.primaryColor))) out.primaryColor = DEFAULT_BRAND_COLOR;
  return out as VendorBrandSettings;
}

/** True once the vendor has saved anything meaningful — prefill stops then. */
export function hasBrandData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const input = raw as Record<string, unknown>;
  return TEXT_KEYS.some((key) => key !== 'primaryColor' && typeof input[key] === 'string' && String(input[key]).trim());
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

/** Readable text colour on a brand-coloured band: white on dark, near-black on light. */
export function inkOnColor(hex: string): string {
  const value = (isHexColor(hex) ? hex : DEFAULT_BRAND_COLOR).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#0f172a' : '#ffffff';
}

/* ── Field checks (from the old dashboard's vendorContactChecks) ───── */

/**
 * What vendors actually type: Arabic-keyboard digits (٠١٢…), spaces or dashes
 * from the bank app, invisible direction marks from a copy, and often the 22
 * digits without the `SA` — all of it becomes `SA` + 22 ASCII digits.
 */
export function normalizeIban(raw: string): string {
  const iban = String(raw || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-_.‎‏‪-‮⁦-⁩]/g, '')
    .toUpperCase();
  return /^\d{22}$/.test(iban) ? `SA${iban}` : iban;
}

function ibanChecksumOk(iban: string): boolean {
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

/** Saudi IBAN: SA + 22 digits, with a valid ISO 13616 (mod 97) check. */
export function isValidSaudiIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  return /^SA\d{22}$/.test(iban) && ibanChecksumOk(iban);
}

export function ibanProblem(raw: string): string {
  const iban = normalizeIban(raw);
  if (!iban) return '';
  if (!/^SA\d{22}$/.test(iban)) {
    const digits = iban.replace(/^SA/, '').replace(/\D/g, '').length;
    return `الآيبان السعودي SA ويتبعه 22 رقماً — كاتب ${digits} رقماً.`;
  }
  return ibanChecksumOk(iban)
    ? ''
    : 'عدد الأرقام صحيح لكن الآيبان نفسه غير صحيح (فيه رقم غلط) — انسخه كما هو من تطبيق البنك.';
}

/** A Saudi VAT registration number: 15 digits, starting and ending with 3. */
export function isValidSaudiVatNumber(raw: string | undefined | null): boolean {
  return /^3\d{13}3$/.test(String(raw || '').replace(/\s+/g, ''));
}

/** A warning only — an unregistered vendor still issues plain invoices. */
export function vatWarning(raw: string): string {
  const value = String(raw || '').replace(/\s+/g, '');
  if (!value) return '';
  return isValidSaudiVatNumber(value)
    ? ''
    : 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3 — بدونه تطلع الفاتورة عادية بدون رمز هيئة الزكاة.';
}

export function emailProblem(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'البريد الإلكتروني غير صحيح.';
}

export function normalizeSaudiMobile(raw: string): string | null {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (digits.startsWith('966')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  return /^05[0-9]{8}$/.test(digits) ? digits : null;
}

export function mobileProblem(raw: string): string {
  if (!String(raw || '').trim()) return '';
  return normalizeSaudiMobile(raw) ? '' : 'رقم الجوال غير صحيح — اكتبه بصيغة 05xxxxxxxx.';
}

/* ── Server calls ──────────────────────────────────────────────────── */

export const BRAND_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const BRAND_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
    reader.readAsDataURL(file);
  });
}

export const brand = {
  read: () => office.read().then((data) => data.brandSettings),
  save: (settings: VendorBrandSettings) =>
    office.patch({ brandSettings: settings as unknown as Record<string, unknown> }).then((data) =>
      normalizeBrandSettings(data.brandSettings ?? settings),
    ),

  /**
   * `/api/uploads` → `/uploads/…`. The logo goes under the `logo` purpose —
   * the public profile only accepts the server's own uploads — and the stamp
   * under the generic one.
   */
  uploadImage: async (file: File, purpose: 'logo' | 'stamp'): Promise<string> => {
    if (!BRAND_IMAGE_TYPES.includes(file.type)) throw new Error('الصيغ المقبولة: JPG أو PNG أو WEBP.');
    if (file.size > BRAND_IMAGE_MAX_BYTES) throw new Error('حجم الصورة أكبر من 5 ميجابايت.');
    const dataUrl = await readAsDataUrl(file);
    const body = await api.post<{ url?: string }>('/api/uploads', {
      purpose: purpose === 'logo' ? 'logo' : 'upload',
      dataUrl,
    });
    if (!body.url) throw new Error('تعذر رفع الصورة، جرّب مرة ثانية.');
    return String(body.url);
  },

  /**
   * The store, the vendor page and the console sidebar show the PROFILE logo,
   * not the invoice branding, so a new logo is pushed there too (what the old
   * dashboard's `handleUpdateBrandSettings` did). `projectName` is required by
   * the server's profile patch.
   */
  syncProfileLogo: (projectName: string, logoUrl: string) =>
    api.put<unknown>('/api/vendor/workspace', { profile: { projectName, logoUrl } }),

  vendorFile: () => api.get<VendorFile & { success?: boolean }>('/api/me/vendor-file'),
};

/** Only a server upload can become the public logo; an old pasted link stays invoice-only. */
export function isServerUpload(url: string): boolean {
  return String(url || '').startsWith('/uploads/');
}

/** Fill only the empty fields from the vendor file (first use). */
export function prefillFromVendorFile(settings: VendorBrandSettings, file: VendorFile | null): VendorBrandSettings {
  if (!file) return settings;
  const profile = file.profile;
  const application = file.application;
  const next = { ...settings };
  const fill = (key: keyof VendorBrandSettings, value: string | undefined | null) => {
    const current = next[key];
    if (typeof current === 'string' && current.trim()) return;
    if (value && String(value).trim()) (next as Record<string, unknown>)[key] = String(value).trim();
  };
  fill('brandName', profile?.projectName || application?.projectName);
  fill('phone', profile?.phone || application?.phone);
  fill('email', profile?.email || application?.email);
  fill('logoUrl', profile?.logoUrl || application?.logoUrl);
  fill('crNumber', profile?.commercialRegister || application?.commercialRegister);
  fill('bankName', application?.bankName);
  fill('iban', application?.iban);
  fill('accountHolder', application?.accountHolderName);
  return next;
}
