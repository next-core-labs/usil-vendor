import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { count } from '../../lib/format.ts';
import { TableSkeleton } from './primitives.tsx';

export type Column<T> = {
  key: string;
  header: string;
  /** Cells are right-aligned by default (RTL); numbers opt into tabular figures. */
  numeric?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
};

/**
 * One table for every list in the dashboard. From `sm` up it scrolls
 * horizontally inside its own container so a wide row never makes the page
 * scroll sideways. Below `sm` each row stacks into a card — header beside value
 * — so price, status and the row's buttons are on screen without a hidden swipe.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
}) {
  if (loading) return <TableSkeleton />;
  if (!rows.length) return <>{empty}</>;

  return (
    <div className="sm:overflow-x-auto">
      <table className="block w-full border-collapse text-sm sm:table">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold tracking-wide text-ink-muted"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="block border-b border-line py-2 last:border-0 transition-colors hover:bg-sunken/60 sm:table-row sm:py-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`flex items-center gap-3 px-4 py-1.5 align-middle text-ink sm:table-cell sm:py-3 ${
                    column.header ? '' : 'justify-end'
                  } ${column.numeric ? 'tabular' : ''}`}
                >
                  {column.header ? (
                    <span className="w-20 shrink-0 text-xs font-semibold text-ink-muted sm:hidden">{column.header}</span>
                  ) : null}
                  <div className="min-w-0 flex-1 sm:flex-none">{column.render(row)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Filters live in one row above the table — never inside it. */
export function Toolbar({
  search,
  onSearch,
  placeholder = 'ابحث…',
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-muted"
          aria-hidden
        />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-lg border border-line-strong bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-[var(--axis)] focus:border-accent focus:outline-none"
        />
      </div>
      {children}
    </div>
  );
}

/** A segmented status filter. Counts sit in the pill so the operator can triage. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-sunken p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              active ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span className="tabular text-xs text-ink-muted">{count(option.count)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
