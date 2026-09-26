import { useMemo, useState } from 'react';
import { useMeasure } from '../../lib/useMeasure.ts';

export type AreaPoint = { key: string; label: string; value: number };

const PAD_TOP = 18;
const PAD_BOTTOM = 26;
/** The y-axis sits on the start edge — the right, in RTL. */
const PAD_AXIS = 54;
const PAD_FAR = 14;
const DEFAULT_HEIGHT = 260;

/** Nice-ish round ceiling so the top gridline lands on a readable number. */
function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Single-series trend over time. One series is the whole point, so it takes the
 * sequential hue and needs no legend — the card title names it. Time flows
 * right → left to match the RTL reading order.
 */
export function AreaChart({
  points,
  formatValue,
  label,
  height = DEFAULT_HEIGHT,
}: {
  points: AreaPoint[];
  formatValue: (value: number) => string;
  /** The chart's accessible name — it carries what the series actually is. */
  label: string;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (width <= 0 || points.length === 0) return null;
    const plotWidth = Math.max(1, width - PAD_AXIS - PAD_FAR);
    const plotHeight = height - PAD_TOP - PAD_BOTTOM;
    const top = niceCeiling(Math.max(...points.map((point) => point.value)));
    const last = points.length - 1;

    // index 0 is the oldest, and sits on the right edge.
    const xFor = (index: number) =>
      width - PAD_AXIS - (last === 0 ? plotWidth / 2 : (index / last) * plotWidth);
    const yFor = (value: number) => PAD_TOP + plotHeight - (value / top) * plotHeight;

    const coords = points.map((point, index) => ({ x: xFor(index), y: yFor(point.value) }));
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const baseline = PAD_TOP + plotHeight;
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${baseline} L${coords[0].x.toFixed(1)},${baseline} Z`;

    const ticks = [0, 0.5, 1].map((fraction) => ({
      value: top * fraction,
      y: PAD_TOP + plotHeight - fraction * plotHeight,
    }));

    return { coords, line, area, ticks, baseline, plotWidth, xFor };
  }, [points, width, height]);

  const active = hover !== null && geometry ? { point: points[hover], coord: geometry.coords[hover] } : null;

  return (
    <div ref={ref} className="relative w-full">
      {geometry ? (
        <svg
          width={width}
          height={height}
          role="img"
          // `text-anchor` resolves against the inline direction: under the page's
          // RTL it mirrors, pushing every axis label the wrong way (the newest
          // date ran off the left edge). The plot is laid out in explicit pixel
          // coordinates, so it is anchored LTR — Arabic labels still shape RTL.
          style={{ direction: 'ltr' }}
          aria-label={label}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            let nearest = 0;
            let best = Infinity;
            geometry.coords.forEach((coord, index) => {
              const distance = Math.abs(coord.x - x);
              if (distance < best) {
                best = distance;
                nearest = index;
              }
            });
            setHover(nearest);
          }}
        >
          <defs>
            <linearGradient id="usil-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive grid, drawn under the data. */}
          {geometry.ticks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={PAD_FAR}
                x2={width - PAD_AXIS}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={width - PAD_AXIS + 8}
                y={tick.y + 4}
                fontSize={11}
                textAnchor="start"
                fill="var(--ink-muted)"
                className="tabular"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}

          <path d={geometry.area} fill="url(#usil-area)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active ? (
            <g>
              <line
                x1={active.coord.x}
                x2={active.coord.x}
                y1={PAD_TOP - 6}
                y2={geometry.baseline}
                stroke="var(--axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {/* A surface ring keeps the marker legible over the fill. */}
              <circle cx={active.coord.x} cy={active.coord.y} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          ) : null}

          <line
            x1={PAD_FAR}
            x2={width - PAD_AXIS}
            y1={geometry.baseline}
            y2={geometry.baseline}
            stroke="var(--axis)"
            strokeWidth={1}
          />

          {/* Only the two endpoints are labelled — a tick per day would collide. */}
          <text x={width - PAD_AXIS} y={height - 8} fontSize={11} textAnchor="end" fill="var(--ink-muted)">
            {points[0]?.label}
          </text>
          <text x={PAD_FAR} y={height - 8} fontSize={11} textAnchor="start" fill="var(--ink-muted)">
            {points[points.length - 1]?.label}
          </text>
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {active && geometry ? (
        <div
          className="pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 shadow-[var(--shadow-pop)]"
          style={{
            insetInlineStart: 'auto',
            left: Math.min(Math.max(active.coord.x - 60, 4), Math.max(width - 124, 4)),
            top: active.coord.y - 12,
          }}
        >
          <p className="text-[11px] text-ink-muted">{active.point.label}</p>
          <p className="tabular text-sm font-semibold text-ink">{formatValue(active.point.value)}</p>
        </div>
      ) : null}
    </div>
  );
}
