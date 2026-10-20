import { useMemo, useState } from 'react';
import { LogOut, Search, Store } from 'lucide-react';
import { supervision } from '../api/endpoints.ts';
import type { VendorHubRow } from '../api/types.ts';
import { useResource } from '../lib/useResource.ts';
import { count } from '../lib/format.ts';
import { useAccount } from '../state/AccountContext.tsx';
import { useSession } from '../state/SessionContext.tsx';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Skeleton } from '../components/ui/primitives.tsx';

const STATUS: Record<VendorHubRow['status'], { label: string; tone: 'good' | 'warning' | 'critical' }> = {
  approved: { label: 'معتمد', tone: 'good' },
  pending: { label: 'قيد المراجعة', tone: 'warning' },
  rejected: { label: 'مرفوض', tone: 'critical' },
};

/**
 * Admins and accounts managers do not have a store of their own: they pick the
 * vendor whose dashboard to open, and every screen then acts for that vendor.
 */
export function VendorPicker() {
  const { chooseVendor } = useAccount();
  const { user, signOut } = useSession();
  const hubs = useResource(() => supervision.hubs(), []);
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const order = { approved: 0, pending: 1, rejected: 2 } as const;
    return (hubs.data ?? [])
      .filter((row) => !needle || [row.projectName, row.name, row.email].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => order[a.status] - order[b.status] || (a.projectName || a.name).localeCompare(b.projectName || b.name, 'ar'));
  }, [hubs.data, search]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="اختر لوحة مورّد"
        subtitle={`مرحباً ${user?.name || ''} — أنت مشرف، فتفتح لوحة أي مورّد وتعمل نيابة عنه.`}
        action={
          <Button size="sm" variant="ghost" icon={<LogOut size={15} />} onClick={() => void signOut()}>
            تسجيل الخروج
          </Button>
        }
      />
      {hubs.error ? <ErrorNote message={hubs.error} onRetry={() => void hubs.reload()} /> : null}
      <Card padded={false}>
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-muted" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم المشروع أو المورّد أو البريد…"
              aria-label="ابحث عن مورّد"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        {hubs.loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <li key={row.vendorId}>
                <button
                  type="button"
                  onClick={() => chooseVendor({ vendorId: row.vendorId, name: row.projectName || row.name })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-sunken/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-secondary">
                    <Store size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{row.projectName || row.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {row.name} · {row.email}
                    </span>
                  </span>
                  <span className="hidden text-xs text-ink-muted sm:block">
                    {count(row.listingCount)} منتج · {count(row.bookingCount)} حجز
                  </span>
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Store size={22} />} title={hubs.data?.length ? 'لا نتائج مطابقة' : 'لا يوجد مورّدون بعد'} />
        )}
      </Card>
    </div>
  );
}
