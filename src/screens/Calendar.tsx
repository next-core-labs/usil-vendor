import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  List,
  Lock,
  RefreshCw,
  Unlock,
} from 'lucide-react';
import { blockedDates as blockedApi, bookings as bookingsApi, orders as ordersApi, workspace } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { usePoll } from '../lib/usePoll.ts';
import { count } from '../lib/format.ts';
import { BLOCKED_DATE_LABEL, BLOCKED_DATE_TYPES } from '../lib/labels.ts';
import { longDayLabel, monthLabel, monthOf, riyadhToday, shiftMonth } from '../lib/riyadh.ts';
import { buildCalendar, type CalendarEntry } from '../lib/calendarEntries.ts';
import { useToast } from '../state/ToastContext.tsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../components/ui/primitives.tsx';
import { FilterTabs } from '../components/ui/Table.tsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.tsx';
import { MonthGrid } from '../components/calendar/MonthGrid.tsx';
import { EntryCard } from '../components/calendar/EntryCard.tsx';
import { ExternalBookingModal } from '../components/calendar/ExternalBookingModal.tsx';
import type { BlockedDateType } from '../api/types.ts';

type View = 'month' | 'list';

/**
 * التقويم — store orders and external bookings on one month, with the closed
 * days. A conflict is two live entries holding the same listing on the same
 * day (the rule in `server/bookings/slot-holds.ts`); the server refuses to
 * create one, so a conflict here means data that predates the lock or an
 * order that slipped in — the vendor resolves it by hand.
 */
export function Calendar() {
  const toast = useToast();
  const ws = useResource(workspace.read);
  const orders = useResource(ordersApi.list);
  usePoll(() => {
    void ws.reload();
    void orders.reload();
  }, 60_000);

  const [today] = useState(riyadhToday);
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<View>('month');

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState(today);
  const [blockOpen, setBlockOpen] = useState(false);
  const [block, setBlock] = useState<{ reason: string; type: BlockedDateType }>({ reason: '', type: 'full_day' });
  const [removing, setRemoving] = useState<CalendarEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const listings = useMemo(() => ws.data?.listings || [], [ws.data]);
  const calendar = useMemo(
    () => buildCalendar(orders.data || [], ws.data?.bookings || [], ws.data?.blockedDates || []),
    [orders.data, ws.data],
  );

  const dayEntries = calendar.byDate.get(selected) || [];
  const dayBlocked = calendar.blockedByDate.get(selected);
  const dayConflict = calendar.conflictDates.has(selected);
  const dayPast = selected < today;

  const monthDays = useMemo(() => {
    const keys = new Set<string>();
    for (const key of calendar.byDate.keys()) if (key.startsWith(month)) keys.add(key);
    for (const key of calendar.blockedByDate.keys()) if (key.startsWith(month)) keys.add(key);
    return Array.from(keys).sort();
  }, [calendar, month]);

  const monthStats = useMemo(() => {
    let orderCount = 0;
    let manualCount = 0;
    let conflicts = 0;
    for (const day of monthDays) {
      for (const entry of calendar.byDate.get(day) || []) {
        if (!entry.holdsDate) continue;
        if (entry.kind === 'order') orderCount += 1;
        else manualCount += 1;
      }
      if (calendar.conflictDates.has(day)) conflicts += 1;
    }
    return { orderCount, manualCount, conflicts };
  }, [calendar, monthDays]);

  function goMonth(next: string) {
    setMonth(next);
    setSelected(next === monthOf(today) ? today : `${next}-01`);
  }

  function goToday() {
    setMonth(monthOf(today));
    setSelected(today);
  }

  function selectDay(day: string, reveal = false) {
    setSelected(day);
    if (monthOf(day) !== month) setMonth(monthOf(day));
    // Below `lg` the day panel sits under the month — bring it into view.
    if (reveal && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await ws.reload();
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openBooking(date: string) {
    setBookingDate(date);
    setBookingOpen(true);
  }

  async function blockDay() {
    const ok = await run(
      () => blockedApi.create({ date: selected, reason: block.reason.trim(), type: block.type }),
      'أُغلق اليوم — ما يستقبل حجوزات من المتجر.',
    );
    if (ok) {
      setBlockOpen(false);
      setBlock({ reason: '', type: 'full_day' });
    }
  }

  const loading = ws.loading || orders.loading;

  const dayPanel = (
    <Card>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{longDayLabel(selected)}</h2>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            {dayEntries.length ? `${count(dayEntries.length)} حجز في هذا اليوم` : 'ما فيه حجوزات في هذا اليوم'}
          </p>
        </div>
        {selected === today ? <Badge tone="accent">اليوم</Badge> : null}
      </header>

      {dayBlocked ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2.5">
          <Lock size={15} className="shrink-0 text-ink-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] text-ink">
            يوم مغلق · {BLOCKED_DATE_LABEL[dayBlocked.type] || dayBlocked.type}
            {dayBlocked.reason ? ` — ${dayBlocked.reason}` : ''}
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={<Unlock size={14} />}
            busy={busy}
            onClick={() => void run(() => blockedApi.remove(dayBlocked.id), 'فُتح اليوم للحجز من جديد.')}
          >
            فتح اليوم
          </Button>
        </div>
      ) : null}

      {dayConflict ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--critical)]" aria-hidden />
          <p className="text-[13px] leading-6 text-ink">
            حجزين على نفس المنتج في هذا اليوم — المنتج يخدم مناسبة واحدة في اليوم. غيّر تاريخ أحدهما أو ألغِه.
          </p>
        </div>
      ) : null}

      {dayBlocked && dayEntries.some((entry) => entry.holdsDate) ? (
        <p className="mb-3 text-xs text-ink-muted">اليوم مغلق وعليه حجوزات قائمة — الإغلاق يمنع الحجوزات الجديدة فقط.</p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={<CalendarPlus size={15} />}
          disabled={dayPast || Boolean(dayBlocked)}
          title={dayPast ? 'اليوم مضى' : dayBlocked ? 'افتح اليوم أولاً' : undefined}
          onClick={() => openBooking(selected)}
        >
          حجز خارجي لهذا اليوم
        </Button>
        {!dayBlocked ? (
          <Button
            size="sm"
            icon={<CalendarOff size={15} />}
            disabled={dayPast}
            title={dayPast ? 'اليوم مضى' : undefined}
            onClick={() => setBlockOpen(true)}
          >
            إغلاق اليوم
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : dayEntries.length ? (
        <ul className="space-y-2">
          {dayEntries.map((entry) => (
            <EntryCard
              key={entry.key}
              entry={entry}
              busy={busy}
              onStatus={(id, status) => void run(() => bookingsApi.update(id, { status }), 'حُدّثت حالة الحجز.')}
              onDelete={setRemoving}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title={dayBlocked ? 'يوم مغلق' : dayPast ? 'يوم مضى بدون حجوزات' : 'اليوم متاح'}
          body={dayBlocked || dayPast ? undefined : 'سجّل حجزاً خارجياً عشان يقفل اليوم لمنتجك في المتجر.'}
        />
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="التقويم والحجوزات"
        subtitle="طلبات المتجر وحجوزاتك الخارجية والأيام المغلقة في تقويم واحد."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              busy={ws.refreshing || orders.refreshing}
              icon={<RefreshCw size={15} />}
              onClick={() => {
                void ws.reload();
                void orders.reload();
              }}
            >
              تحديث
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<CalendarPlus size={15} />}
              onClick={() => openBooking(selected >= today && !dayBlocked ? selected : today)}
            >
              حجز خارجي
            </Button>
          </div>
        }
      />

      {ws.error ? <ErrorNote message={ws.error} onRetry={() => void ws.reload()} /> : null}
      {orders.error ? (
        <ErrorNote message={`ما قدرنا نجيب طلبات المتجر: ${orders.error}`} onRetry={() => void orders.reload()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                aria-label="الشهر السابق"
                icon={<ChevronRight size={16} />}
                onClick={() => goMonth(shiftMonth(month, -1))}
              />
              <h2 className="min-w-[8.5rem] text-center text-base font-semibold text-ink">{monthLabel(month)}</h2>
              <Button
                size="sm"
                variant="ghost"
                aria-label="الشهر التالي"
                icon={<ChevronLeft size={16} />}
                onClick={() => goMonth(shiftMonth(month, 1))}
              />
              <Button size="sm" variant="secondary" onClick={goToday}>
                اليوم
              </Button>
            </div>
            <FilterTabs<View>
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: 'الشهر' },
                { value: 'list', label: 'قائمة' },
              ]}
            />
          </header>

          <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
            <span>{count(monthStats.orderCount)} طلب متجر</span>
            <span>{count(monthStats.manualCount)} حجز خارجي</span>
            {monthStats.conflicts ? (
              <span className="inline-flex items-center gap-1 text-[var(--critical)]">
                <AlertTriangle size={12} aria-hidden />
                {count(monthStats.conflicts)} يوم فيه تعارض
              </span>
            ) : null}
          </p>

          {loading ? (
            <Skeleton className="h-[26rem] w-full" />
          ) : view === 'month' ? (
            <MonthGrid month={month} today={today} selected={selected} calendar={calendar} onSelect={(day) => selectDay(day, true)} />
          ) : monthDays.length ? (
            <ol className="space-y-4">
              {monthDays.map((day) => {
                const entries = calendar.byDate.get(day) || [];
                const blocked = calendar.blockedByDate.get(day);
                return (
                  <li key={day}>
                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      className={`mb-2 flex w-full flex-wrap items-center gap-2 text-start text-[13px] font-semibold ${
                        day === selected ? 'text-accent' : 'text-ink'
                      }`}
                    >
                      <List size={14} aria-hidden className="text-ink-muted" />
                      {longDayLabel(day)}
                      {day === today ? <Badge tone="accent">اليوم</Badge> : null}
                      {blocked ? (
                        <Badge icon={<Lock size={11} aria-hidden />}>
                          مغلق{blocked.reason ? ` · ${blocked.reason}` : ''}
                        </Badge>
                      ) : null}
                      {calendar.conflictDates.has(day) ? (
                        <Badge tone="critical" icon={<AlertTriangle size={11} aria-hidden />}>
                          تعارض
                        </Badge>
                      ) : null}
                    </button>
                    {entries.length ? (
                      <ul className="space-y-2">
                        {entries.map((entry) => (
                          <EntryCard
                            key={entry.key}
                            entry={entry}
                            busy={busy}
                            onStatus={(id, status) =>
                              void run(() => bookingsApi.update(id, { status }), 'حُدّثت حالة الحجز.')
                            }
                            onDelete={setRemoving}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              icon={<CalendarDays size={26} />}
              title="الشهر فاضي"
              body="ما فيه طلبات ولا حجوزات ولا أيام مغلقة في هذا الشهر."
            />
          )}
        </Card>

        <div ref={panelRef} className="min-w-0 scroll-mt-4">
          {dayPanel}
        </div>
      </div>

      <ExternalBookingModal
        open={bookingOpen}
        initialDate={bookingDate}
        listings={listings}
        calendar={calendar}
        onClose={() => setBookingOpen(false)}
        onSaved={(booking) => {
          setBookingOpen(false);
          toast.success(`سُجّل حجز ${booking.customerName} وانقفل اليوم في تقويمك.`);
          selectDay(booking.date);
          void ws.reload();
        }}
      />

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="إغلاق اليوم"
        description={`${longDayLabel(selected)} — اليوم المغلق ما يستقبل حجوزات من المتجر ولا حجوزات خارجية.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void blockDay()}>
              إغلاق اليوم
            </Button>
          </>
        }
      >
        {dayEntries.some((entry) => entry.holdsDate) ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] px-3 py-2 text-[13px] text-ink">
            عليه {count(dayEntries.filter((entry) => entry.holdsDate).length)} حجز قائم — الإغلاق ما يلغيها.
          </p>
        ) : null}
        <Field label="النوع">
          <Select value={block.type} onChange={(event) => setBlock({ ...block, type: event.target.value as BlockedDateType })}>
            {BLOCKED_DATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {BLOCKED_DATE_LABEL[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="السبب">
          <Input
            placeholder="إجازة، صيانة، ارتباط…"
            value={block.reason}
            onChange={(event) => setBlock({ ...block, reason: event.target.value })}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="حذف الحجز؟"
        body={`حجز «${removing?.customer || ''}» يُحذف من تقويمك ويُفتح اليوم للحجز.`}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!removing || removing.kind !== 'manual') return;
          const ok = await run(() => bookingsApi.remove(removing.booking.id), 'حُذف الحجز.');
          if (ok) setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
