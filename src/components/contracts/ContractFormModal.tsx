import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, Inbox, PenLine } from 'lucide-react';
import { orders as ordersApi, workspace } from '../../api/endpoints.ts';
import type { Contract, ContractDraft, ContractSourceKind } from '../../api/contracts.ts';
import type { PlatformOrder, VendorBooking } from '../../api/types.ts';
import { useResource } from '../../lib/useResource.ts';
import { sar, shortDate } from '../../lib/format.ts';
import { bookingStatusLabel } from '../../lib/labels.ts';
import { riyadhToday } from '../../lib/riyadh.ts';
import { defaultContractTerms } from '../../lib/contracts.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button, ErrorNote, Field, Input, Select, Skeleton, Textarea } from '../ui/primitives.tsx';
import { TermsEditor } from './TermsEditor.tsx';

type Form = {
  sourceKind: ContractSourceKind;
  sourceRef: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientNationalId: string;
  date: string;
  time: string;
  location: string;
  service: string;
  total: string;
  deposit: string;
  terms: string[];
  notes: string;
};

function emptyForm(): Form {
  return {
    sourceKind: 'manual',
    sourceRef: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    clientNationalId: '',
    date: riyadhToday(),
    time: '',
    location: '',
    service: '',
    total: '',
    deposit: '',
    terms: defaultContractTerms(''),
    notes: '',
  };
}

function formFromContract(contract: Contract): Form {
  return {
    sourceKind: contract.source.kind,
    sourceRef: contract.source.ref || '',
    clientName: contract.client.name,
    clientPhone: contract.client.phone,
    clientEmail: contract.client.email || '',
    clientNationalId: contract.client.nationalId || '',
    date: contract.event.date,
    time: contract.event.time || '',
    location: contract.event.location || '',
    service: contract.event.service,
    total: String(contract.amounts.total || ''),
    deposit: String(contract.amounts.deposit || ''),
    terms: contract.terms.length ? [...contract.terms] : defaultContractTerms(contract.event.service),
    notes: contract.notes || '',
  };
}

const SOURCES: Array<{ id: ContractSourceKind; label: string; icon: typeof PenLine }> = [
  { id: 'manual', label: 'يدوي', icon: PenLine },
  { id: 'order', label: 'من طلب المتجر', icon: Inbox },
  { id: 'booking', label: 'من حجز التقويم', icon: CalendarCheck },
];

const CLOSED_ORDER = new Set(['مرفوض من المورّد', 'ملغي', 'rejected', 'cancelled']);

function fromOrder(order: PlatformOrder, base: Form): Form {
  const lines = (order.items || []).filter((item) => Number(item.price) > 0);
  const total = lines.length
    ? lines.reduce((sum, item) => sum + (Number(item.quantity) || 1) * (Number(item.price) || 0), 0)
    : Number(order.totalAmount) || 0;
  const service = lines.length
    ? lines.map((item) => (Number(item.quantity) > 1 ? `${item.title} × ${item.quantity}` : item.title)).join('، ')
    : order.serviceName || 'طلب من متجر يوصل';
  return {
    ...base,
    sourceKind: 'order',
    sourceRef: order.id,
    clientName: order.name || '',
    clientPhone: order.phone || '',
    clientEmail: order.email || '',
    date: (order.eventDate || '').slice(0, 10) || base.date,
    time: /^\d{2}:\d{2}$/.test(order.eventTime || '') ? (order.eventTime as string) : '',
    location: order.city || '',
    service,
    total: String(Math.round(total * 100) / 100),
    // A paid store order is settled through Usil — nothing left on the client.
    deposit: order.paymentStatus === 'paid' ? String(Math.round(total * 100) / 100) : '',
  };
}

function fromBooking(booking: VendorBooking, base: Form): Form {
  return {
    ...base,
    sourceKind: 'booking',
    sourceRef: booking.bookingNumber || booking.id,
    clientName: booking.customerName || '',
    clientPhone: booking.customerPhone || '',
    date: booking.date || base.date,
    time: /^\d{2}:\d{2}$/.test(booking.startTime || '') ? booking.startTime : '',
    location: [booking.venueName, booking.city].filter(Boolean).join(' — '),
    service: booking.serviceTitle || '',
    total: String(Number(booking.totalAmount) || ''),
    deposit: String(Number(booking.depositAmount) || ''),
  };
}

export function ContractFormModal({
  open,
  onClose,
  editing,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing an existing draft/sent contract; null for a new one. */
  editing: Contract | null;
  saving: boolean;
  onSubmit: (draft: ContractDraft) => void;
}) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [termsTouched, setTermsTouched] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(editing ? formFromContract(editing) : emptyForm());
    setTermsTouched(Boolean(editing));
    setError('');
  }, [open, editing]);

  const total = Number(form.total) || 0;
  const deposit = Number(form.deposit) || 0;
  const remaining = Math.max(0, Math.round((total - deposit) * 100) / 100);

  function patch(next: Partial<Form>) {
    setError('');
    setForm((current) => {
      const merged = { ...current, ...next };
      // Until the vendor edits the terms, the scope line follows the service.
      if (!termsTouched && next.service !== undefined) merged.terms = defaultContractTerms(merged.service);
      return merged;
    });
  }

  function chooseSource(kind: ContractSourceKind) {
    setForm({ ...emptyForm(), sourceKind: kind });
    setTermsTouched(false);
    setError('');
  }

  function picked(next: Form) {
    setError('');
    setForm(termsTouched ? { ...next, terms: form.terms } : { ...next, terms: defaultContractTerms(next.service) });
  }

  function submit() {
    if (form.clientName.trim().length < 2) return setError('اكتب اسم العميل.');
    if (!form.clientPhone.trim()) return setError('اكتب جوال العميل — يصله رابط التوقيع عليه.');
    if (!form.date) return setError('اختر تاريخ المناسبة.');
    if (!form.service.trim()) return setError('اكتب الخدمة المتفق عليها.');
    if (!(total >= 0) || !(deposit >= 0)) return setError('المبالغ ما تكون سالبة.');
    if (deposit > total) return setError('العربون أكبر من إجمالي العقد.');
    const terms = form.terms.map((term) => term.trim()).filter(Boolean);
    if (!terms.length) return setError('أضف بنداً واحداً على الأقل.');
    onSubmit({
      source: form.sourceRef ? { kind: form.sourceKind, ref: form.sourceRef } : { kind: form.sourceKind },
      client: {
        name: form.clientName.trim(),
        phone: form.clientPhone.trim(),
        ...(form.clientEmail.trim() ? { email: form.clientEmail.trim() } : {}),
        ...(form.clientNationalId.trim() ? { nationalId: form.clientNationalId.trim() } : {}),
      },
      event: {
        date: form.date,
        ...(form.time ? { time: form.time } : {}),
        location: form.location.trim(),
        service: form.service.trim(),
      },
      amounts: { total, deposit },
      terms,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `تعديل العقد ${editing.number}` : 'عقد جديد'}
      description={
        editing?.status === 'sent'
          ? 'العقد مرسل للعميل. بعد الحفظ يبقى نفس الرابط، لكن صفحة التوقيع المفتوحة عند العميل تطلب منه تحديثها قبل التوقيع.'
          : 'يُحفظ مسودة. بعدها ترسل للعميل رابطاً يقرأ منه العقد ويوقّعه بنفسه.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" busy={saving} onClick={submit}>
            {editing ? 'حفظ التعديل' : 'حفظ المسودة'}
          </Button>
        </>
      }
    >
      {editing ? null : (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1" role="group" aria-label="مصدر العقد">
          {SOURCES.map((option) => {
            const Icon = option.icon;
            const active = form.sourceKind === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseSource(option.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:text-[13px] ${
                  active ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Icon size={15} aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {!editing && form.sourceKind === 'order' ? (
        <OrderPicker value={form.sourceRef} onPick={(order) => picked(fromOrder(order, emptyForm()))} />
      ) : null}
      {!editing && form.sourceKind === 'booking' ? (
        <BookingPicker value={form.sourceRef} onPick={(booking) => picked(fromBooking(booking, emptyForm()))} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم العميل *">
          <Input value={form.clientName} onChange={(e) => patch({ clientName: e.target.value })} placeholder="مثال: فهد الدوسري" />
        </Field>
        <Field label="جوال العميل *" hint="يرسل له رابط التوقيع على واتساب.">
          <Input
            dir="ltr"
            inputMode="tel"
            className="text-end"
            value={form.clientPhone}
            onChange={(e) => patch({ clientPhone: e.target.value })}
            placeholder="05xxxxxxxx"
          />
        </Field>
        <Field label="بريد العميل (اختياري)">
          <Input dir="ltr" type="email" className="text-end" value={form.clientEmail} onChange={(e) => patch({ clientEmail: e.target.value })} />
        </Field>
        <Field label="رقم الهوية (اختياري)">
          <Input
            dir="ltr"
            inputMode="numeric"
            className="text-end font-mono"
            value={form.clientNationalId}
            onChange={(e) => patch({ clientNationalId: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <Field label="الخدمة المتفق عليها *">
          <Input value={form.service} onChange={(e) => patch({ service: e.target.value })} placeholder="مثال: ركن قهوة عربية لـ 100 ضيف" />
        </Field>
        <Field label="الموقع">
          <Input value={form.location} onChange={(e) => patch({ location: e.target.value })} placeholder="القاعة أو الحي والمدينة" />
        </Field>
        <Field label="تاريخ المناسبة *">
          <Input type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        <Field label="الوقت (اختياري)">
          <Input type="time" value={form.time} onChange={(e) => patch({ time: e.target.value })} />
        </Field>
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <Field label="إجمالي العقد (ر.س)">
          <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.total} onChange={(e) => patch({ total: e.target.value })} />
        </Field>
        <Field label="العربون / المدفوع">
          <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.deposit} onChange={(e) => patch({ deposit: e.target.value })} />
        </Field>
        <div className="rounded-lg border border-line bg-sunken/60 p-3 text-[13px]">
          <p className="text-ink-secondary">المتبقي</p>
          <p className="mt-1 font-semibold tabular text-ink">{sar(remaining)}</p>
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <TermsEditor
          terms={form.terms}
          onChange={(terms) => {
            setTermsTouched(true);
            patch({ terms });
          }}
          onRestore={() => {
            setTermsTouched(false);
            patch({ terms: defaultContractTerms(form.service) });
          }}
        />
      </div>

      <Field label="ملاحظات (تظهر في العقد)">
        <Textarea rows={2} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
      </Field>

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-[13px] font-medium text-[var(--critical)]">
          <AlertTriangle size={14} aria-hidden />
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function OrderPicker({ value, onPick }: { value: string; onPick: (order: PlatformOrder) => void }) {
  const resource = useResource(ordersApi.list);
  const rows = useMemo(
    () =>
      [...(resource.data || [])]
        .filter((order) => !CLOSED_ORDER.has(String(order.status)))
        .sort((a, b) => String(b.createdAt || b.eventDate).localeCompare(String(a.createdAt || a.eventDate))),
    [resource.data],
  );
  if (resource.loading) return <Skeleton className="h-10 w-full" />;
  if (resource.error) return <ErrorNote message={resource.error} onRetry={() => void resource.reload()} />;
  if (!rows.length) return <p className="text-[13px] text-ink-secondary">ما فيه طلبات متجر مفتوحة.</p>;
  return (
    <Field label="اختر الطلب" hint="يعبّي العميل والمناسبة والمبلغ من الطلب — تقدر تعدّلها.">
      <Select
        value={value}
        onChange={(e) => {
          const order = rows.find((row) => row.id === e.target.value);
          if (order) onPick(order);
        }}
      >
        <option value="" disabled>
          — اختر —
        </option>
        {rows.map((order) => (
          <option key={order.id} value={order.id}>
            {`${order.id} · ${order.name || 'عميل'} · ${shortDate(order.eventDate)} · ${sar(order.totalAmount)} · ${bookingStatusLabel(order.status)}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function BookingPicker({ value, onPick }: { value: string; onPick: (booking: VendorBooking) => void }) {
  const resource = useResource(workspace.read);
  const rows = useMemo(
    () =>
      [...(resource.data?.bookings || [])]
        .filter((booking) => bookingStatusLabel(booking.status) !== 'ملغي')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [resource.data],
  );
  if (resource.loading) return <Skeleton className="h-10 w-full" />;
  if (resource.error) return <ErrorNote message={resource.error} onRetry={() => void resource.reload()} />;
  if (!rows.length) return <p className="text-[13px] text-ink-secondary">ما فيه حجوزات في التقويم.</p>;
  return (
    <Field label="اختر الحجز" hint="يعبّي العميل والموقع والمبلغ والعربون من الحجز — تقدر تعدّلها.">
      <Select
        value={rows.find((row) => (row.bookingNumber || row.id) === value)?.id || ''}
        onChange={(e) => {
          const booking = rows.find((row) => row.id === e.target.value);
          if (booking) onPick(booking);
        }}
      >
        <option value="" disabled>
          — اختر —
        </option>
        {rows.map((booking) => (
          <option key={booking.id} value={booking.id}>
            {`${booking.customerName || 'عميل'} · ${shortDate(booking.date)} · ${booking.serviceTitle || ''} · ${sar(booking.totalAmount)}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}
