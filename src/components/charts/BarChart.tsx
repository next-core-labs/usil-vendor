import { useState } from 'react';

export type BarRow = { key: string; label: string; value: number };

/**
 * Magnitude across named categories. Horizontal because the Arabic category
 * names are long, and one hue because the job is "compare size", not "tell
 * these apart". Every bar is direct-labelled, so the reading never depends on
 * the fill colour.
 */
export function BarChart({
  rows,
  formatValue,
  total,
}: {
  rows: BarRow[];
  formatValue: (value: number) => string;
  total?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const whole = total ?? rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const share = whole ? Math.round((row.value / whole) * 100) : 0;
        const active = hover === row.key;
        return (
          <li
            key={row.key}
            onMouseEnter={() => setHover(row.key)}
            onMouseLeave={() => setHover(null)}
            className="group"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-ink-secondary">{row.label}</span>
              <span className="shrink-0 text-[13px]">
                <span className="tabular font-semibold text-ink">{formatValue(row.value)}</span>
                {whole ? (
                  <>
                    <span className="mx-1.5 text-ink-muted" aria-hidden>
                      ·
                    </span>
                    <span className={`tabular ${active ? 'text-ink-secondary' : 'text-ink-muted'}`}>{share}٪</span>
                  </>
                ) : null}
              </span>
            </div>
            {/* Track and fill share a baseline on the start edge; the data-end is
                rounded, the baseline end is square. */}
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-sunken">
              <div
                className="h-full rounded-s-none rounded-e-[4px] transition-[width,opacity] duration-300"
                style={{
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%`,
                  background: 'var(--series-1)',
                  opacity: hover && !active ? 0.45 : 1,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Part-to-whole for exactly two states (paid / unpaid). Two categorical slots,
 * both direct-labelled with a colour swatch beside the text, so identity never
 * rests on hue alone. A 2px surface gap separates the segments.
 */
export function SplitBar({
  segments,
  formatValue,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  formatValue: (value: number) => string;
}) {
  const whole = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-sm bg-sunken">
        {whole > 0
          ? segments.map((segment) => (
              <div
                key={segment.key}
                style={{ width: `${(segment.value / whole) * 100}%`, background: segment.color }}
                className="h-full first:rounded-s-[4px] last:rounded-e-[4px]"
              />
            ))
          : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: segment.color }}
            />
            <span className="text-[13px] text-ink-secondary">{segment.label}</span>
            <span className="tabular text-[13px] font-semibold text-ink">{formatValue(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
