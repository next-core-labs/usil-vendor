import { useMemo } from 'react';
import { AlertTriangle, CalendarCheck, CalendarOff, ExternalLink, Package, Wallet } from 'lucide-react';
import { storefront, workspace } from '../api/endpoints.ts';
import { useResource } from '../lib/useResource.ts';
import { count, dayKey, dayLabel, sar, sarCompact, shortDate } from '../lib/format.ts';
import { CATEGORY_LABEL, isRevenueBooking, labelFor } from '../lib/labels.ts';
import { navigate } from '../lib/router.ts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../components/ui/primitives.tsx';
import { StatTile } from '../components/ui/StatTile.tsx';
import { AreaChart, type AreaPoint } from '../components/charts/AreaChart.tsx';
import { BarChart, type BarRow } from '../components/charts/BarChart.tsx';
import type { VendorBooking, VendorListing } from '../api/types.ts';

const TREND_DAYS = 30;

/** Revenue per day over the trailing window, oldest first — zero-filled so a
 *  quiet week reads as a flat line rather than a missing one. */
function revenueTrend(bookings: VendorBooking[]): AreaPoint[] {
  const byDay = new Map<string, number>();
  for (const booking of bookings) {
    if (!isRevenueBooking(booking)) continue;
    const key = String(booking.date || '').slice(0, 10);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) || 0) + Number(booking.totalAmount || 0));
  }

  const today = new Date();
  const points: AreaPoint[] = [];
  for (let back = TREND_DAYS - 1; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    const key = dayKey(day);
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

export function Overview() {
  const ws = useResource(workspace.read);
  const file = useResource(storefront.file);

  const bookings = useMemo(() => ws.data?.bookings || [], [ws.data]);
  const listings = useMemo(() => ws.data?.listings || [], [ws.data]);

  const revenue = useMemo(
    () => bookings.filter(isRevenueBooking).reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
    [bookings],
  );
  const outstanding = useMemo(
    () => bookings.reduce((sum, booking) => sum + Number(booking.remainingAmount || 0), 0),
    [bookings],
  );
  const trend = useMemo(() => revenueTrend(bookings), [bookings]);
  const categories = useMemo(() => byCategory(listings), [listings]);

  const upcoming = useMemo(() => {
    const today = dayKey(new Date());
    return [...bookings]
      .filter((booking) => String(booking.date || '') >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [bookings]);

  const application = file.data?.application;
  const publicFile = file.data?.file;

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        subtitle={publicFile?.projectName ? `متجر ${publicFile.projectName}` : 'ملخّص متجرك في يوصل'}
        action={
          publicFile ? (
            <Button
              size="sm"
              icon={<ExternalLink size={15} />}
              onClick={() => window.open(`/vendor/${encodeURIComponent(publicFile.vendorId)}`, '_blank')}
            >
              عرض متجري
            </Button>
          ) : undefined
        }
      />

      {ws.error ? <ErrorNote message={ws.error} onRetry={() => void ws.reload()} /> : null}

      {application && application.status !== 'approved' ? (
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
          label="منتجات منشورة"
          value={count(listings.length)}
          icon={<Package size={16} />}
          hint={categories.length ? `${count(categories.length)} قسم` : 'ما نشرت منتجاً بعد'}
        />
        <StatTile
          label="حجوزات مسجّلة"
          value={count(bookings.length)}
          icon={<CalendarCheck size={16} />}
          trend={trend.slice(-14).map((point) => point.value)}
        />
        <StatTile
          label="الإيراد المسجّل"
          value={sar(revenue)}
          icon={<Wallet size={16} />}
          hint={outstanding > 0 ? `متبقٍ على العملاء ${sar(outstanding)}` : 'لا مبالغ متبقية'}
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
          <CardHeader title="الإيراد المسجّل يومياً" subtitle={`آخر ${count(TREND_DAYS)} يوماً`} />
          {revenue > 0 ? (
            <AreaChart points={trend} formatValue={sarCompact} label="الإيراد المسجّل يومياً" />
          ) : (
            <EmptyState title="ما فيه إيراد مسجّل بعد" body="سجّل حجزاً في التقويم ويظهر هنا." />
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
          subtitle="أقرب خمسة حجوزات"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate('calendar')}>
              كل التقويم
            </Button>
          }
        />
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {booking.customerName} — {booking.serviceTitle}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {shortDate(booking.date)} · {booking.city} · {count(booking.guestCount)} ضيف
                  </span>
                </span>
                <Badge>{booking.status}</Badge>
                <span className="tabular text-[13px] font-semibold text-ink">{sar(booking.totalAmount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="ما فيه حجوزات قادمة" body="تقويمك فاضي من اليوم فصاعداً." />
        )}
      </Card>
    </>
  );
}
