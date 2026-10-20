import type { BlockedDate, PlatformOrder, VendorBooking } from '../api/types.ts';
import type { Tone } from '../components/ui/primitives.tsx';
import { bookingStatusLabel } from './labels.ts';

/**
 * One calendar for both kinds of booking a vendor has: store orders placed on
 * usil.app (`GET /api/bookings`) and bookings the vendor recorded themselves
 * (`GET /api/vendor/workspace` → bookings). The date-hold rules mirror
 * `server/bookings/slot-holds.ts`, so a conflict shown here is one the server
 * would refuse to create.
 */

export const ORDER_CANCELLED = 'ملغي';
export const ORDER_REJECTED = 'مرفوض من المورّد';
const ORDER_NEW = 'جديد';
/** An unpaid instant checkout holds its date this long (`CHECKOUT_HOLD_MS`). */
const CHECKOUT_HOLD_MS = 45 * 60_000;

/** Vendor calendar statuses that mean the booking is off (`VENDOR_CANCELLED`). */
const MANUAL_CANCELLED = new Set(['cancelled', 'ملغي', ORDER_REJECTED]);
/** Calendar entries on a free-text service don't hold any listing's date. */
export const CUSTOM_SERVICE_ID = 'srv-custom';

export function isEndedOrder(order: Pick<PlatformOrder, 'status'>): boolean {
  return order.status === ORDER_CANCELLED || order.status === ORDER_REJECTED;
}

export function isCancelledBooking(booking: Pick<VendorBooking, 'status'>): boolean {
  return MANUAL_CANCELLED.has(String(booking.status || ''));
}

/** Paid and still going ahead — the store orders that count as revenue. */
export function isRevenueOrder(order: PlatformOrder): boolean {
  return order.paymentStatus === 'paid' && !isEndedOrder(order);
}

/** `createdAt` is stored as UTC `YYYY-MM-DD HH:mm`. */
function createdAtMs(raw: string | undefined): number {
  const ms = Date.parse(`${String(raw || '').replace(' ', 'T')}:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

/** `platformOrderHoldsDate`: paid, past «جديد», or a checkout still in its payment window. */
export function orderHoldsDate(order: PlatformOrder, nowMs: number): boolean {
  if (isEndedOrder(order)) return false;
  if (order.paymentStatus === 'paid') return true;
  if (order.status !== ORDER_NEW) return true;
  return nowMs - createdAtMs(order.createdAt) <= CHECKOUT_HOLD_MS;
}

export function orderListingIds(order: PlatformOrder): string[] {
  const ids = [String(order.serviceId ?? ''), ...(order.items || []).map((item) => String(item?.id ?? ''))].filter(
    Boolean,
  );
  return Array.from(new Set(ids));
}

export function orderTitle(order: PlatformOrder): string {
  const lines = (order.items || []).filter((item) => item?.title);
  if (!lines.length) return order.serviceName || 'طلب من المتجر';
  const first = lines[0].quantity > 1 ? `${lines[0].title} × ${lines[0].quantity}` : lines[0].title;
  return lines.length > 1 ? `${first} +${lines.length - 1}` : first;
}

type EntryBase = {
  key: string;
  date: string;
  time: string;
  title: string;
  customer: string;
  phone: string;
  amount: number;
  status: string;
  listingIds: string[];
  /** Holds its listings' date on the server (cancelled and lapsed checkouts don't). */
  holdsDate: boolean;
  /** Another live entry holds one of the same listings on the same day. */
  conflict: boolean;
};

export type OrderEntry = EntryBase & { kind: 'order'; paid: boolean; order: PlatformOrder };
export type ManualEntry = EntryBase & { kind: 'manual'; source: string; booking: VendorBooking };
export type CalendarEntry = OrderEntry | ManualEntry;

export type CalendarData = {
  byDate: Map<string, CalendarEntry[]>;
  blockedByDate: Map<string, BlockedDate>;
  conflictDates: Set<string>;
};

function sortKey(entry: CalendarEntry): string {
  return `${entry.date} ${entry.time || '99:99'}`;
}

/**
 * Cancelled and rejected store orders are left out entirely; a cancelled
 * manual booking stays visible (its status can be changed back) but holds nothing.
 */
export function buildCalendar(
  orders: PlatformOrder[],
  bookings: VendorBooking[],
  blocked: BlockedDate[],
  nowMs: number = Date.now(),
): CalendarData {
  const entries: CalendarEntry[] = [];

  for (const order of orders) {
    if (isEndedOrder(order)) continue;
    const date = String(order.eventDate || '').slice(0, 10);
    if (!date) continue;
    entries.push({
      kind: 'order',
      key: `o:${order.id}`,
      date,
      time: String(order.eventTime || ''),
      title: orderTitle(order),
      customer: order.name,
      phone: order.phone,
      amount: Number(order.totalAmount || 0),
      status: order.status,
      paid: order.paymentStatus === 'paid',
      listingIds: orderListingIds(order),
      holdsDate: orderHoldsDate(order, nowMs),
      conflict: false,
      order,
    });
  }

  for (const booking of bookings) {
    const date = String(booking.date || '').slice(0, 10);
    if (!date) continue;
    const serviceId = String(booking.serviceId || '');
    entries.push({
      kind: 'manual',
      key: `m:${booking.id}`,
      date,
      time: String(booking.startTime || ''),
      title: booking.serviceTitle,
      customer: booking.customerName,
      phone: booking.customerPhone,
      amount: Number(booking.totalAmount || 0),
      status: booking.status,
      source: booking.source,
      listingIds: serviceId && serviceId !== CUSTOM_SERVICE_ID ? [serviceId] : [],
      holdsDate: !isCancelledBooking(booking),
      conflict: false,
      booking,
    });
  }

  // Two live entries holding the same listing on the same day.
  const holders = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (!entry.holdsDate) continue;
    for (const listingId of entry.listingIds) {
      const slot = `${entry.date}|${listingId}`;
      const list = holders.get(slot);
      if (list) list.push(entry);
      else holders.set(slot, [entry]);
    }
  }
  const conflictDates = new Set<string>();
  for (const list of holders.values()) {
    if (list.length < 2) continue;
    for (const entry of list) {
      entry.conflict = true;
      conflictDates.add(entry.date);
    }
  }

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const blockedByDate = new Map<string, BlockedDate>();
  for (const row of blocked) blockedByDate.set(String(row.date).slice(0, 10), row);

  return { byDate, blockedByDate, conflictDates };
}

/* ── Labels ─────────────────────────────────────────────────────────── */

/** `source` values the console writes; the server stores any short string. */
export const EXTERNAL_SOURCES = [
  { id: 'external_phone', label: 'مكالمة' },
  { id: 'external_whatsapp', label: 'واتساب' },
  { id: 'external_instagram', label: 'إنستقرام / تيك توك' },
  { id: 'direct_bio_link', label: 'رابط البايو' },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  ...Object.fromEntries(EXTERNAL_SOURCES.map((item) => [item.id, item.label])),
  vendor: 'تسجيل يدوي',
  platform: 'تسجيل يدوي',
  pos: 'نقطة البيع',
};

export function sourceLabel(source: string | undefined): string {
  return SOURCE_LABEL[String(source || '')] || 'حجز خارجي';
}

const STATUS_TONE: Record<string, Tone> = {
  'بانتظار موافقة المورّد': 'warning',
  جديد: 'neutral',
  مؤكد: 'accent',
  'قيد التنفيذ': 'accent',
  مكتمل: 'good',
  ملغي: 'neutral',
  'مرفوض من المورّد': 'critical',
  'بانتظار العربون': 'warning',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[bookingStatusLabel(status)] || 'neutral';
}
