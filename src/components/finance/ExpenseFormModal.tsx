import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '../ui/primitives.tsx';
import { Modal } from '../ui/Modal.tsx';
import { sar } from '../../lib/format.ts';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_HINT,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  VAT_RATE,
  expenseAmounts,
  riyadhToday,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
} from '../../lib/finance.ts';

/** What the form hands back; the screen adds the id and voucher number. */
export type ExpenseDraft = Omit<ExpenseRecord, 'id' | 'voucherNumber'>;

export type BookingOption = { id: string; label: string };

type FormState = {
  title: string;
  category: ExpenseCategory;
  paidTo: string;
  amount: string;
  taxRate: number;
  paymentMethod: PaymentMethod;
  date: string;
  invoiceReference: string;
  relatedBookingId: string;
  notes: string;
};

function initialState(editing: ExpenseRecord | null): FormState {
  if (editing) {
    return {
      title: editing.title,
      category: editing.category,
      paidTo: editing.paidTo,
      amount: String(editing.amount || ''),
      taxRate: editing.taxRate > 0 ? VAT_RATE : 0,
      paymentMethod: editing.paymentMethod,
      date: editing.date || riyadhToday(),
      invoiceReference: editing.invoiceReference || '',
      relatedBookingId: editing.relatedBookingId || '',
      notes: editing.notes || '',
    };
  }
  return {
    title: '',
    category: 'raw_materials',
    paidTo: '',
    amount: '',
    taxRate: VAT_RATE,
    paymentMethod: 'mada',
    date: riyadhToday(),
    invoiceReference: '',
    relatedBookingId: '',
    notes: '',
  };
}

/** سند صرف — ported from the add-expense modal of `VendorExpenseManager.tsx`. */
export function ExpenseFormModal({
  open,
  editing,
  bookingOptions,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: ExpenseRecord | null;
  bookingOptions: BookingOption[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ExpenseDraft) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(editing));
  const [error, setError] = useState('');
  // The Modal re-focuses itself whenever `onClose` changes identity, so it gets
  // one stable function — otherwise a parent re-render would steal the caret.
  const closeRef = useRef({ onClose, busy });
  closeRef.current = { onClose, busy };
  const close = useCallback(() => {
    if (!closeRef.current.busy) closeRef.current.onClose();
  }, []);

  useEffect(() => {
    if (open) {
      setForm(initialState(editing));
      setError('');
    }
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const amount = Number(form.amount);
  const preview = expenseAmounts(Number.isFinite(amount) ? amount : 0, form.taxRate);
  // Keep a link to a booking that is no longer listed (e.g. one deleted since).
  const options =
    form.relatedBookingId && !bookingOptions.some((option) => option.id === form.relatedBookingId)
      ? [...bookingOptions, { id: form.relatedBookingId, label: form.relatedBookingId }]
      : bookingOptions;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return setError('اكتب بيان المصروف.');
    if (!form.paidTo.trim()) return setError('اكتب المدفوع له (المورّد أو المحل).');
    if (!Number.isFinite(amount) || amount <= 0) return setError('المبلغ لازم يكون أكبر من صفر.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError('اختر تاريخ الصرف.');
    setError('');
    onSubmit({
      title: form.title.trim(),
      category: form.category,
      ...expenseAmounts(amount, form.taxRate),
      paymentMethod: form.paymentMethod,
      paidTo: form.paidTo.trim(),
      invoiceReference: form.invoiceReference.trim() || undefined,
      date: form.date,
      notes: form.notes.trim() || undefined,
      relatedBookingId: form.relatedBookingId || undefined,
      receiptImageUrl: editing?.receiptImageUrl,
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? `تعديل سند الصرف ${editing.voucherNumber}` : 'سند صرف جديد'}
      description="فواتير المشتريات، العهدة النقدية، أو أجور الطاقم والعمالة."
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <Field label="بيان المصروف *">
          <Input
            value={form.title}
            maxLength={160}
            placeholder="مثال: كرتون بن خولاني 10 كجم"
            onChange={(event) => set('title', event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التصنيف *" hint={EXPENSE_CATEGORY_HINT[form.category]}>
            <Select value={form.category} onChange={(event) => set('category', event.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {EXPENSE_CATEGORY_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المدفوع له *">
            <Input
              value={form.paidTo}
              maxLength={120}
              placeholder="مثال: محامص البن العربي"
              onChange={(event) => set('paidTo', event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المبلغ قبل الضريبة (ر.س) *">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              className="text-end tabular"
              value={form.amount}
              onChange={(event) => set('amount', event.target.value)}
            />
          </Field>
          <Field label="ضريبة القيمة المضافة">
            <Select value={String(form.taxRate)} onChange={(event) => set('taxRate', Number(event.target.value))}>
              <option value={String(VAT_RATE)}>15٪ — فاتورة ضريبية (ضريبة مدخلات)</option>
              <option value="0">0٪ — معفى أو بدون فاتورة ضريبية</option>
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-sunken px-3 py-2.5 text-[13px]">
          <span className="text-ink-secondary">
            الإجمالي شامل الضريبة
            {preview.taxAmount > 0 ? <span className="text-ink-muted"> (ضريبة {sar(preview.taxAmount)})</span> : null}
          </span>
          <span className="tabular font-semibold text-ink">{sar(preview.totalAmount)}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="طريقة الدفع">
            <Select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((key) => (
                <option key={key} value={key}>
                  {PAYMENT_METHOD_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="تاريخ الصرف *">
            <Input type="date" dir="ltr" className="text-end" value={form.date} onChange={(event) => set('date', event.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رقم فاتورة المورّد (اختياري)">
            <Input
              value={form.invoiceReference}
              maxLength={60}
              dir="ltr"
              className="text-end"
              placeholder="INV-12345"
              onChange={(event) => set('invoiceReference', event.target.value)}
            />
          </Field>
          <Field label="ربط بحجز أو طلب (اختياري)">
            <Select value={form.relatedBookingId} onChange={(event) => set('relatedBookingId', event.target.value)}>
              <option value="">مصروف عام للمنشأة</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="ملاحظات (اختياري)">
          <Input value={form.notes} maxLength={300} onChange={(event) => set('notes', event.target.value)} />
        </Field>

        {error ? <p className="text-[13px] text-[var(--critical)]">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={close} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            {editing ? 'حفظ التعديل' : 'حفظ سند الصرف'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
