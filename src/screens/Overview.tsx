import { useMemo } from 'react';
import { AlertTriangle, CalendarCheck, CalendarOff, ExternalLink, Package, Wallet } from 'lucide-react';
import { orders as ordersApi, storefront, workspace } from '../api/endpoints.ts';
import { useResource } from '../lib/useResource.ts';
import { count, dayLabel, sar, sarCompact, shortDate } from '../lib/format.ts';
import { CATEGORY_LABEL, bookingStatusLabel, isRevenueBooking, labelFor } from '../lib/labels.ts';
import { navigate } from '../lib/router.ts';
import { publicStoreUrl } from '../lib/publicSite.ts';
import { riyadhToday } from '../lib/riyadh.ts';
import {
  isCancelledBooking,
  isEndedOrder,
  isRevenueOrder,
  orderTitle,
  sourceLabel,
  statusTone,
} from '../lib/calendarEntries.ts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../components/ui/primitives.tsx';
import { StatTile } from '../components/ui/StatTile.tsx';
import { AreaChart, type AreaPoint } from '../components/charts/AreaChart.tsx';
import { BarChart, type BarRow } from '../components/charts/BarChart.tsx';
import type { PlatformOrder, VendorBooking, VendorListing } from '../api/types.ts';
import { useAccount } from '../state/AccountContext.tsx';

const TREND_DAYS = 30;

/** `YYYY-MM-DD` shifted by whole days, in UTC so the device timezone never moves it. */
function shiftDay(key: string, delta: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Revenue per event day over the trailing window, oldest first — zero-filled so a
 *  quiet week reads as a flat line rather than a missing one. Paid store orders
 *  and confirmed external bookings both count. */
function revenueTrend(bookings: VendorBooking[], orders: PlatformOrder[], today: string): AreaPoint[] {
  const byDay = new Map<string, number>();
  const add = (date: string, amount: number) => {
    const key = String(date || '').slice(0, 10);
    if (key) byDay.set(key, (byDay.get(key) || 0) + Number(amount || 0));
  };
  for (const booking of bookings) if (isRevenueBooking(booking)) add(booking.date, booking.totalAmount);
  for (const order of orders) if (isRevenueOrder(order)) add(order.eventDate, order.totalAmount);

  const points: AreaPoint[] = [];
  for (let back = TREND_DAYS - 1; back >= 0; back -= 1) {
    const key = shiftDay(today, -back);
    points.push({ key, label: dayLabel(key), value: byDay.get(key) || 0 });
  }
  return points;
}

function byCategory(listings: VendorListing[]): BarRow[] {
  const totals = new Map<string, number>();
  for (const listing of listings) {
    totals.set(listing.category, (totals.get(listing.category) || 0) + 1);
  }
  return Array.from(totals, ([key, value]) => ({
    key,
    label: labelFor(CATEGORY_LABEL, key),
    value,
  })).sort((a, b) => b.value - a.value);
}

type Upcoming =
  | { kind: 'order'; key: string; date: string; time: string; order: PlatformOrder }
  | { kind: 'manual'; key: string; date: string; time: string; booking: VendorBooking };

export function Overview() {
  const ws = useResource(workspace.read);
  const file = useResource(storefront.file);
  const { mode } = useAccount();
  // The pending checklist banner covers status; a store page and bookings come with approval.
  const pending = mode === 'pending';
  // A pending applicant is still a client account: `GET /api/bookings` would
  // return their own purchases, not orders on their products.
  const ordersRes = useResource(() => (mode === 'vendor' ? ordersApi.list() : Promise.resolve([])), [mode]);
  const today = riyadhToday();

  const bookings = useMemo(() => ws.data?.bookings || [], [ws.data]);
  const orders = useMemo(() => ordersRes.data || [], [ordersRes.data]);
  const listings = useMemo(() => ws.data?.listings || [], [ws.data]);

  const manualRevenue = useMemo(
    () => bookings.filter(isRevenueBooking).reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
    [bookings],
  );
  const storeRevenue = useMemo(
    () => orders.filter(isRevenueOrder).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    [orders],
  );
  const revenue = manualRevenue + storeRevenue;
  const outstanding = useMemo(
    () =>
      bookings
        .filter((booking) => !isCancelledBooking(booking))
        .reduce((sum, booking) => sum + Number(booking.remainingAmount || 0), 0),
    [bookings],
  );
  const liveManual = useMemo(() => bookings.filter((booking) => !isCancelledBooking(booking)), [bookings]);
  const liveOrders = useMemo(() => orders.filter((order) => !isEndedOrder(order)), [orders]);
  const trend = useMemo(() => revenueTrend(bookings, orders, today), [bookings, orders, today]);
  const categories = useMemo(() => byCategory(listings), [listings]);

  const upcoming = useMemo(() => {
    const rows: Upcoming[] = [
      ...liveManual
        .filter((booking) => String(booking.date || '') >= today)
        .map((booking): Upcoming => ({
          kind: 'manual',
          key: `m:${booking.id}`,
          date: booking.date,
          time: booking.startTime || '',
          booking,
        })),
      ...liveOrders
        .filter((order) => String(order.eventDate || '') >= today)
        .map((order): Upcoming => ({
          kind: 'order',
          key: `o:${order.id}`,
          date: order.eventDate,
          time: order.eventTime || '',
          order,
        })),
    ];
    return rows
      .sort((a, b) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`))
      .slice(0, 5);
  }, [liveManual, liveOrders, today]);

  const application = file.data?.application;
  const publicFile = file.data?.file;

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        subtitle={publicFile?.projectName ? `متجر ${publicFile.projectName}` : 'ملخّص متجرك في يوصل'}
        action={
          publicFile && !pending ? (
            <Button
              size="sm"
              icon={<ExternalLink size={15} />}
              onClick={() => window.open(publicStoreUrl(publicFile.vendorId), '_blank', 'noopener')}
            >
              عرض متجري
            </Button>
          ) : undefined
        }
      />

      {ws.error ? <ErrorNote message={ws.error} onRetry={() => void ws.reload()} /> : null}
      {ordersRes.error ? (
        <ErrorNote
          message={`ما قدرنا نجيب طلبات المتجر: ${ordersRes.error}`}
          onRetry={() => void ordersRes.reload()}
        />
      ) : null}

      {application && application.status !== 'approved' && !pending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] px-4 py-3">
          <AlertTriangle size={17} className="shrink-0 text-ink" aria-hidden />
          <p className="flex-1 text-[13px] leading-6 text-ink">
            {application.status === 'pending'
              ? 'طلب انضمامك قيد المراجعة عند إدارة يوصل. تقدر تجهّز منتجاتك الآن، وتظهر في المتجر بعد الاعتماد.'
              : `طلب انضمامك مرفوض${application.rejectReason ? ` — ${application.rejectReason}` : ''}.`}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={pending ? 'منتجاتي' : 'منتجات منشورة'}
          value={count(listings.length)}
          icon={<Package size={16} />}
          hint={categories.length ? `${count(categories.length)} قسم` : 'ما نشرت منتجاً بعد'}
        />
        <StatTile
          label="الحجوزات"
          value={count(liveOrders.length + liveManual.length)}
          icon={<CalendarCheck size={16} />}
          hint={`${count(liveOrders.length)} من المتجر · ${count(liveManual.length)} خارجي`}
          trend={trend.slice(-14).map((point) => point.value)}
        />
        <StatTile
          label="الإيراد"
          value={sar(revenue)}
          icon={<Wallet size={16} />}
          hint={`المتجر (مدفوع) ${sar(storeRevenue)} · خارجي ${sar(manualRevenue)}${
            outstanding > 0 ? ` · متبقٍ على عملاء الخارجي ${sar(outstanding)}` : ''
          }`}
        />
        <StatTile
          label="أيام مغلقة"
          value={count(ws.data?.blockedDates.length || 0)}
          icon={<CalendarOff size={16} />}
          hint="أيام ما تستقبل فيها حجوزات"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="الإيراد يومياً"
            subtitle={`طلبات المتجر المدفوعة والحجوزات الخارجية المؤكدة، حسب يوم المناسبة — آخر ${count(TREND_DAYS)} يوماً`}
          />
          {trend.some((point) => point.value > 0) ? (
            <AreaChart points={trend} formatValue={sarCompact} label="الإيراد يومياً" />
          ) : (
            <EmptyState
              title="ما فيه إيراد في آخر 30 يوماً"
              body="الطلبات المدفوعة من المتجر والحجوزات الخارجية المؤكدة تظهر هنا."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="منتجاتي حسب القسم" />
          {categories.length ? (
            <BarChart rows={categories} formatValue={count} />
          ) : (
            <EmptyState
              title="ما نشرت منتجاً"
              action={
                <Button size="sm" variant="primary" onClick={() => navigate('listings')}>
                  أضف منتجاً
                </Button>
              }
            />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="القادم في تقويمك"
          subtitle="أقرب خمسة حجوزات — من المتجر والخارجية"
          action={
            pending ? undefined : (
              <Button size="sm" variant="ghost" onClick={() => navigate('calendar')}>
                كل التقويم
              </Button>
            )
          }
        />
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((row) =>
              row.kind === 'order' ? (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {row.order.name} — {orderTitle(row.order)}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {shortDate(row.date)}
                      {row.order.city ? ` · ${row.order.city}` : ''} · طلب {row.order.id}
                    </span>
                  </span>
                  <Badge tone="accent">طلب متجر</Badge>
                  <Badge tone={statusTone(row.order.status)}>{bookingStatusLabel(row.order.status)}</Badge>
                  <Badge tone={row.order.paymentStatus === 'paid' ? 'good' : 'warning'}>
                    {row.order.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                  </Badge>
                  <span className="tabular text-[13px] font-semibold text-ink">{sar(row.order.totalAmount)}</span>
                </li>
              ) : (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {row.booking.customerName} — {row.booking.serviceTitle}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {shortDate(row.date)} · {row.booking.city} · {count(row.booking.guestCount)} ضيف
                    </span>
                  </span>
                  <Badge>خارجي · {sourceLabel(row.booking.source)}</Badge>
                  <Badge tone={statusTone(row.booking.status)}>{bookingStatusLabel(row.booking.status)}</Badge>
                  <span className="tabular text-[13px] font-semibold text-ink">{sar(row.booking.totalAmount)}</span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <EmptyState title="ما فيه حجوزات قادمة" body="تقويمك فاضي من اليوم فصاعداً." />
        )}
      </Card>
    </>
  );
}
