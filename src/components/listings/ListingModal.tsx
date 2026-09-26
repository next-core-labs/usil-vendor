import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal.tsx';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives.tsx';
import { ImagesPicker } from './ImagesPicker.tsx';
import { CityPicker } from './CityPicker.tsx';
import {
  BOOKING_MODES,
  BOOKING_MODE_HINT,
  BOOKING_MODE_LABEL,
  CATEGORIES,
  FULFILLMENT_LABEL,
  FULFILLMENT_LANES,
  LISTING_MIN_IMAGES,
  PRICE_UNITS,
} from '../../lib/labels.ts';
import type { BookingMode, FulfillmentLane, ListingDraft, PriceUnit, VendorListing } from '../../api/types.ts';

function draftFrom(listing: VendorListing | null): ListingDraft {
  return {
    title: listing?.title || '',
    category: listing?.category || '',
    shortDesc: listing?.shortDesc || '',
    price: listing?.price || 0,
    priceUnit: listing?.priceUnit || 'للمناسبة',
    cities: listing?.cities || [],
    images: listing?.images?.length ? listing.images : listing?.image ? [listing.image] : [],
    fulfillment: listing?.fulfillment || [],
    bookingMode: listing?.bookingMode || 'approval',
  };
}

/**
 * The server is the only validator — it answers with the exact Arabic sentence
 * the vendor should read. So this form blocks only what it can state itself
 * (photos and lanes, which have no single field to attach an error to) and lets
 * everything else come back from `POST /api/vendor/listings`.
 */
export function ListingModal({
  open,
  listing,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  listing: VendorListing | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ListingDraft) => void;
}) {
  const [draft, setDraft] = useState<ListingDraft>(() => draftFrom(listing));
  const [uploading, setUploading] = useState(false);

  // Reopening for a different row must not show the previous one's values.
  useEffect(() => {
    if (open) setDraft(draftFrom(listing));
  }, [open, listing]);

  function patch(next: Partial<ListingDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggleLane(lane: FulfillmentLane) {
    patch({
      fulfillment: draft.fulfillment.includes(lane)
        ? draft.fulfillment.filter((item) => item !== lane)
        : [...draft.fulfillment, lane],
    });
  }

  const missingImages = draft.images.length < LISTING_MIN_IMAGES;
  const missingLanes = draft.fulfillment.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={listing ? 'تعديل المنتج' : 'منتج جديد'}
      description="ما يظهر هنا هو نفسه ما يشوفه العميل في متجر يوصل."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={uploading || missingImages || missingLanes}
            onClick={() => onSubmit(draft)}
          >
            {listing ? 'حفظ التعديل' : 'نشر المنتج'}
          </Button>
        </>
      }
    >
      <Field label="اسم المنتج">
        <Input
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="مثال: ركن قهوة عربية مع صباب"
        />
      </Field>

      <Field label="القسم">
        <Select value={draft.category} onChange={(event) => patch({ category: event.target.value })}>
          <option value="">اختر قسماً…</option>
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="وصف مختصر" hint="سطر أو سطران يشرحان ما يستلمه العميل فعلاً.">
        <Textarea
          rows={3}
          value={draft.shortDesc}
          onChange={(event) => patch({ shortDesc: event.target.value })}
          placeholder="صباب واحد، فناجيل وتمر، ساعتان تشغيل."
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="السعر شامل الضريبة">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="tabular"
            value={draft.price || ''}
            onChange={(event) => patch({ price: Number(event.target.value) })}
            placeholder="0"
          />
        </Field>
        <Field label="وحدة السعر">
          <Select
            value={draft.priceUnit}
            onChange={(event) => patch({ priceUnit: event.target.value as PriceUnit })}
          >
            {PRICE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ImagesPicker
        value={draft.images}
        onChange={(images) => patch({ images })}
        onBusyChange={setUploading}
      />

      <CityPicker value={draft.cities} onChange={(cities) => patch({ cities })} />

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-secondary">مسار يوصل</legend>
        <div className="flex flex-wrap gap-2">
          {FULFILLMENT_LANES.map((lane) => {
            const active = draft.fulfillment.includes(lane);
            return (
              <label
                key={lane}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? 'border-accent bg-[var(--accent-wash)] font-medium text-accent'
                    : 'border-line-strong bg-surface text-ink-secondary hover:border-[var(--axis)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleLane(lane)}
                  className="sr-only"
                />
                {FULFILLMENT_LABEL[lane]}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">اختر مساراً واحداً على الأقل — هذي سرعة التوريد.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-secondary">طريقة تأكيد الحجز</legend>
        <div className="space-y-2">
          {BOOKING_MODES.map((mode) => {
            const active = draft.bookingMode === mode;
            return (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                  active ? 'border-accent bg-[var(--accent-wash)]' : 'border-line-strong bg-surface hover:border-[var(--axis)]'
                }`}
              >
                <input
                  type="radio"
                  name="bookingMode"
                  checked={active}
                  onChange={() => patch({ bookingMode: mode as BookingMode })}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  <span className={`block text-[13px] font-medium ${active ? 'text-accent' : 'text-ink'}`}>
                    {BOOKING_MODE_LABEL[mode]}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{BOOKING_MODE_HINT[mode]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Modal>
  );
}
