/**
 * Arabic-locale formatting. Every number the operator reads goes through here.
 *
 * `-u-nu-latn` forces Latin digits: plain `ar-SA` yields Arabic-Indic ones,
 * which then sit beside the Latin digits that any template literal produces —
 * and a value like "١٠22٪" is unreadable. Latin digits are also the norm in
 * Saudi business dashboards and keep tabular columns aligned.
 */
const AR = 'ar-SA-u-nu-latn';

const sarFormatter = new Intl.NumberFormat(AR, {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(AR);

export function sar(value: number): string {
  return sarFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Compact form for axis ticks, where a full currency string would collide. */
export function sarCompact(value: number): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}ك`;
  return numberFormatter.format(n);
}

export function count(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}٪`;
}

/**
 * Platform bookings store `YYYY-MM-DD HH:mm` (the server trims the ISO string),
 * which Safari will not parse. Everything else stores a real ISO timestamp, so
 * both shapes are normalised here rather than at every call site.
 */
export function parseServerDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? text.replace(' ', 'T') : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const dateFormatter = new Intl.DateTimeFormat(AR, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(AR, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function shortDate(raw: string | undefined | null): string {
  const parsed = parseServerDate(raw);
  return parsed ? dateFormatter.format(parsed) : '—';
}

export function dateTime(raw: string | undefined | null): string {
  const parsed = parseServerDate(raw);
  return parsed ? dateTimeFormatter.format(parsed) : '—';
}

/** `YYYY-MM-DD` in local time — the key charts bucket days by. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dayLabelFormatter = new Intl.DateTimeFormat(AR, { day: 'numeric', month: 'short' });

export function dayLabel(key: string): string {
  const parsed = new Date(`${key}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? key : dayLabelFormatter.format(parsed);
}

export function uptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${count(days)} يوم و${count(hours)} ساعة`;
  if (hours) return `${count(hours)} ساعة و${count(minutes)} دقيقة`;
  return `${count(minutes)} دقيقة`;
}

export function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  return parts.slice(0, 2).map((part) => part[0]).join('');
}
