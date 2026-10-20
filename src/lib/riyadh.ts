/**
 * Dates pinned to Saudi time (Asia/Riyadh, UTC+3, no DST) — never the device's
 * timezone. The server decides "today" the same way (`todayInRiyadh`), so a
 * vendor abroad still sees the day the server accepts or refuses.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Today in Riyadh as `YYYY-MM-DD`. */
export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM` month key. */
export type MonthKey = string;

export function monthOf(dayKey: string): MonthKey {
  return dayKey.slice(0, 7);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The month as whole weeks, Sunday first (the Saudi week). Days outside the
 * month are null so the grid keeps its shape without showing other months.
 * Pure date arithmetic in UTC, so the device timezone never shifts a day.
 */
export function monthWeeks(month: MonthKey): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${y}-${pad(m)}-${pad(day)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const AR = 'ar-SA-u-nu-latn';
const monthFormatter = new Intl.DateTimeFormat(AR, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDayFormatter = new Intl.DateTimeFormat(AR, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function utcDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

/** «أكتوبر 2026». */
export function monthLabel(month: MonthKey): string {
  return monthFormatter.format(utcDate(`${month}-01`));
}

/** «الثلاثاء، 20 أكتوبر 2026». */
export function longDayLabel(dayKey: string): string {
  const parsed = utcDate(dayKey);
  return Number.isNaN(parsed.getTime()) ? dayKey : longDayFormatter.format(parsed);
}

/** Sunday-first short weekday names for the grid header. */
export const WEEKDAYS_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
