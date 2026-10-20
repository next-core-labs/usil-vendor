import { office } from './office.ts';

/**
 * «الفواتير» — invoices live in the back office under `invoices` (shape:
 * `VendorInvoice` in `../usil backend/core/types.ts`), so the old dashboard
 * and this console read the same list.
 */

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'draft';

export type InvoicePaymentMethod = 'مدى / فيزا' | 'تحويل بنكي' | 'نقداً عند الوصول' | 'حساب الضمان' | 'Apple Pay';

export const PAYMENT_METHODS: InvoicePaymentMethod[] = [
  'تحويل بنكي',
  'مدى / فيزا',
  'نقداً عند الوصول',
  'Apple Pay',
  'حساب الضمان',
];

/** `MultiChannelSource` — `mithyaf` is the internal id of an Usil store order. */
export type InvoiceChannel =
  | 'mithyaf'
  | 'external_phone'
  | 'external_instagram'
  | 'external_whatsapp'
  | 'external_haraj'
  | 'external_maroof'
  | 'direct_bio_link'
  | 'pos_cashier';

export const CHANNEL_LABEL: Record<InvoiceChannel, string> = {
  mithyaf: 'طلب من متجر يوصل',
  external_phone: 'اتصال مباشر',
  external_instagram: 'إنستقرام',
  external_whatsapp: 'واتساب',
  external_haraj: 'حراج',
  external_maroof: 'معروف / سلة',
  direct_bio_link: 'رابط البايو',
  pos_cashier: 'كاشير المحل',
};

export type InvoiceLine = { description: string; quantity: number; unitPrice: number; total: number };

export type VendorInvoice = {
  id: string;
  invoiceNumber: string;
  bookingId?: string;
  trackingCode?: string;
  clientName: string;
  clientPhone: string;
  clientTaxId?: string;
  eventDate: string;
  issueDate: string;
  dueDate: string;
  /** Unit prices and line totals BEFORE VAT — what the PDF expects. */
  items: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  depositPaid: number;
  remainingBalance: number;
  status: InvoiceStatus;
  terms: string;
  paymentMethod: InvoicePaymentMethod | string;
  isWhiteLabel?: boolean;
  channelSource?: InvoiceChannel;
  platformFeeRate?: number;
  platformFeeAmount?: number;
  vendorNetAmount?: number;
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  unpaid: 'بانتظار السداد',
  draft: 'مسودة',
};

/* ── Totals (from the old dashboard's invoiceTotals) ───────────────── */

export const INVOICE_VAT_RATE = 0.15;

export type InvoiceLineInput = { description: string; quantity: number; unitPrice: number };

export const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Invoice lines and totals. Platform prices are final and VAT-inclusive, so by
 * default the price the vendor types is the gross the client pays: VAT is taken
 * out of it, never added on top. Stored lines are always before VAT.
 *
 * `taxRate` 0 is an invoice without VAT (a vendor not registered for it): the
 * typed prices are then the totals as they are.
 */
export function invoiceTotals(lines: InvoiceLineInput[], pricesIncludeVat = true, taxRate = INVOICE_VAT_RATE) {
  const rate = taxRate > 0 ? taxRate : 0;
  const net = (gross: number) => (pricesIncludeVat ? gross / (1 + rate) : gross);
  const items = lines.map((line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = round2(net(Number(line.unitPrice) || 0));
    return { description: line.description.trim(), quantity, unitPrice, total: round2(quantity * unitPrice) };
  });
  const entered = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
  const total = round2(pricesIncludeVat ? entered : entered * (1 + rate));
  const subtotal = round2(net(entered));
  return { items, subtotal, taxRate: rate, taxAmount: round2(total - subtotal), total };
}

export function statusForPayment(paid: number, total: number): InvoiceStatus {
  if (total > 0 && paid >= total - 0.005) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

/** A payment recorded against an invoice: paid amount, balance and status move together. */
export function withPayment(invoice: VendorInvoice, paid: number): VendorInvoice {
  const depositPaid = round2(Math.min(Math.max(0, paid), invoice.total));
  return {
    ...invoice,
    depositPaid,
    remainingBalance: round2(Math.max(0, invoice.total - depositPaid)),
    status: statusForPayment(depositPaid, invoice.total),
  };
}

/* ── Dates & numbers ───────────────────────────────────────────────── */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Today's date in Riyadh as `YYYY-MM-DD` — never the device timezone. */
export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** `INV-2026-0007`: the next number this year, never reusing one on the list. */
export function nextInvoiceNumber(existing: Array<Pick<VendorInvoice, 'invoiceNumber'>>, today = riyadhToday()): string {
  const year = today.slice(0, 4);
  const taken = new Set(existing.map((row) => row.invoiceNumber));
  let next =
    existing.reduce((max, row) => {
      const match = new RegExp(`^INV-${year}-(\\d+)$`).exec(String(row.invoiceNumber || ''));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  while (taken.has(`INV-${year}-${String(next).padStart(4, '0')}`)) next++;
  return `INV-${year}-${String(next).padStart(4, '0')}`;
}

/* ── Reading and saving ────────────────────────────────────────────── */

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** A stored row, defensively — old rows may miss fields. Unknown keys are kept. */
export function normalizeInvoice(raw: unknown): VendorInvoice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  const items = (Array.isArray(row.items) ? row.items : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const quantity = num(item.quantity) || 0;
      const unitPrice = num(item.unitPrice);
      return {
        description: text(item.description),
        quantity,
        unitPrice,
        total: item.total === undefined ? round2(quantity * unitPrice) : num(item.total),
      };
    });
  const total = num(row.total);
  const depositPaid = num(row.depositPaid);
  const status = ['paid', 'partial', 'unpaid', 'draft'].includes(text(row.status))
    ? (text(row.status) as InvoiceStatus)
    : statusForPayment(depositPaid, total);
  return {
    ...(row as Partial<VendorInvoice>),
    id,
    invoiceNumber: text(row.invoiceNumber) || id,
    clientName: text(row.clientName),
    clientPhone: text(row.clientPhone),
    clientTaxId: text(row.clientTaxId) || undefined,
    eventDate: text(row.eventDate),
    issueDate: text(row.issueDate),
    dueDate: text(row.dueDate),
    items,
    subtotal: num(row.subtotal),
    taxRate: row.taxRate === undefined ? INVOICE_VAT_RATE : num(row.taxRate),
    taxAmount: num(row.taxAmount),
    discount: num(row.discount),
    total,
    depositPaid,
    remainingBalance: row.remainingBalance === undefined ? round2(Math.max(0, total - depositPaid)) : num(row.remainingBalance),
    status,
    terms: text(row.terms),
    paymentMethod: text(row.paymentMethod) || 'تحويل بنكي',
  };
}

export function normalizeInvoices(raw: unknown): VendorInvoice[] {
  return (Array.isArray(raw) ? raw : []).map(normalizeInvoice).filter((row): row is VendorInvoice => !!row);
}

export const invoicesApi = {
  /** Invoices and branding in one read — the invoice screen needs both. */
  read: () => office.read(),

  /**
   * Re-reads the stored list right before writing, so an invoice added from
   * another tab (or by the old dashboard) is never overwritten by a stale copy.
   * `change` receives the fresh list and returns the one to save.
   */
  update: async (change: (current: unknown[]) => unknown[]): Promise<VendorInvoice[]> => {
    const fresh = await office.read();
    const current = Array.isArray(fresh.invoices) ? fresh.invoices : [];
    const saved = await office.patch({ invoices: change(current) });
    return normalizeInvoices(saved.invoices);
  },
};

/** Replace the stored row with the same id, keeping keys this console does not know. */
export function replaceInvoice(current: unknown[], next: VendorInvoice): unknown[] {
  return current.map((row) =>
    row && typeof row === 'object' && (row as { id?: unknown }).id === next.id
      ? { ...(row as Record<string, unknown>), ...next }
      : row,
  );
}

/* ── WhatsApp ──────────────────────────────────────────────────────── */

/** `05xxxxxxxx` → `9665xxxxxxxx` for wa.me; other numbers as plain digits. */
export function whatsappNumber(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return digits;
}

export function whatsappShareUrl(phone: string, message: string): string {
  const target = whatsappNumber(phone);
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}
