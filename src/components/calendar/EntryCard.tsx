import { AlertTriangle, Clock, ExternalLink, MapPin, Phone, Trash2, Users } from 'lucide-react';
import { count, sar } from '../../lib/format.ts';
import { BOOKING_STATUSES, bookingStatusLabel } from '../../lib/labels.ts';
import { navigate } from '../../lib/router.ts';
import { sourceLabel, statusTone, type CalendarEntry } from '../../lib/calendarEntries.ts';
import { Badge, Button, Select } from '../ui/primitives.tsx';

/**
 * One entry in the day panel or the list view. Store orders are read-only here
 * (their status moves through the orders page, which owns accept/reject and
 * payment); external bookings change status or are deleted in place.
 */
export function EntryCard({
  entry,
  busy,
  onStatus,
  onDelete,
}: {
  entry: CalendarEntry;
  busy: boolean;
  onStatus: (bookingId: string, status: string) => void;
  onDelete: (entry: CalendarEntry) => void;
}) {
  const current = bookingStatusLabel(entry.status);
  const known = BOOKING_STATUSES.includes(current as never);

  return (
    <li
      className={`rounded-lg border px-3 py-2.5 ${
        entry.conflict
          ? 'border-[color-mix(in_srgb,var(--critical)_40%,transparent)] bg-[var(--critical-wash)]'
          : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {entry.kind === 'order' ? (
          <Badge tone="accent">طلب متجر · {entry.order.id}</Badge>
        ) : (
          <Badge>خارجي · {sourceLabel(entry.source)}</Badge>
        )}
        {entry.kind === 'order' ? (
          <>
            <Badge tone={statusTone(entry.status)}>{current}</Badge>
            <Badge tone={entry.paid ? 'good' : 'warning'}>{entry.paid ? 'مدفوع' : 'غير مدفوع'}</Badge>
          </>
        ) : null}
        {entry.conflict ? (
          <Badge tone="critical" icon={<AlertTriangle size={12} aria-hidden />}>
            تعارض على نفس المنتج
          </Badge>
        ) : null}
        {!entry.holdsDate && entry.kind === 'order' ? <Badge>انتهت مهلة الدفع</Badge> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-medium text-ink">{entry.title}</p>
          <p className="mt-0.5 break-words text-xs text-ink-secondary">{entry.customer}</p>
        </div>
        <span className="tabular whitespace-nowrap text-[13px] font-semibold text-ink">{sar(entry.amount)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        {entry.time ? (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden />
            <span className="tabular" dir="ltr">
              {entry.kind === 'manual' && entry.booking.endTime ? `${entry.time} – ${entry.booking.endTime}` : entry.time}
            </span>
          </span>
        ) : null}
        {entry.phone ? (
          <a href={`tel:${entry.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
            <Phone size={12} aria-hidden />
            <span className="tabular" dir="ltr">
              {entry.phone}
            </span>
          </a>
        ) : null}
        {entry.kind === 'manual' ? (
          <>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {[entry.booking.venueName, entry.booking.city].filter(Boolean).join(' · ')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden />
              {count(entry.booking.guestCount)} ضيف
            </span>
            {entry.booking.remainingAmount > 0 ? <span>متبقٍ {sar(entry.booking.remainingAmount)}</span> : null}
          </>
        ) : entry.order.city ? (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} aria-hidden />
            {entry.order.city}
          </span>
        ) : null}
      </div>

      {entry.kind === 'manual' && entry.booking.notes ? (
        <p className="mt-1.5 break-words text-xs text-ink-secondary">{entry.booking.notes}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {entry.kind === 'manual' ? (
          <>
            <div className="w-36">
              <Select
                value={known ? current : ''}
                aria-label={`حالة حجز ${entry.customer}`}
                className="h-8 text-[13px]"
                disabled={busy}
                onChange={(event) => onStatus(entry.booking.id, event.target.value)}
              >
                {known ? null : <option value="">{current}</option>}
                {BOOKING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`حذف حجز ${entry.customer}`}
              title="حذف"
              icon={<Trash2 size={15} />}
              disabled={busy}
              onClick={() => onDelete(entry)}
            />
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => navigate('orders')}>
            إدارة من الطلبات
          </Button>
        )}
      </div>
    </li>
  );
}
