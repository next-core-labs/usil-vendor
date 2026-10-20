/**
 * Inventory — items, the consumption forecast and the restock expense.
 *
 * Items live in the vendor workspace field `inventoryItems`, an untyped bucket
 * on the server (`InventoryRecord = { id } & Record<string, unknown>`). Field
 * names match the old dashboard's `InventoryItem` (usil/src/types.ts) so rows
 * it wrote read the same here, and fields this screen does not edit
 * (`nameEn`, `category`, `notes`, …) ride along untouched on every save.
 */
import type { VendorBooking } from '../api/types.ts';
import { dayKey } from './format.ts';

export type InventoryItem = {
  id: string;
  nameAr: string;
  unit: string;
  currentStock: number;
  minStockThreshold: number;
  /** SAR per unit. */
  unitCost: number;
  /** Units one guest consumes at an event; 0 for things that are not used up. */
  estimatedUsagePerGuest: number;
  leadTimeDays?: number;
  supplierName?: string;
  barcode?: string;
  location?: string;
  lastRestockedAt?: string;
  createdAt?: string;
  /** Anything else the old dashboard stored on the row. */
  [extra: string]: unknown;
};

/** What the add/edit form edits. */
export type InventoryDraft = {
  nameAr: string;
  unit: string;
  currentStock: number;
  minStockThreshold: number;
  unitCost: number;
  estimatedUsagePerGuest: number;
  leadTimeDays: number;
  supplierName: string;
  barcode: string;
  location: string;
};

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** A stored row → a usable item. Unknown rows (no id) are dropped. */
export function normalizeItem(raw: unknown): InventoryItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  const leadTime = num(row.leadTimeDays, NaN);
  return {
    ...row,
    id,
    nameAr: text(row.nameAr) || text(row.nameEn) || 'صنف بدون اسم',
    unit: text(row.unit) || 'حبة',
    currentStock: Math.max(0, num(row.currentStock)),
    minStockThreshold: Math.max(0, num(row.minStockThreshold)),
    unitCost: Math.max(0, num(row.unitCost)),
    estimatedUsagePerGuest: Math.max(0, num(row.estimatedUsagePerGuest)),
    leadTimeDays: Number.isFinite(leadTime) && leadTime >= 0 ? leadTime : undefined,
    supplierName: text(row.supplierName),
    barcode: text(row.barcode),
    location: text(row.location),
  };
}

export function normalizeItems(raw: unknown): InventoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeItem).filter((item): item is InventoryItem => item !== null);
}

export function emptyDraft(barcode = ''): InventoryDraft {
  return {
    nameAr: '',
    unit: 'حبة',
    currentStock: 0,
    minStockThreshold: 0,
    unitCost: 0,
    estimatedUsagePerGuest: 0,
    leadTimeDays: 2,
    supplierName: '',
    barcode,
    location: '',
  };
}

export function draftFromItem(item: InventoryItem): InventoryDraft {
  return {
    nameAr: item.nameAr,
    unit: item.unit,
    currentStock: item.currentStock,
    minStockThreshold: item.minStockThreshold,
    unitCost: item.unitCost,
    estimatedUsagePerGuest: item.estimatedUsagePerGuest,
    leadTimeDays: item.leadTimeDays ?? 0,
    supplierName: item.supplierName || '',
    barcode: item.barcode || '',
    location: item.location || '',
  };
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/** Applies the form onto an item (or a new one), keeping fields the form does not show. */
export function applyDraft(draft: InventoryDraft, existing?: InventoryItem): InventoryItem {
  const base: InventoryItem = existing ?? {
    id: newId('inv'),
    createdAt: new Date().toISOString(),
    nameAr: '',
    unit: '',
    currentStock: 0,
    minStockThreshold: 0,
    unitCost: 0,
    estimatedUsagePerGuest: 0,
  };
  return {
    ...base,
    nameAr: draft.nameAr.trim(),
    unit: draft.unit.trim() || 'حبة',
    currentStock: Math.max(0, num(draft.currentStock)),
    minStockThreshold: Math.max(0, num(draft.minStockThreshold)),
    unitCost: Math.max(0, num(draft.unitCost)),
    estimatedUsagePerGuest: Math.max(0, num(draft.estimatedUsagePerGuest)),
    leadTimeDays: Math.max(0, Math.round(num(draft.leadTimeDays))),
    supplierName: draft.supplierName.trim() || undefined,
    barcode: draft.barcode.trim() || undefined,
    location: draft.location.trim() || undefined,
  };
}

export function sameCode(a: string | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A scanned or typed code → the item carrying it (barcode first, then the item id). */
export function findByCode(items: InventoryItem[], code: string): InventoryItem | null {
  const clean = code.trim();
  if (!clean) return null;
  return items.find((item) => sameCode(item.barcode, clean)) || items.find((item) => sameCode(item.id, clean)) || null;
}

/* ── Forecast ─────────────────────────────────────────────────────────── */

/**
 * Bookings that will not consume stock. Everything else that is dated today
 * or later counts — including ones still awaiting approval, so a pending event
 * is planned for rather than discovered late.
 */
const NOT_CONSUMING = new Set(['cancelled', 'completed', 'ملغي', 'مكتمل', 'مرفوض من المورّد']);

export type ForecastEvent = { id: string; date: string; guests: number; title: string };

/**
 * Upcoming events from the workspace bookings. Store orders (`GET
 * /api/bookings`) carry no guest count, so they cannot feed a per-guest
 * forecast and are left out.
 */
export function upcomingEvents(bookings: VendorBooking[], today = dayKey(new Date())): ForecastEvent[] {
  return bookings
    .filter((b) => !NOT_CONSUMING.has(String(b.status || '')) && String(b.date || '').slice(0, 10) >= today)
    .map((b) => ({
      id: b.id,
      date: String(b.date).slice(0, 10),
      guests: Math.max(0, num(b.guestCount)),
      title: b.serviceTitle || b.customerName || 'مناسبة',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type StockStatus = 'safe' | 'low' | 'critical';

export const STATUS_LABEL: Record<StockStatus, string> = {
  safe: 'آمن',
  low: 'تحت حد الأمان',
  critical: 'عجز متوقع',
};

/** Extra cover on top of the shortage so the next event is not run to zero. */
export const REORDER_BUFFER = 1.3;

export type Forecast = {
  item: InventoryItem;
  /** Units the upcoming events will use. */
  usage: number;
  /** Stock left after every upcoming event. Negative = runs out. */
  remaining: number;
  status: StockStatus;
  shortage: number;
  suggestedQty: number;
  suggestedCost: number;
  /** Date of the event at which stock drops below the safety level (or runs out). */
  troubleOn: string | null;
  /** `troubleOn` minus the supplier lead time — the last day to order. */
  orderBy: string | null;
};

function minusDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - days);
  return dayKey(date);
}

export function forecastItem(item: InventoryItem, events: ForecastEvent[]): Forecast {
  const perGuest = item.estimatedUsagePerGuest;
  const totalGuests = events.reduce((sum, e) => sum + e.guests, 0);
  const usage = Math.ceil(totalGuests * perGuest);
  const remaining = Math.round((item.currentStock - usage) * 100) / 100;
  const min = item.minStockThreshold;

  let status: StockStatus = 'safe';
  let shortage = 0;
  if (remaining < 0) {
    status = 'critical';
    shortage = Math.abs(remaining) + min;
  } else if (min > 0 && remaining <= min) {
    status = 'low';
    shortage = min - remaining;
  }

  const suggestedQty =
    shortage > 0 ? Math.ceil(shortage * REORDER_BUFFER) : status === 'low' ? Math.max(1, Math.ceil(min * (REORDER_BUFFER - 1))) : 0;
  const suggestedCost = Math.round(suggestedQty * item.unitCost * 100) / 100;

  // Walk the events in date order to find when the trouble actually starts.
  let troubleOn: string | null = null;
  if (status !== 'safe') {
    if (item.currentStock <= min) {
      troubleOn = dayKey(new Date());
    } else {
      let used = 0;
      for (const event of events) {
        used += event.guests * perGuest;
        if (item.currentStock - used <= min) {
          troubleOn = event.date;
          break;
        }
      }
    }
  }
  const orderBy = troubleOn ? minusDays(troubleOn, item.leadTimeDays ?? 0) : null;

  return { item, usage, remaining, status, shortage: Math.ceil(shortage), suggestedQty, suggestedCost, troubleOn, orderBy };
}

export function forecastAll(items: InventoryItem[], events: ForecastEvent[]): Forecast[] {
  return items.map((item) => forecastItem(item, events));
}

/* ── Restock expense ──────────────────────────────────────────────────── */

export type PaymentMethod = 'cash' | 'mada' | 'bank_transfer' | 'petty_cash';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقداً',
  mada: 'مدى',
  petty_cash: 'عهدة نثرية',
};

export const VAT_RATE = 0.15;

/**
 * Same shape as the old dashboard's `ExpenseRecord` (usil/src/types.ts), so
 * the Expenses screen reads restock expenses like any other.
 */
export type ExpenseRecord = {
  id: string;
  voucherNumber: string;
  title: string;
  category: 'inventory_supplies';
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  invoiceReference?: string;
  date: string;
  notes?: string;
};

export type RestockInput = {
  quantity: number;
  /** What was actually paid. */
  totalPaid: number;
  /** The supplier invoice includes 15% VAT inside `totalPaid`. */
  vatIncluded: boolean;
  supplierName: string;
  paymentMethod: PaymentMethod;
  notes: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Splits what was paid into the net cost and the input VAT. */
export function splitPaid(totalPaid: number, vatIncluded: boolean) {
  const total = round2(Math.max(0, totalPaid));
  if (!vatIncluded) return { amount: total, taxRate: 0, taxAmount: 0, totalAmount: total };
  const amount = round2(total / (1 + VAT_RATE));
  return { amount, taxRate: VAT_RATE, taxAmount: round2(total - amount), totalAmount: total };
}

/** The item after a restock: more stock, the new net unit cost, and the supplier. */
export function restockedItem(item: InventoryItem, input: RestockInput): InventoryItem {
  const { amount } = splitPaid(input.totalPaid, input.vatIncluded);
  return {
    ...item,
    currentStock: round2(item.currentStock + input.quantity),
    unitCost: input.quantity > 0 && amount > 0 ? round2(amount / input.quantity) : item.unitCost,
    supplierName: input.supplierName.trim() || item.supplierName,
    lastRestockedAt: new Date().toISOString(),
  };
}

export function restockExpense(item: InventoryItem, input: RestockInput, existing: Array<{ voucherNumber?: unknown }>): ExpenseRecord {
  const taken = new Set(existing.map((e) => String(e.voucherNumber || '')));
  let voucherNumber = '';
  do {
    voucherNumber = `PV-INV-${Math.floor(10000 + Math.random() * 90000)}`;
  } while (taken.has(voucherNumber));

  return {
    id: newId('exp'),
    voucherNumber,
    title: `شراء وتوريد مخزون: ${item.nameAr} (${input.quantity} ${item.unit})`,
    category: 'inventory_supplies',
    ...splitPaid(input.totalPaid, input.vatIncluded),
    paymentMethod: input.paymentMethod,
    paidTo: input.supplierName.trim() || item.supplierName || 'مورّد',
    date: dayKey(new Date()),
    notes: input.notes.trim() || undefined,
  };
}
