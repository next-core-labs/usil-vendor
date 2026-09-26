/**
 * Context for a stat tile — shape only, no axes and no labels. It never carries
 * a value the reader has to extract; the tile's number does that.
 */
export function Sparkline({ values, tone = 'var(--series-1)' }: { values: number[]; tone?: string }) {
  const width = 88;
  const height = 28;
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const last = values.length - 1;

  // Oldest on the right, matching the RTL time flow of the main chart.
  const points = values.map((value, index) => {
    const x = width - (index / last) * width;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={tone}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
