/**
 * Quotations (office key `quotations`) — the fields of the old
 * `InteractiveQuotationProposal` (`usil/src/types.ts`), with honest statuses
 * the vendor sets themselves and a deposit percentage.
 */
import { VAT_RATE, addDays, riyadhToday } from '../../lib/finance.ts';
import { phoneToWhatsApp } from '../../lib/whatsappTemplates.ts';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export const QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: 'مسودة',
  sent: 'أُرسل',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'منتهي',
};

export type QuotationItem = {
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** The listing it was copied from, if any. */
  listingId?: string;
};

export type Quotation = {
  id: string;
  quoteNumber: string;
  clientName: string;
  clientPhone: string;
  companyName?: string;
  eventTitle: string;
  eventDate: string;
  guestCount: number;
  city: string;
  items: QuotationItem[];
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  grandTotal: number;
  /** Percent of the grand total, 0–100. */
  depositPercent: number;
  depositRequired: number;
  validUntil: string;
  status: QuotationStatus;
  customNote?: string;
  createdAt: string;
  updatedAt?: string;
  sentAt?: string;
};

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

/** Every money figure follows from the items, discount and deposit %. */
export function totalsFor(items: QuotationItem[], discountAmount: number, depositPercent: number) {
  const lines = items.map((item) => ({ ...item, total: round2(num(item.quantity) * num(item.unitPrice)) }));
  const subtotal = round2(lines.reduce((sum, item) => sum + item.total, 0));
  const discount = Math.min(Math.max(0, round2(discountAmount)), subtotal);
  const taxable = round2(subtotal - discount);
  const vatAmount = round2(taxable * VAT_RATE);
  const grandTotal = round2(taxable + vatAmount);
  const percent = Math.min(100, Math.max(0, num(depositPercent)));
  return {
    items: lines,
    subtotal,
    discountAmount: discount,
    vatAmount,
    grandTotal,
    depositPercent: percent,
    depositRequired: round2((grandTotal * percent) / 100),
  };
}

export function normalizeQuotation(raw: unknown, index = 0): Quotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const items: QuotationItem[] = (Array.isArray(row.items) ? row.items : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      title: str(item.title),
      description: str(item.description),
      quantity: num(item.quantity, 1),
      unitPrice: num(item.unitPrice),
      total: num(item.total),
      listingId: item.listingId ? str(item.listingId) : undefined,
    }));
  const grandTotal = num(row.grandTotal);
  // Old rows carried only the deposit amount; derive the percent from it.
  const depositPercent =
    row.depositPercent !== undefined
      ? num(row.depositPercent)
      : grandTotal > 0
        ? Math.round((num(row.depositRequired) / grandTotal) * 100)
        : 0;
  const status = QUOTATION_STATUSES.includes(row.status as QuotationStatus)
    ? (row.status as QuotationStatus)
    : row.status === 'viewed'
      ? 'sent'
      : row.status === 'converted_to_booking'
        ? 'accepted'
        : 'draft';
  return {
    id: str(row.id) || `row-${index}`,
    quoteNumber: str(row.quoteNumber) || '—',
    clientName: str(row.clientName),
    clientPhone: str(row.clientPhone),
    companyName: str(row.companyName) || undefined,
    eventTitle: str(row.eventTitle),
    eventDate: str(row.eventDate).slice(0, 10),
    guestCount: num(row.guestCount),
    city: str(row.city),
    items,
    subtotal: num(row.subtotal),
    discountAmount: num(row.discountAmount),
    vatAmount: num(row.vatAmount),
    grandTotal,
    depositPercent,
    depositRequired: num(row.depositRequired),
    validUntil: str(row.validUntil).slice(0, 10),
    status,
    customNote: str(row.customNote) || undefined,
    createdAt: str(row.createdAt) || riyadhToday(),
    updatedAt: str(row.updatedAt) || undefined,
    sentAt: str(row.sentAt) || undefined,
  };
}

export function newQuotationId(): string {
  return `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Next `Q-YYYY-001` after the highest one already used this year. */
export function nextQuoteNumber(existing: Quotation[], today = riyadhToday()): string {
  const year = today.slice(0, 4);
  const pattern = new RegExp(`^Q-${year}-(\\d+)$`);
  const highest = existing.reduce((max, row) => {
    const match = pattern.exec(row.quoteNumber || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `Q-${year}-${String(highest + 1).padStart(3, '0')}`;
}

/** An open offer past its validity date reads as «منتهي» even before anyone changes it. */
export function effectiveStatus(row: Quotation, today = riyadhToday()): QuotationStatus {
  if ((row.status === 'draft' || row.status === 'sent') && row.validUntil && row.validUntil < today) return 'expired';
  return row.status;
}

export const DEFAULT_VALIDITY_DAYS = 14;
export const DEFAULT_DEPOSIT_PERCENT = 30;

export function defaultValidUntil(): string {
  return addDays(riyadhToday(), DEFAULT_VALIDITY_DAYS);
}

const money = (value: number) =>
  `${new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ر.س`;

/** Plain text for WhatsApp — readable without any link or attachment. */
export function quotationShareText(row: Quotation, brandName: string): string {
  const lines: string[] = [];
  lines.push(`عرض سعر ${row.quoteNumber}${brandName ? ` — ${brandName}` : ''}`);
  lines.push('');
  lines.push(`إلى: ${row.clientName}${row.companyName ? ` (${row.companyName})` : ''}`);
  if (row.eventTitle) lines.push(`المناسبة: ${row.eventTitle}`);
  const when = [row.eventDate, row.city].filter(Boolean).join(' · ');
  if (when) lines.push(`التاريخ والمكان: ${when}`);
  if (row.guestCount > 0) lines.push(`عدد الضيوف: ${row.guestCount}`);
  lines.push('');
  lines.push('البنود:');
  row.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title} × ${item.quantity} = ${money(item.total)}`);
    if (item.description) lines.push(`   ${item.description}`);
  });
  lines.push('');
  lines.push(`المجموع: ${money(row.subtotal)}`);
  if (row.discountAmount > 0) lines.push(`الخصم: ${money(row.discountAmount)}`);
  lines.push(`ضريبة القيمة المضافة 15%: ${money(row.vatAmount)}`);
  lines.push(`الإجمالي: ${money(row.grandTotal)}`);
  if (row.depositRequired > 0) lines.push(`العربون المطلوب (${row.depositPercent}%): ${money(row.depositRequired)}`);
  if (row.validUntil) lines.push(`العرض ساري حتى: ${row.validUntil}`);
  if (row.customNote) {
    lines.push('');
    lines.push(`ملاحظات: ${row.customNote}`);
  }
  return lines.join('\n');
}

export function hasWhatsAppPhone(phone: string): boolean {
  return phoneToWhatsApp(phone).length >= 10;
}
