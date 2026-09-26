import { useMemo, useState } from 'react';
import { CalendarOff, CalendarPlus, RefreshCw, Trash2 } from 'lucide-react';
import { blockedDates as blockedApi, bookings as bookingsApi, workspace } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { count, sar, shortDate } from '../lib/format.ts';
import { BLOCKED_DATE_LABEL, BLOCKED_DATE_TYPES, BOOKING_STATUSES } from '../lib/labels.ts';
import { useToast } from '../state/ToastContext.tsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui/primitives.tsx';
import { DataTable, type Column } from '../components/ui/Table.tsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.tsx';
import type { BlockedDate, BlockedDateType, VendorBooking } from '../api/types.ts';

const TODAY = () => new Date().toISOString().slice(0, 10);

type BookingDraft = {
  customerName: string;
  customerPhone: string;
  serviceTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  venueName: string;
  guestCount: number;
  totalAmount: number;
  depositAmount: number;
  notes: string;
};

function emptyBooking(): BookingDraft {
  return {
    customerName: '',
    customerPhone: '',
    serviceTitle: '',
    date: TODAY(),
    startTime: '18:00',
    endTime: '23:30',
    city: '',
    venueName: '',
    guestCount: 50,
    totalAmount: 0,
    depositAmount: 0,
    notes: '',
  };
}

export function Calendar() {
  const toast = useToast();
  const ws = useResource(workspace.read);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [draft, setDraft] = useState<BookingDraft>(emptyBooking);
  const [block, setBlock] = useState<{ date: string; reason: string; type: BlockedDateType }>({
    date: TODAY(),
    reason: '',
    type: 'full_day',
  });
  const [removingBooking, setRemovingBooking] = useState<VendorBooking | null>(null);
  const [busy, setBusy] = useState(false);

  /** Newest event first — the vendor plans forward from today, not from the oldest row. */
  const bookingRows = useMemo(
    () => [...(ws.data?.bookings || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [ws.data],
  );
  const blockedRows = useMemo(
    () => [...(ws.data?.blockedDates || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [ws.data],
  );

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

  async function addBooking() {
    const ok = await run(
      () =>
        bookingsApi.create({
          ...draft,
          // The server recomputes this (total − deposit) and owns the id and number.
          remainingAmount: Math.max(0, draft.totalAmount - draft.depositAmount),
          source: 'vendor',
          status: 'مؤكد',
        }),
      'أُضيف الحجز إلى تقويمك.',
    );
    if (ok) {
      setBookingOpen(false);
      setDraft(emptyBooking());
    }
  }

  async function addBlocked() {
    const ok = await run(() => blockedApi.create(block), 'أُغلق التاريخ — ما يستقبل حجوزات.');
    if (ok) {
      setBlockOpen(false);
      setBlock({ date: TODAY(), reason: '', type: 'full_day' });
    }
  }

  const bookingColumns: Column<VendorBooking>[] = [
    {
      key: 'date',
      header: 'التاريخ',
      render: (row) => (
        <span className="whitespace-nowrap">
          <span className="block text-ink">{shortDate(row.date)}</span>
          <span className="tabular block text-xs text-ink-muted" dir="ltr">
            {row.startTime} – {row.endTime}
          </span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'العميل',
      render: (row) => (
        <span>
          <span className="block font-medium text-ink">{row.customerName}</span>
          <span className="tabular block text-xs text-ink-muted" dir="ltr">
            {row.customerPhone}
          </span>
        </span>
      ),
    },
    {
      key: 'service',
      header: 'الخدمة',
      render: (row) => (
        <span>
          <span className="block text-ink">{row.serviceTitle}</span>
          <span className="block text-xs text-ink-muted">
            {row.venueName} · {row.city} · {count(row.guestCount)} ضيف
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'المبلغ',
      numeric: true,
      render: (row) => (
        <span className="whitespace-nowrap">
          <span className="block font-medium text-ink">{sar(row.totalAmount)}</span>
          {row.remainingAmount > 0 ? (
            <span className="block text-xs text-ink-muted">متبقٍ {sar(row.remainingAmount)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      width: '150px',
      render: (row) => (
        <Select
          value={BOOKING_STATUSES.includes(row.status as never) ? row.status : ''}
          aria-label={`حالة حجز ${row.customerName}`}
          className="h-8 text-[13px]"
          onChange={(event) =>
            void run(() => bookingsApi.update(row.id, { status: event.target.value }), 'حُدّثت حالة الحجز.')
          }
        >
          {BOOKING_STATUSES.includes(row.status as never) ? null : (
            <option value="">{row.status || '—'}</option>
          )}
          {BOOKING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '56px',
      render: (row) => (
        <span className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`حذف حجز ${row.customerName}`}
            title="حذف"
            icon={<Trash2 size={15} />}
            onClick={() => setRemovingBooking(row)}
          />
        </span>
      ),
    },
  ];

  const blockedColumns: Column<BlockedDate>[] = [
    { key: 'date', header: 'التاريخ', render: (row) => shortDate(row.date) },
    { key: 'type', header: 'النوع', render: (row) => <Badge>{BLOCKED_DATE_LABEL[row.type]}</Badge> },
    {
      key: 'reason',
      header: 'السبب',
      render: (row) => <span className="text-ink-secondary">{row.reason}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '56px',
      render: (row) => (
        <span className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`فتح ${row.date}`}
            title="إلغاء الإغلاق"
            icon={<Trash2 size={15} />}
            onClick={() => void run(() => blockedApi.remove(row.id), 'فُتح التاريخ من جديد.')}
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="التقويم والحجوزات"
        subtitle="حجوزاتك المسجّلة يدوياً والأيام المغلقة عندك."
        action={
          <Button
            size="sm"
            variant="ghost"
            busy={ws.refreshing}
            icon={<RefreshCw size={15} />}
            onClick={() => void ws.reload()}
          >
            تحديث
          </Button>
        }
      />

      {ws.error ? <ErrorNote message={ws.error} onRetry={() => void ws.reload()} /> : null}

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="الحجوزات"
            subtitle="حجوزات تسجّلها أنت — الطلبات القادمة من المتجر تُدار من صفحة الطلبات."
            action={
              <Button size="sm" icon={<CalendarPlus size={15} />} onClick={() => setBookingOpen(true)}>
                حجز جديد
              </Button>
            }
          />
        </div>
        <DataTable
          columns={bookingColumns}
          rows={bookingRows}
          rowKey={(row) => row.id}
          loading={ws.loading}
          empty={
            <EmptyState
              icon={<CalendarPlus size={26} />}
              title="التقويم فاضي"
              body="سجّل حجزاً يدوياً عشان يحجز اليوم في تقويمك ويمنع التعارض."
            />
          }
        />
      </Card>

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="أيام مغلقة"
            subtitle="أيام ما تستقبل فيها حجوزات — إجازة أو صيانة أو ارتباط."
            action={
              <Button size="sm" icon={<CalendarOff size={15} />} onClick={() => setBlockOpen(true)}>
                إغلاق تاريخ
              </Button>
            }
          />
        </div>
        <DataTable
          columns={blockedColumns}
          rows={blockedRows}
          rowKey={(row) => row.id}
          loading={ws.loading}
          empty={<EmptyState title="ما عندك أيام مغلقة" body="كل الأيام مفتوحة للحجز حالياً." />}
        />
      </Card>

      <Modal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="حجز جديد"
        description="الاسم ورقم الجوال مطلوبان — الباقي يساعدك على منع التعارض."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBookingOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!draft.customerName.trim() || !draft.customerPhone.trim()}
              onClick={() => void addBooking()}
            >
              إضافة الحجز
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="اسم العميل">
            <Input
              value={draft.customerName}
              onChange={(event) => setDraft({ ...draft, customerName: event.target.value })}
            />
          </Field>
          <Field label="جوال العميل">
            <Input
              dir="ltr"
              inputMode="tel"
              className="tabular text-start"
              placeholder="05xxxxxxxx"
              value={draft.customerPhone}
              onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })}
            />
          </Field>
        </div>

        <Field label="الخدمة">
          <Input
            placeholder="ركن قهوة، بوفيه، تنسيق…"
            value={draft.serviceTitle}
            onChange={(event) => setDraft({ ...draft, serviceTitle: event.target.value })}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="التاريخ">
            <Input
              type="date"
              className="tabular"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </Field>
          <Field label="من">
            <Input
              type="time"
              className="tabular"
              value={draft.startTime}
              onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
            />
          </Field>
          <Field label="إلى">
            <Input
              type="time"
              className="tabular"
              value={draft.endTime}
              onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="المدينة">
            <Input
              value={draft.city}
              onChange={(event) => setDraft({ ...draft, city: event.target.value })}
            />
          </Field>
          <Field label="المقر">
            <Input
              value={draft.venueName}
              onChange={(event) => setDraft({ ...draft, venueName: event.target.value })}
            />
          </Field>
          <Field label="عدد الضيوف">
            <Input
              type="number"
              min={1}
              className="tabular"
              value={draft.guestCount || ''}
              onChange={(event) => setDraft({ ...draft, guestCount: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="إجمالي المبلغ">
            <Input
              type="number"
              min={0}
              className="tabular"
              value={draft.totalAmount || ''}
              onChange={(event) => setDraft({ ...draft, totalAmount: Number(event.target.value) })}
            />
          </Field>
          <Field
            label="العربون المستلم"
            hint={`المتبقي: ${sar(Math.max(0, draft.totalAmount - draft.depositAmount))}`}
          >
            <Input
              type="number"
              min={0}
              className="tabular"
              value={draft.depositAmount || ''}
              onChange={(event) => setDraft({ ...draft, depositAmount: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Field label="ملاحظات">
          <Textarea
            rows={2}
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </Field>
      </Modal>

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="إغلاق تاريخ"
        description="اليوم المغلق يظهر لك في التقويم كيوم غير متاح."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button variant="primary" busy={busy} disabled={!block.date} onClick={() => void addBlocked()}>
              إغلاق التاريخ
            </Button>
          </>
        }
      >
        <Field label="التاريخ">
          <Input
            type="date"
            className="tabular"
            value={block.date}
            onChange={(event) => setBlock({ ...block, date: event.target.value })}
          />
        </Field>
        <Field label="النوع">
          <Select
            value={block.type}
            onChange={(event) => setBlock({ ...block, type: event.target.value as BlockedDateType })}
          >
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
        open={Boolean(removingBooking)}
        title="حذف الحجز؟"
        body={`حجز «${removingBooking?.customerName || ''}» يُحذف من تقويمك ويُفتح اليوم للحجز.`}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!removingBooking) return;
          const ok = await run(() => bookingsApi.remove(removingBooking.id), 'حُذف الحجز.');
          if (ok) setRemovingBooking(null);
        }}
        onCancel={() => setRemovingBooking(null)}
      />
    </>
  );
}
