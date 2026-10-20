import { AlertTriangle, Lock } from 'lucide-react';
import { count } from '../../lib/format.ts';
import { WEEKDAYS_SHORT, monthWeeks, type MonthKey } from '../../lib/riyadh.ts';
import type { CalendarData, CalendarEntry } from '../../lib/calendarEntries.ts';

/** A dot per entry kind: store orders take the accent, external bookings the second series. */
function EntryDot({ entry }: { entry: CalendarEntry }) {
  const color = entry.conflict
    ? 'bg-[var(--critical)]'
    : entry.kind === 'order'
      ? 'bg-accent'
      : 'bg-[var(--series-2)]';
  return <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${color} ${entry.holdsDate ? '' : 'opacity-40'}`} />;
}

/**
 * The month as a Sunday-first grid (Sunday sits on the right under RTL). Each
 * day shows its entries — titles from `sm` up, dots on a phone — plus the
 * closed-day and conflict marks. Clicking a day selects it for the side panel.
 */
export function MonthGrid({
  month,
  today,
  selected,
  calendar,
  onSelect,
}: {
  month: MonthKey;
  today: string;
  selected: string;
  calendar: CalendarData;
  onSelect: (day: string) => void;
}) {
  const weeks = monthWeeks(month);

  return (
    <div role="grid" aria-label="تقويم الشهر" className="select-none">
      <div role="row" className="grid grid-cols-7 gap-1 pb-1.5">
        {WEEKDAYS_SHORT.map((name) => (
          <div key={name} role="columnheader" className="text-center text-xs font-semibold text-ink-muted">
            {name}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, index) => (
          <div key={index} role="row" className="grid grid-cols-7 gap-1">
            {week.map((day, cell) => {
              if (!day) return <div key={`blank-${cell}`} role="gridcell" aria-hidden className="min-h-14 sm:min-h-24" />;
              const entries = calendar.byDate.get(day) || [];
              const live = entries.filter((entry) => entry.holdsDate);
              const blocked = calendar.blockedByDate.get(day);
              const conflict = calendar.conflictDates.has(day);
              const isToday = day === today;
              const isSelected = day === selected;
              const past = day < today;
              const label = [
                day,
                live.length ? `${count(live.length)} حجز` : 'لا حجوزات',
                blocked ? 'مغلق' : '',
                conflict ? 'فيه تعارض' : '',
              ]
                .filter(Boolean)
                .join('، ');

              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={label}
                  onClick={() => onSelect(day)}
                  className={`relative flex min-h-14 flex-col items-stretch gap-1 rounded-lg border p-1.5 text-start transition-colors sm:min-h-24 ${
                    isSelected
                      ? 'border-accent bg-[var(--accent-wash)]'
                      : conflict
                        ? 'border-[color-mix(in_srgb,var(--critical)_45%,transparent)] hover:bg-sunken'
                        : 'border-line hover:bg-sunken'
                  } ${blocked && !isSelected ? 'bg-sunken' : ''} ${past && !isSelected ? 'opacity-70' : ''}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span
                      className={`tabular inline-flex size-6 items-center justify-center rounded-full text-xs ${
                        isToday ? 'bg-accent font-semibold text-accent-ink' : 'text-ink'
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {conflict ? <AlertTriangle size={13} className="text-[var(--critical)]" aria-hidden /> : null}
                      {blocked ? <Lock size={12} className="text-ink-muted" aria-hidden /> : null}
                    </span>
                  </span>

                  {/* Phone: dots only. */}
                  {entries.length ? (
                    <span className="flex flex-wrap items-center gap-0.5 sm:hidden">
                      {entries.slice(0, 4).map((entry) => (
                        <EntryDot key={entry.key} entry={entry} />
                      ))}
                      {entries.length > 4 ? <span className="text-[10px] text-ink-muted">+</span> : null}
                    </span>
                  ) : null}

                  {/* Tablet and up: the first entries by name. */}
                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {blocked ? <span className="truncate text-[11px] text-ink-muted">مغلق · {blocked.reason}</span> : null}
                    {entries.slice(0, 2).map((entry) => (
                      <span
                        key={entry.key}
                        className={`flex min-w-0 items-center gap-1 text-[11px] ${
                          entry.holdsDate ? 'text-ink-secondary' : 'text-ink-muted line-through'
                        }`}
                      >
                        <EntryDot entry={entry} />
                        <span className="truncate">{entry.customer || entry.title}</span>
                      </span>
                    ))}
                    {entries.length > 2 ? (
                      <span className="text-[11px] text-ink-muted">+{count(entries.length - 2)} أخرى</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          طلب من المتجر
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-[var(--series-2)]" />
          حجز خارجي
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-[var(--critical)]" aria-hidden />
          تعارض على نفس المنتج
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock size={12} className="text-ink-muted" aria-hidden />
          يوم مغلق
        </span>
      </div>
    </div>
  );
}
