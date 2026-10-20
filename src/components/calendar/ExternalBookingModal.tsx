import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { bookings as bookingsApi } from '../../api/endpoints.ts';
import { errorText } from '../../api/client.ts';
import type { VendorBooking, VendorListing } from '../../api/types.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives.tsx';
import { count, sar } from '../../lib/format.ts';
import { riyadhToday } from '../../lib/riyadh.ts';
import { CUSTOM_SERVICE_ID, EXTERNAL_SOURCES, type CalendarData } from '../../lib/calendarEntries.ts';

type Draft = {
  customerName: string;
  customerPhone: string;
  source: string;
  serviceId: string;
  customTitle: string;
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

function priceFor(listing: VendorListing | undefined, guests: number): number {
  if (!listing) return 0;
  return listing.priceUnit === 'للشخص' ? listing.price * Math.max(1, guests || 0) : listing.price;
}

function freshDraft(date: string, listings: VendorListing[]): Draft {
  const first = listings[0];
  return {
    customerName: '',
    customerPhone: '',
    source: 'external_phone',
    serviceId: first?.id || CUSTOM_SERVICE_ID,
    customTitle: '',
    date,
    startTime: '18:00',
    endTime: '23:00',
    city: first?.cities?.[0] || 'الرياض',
    venueName: '',
    guestCount: 50,
    totalAmount: priceFor(first, 50),
    depositAmount: 0,
    notes: '',
  };
}

/**
 * A booking taken outside the store — a call, WhatsApp, Instagram or the bio
 * link. Picking one of the vendor's listings sends its id as `serviceId`, so the
 * server's one-event-per-day lock applies to it like a store order; «خدمة
 * أخرى» records a free-text service that blocks nothing. The server owns every
 * refusal (taken or closed date, past date, bad phone…) and its Arabic sentence
 * is shown in the form, with what was typed kept.
 */
export function ExternalBookingModal({
  open,
  initialDate,
  listings,
  calendar,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialDate: string;
  listings: VendorListing[];
  calendar: CalendarData;
  onClose: () => void;
  onSaved: (booking: VendorBooking) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => freshDraft(initialDate, listings));
  const [totalTouched, setTotalTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(freshDraft(initialDate, listings));
    setTotalTouched(false);
    setError(null);
    // Only on opening: listings refreshing behind an open form must not wipe it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  const listing = listings.find((item) => item.id === draft.serviceId);
  const isCustom = !listing;

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  }

  function pickService(serviceId: string) {
    const picked = listings.find((item) => item.id === serviceId);
    setTotalTouched(false);
    patch({
      serviceId,
      totalAmount: picked ? priceFor(picked, draft.guestCount) : draft.totalAmount,
      depositAmount: picked ? Math.min(draft.depositAmount, priceFor(picked, draft.guestCount)) : draft.depositAmount,
      city: picked?.cities?.includes(draft.city) || !picked?.cities?.length ? draft.city : picked.cities[0],
    });
  }

  function setGuests(guestCount: number) {
    patch(
      listing?.priceUnit === 'للشخص' && !totalTouched
        ? { guestCount, totalAmount: priceFor(listing, guestCount) }
        : { guestCount },
    );
  }

  /* Live preview of what the server will say about this date. */
  const today = riyadhToday();
  const preview = useMemo(() => {
    const date = draft.date;
    if (!date) return null;
    if (date < today) return { tone: 'critical' as const, text: 'التاريخ مضى — ما تقدر تسجّل حجزاً بتاريخ سابق.' };
    if (calendar.blockedByDate.has(date)) {
      return { tone: 'critical' as const, text: 'هذا اليوم مغلق في تقويمك — افتحه أولاً عشان تسجّل عليه حجزاً.' };
    }
    const sameDay = (calendar.byDate.get(date) || []).filter((entry) => entry.holdsDate);
    if (listing) {
      const taken = sameDay.find((entry) => entry.listingIds.includes(listing.id));
      if (taken) {
        return {
          tone: 'critical' as const,
          text: `«${listing.title}» محجوز في هذا اليوم (${
            taken.kind === 'order' ? `طلب ${taken.order.id}` : `حجز ${taken.customer}`
          }) — المنتج يخدم مناسبة واحدة في اليوم.`,
        };
      }
    }
    if (sameDay.length) {
      return {
        tone: 'warning' as const,
        text: `عندك ${count(sameDay.length)} حجز آخر في هذا اليوم — تأكد إن الطاقم والمعدات تكفي.`,
      };
    }
    return { tone: 'good' as const, text: 'اليوم متاح — الحجز يقفل التاريخ لهذا المنتج في المتجر.' };
  }, [draft.date, today, calendar, listing]);

  const remaining = Math.max(0, draft.totalAmount - draft.depositAmount);
  const canSave =
    draft.customerName.trim() && draft.customerPhone.trim() && draft.date && (!isCustom || draft.customTitle.trim());

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await bookingsApi.create({
        serviceId: listing ? listing.id : CUSTOM_SERVICE_ID,
        serviceTitle: listing ? listing.title : draft.customTitle.trim(),
        customerName: draft.customerName.trim(),
        customerPhone: draft.customerPhone.trim(),
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        city: draft.city.trim(),
        venueName: draft.venueName.trim(),
        guestCount: draft.guestCount,
        totalAmount: draft.totalAmount,
        depositAmount: draft.depositAmount,
        // The server recomputes this (total − deposit).
        remainingAmount: remaining,
        source: draft.source,
        status: 'مؤكد',
        notes: draft.notes.trim(),
      });
      onSaved(saved);
    } catch (caught) {
      // Taken or closed date, past date, bad phone, deposit over total… — the server's own sentence.
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  const previewStyle =
    preview?.tone === 'critical'
      ? 'border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)]'
      : preview?.tone === 'warning'
        ? 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)]'
        : 'border-[color-mix(in_srgb,var(--good)_30%,transparent)] bg-[var(--good-wash)]';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حجز خارجي جديد"
      description="حجز جاك من مكالمة أو واتساب أو إنستقرام. اختيار منتجك يقفل اليوم له في المتجر ويمنع التعارض."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" busy={saving} disabled={!canSave} onClick={() => void save()}>
            تثبيت الحجز
          </Button>
        </>
      }
    >
      {preview ? (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-6 text-ink ${previewStyle}`}>
          {preview.tone === 'good' ? (
            <CheckCircle2 size={16} className="mt-1 shrink-0 text-[var(--good)]" aria-hidden />
          ) : preview.tone === 'warning' ? (
            <Info size={16} className="mt-1 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle size={16} className="mt-1 shrink-0 text-[var(--critical)]" aria-hidden />
          )}
          <span>{preview.text}</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم العميل">
          <Input
            value={draft.customerName}
            placeholder="مثال: تركي الشمري"
            onChange={(event) => patch({ customerName: event.target.value })}
          />
        </Field>
        <Field label="جوال العميل">
          <Input
            dir="ltr"
            inputMode="tel"
            className="tabular text-start"
            placeholder="05xxxxxxxx"
            value={draft.customerPhone}
            onChange={(event) => patch({ customerPhone: event.target.value })}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-secondary">مصدر الحجز</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EXTERNAL_SOURCES.map((source) => {
            const active = draft.source === source.id;
            return (
              <button
                key={source.id}
                type="button"
                aria-pressed={active}
                onClick={() => patch({ source: source.id })}
                className={`rounded-lg border px-2 py-2 text-[13px] transition-colors ${
                  active
                    ? 'border-accent bg-[var(--accent-wash)] font-medium text-accent'
                    : 'border-line-strong bg-surface text-ink-secondary hover:border-[var(--axis)]'
                }`}
              >
                {source.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="الخدمة"
        hint={
          listing
            ? `السعر من منتجك: ${sar(listing.price)} ${listing.priceUnit}`
            : 'خدمة خارج منتجاتك — تُسجّل في التقويم ولا تقفل أي منتج.'
        }
      >
        <Select value={draft.serviceId} onChange={(event) => pickService(event.target.value)}>
          {listings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {sar(item.price)} {item.priceUnit}
            </option>
          ))}
          <option value={CUSTOM_SERVICE_ID}>خدمة أخرى…</option>
        </Select>
      </Field>
      {isCustom ? (
        <Field label="اسم الخدمة">
          <Input
            value={draft.customTitle}
            placeholder="ركن قهوة، بوفيه، تنسيق…"
            onChange={(event) => patch({ customTitle: event.target.value })}
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Field label="التاريخ">
            <Input
              type="date"
              className="tabular"
              min={today}
              value={draft.date}
              onChange={(event) => patch({ date: event.target.value })}
            />
          </Field>
        </div>
        <Field label="من">
          <Input
            type="time"
            className="tabular"
            value={draft.startTime}
            onChange={(event) => patch({ startTime: event.target.value })}
          />
        </Field>
        <Field label="إلى">
          <Input
            type="time"
            className="tabular"
            value={draft.endTime}
            onChange={(event) => patch({ endTime: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="المدينة">
          <Input value={draft.city} onChange={(event) => patch({ city: event.target.value })} />
        </Field>
        <Field label="عدد الضيوف">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="tabular"
            value={draft.guestCount || ''}
            onChange={(event) => setGuests(Number(event.target.value))}
          />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="الموقع / القاعة">
            <Input
              value={draft.venueName}
              placeholder="مثال: قاعة الخزامى"
              onChange={(event) => patch({ venueName: event.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="المبلغ الإجمالي">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            className="tabular"
            value={draft.totalAmount || ''}
            onChange={(event) => {
              setTotalTouched(true);
              patch({ totalAmount: Number(event.target.value) });
            }}
          />
        </Field>
        <Field label="العربون المستلم">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            className="tabular"
            value={draft.depositAmount || ''}
            onChange={(event) => patch({ depositAmount: Number(event.target.value) })}
          />
        </Field>
        <div className="col-span-2 flex flex-col justify-center rounded-lg border border-line bg-sunken px-3 py-2 sm:col-span-1">
          <span className="text-xs text-ink-muted">المتبقي عند التنفيذ</span>
          <span className="tabular text-base font-semibold text-ink">{sar(remaining)}</span>
        </div>
      </div>
      {draft.depositAmount > draft.totalAmount ? (
        <p className="text-xs text-[var(--critical)]">العربون أكبر من المبلغ الإجمالي.</p>
      ) : null}

      <Field label="ملاحظات">
        <Textarea
          rows={2}
          value={draft.notes}
          placeholder="متطلبات خاصة، وقت وصول الطاقم…"
          onChange={(event) => patch({ notes: event.target.value })}
        />
      </Field>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] leading-6 text-ink"
        >
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
