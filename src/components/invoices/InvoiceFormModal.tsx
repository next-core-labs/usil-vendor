import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, Inbox, PenLine, Plus, Trash2 } from 'lucide-react';
import { orders as ordersApi, workspace } from '../../api/endpoints.ts';
import { isValidSaudiVatNumber, type VendorBrandSettings } from '../../api/brand.ts';
import {
  CHANNEL_LABEL,
  INVOICE_VAT_RATE,
  PAYMENT_METHODS,
  invoiceTotals,
  riyadhToday,
  round2,
  statusForPayment,
  type InvoiceChannel,
  type VendorInvoice,
} from '../../api/invoices.ts';
import type { PlatformOrder, VendorBooking } from '../../api/types.ts';
import { useResource } from '../../lib/useResource.ts';
import { sar, shortDate } from '../../lib/format.ts';
import { bookingStatusLabel } from '../../lib/labels.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button, ErrorNote, Field, Input, Select, Skeleton, Textarea } from '../ui/primitives.tsx';

type Source = 'manual' | 'order' | 'booking';

type LineDraft = { description: string; quantity: number; unitPrice: number };

type Draft = {
  channelSource: InvoiceChannel;
  clientName: string;
  clientPhone: string;
  clientTaxId: string;
  eventDate: string;
  paymentMethod: string;
  depositPaid: number;
  items: LineDraft[];
  pricesIncludeVat: boolean;
  applyVat: boolean;
  terms: string;
  bookingId?: string;
};

/** What the screen saves; the number and id are assigned against the fresh list. */
export type InvoiceDraft = Omit<VendorInvoice, 'id' | 'invoiceNumber'>;

function emptyDraft(brand: VendorBrandSettings): Draft {
  return {
    channelSource: 'external_phone',
    clientName: '',
    clientPhone: '',
    clientTaxId: '',
    eventDate: riyadhToday(),
    paymentMethod: 'تحويل بنكي',
    depositPaid: 0,
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    pricesIncludeVat: true,
    // A vendor not registered for VAT must not charge it; the old dashboard always did.
    applyVat: isValidSaudiVatNumber(brand.vatNumber),
    terms: brand.invoiceFooterNotes || '',
  };
}

const SOURCES: Array<{ id: Source; label: string; icon: typeof PenLine }> = [
  { id: 'manual', label: 'يدوي', icon: PenLine },
  { id: 'order', label: 'من طلب المتجر', icon: Inbox },
  { id: 'booking', label: 'من حجز التقويم', icon: CalendarCheck },
];

/** Orders that will never be invoiced (Arabic statuses as stored, plus core's English keys). */
const CLOSED_ORDER = new Set(['مرفوض من المورّد', 'ملغي', 'rejected', 'cancelled']);

function fromOrder(order: PlatformOrder, base: Draft): Draft {
  const paid = order.paymentStatus === 'paid';
  const lines: LineDraft[] = (order.items || [])
    .filter((item) => Number(item.price) > 0)
    .map((item) => ({ description: item.title, quantity: Number(item.quantity) || 1, unitPrice: Number(item.price) || 0 }));
  const items = lines.length
    ? lines
    : [{ description: order.serviceName || 'طلب من متجر يوصل', quantity: 1, unitPrice: Number(order.totalAmount) || 0 }];
  const total = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  return {
    ...base,
    channelSource: 'mithyaf',
    clientName: order.name || '',
    clientPhone: order.phone || '',
    eventDate: (order.eventDate || '').slice(0, 10) || base.eventDate,
    // The client paid Usil (held until delivery), not the vendor directly.
    paymentMethod: 'حساب الضمان',
    depositPaid: paid ? round2(total) : 0,
    items,
    // Store prices are final and include VAT.
    pricesIncludeVat: true,
    bookingId: order.id,
  };
}

function fromBooking(booking: VendorBooking, base: Draft): Draft {
  return {
    ...base,
    channelSource: 'external_phone',
    clientName: booking.customerName || '',
    clientPhone: booking.customerPhone || '',
    eventDate: booking.date || base.eventDate,
    depositPaid: Number(booking.depositAmount) || 0,
    items: [
      {
        description: [booking.serviceTitle, booking.venueName].filter(Boolean).join(' — ') || 'حجز',
        quantity: 1,
        unitPrice: Number(booking.totalAmount) || 0,
      },
    ],
    bookingId: booking.bookingNumber || booking.id,
  };
}

export function InvoiceFormModal({
  open,
  onClose,
  brand,
  existing,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  brand: VendorBrandSettings;
  existing: VendorInvoice[];
  saving: boolean;
  onSubmit: (draft: InvoiceDraft) => void;
}) {
  const [source, setSource] = useState<Source>('manual');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(brand));
  const [pickedId, setPickedId] = useState('');
  const [error, setError] = useState('');

  // Every opening starts clean, from the current branding.
  useEffect(() => {
    if (!open) return;
    setSource('manual');
    setDraft(emptyDraft(brand));
    setPickedId('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const vatRegistered = isValidSaudiVatNumber(brand.vatNumber);
  const totals = useMemo(
    () => invoiceTotals(draft.items, draft.pricesIncludeVat, draft.applyVat ? INVOICE_VAT_RATE : 0),
    [draft.items, draft.pricesIncludeVat, draft.applyVat],
  );
  const remaining = round2(Math.max(0, totals.total - (Number(draft.depositPaid) || 0)));
  const duplicate = draft.bookingId ? existing.find((row) => row.bookingId === draft.bookingId) : undefined;

  function patch(next: Partial<Draft>) {
    setError('');
    setDraft((current) => ({ ...current, ...next }));
  }

  function setLine(index: number, next: Partial<LineDraft>) {
    patch({ items: draft.items.map((line, i) => (i === index ? { ...line, ...next } : line)) });
  }

  function chooseSource(next: Source) {
    setSource(next);
    setPickedId('');
    setDraft(emptyDraft(brand));
    setError('');
  }

  function submit() {
    if (!draft.clientName.trim()) return setError('اكتب اسم العميل.');
    const lines = draft.items.filter((line) => line.description.trim() || Number(line.unitPrice) > 0);
    if (!lines.length) return setError('أضف بنداً واحداً على الأقل.');
    if (lines.some((line) => !line.description.trim())) return setError('اكتب وصف كل بند.');
    if (lines.some((line) => !(Number(line.quantity) > 0) || Number(line.unitPrice) < 0)) {
      return setError('الكمية لازم تكون أكبر من صفر والسعر ما يكون سالباً.');
    }
    const final = invoiceTotals(lines, draft.pricesIncludeVat, draft.applyVat ? INVOICE_VAT_RATE : 0);
    if (!(final.total > 0)) return setError('إجمالي الفاتورة صفر — راجع الأسعار.');
    const paid = round2(Number(draft.depositPaid) || 0);
    if (paid < 0) return setError('المبلغ المدفوع ما يكون سالباً.');
    if (paid > final.total + 0.005) return setError('المبلغ المدفوع أكبر من إجمالي الفاتورة.');

    const isPlatform = draft.channelSource === 'mithyaf';
    const feeRate = isPlatform ? 0.15 : 0;
    const feeAmount = round2(final.total * feeRate);
    onSubmit({
      bookingId: draft.bookingId,
      clientName: draft.clientName.trim(),
      clientPhone: draft.clientPhone.trim(),
      clientTaxId: draft.clientTaxId.trim() || undefined,
      eventDate: draft.eventDate,
      issueDate: riyadhToday(),
      dueDate: draft.eventDate,
      items: final.items,
      subtotal: final.subtotal,
      taxRate: final.taxRate,
      taxAmount: final.taxAmount,
      discount: 0,
      total: final.total,
      depositPaid: paid,
      remainingBalance: round2(Math.max(0, final.total - paid)),
      status: statusForPayment(paid, final.total),
      terms: draft.terms.trim(),
      paymentMethod: draft.paymentMethod,
      isWhiteLabel: !isPlatform,
      channelSource: draft.channelSource,
      platformFeeRate: feeRate,
      platformFeeAmount: feeAmount,
      vendorNetAmount: round2(final.total - feeAmount),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="فاتورة جديدة"
      description="تصدر باسم منشأتك وشعارك وبياناتك البنكية من «الهوية والفواتير»."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" busy={saving} onClick={submit}>
            إصدار الفاتورة
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1" role="group" aria-label="مصدر الفاتورة">
        {SOURCES.map((option) => {
          const Icon = option.icon;
          const active = source === option.id;
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

      {source === 'order' ? (
        <OrderPicker
          value={pickedId}
          onPick={(order) => {
            setPickedId(order.id);
            setDraft(fromOrder(order, emptyDraft(brand)));
            setError('');
          }}
        />
      ) : null}
      {source === 'booking' ? (
        <BookingPicker
          value={pickedId}
          onPick={(booking) => {
            setPickedId(booking.id);
            setDraft(fromBooking(booking, emptyDraft(brand)));
            setError('');
          }}
        />
      ) : null}

      {duplicate ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] px-3 py-2 text-[13px] leading-6 text-ink">
          <AlertTriangle size={15} className="mt-1 shrink-0" aria-hidden />
          صدرت لهذا الطلب فاتورة من قبل ({duplicate.invoiceNumber}). تقدر تصدر فاتورة ثانية لو تحتاج.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم العميل *">
          <Input value={draft.clientName} onChange={(e) => patch({ clientName: e.target.value })} placeholder="مثال: فهد الدوسري" />
        </Field>
        <Field label="جوال العميل">
          <Input
            dir="ltr"
            inputMode="tel"
            className="text-end"
            value={draft.clientPhone}
            onChange={(e) => patch({ clientPhone: e.target.value })}
            placeholder="05xxxxxxxx"
          />
        </Field>
        <Field label="تاريخ المناسبة / التسليم">
          <Input type="date" value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} />
        </Field>
        <Field label="الرقم الضريبي للعميل (اختياري)">
          <Input
            dir="ltr"
            inputMode="numeric"
            className="text-end font-mono"
            value={draft.clientTaxId}
            onChange={(e) => patch({ clientTaxId: e.target.value })}
          />
        </Field>
        <Field label="مصدر الحجز">
          <Select
            value={draft.channelSource}
            onChange={(e) => patch({ channelSource: e.target.value as InvoiceChannel })}
          >
            {(Object.keys(CHANNEL_LABEL) as InvoiceChannel[]).map((key) => (
              <option key={key} value={key}>
                {CHANNEL_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="طريقة الدفع">
          <Select value={draft.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value })}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-secondary">البنود والأسعار</span>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            onClick={() => patch({ items: [...draft.items, { description: '', quantity: 1, unitPrice: 0 }] })}
          >
            بند
          </Button>
        </div>
        {draft.items.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_4.5rem_6.5rem_auto] sm:border-0 sm:p-0">
            <Input
              aria-label={`وصف البند ${index + 1}`}
              placeholder="وصف البند"
              value={line.description}
              onChange={(e) => setLine(index, { description: e.target.value })}
              className="col-span-2 sm:col-span-1"
            />
            <div className="col-span-2 grid grid-cols-[4.5rem_1fr_auto] gap-2 sm:contents">
              <Input
                aria-label="الكمية"
                type="number"
                min={1}
                inputMode="numeric"
                className="text-center"
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
              />
              <Input
                aria-label="السعر"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="text-center"
                placeholder="السعر"
                value={line.unitPrice || ''}
                onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })}
              />
              <Button
                variant="ghost"
                aria-label="حذف البند"
                icon={<Trash2 size={15} />}
                disabled={draft.items.length < 2}
                onClick={() => patch({ items: draft.items.filter((_, i) => i !== index) })}
              />
            </div>
          </div>
        ))}

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={draft.applyVat} onChange={(e) => patch({ applyVat: e.target.checked })} />
          تطبيق ضريبة القيمة المضافة 15٪
        </label>
        {draft.applyVat ? (
          <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
            <input
              type="checkbox"
              checked={draft.pricesIncludeVat}
              onChange={(e) => patch({ pricesIncludeVat: e.target.checked })}
            />
            الأسعار المكتوبة شاملة الضريبة (مثل أسعار متجر يوصل)
          </label>
        ) : null}
        {draft.applyVat && !vatRegistered ? (
          <p className="text-xs leading-5 text-ink-muted">
            ما عندك رقم ضريبي صالح في «الهوية والفواتير» — الفاتورة تطلع عادية بدون رمز هيئة الزكاة. لا تضف ضريبة إلا إذا كنت مسجّلاً.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="المدفوع مقدماً (عربون)" hint={`المتبقي: ${sar(remaining)}`}>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={draft.depositPaid || ''}
            placeholder="0"
            onChange={(e) => patch({ depositPaid: Number(e.target.value) })}
          />
        </Field>
        <div className="rounded-lg border border-line bg-sunken/60 p-3 text-[13px]">
          {totals.taxRate > 0 ? (
            <>
              <div className="flex justify-between text-ink-secondary">
                <span>قبل الضريبة</span>
                <span className="tabular">{sar2(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-secondary">
                <span>الضريبة 15٪</span>
                <span className="tabular">{sar2(totals.taxAmount)}</span>
              </div>
            </>
          ) : null}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink">
            <span>الإجمالي</span>
            <span className="tabular">{sar2(totals.total)}</span>
          </div>
        </div>
      </div>

      <Field label="الشروط (تطلع أسفل الفاتورة)">
        <Textarea rows={3} value={draft.terms} onChange={(e) => patch({ terms: e.target.value })} />
      </Field>

      {error ? (
        <p role="alert" className="text-[13px] font-medium text-[var(--critical)]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

/** Two decimals — VAT splits rarely land on whole riyals. */
export function sar2(value: number): string {
  return `${(Number(value) || 0).toLocaleString('ar-SA-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
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
    <Field label="اختر الطلب" hint="يعبّي العميل والبنود والمبلغ من الطلب — تقدر تعدّلها.">
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
            {`${order.name || 'عميل'} · ${shortDate(order.eventDate)} · ${sar(order.totalAmount)} · ${bookingStatusLabel(order.status)}${order.paymentStatus === 'paid' ? ' · مدفوع' : ''}`}
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
    <Field label="اختر الحجز" hint="يعبّي العميل والمبلغ والعربون من الحجز — تقدر تعدّلها.">
      <Select
        value={value}
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
