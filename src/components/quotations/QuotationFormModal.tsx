import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives.tsx';
import { Modal } from '../ui/Modal.tsx';
import { sar } from '../../lib/format.ts';
import { riyadhToday } from '../../lib/finance.ts';
import type { VendorListing } from '../../api/types.ts';
import {
  DEFAULT_DEPOSIT_PERCENT,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LABEL,
  defaultValidUntil,
  totalsFor,
  type Quotation,
  type QuotationItem,
  type QuotationStatus,
} from './model.ts';

/** The fields the form owns; id, number and dates are added by the screen. */
export type QuotationDraft = Omit<Quotation, 'id' | 'quoteNumber' | 'createdAt' | 'updatedAt' | 'sentAt'>;

type ItemRow = { key: number; title: string; description: string; quantity: string; unitPrice: string; listingId?: string };

type FormState = {
  clientName: string;
  clientPhone: string;
  companyName: string;
  eventTitle: string;
  eventDate: string;
  guestCount: string;
  city: string;
  discount: string;
  depositPercent: string;
  validUntil: string;
  status: QuotationStatus;
  notes: string;
};

let itemKey = 0;
const blankItem = (): ItemRow => ({ key: ++itemKey, title: '', description: '', quantity: '1', unitPrice: '' });

function initialForm(editing: Quotation | null): FormState {
  if (editing) {
    return {
      clientName: editing.clientName,
      clientPhone: editing.clientPhone,
      companyName: editing.companyName || '',
      eventTitle: editing.eventTitle,
      eventDate: editing.eventDate,
      guestCount: editing.guestCount ? String(editing.guestCount) : '',
      city: editing.city,
      discount: editing.discountAmount ? String(editing.discountAmount) : '',
      depositPercent: String(editing.depositPercent),
      validUntil: editing.validUntil,
      status: editing.status,
      notes: editing.customNote || '',
    };
  }
  return {
    clientName: '',
    clientPhone: '',
    companyName: '',
    eventTitle: '',
    eventDate: '',
    guestCount: '',
    city: '',
    discount: '',
    depositPercent: String(DEFAULT_DEPOSIT_PERCENT),
    validUntil: defaultValidUntil(),
    status: 'draft',
    notes: '',
  };
}

function initialItems(editing: Quotation | null): ItemRow[] {
  if (!editing?.items.length) return [blankItem()];
  return editing.items.map((item) => ({
    key: ++itemKey,
    title: item.title,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
    listingId: item.listingId,
  }));
}

const toNumber = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Create or edit a quotation — the fields of the old «عرض سعر» modal, with several items. */
export function QuotationFormModal({
  open,
  editing,
  listings,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: Quotation | null;
  listings: VendorListing[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: QuotationDraft) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editing));
  const [items, setItems] = useState<ItemRow[]>(() => initialItems(editing));
  const [error, setError] = useState('');
  const [pick, setPick] = useState('');

  const closeRef = useRef({ onClose, busy });
  closeRef.current = { onClose, busy };
  const close = useCallback(() => {
    if (!closeRef.current.busy) closeRef.current.onClose();
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(editing));
    setItems(initialItems(editing));
    setError('');
    setPick('');
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setItem = (key: number, patch: Partial<ItemRow>) =>
    setItems((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const parsedItems: QuotationItem[] = items
    .filter((row) => row.title.trim())
    .map((row) => ({
      title: row.title.trim(),
      description: row.description.trim(),
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unitPrice),
      total: 0,
      listingId: row.listingId,
    }));
  const totals = totalsFor(parsedItems, toNumber(form.discount), toNumber(form.depositPercent));

  const addFromListing = (id: string) => {
    const listing = listings.find((row) => row.id === id);
    setPick('');
    if (!listing) return;
    const row: ItemRow = {
      key: ++itemKey,
      title: listing.title,
      description: listing.shortDesc || '',
      quantity: '1',
      unitPrice: String(listing.price || ''),
      listingId: listing.id,
    };
    // Fill the first empty row rather than leaving a blank one above it.
    setItems((current) => {
      const blank = current.findIndex((item) => !item.title.trim() && !item.unitPrice.trim());
      if (blank < 0) return [...current, row];
      const copy = [...current];
      copy[blank] = row;
      return copy;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.clientName.trim()) return setError('اكتب اسم العميل.');
    if (!parsedItems.length) return setError('أضف بنداً واحداً على الأقل.');
    if (parsedItems.some((item) => item.quantity <= 0)) return setError('الكمية لازم تكون أكبر من صفر.');
    if (parsedItems.some((item) => item.unitPrice < 0)) return setError('سعر الوحدة ما يكون بالسالب.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.validUntil)) return setError('اختر تاريخ صلاحية العرض.');
    const deposit = toNumber(form.depositPercent);
    if (deposit < 0 || deposit > 100) return setError('نسبة العربون بين 0 و 100.');
    setError('');
    onSubmit({
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      companyName: form.companyName.trim() || undefined,
      eventTitle: form.eventTitle.trim(),
      eventDate: form.eventDate,
      guestCount: Math.max(0, Math.round(toNumber(form.guestCount))),
      city: form.city.trim(),
      ...totals,
      validUntil: form.validUntil,
      status: form.status,
      customNote: form.notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? `تعديل عرض السعر ${editing.quoteNumber}` : 'عرض سعر جديد'}
      description="الأسعار قبل الضريبة، ونضيف ضريبة القيمة المضافة 15٪ على الإجمالي بعد الخصم."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العميل *">
            <Input value={form.clientName} maxLength={120} onChange={(event) => set('clientName', event.target.value)} />
          </Field>
          <Field label="الشركة / الجهة (اختياري)">
            <Input value={form.companyName} maxLength={120} onChange={(event) => set('companyName', event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="جوال العميل" hint="للإرسال عبر واتساب">
            <Input
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="text-end"
              placeholder="05xxxxxxxx"
              value={form.clientPhone}
              maxLength={20}
              onChange={(event) => set('clientPhone', event.target.value)}
            />
          </Field>
          <Field label="المناسبة">
            <Input
              value={form.eventTitle}
              maxLength={120}
              placeholder="مثال: حفل تخرج الشركة"
              onChange={(event) => set('eventTitle', event.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="تاريخ المناسبة">
            <Input type="date" dir="ltr" className="text-end" value={form.eventDate} onChange={(event) => set('eventDate', event.target.value)} />
          </Field>
          <Field label="عدد الضيوف">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              dir="ltr"
              className="text-end tabular"
              value={form.guestCount}
              onChange={(event) => set('guestCount', event.target.value)}
            />
          </Field>
          <div className="col-span-2 sm:col-span-1">
            <Field label="المدينة">
              <Input value={form.city} maxLength={60} onChange={(event) => set('city', event.target.value)} />
            </Field>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-medium text-ink-secondary">البنود</legend>
          {listings.length ? (
            <Select aria-label="أضف من منتجاتك" value={pick} onChange={(event) => addFromListing(event.target.value)}>
              <option value="">+ أضف بنداً من منتجاتك…</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.title} — {sar(listing.price)} {listing.priceUnit}
                </option>
              ))}
            </Select>
          ) : null}
          {items.map((row, index) => {
            const lineTotal = toNumber(row.quantity) * toNumber(row.unitPrice);
            return (
              <div key={row.key} className="space-y-2 rounded-lg bg-sunken/60 p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`البند ${index + 1}`}
                    placeholder={`البند ${index + 1}`}
                    value={row.title}
                    maxLength={120}
                    onChange={(event) => setItem(row.key, { title: event.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="حذف البند"
                    icon={<Trash2 size={15} />}
                    disabled={items.length === 1}
                    onClick={() => setItems((current) => current.filter((item) => item.key !== row.key))}
                  />
                </div>
                <Input
                  aria-label="وصف البند"
                  placeholder="وصف مختصر (اختياري)"
                  value={row.description}
                  maxLength={200}
                  onChange={(event) => setItem(row.key, { description: event.target.value })}
                />
                <div className="grid grid-cols-3 items-end gap-2">
                  <Field label="الكمية">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      dir="ltr"
                      className="text-end tabular"
                      value={row.quantity}
                      onChange={(event) => setItem(row.key, { quantity: event.target.value })}
                    />
                  </Field>
                  <Field label="سعر الوحدة">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      className="text-end tabular"
                      value={row.unitPrice}
                      onChange={(event) => setItem(row.key, { unitPrice: event.target.value })}
                    />
                  </Field>
                  <div className="pb-2.5 text-end">
                    <span className="block text-xs text-ink-muted">المجموع</span>
                    <span className="tabular text-sm font-semibold text-ink">{sar(lineTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setItems((current) => [...current, blankItem()])}>
            بند جديد
          </Button>
        </fieldset>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="خصم (ر.س)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              className="text-end tabular"
              value={form.discount}
              onChange={(event) => set('discount', event.target.value)}
            />
          </Field>
          <Field label="العربون ٪">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              dir="ltr"
              className="text-end tabular"
              value={form.depositPercent}
              onChange={(event) => set('depositPercent', event.target.value)}
            />
          </Field>
          <div className="col-span-2 sm:col-span-1">
            <Field label="العرض ساري حتى *">
              <Input
                type="date"
                dir="ltr"
                className="text-end"
                min={editing ? undefined : riyadhToday()}
                value={form.validUntil}
                onChange={(event) => set('validUntil', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-sunken px-3 py-2.5 text-[13px]">
          <SumRow label="المجموع" value={sar(totals.subtotal)} />
          {totals.discountAmount ? <SumRow label="الخصم" value={`− ${sar(totals.discountAmount)}`} /> : null}
          <SumRow label="ضريبة القيمة المضافة 15٪" value={sar(totals.vatAmount)} />
          <SumRow label="الإجمالي" value={sar(totals.grandTotal)} strong />
          {totals.depositRequired ? <SumRow label={`العربون (${totals.depositPercent}٪)`} value={sar(totals.depositRequired)} /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="ملاحظات للعميل (اختياري)">
            <Textarea rows={2} maxLength={600} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(event) => set('status', event.target.value as QuotationStatus)}>
              {QUOTATION_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {QUOTATION_STATUS_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error ? <p className="text-[13px] text-[var(--critical)]">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={close} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            {editing ? 'حفظ التعديل' : 'حفظ عرض السعر'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SumRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
