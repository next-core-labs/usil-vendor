import type { ReactNode } from 'react';
import { Sparkline } from '../charts/Sparkline.tsx';

/**
 * A single headline number. Deliberately not a one-bar chart — the value is the
 * message, and the sparkline is context the reader may ignore.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  trend?: number[];
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-secondary">{label}</p>
        {icon ? <span className="text-ink-muted">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
