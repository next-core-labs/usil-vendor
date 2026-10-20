/**
 * Expenses and the simple income statement — ported from the old dashboard
 * (`VendorExpenseManager.tsx`, `VendorProfitAndLoss.tsx`). Pure functions only;
 * the screen loads the data and these turn it into numbers.
 */
import type { PlatformOrder, VendorBooking } from '../api/types.ts';

/* ── Expense records (office key `expenses`) ─────────────────────────── */

/** Same keys as `ExpenseCategory` in `usil/src/types.ts` — the inventory screen writes these too. */
export type ExpenseCategory =
  | 'raw_materials'
  | 'inventory_supplies'
  | 'direct_labor'
  | 'crew_wages'
  | 'fuel_transport'
  | 'maintenance_tools'
  | 'packaging_disposables'
  | 'marketing_ads'
  | 'utilities_rent'
  | 'other_petty_cash';

export type PaymentMethod = 'cash' | 'mada' | 'bank_transfer' | 'petty_cash';

/** Same shape as `ExpenseRecord` in `usil/src/types.ts`. */
export type ExpenseRecord = {
  id: string;
  /** سند صرف */
  voucherNumber: string;
  title: string;
  category: ExpenseCategory;
  /** Before VAT. */
  amount: number;
  /** 0.15 or 0. */
  taxRate: number;
  /** Input VAT. */
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  invoiceReference?: string;
  /** `YYYY-MM-DD` */
  date: string;
  notes?: string;
  relatedBookingId?: string;
  receiptImageUrl?: string;
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'raw_materials',
  'inventory_supplies',
  'direct_labor',
  'crew_wages',
  'fuel_transport',
  'packaging_disposables',
  'maintenance_tools',
  'marketing_ads',
  'utilities_rent',
  'other_petty_cash',
];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  raw_materials: 'خامات ومواد غذائية',
  inventory_supplies: 'توريدات ومستلزمات المخزون',
  direct_labor: 'عمالة مؤقتة باليومية',
  crew_wages: 'أجور الطاقم',
  fuel_transport: 'وقود ونقل',
  packaging_disposables: 'مستهلكات وتغليف',
  maintenance_tools: 'صيانة عتاد وأدوات',
  marketing_ads: 'تسويق وإعلانات',
  utilities_rent: 'إيجار وكهرباء وإنترنت',
  other_petty_cash: 'نثريات وعهدة',
};

/** A longer hint shown in the category picker. */
export const EXPENSE_CATEGORY_HINT: Record<ExpenseCategory, string> = {
  raw_materials: 'بن، تمور، لحوم، فواكه',
  inventory_supplies: 'مشتريات المستودع والمخزون',
  direct_labor: 'مباشرين وعمالة باليومية',
  crew_wages: 'مسير أجور وسندات صرف الطاقم',
  fuel_transport: 'وقود، شاحنات، مشاوير',
  packaging_disposables: 'فناجيل، علب، أكياس',
  maintenance_tools: 'دلال، غسيل، صيانة معدات',
  marketing_ads: 'إعلانات وحملات',
  utilities_rent: 'مستودع أو معرض، فواتير',
  other_petty_cash: 'ضيافة داخلية ومصاريف صغيرة',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['mada', 'bank_transfer', 'cash', 'petty_cash'];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  mada: 'مدى / بطاقة',
  bank_transfer: 'تحويل بنكي',
  cash: 'نقداً',
  petty_cash: 'عهدة نقدية',
};

export const VAT_RATE = 0.15;
/** Usil's commission on store orders. External bookings pay none. */
export const USIL_COMMISSION_RATE = 0.15;

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Office rows are written by more than one screen and kept verbatim by the
 * server, so each is coerced into a safe shape before it is summed. A row that
 * is not an object is dropped; unknown categories land in «نثريات».
 */
export function normalizeExpense(raw: unknown, index = 0): ExpenseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const amount = num(row.amount);
  const taxRate = num(row.taxRate) > 0 ? num(row.taxRate) : 0;
  const taxAmount = row.taxAmount === undefined ? round2(amount * taxRate) : num(row.taxAmount);
  const totalAmount = row.totalAmount === undefined ? round2(amount + taxAmount) : num(row.totalAmount);
  const category = EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory)
    ? (row.category as ExpenseCategory)
    : 'other_petty_cash';
  const paymentMethod = PAYMENT_METHODS.includes(row.paymentMethod as PaymentMethod)
    ? (row.paymentMethod as PaymentMethod)
    : 'cash';
  return {
    ...(row as Partial<ExpenseRecord>),
    // A row without an id gets a stable one from its position, so it can still be deleted.
    id: String(row.id || `row-${index}`),
    voucherNumber: String(row.voucherNumber || '—'),
    title: String(row.title || 'مصروف'),
    category,
    amount,
    taxRate,
    taxAmount,
    totalAmount,
    paymentMethod,
    paidTo: String(row.paidTo || ''),
    date: String(row.date || '').slice(0, 10),
  };
}

function voucherSeed(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function newExpenseId(): string {
  return `exp-${voucherSeed()}`;
}

/** Next `PV-YYYY-0001` for the year of `date`, after the highest one already used. */
export function nextVoucherNumber(expenses: ExpenseRecord[], date: string): string {
  const year = (date || riyadhToday()).slice(0, 4);
  const pattern = new RegExp(`^PV-${year}-(\\d+)$`);
  const highest = expenses.reduce((max, row) => {
    const match = pattern.exec(row.voucherNumber || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PV-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/** Amount before VAT → the three stored numbers. */
export function expenseAmounts(amount: number, taxRate: number) {
  const base = round2(amount);
  const taxAmount = round2(base * taxRate);
  return { amount: base, taxRate, taxAmount, totalAmount: round2(base + taxAmount) };
}

/* ── Riyadh dates ───────────────────────────────────────────────────── */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Today in Riyadh as `YYYY-MM-DD` — never the device time zone. */
export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function riyadhMonth(now: Date = new Date()): string {
  return riyadhToday(now).slice(0, 7);
}

/** `YYYY-MM-DD` in Riyadh for a stored date or timestamp, or null. */
export function toRiyadhDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = String(value).trim();
  // A plain date (or `YYYY-MM-DD HH:mm`) is already a Riyadh wall-clock date.
  if (/^\d{4}-\d{2}-\d{2}/.test(text) && !text.includes('T')) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return riyadhToday(parsed);
}

export function monthKeyOf(value: string | undefined | null): string | null {
  const day = toRiyadhDate(value);
  return day ? day.slice(0, 7) : null;
}

export function addDays(day: string, days: number): string {
  const base = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return day;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/** «أكتوبر 2026» for `2026-10`. */
export function arabicMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${ARABIC_MONTHS[m - 1]} ${y}`;
}

export const ALL_PERIODS = 'all';

export function periodLabel(period: string): string {
  return period === ALL_PERIODS ? 'كل الفترات' : arabicMonthLabel(period);
}

/* ── Income statement ───────────────────────────────────────────────── */

const ENDED_STATUSES = new Set([
  'ملغي',
  'cancelled',
  'canceled',
  'مرفوض',
  'مرفوض من المورّد',
  'rejected',
]);

function isEnded(status: string | undefined): boolean {
  return ENDED_STATUSES.has(String(status || '').trim());
}

/** A store order counts once Moyasar confirmed payment and it was not cancelled or rejected. */
export function countsAsStoreIncome(order: PlatformOrder): boolean {
  return order.paymentStatus === 'paid' && !isEnded(order.status);
}

/** A booking the vendor entered by hand counts unless it was cancelled. */
export function countsAsExternalIncome(booking: VendorBooking): boolean {
  return !isEnded(booking.status);
}

export type IncomeLine = {
  id: string;
  channel: 'store' | 'external';
  reference: string;
  customer: string;
  service: string;
  date: string;
  gross: number;
  commission: number;
  net: number;
  status: string;
};

export type CategoryCost = { category: ExpenseCategory; amount: number; taxAmount: number; count: number };

export type ProfitAndLoss = {
  period: string;
  lines: IncomeLine[];
  storeGross: number;
  storeCount: number;
  commission: number;
  storeNet: number;
  externalGross: number;
  externalCount: number;
  grossIncome: number;
  netIncome: number;
  expenses: ExpenseRecord[];
  costsByCategory: CategoryCost[];
  /** Before VAT — input VAT is recoverable, so it is not a cost. */
  totalCosts: number;
  inputVat: number;
  netProfit: number;
  /** Net profit over gross income, or null when there is no income. */
  margin: number | null;
};

/** Months that have any record, newest first, always including the current one. */
export function periodOptions(orders: PlatformOrder[], bookings: VendorBooking[], expenses: ExpenseRecord[]): string[] {
  const keys = new Set<string>([riyadhMonth()]);
  orders.forEach((row) => {
    const key = monthKeyOf(row.eventDate);
    if (key && countsAsStoreIncome(row)) keys.add(key);
  });
  bookings.forEach((row) => {
    const key = monthKeyOf(row.date);
    if (key && countsAsExternalIncome(row)) keys.add(key);
  });
  expenses.forEach((row) => {
    const key = monthKeyOf(row.date);
    if (key) keys.add(key);
  });
  return Array.from(keys).sort().reverse();
}

export function computeProfitAndLoss(
  period: string,
  orders: PlatformOrder[],
  bookings: VendorBooking[],
  allExpenses: ExpenseRecord[],
): ProfitAndLoss {
  const inPeriod = (value: string | undefined | null) => period === ALL_PERIODS || monthKeyOf(value) === period;

  const storeLines: IncomeLine[] = orders
    .filter((row) => countsAsStoreIncome(row) && inPeriod(row.eventDate))
    .map((row) => {
      const gross = round2(num(row.totalAmount));
      const commission = round2(gross * USIL_COMMISSION_RATE);
      return {
        id: `store-${row.id}`,
        channel: 'store',
        reference: row.id,
        customer: row.name || '—',
        service: row.serviceName || row.items?.[0]?.title || 'طلب من المتجر',
        date: toRiyadhDate(row.eventDate) || '',
        gross,
        commission,
        net: round2(gross - commission),
        status: row.status,
      };
    });

  const externalLines: IncomeLine[] = bookings
    .filter((row) => countsAsExternalIncome(row) && inPeriod(row.date))
    .map((row) => {
      const gross = round2(num(row.totalAmount));
      return {
        id: `ext-${row.id}`,
        channel: 'external',
        reference: row.bookingNumber || row.id,
        customer: row.customerName || '—',
        service: row.serviceTitle || 'حجز',
        date: toRiyadhDate(row.date) || '',
        gross,
        commission: 0,
        net: gross,
        status: row.status,
      };
    });

  const lines = [...storeLines, ...externalLines].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (rows: IncomeLine[], pick: (row: IncomeLine) => number) =>
    round2(rows.reduce((total, row) => total + pick(row), 0));

  const storeGross = sum(storeLines, (row) => row.gross);
  const commission = sum(storeLines, (row) => row.commission);
  const externalGross = sum(externalLines, (row) => row.gross);
  const grossIncome = round2(storeGross + externalGross);
  const netIncome = round2(grossIncome - commission);

  const expenses = allExpenses
    .filter((row) => inPeriod(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byCategory = new Map<ExpenseCategory, CategoryCost>();
  for (const row of expenses) {
    const entry = byCategory.get(row.category) || { category: row.category, amount: 0, taxAmount: 0, count: 0 };
    entry.amount = round2(entry.amount + row.amount);
    entry.taxAmount = round2(entry.taxAmount + row.taxAmount);
    entry.count += 1;
    byCategory.set(row.category, entry);
  }
  const costsByCategory = EXPENSE_CATEGORIES.map((key) => byCategory.get(key)).filter(
    (entry): entry is CategoryCost => Boolean(entry),
  );
  const totalCosts = round2(costsByCategory.reduce((total, row) => total + row.amount, 0));
  const inputVat = round2(costsByCategory.reduce((total, row) => total + row.taxAmount, 0));
  const netProfit = round2(netIncome - totalCosts);

  return {
    period,
    lines,
    storeGross,
    storeCount: storeLines.length,
    commission,
    storeNet: round2(storeGross - commission),
    externalGross,
    externalCount: externalLines.length,
    grossIncome,
    netIncome,
    expenses,
    costsByCategory,
    totalCosts,
    inputVat,
    netProfit,
    margin: grossIncome > 0 ? netProfit / grossIncome : null,
  };
}

/** «12.5٪» with a sign, or «—» when undefined. */
export function marginText(margin: number | null): string {
  if (margin === null || !Number.isFinite(margin)) return '—';
  return `${(margin * 100).toFixed(1)}٪`;
}
