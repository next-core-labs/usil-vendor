import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Loader2,
  PackagePlus,
  Pencil,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { inventory, type InventoryData } from '../api/inventory.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { count, dayKey, sar, shortDate } from '../lib/format.ts';
import {
  applyDraft,
  forecastAll,
  restockedItem,
  STATUS_LABEL,
  upcomingEvents,
  type Forecast,
  type InventoryDraft,
  type InventoryItem,
  type RestockInput,
  type StockStatus,
} from '../lib/inventory.ts';
import { useToast } from '../state/ToastContext.tsx';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, type Tone } from '../components/ui/primitives.tsx';
import { DataTable, FilterTabs, Toolbar, type Column } from '../components/ui/Table.tsx';
import { ConfirmDialog } from '../components/ui/Modal.tsx';
import { StatTile } from '../components/ui/StatTile.tsx';
import { ItemFormModal } from '../components/inventory/ItemFormModal.tsx';
import { AdjustStockModal } from '../components/inventory/AdjustStockModal.tsx';
import { RestockModal } from '../components/inventory/RestockModal.tsx';
import type { ScanPick } from '../components/inventory/BarcodeScanner.tsx';

// html5-qrcode is heavy and only needed once the camera is opened.
const BarcodeScanner = lazy(() =>
  import('../components/inventory/BarcodeScanner.tsx').then((m) => ({ default: m.BarcodeScanner })),
);

type Filter = 'all' | StockStatus;

const STATUS_TONE: Record<StockStatus, Tone> = { safe: 'good', low: 'warning', critical: 'critical' };
const STATUS_ICON: Record<StockStatus, ReactNode> = {
  safe: <CheckCircle2 size={12} />,
  low: <TrendingDown size={12} />,
  critical: <AlertTriangle size={12} />,
};
const STATUS_RANK: Record<StockStatus, number> = { critical: 0, low: 1, safe: 2 };

export function Inventory() {
  const toast = useToast();
  const res = useResource<InventoryData>(inventory.load);
  const items = useMemo(() => res.data?.items ?? [], [res.data]);
  const events = useMemo(() => upcomingEvents(res.data?.bookings ?? []), [res.data]);
  const forecasts = useMemo(() => forecastAll(items, events), [items, events]);
  const guests = events.reduce((sum, e) => sum + e.guests, 0);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ item: InventoryItem | null; barcode: string } | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [restocking, setRestocking] = useState<InventoryItem | null>(null);
  const [removing, setRemoving] = useState<InventoryItem | null>(null);
  const [scanning, setScanning] = useState(false);

  // Stable closers: the console Modal re-focuses its panel whenever `onClose` changes identity.
  const closeForm = useCallback(() => setForm(null), []);
  const closeAdjust = useCallback(() => setAdjusting(null), []);
  const closeRestock = useCallback(() => setRestocking(null), []);
  const closeRemove = useCallback(() => setRemoving(null), []);
  const closeScanner = useCallback(() => setScanning(false), []);

  /** Saves run one after another, so quick taps in the scanner never race each other. */
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  function save(change: (list: InventoryItem[]) => InventoryItem[]): Promise<InventoryItem[]> {
    const next = saveQueue.current.catch(() => undefined).then(() => inventory.mutate(change));
    saveQueue.current = next;
    return next.then((saved) => {
      res.set((current) => (current ? { ...current, items: saved } : current));
      return saved;
    });
  }

  async function run(action: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const byId = (list: InventoryItem[], id: string) => list.some((row) => row.id === id);
  const missing = () => new Error('الصنف انحذف من جهاز ثاني. حدّث الصفحة.');

  async function saveForm(draft: InventoryDraft) {
    const editing = form?.item ?? null;
    const ok = await run(
      () =>
        save((list) => {
          if (!editing) return [...list, applyDraft(draft)];
          if (!byId(list, editing.id)) throw missing();
          return list.map((row) => (row.id === editing.id ? applyDraft(draft, row) : row));
        }),
      editing ? 'حُفظت تعديلات الصنف.' : 'أُضيف الصنف للمخزون.',
    );
    if (ok) setForm(null);
  }

  function setStock(item: InventoryItem, nextStock: number) {
    return save((list) => {
      if (!byId(list, item.id)) throw missing();
      return list.map((row) => (row.id === item.id ? { ...row, currentStock: Math.max(0, nextStock) } : row));
    });
  }

  async function saveAdjust(item: InventoryItem, nextStock: number) {
    const ok = await run(() => setStock(item, nextStock), `رصيد «${item.nameAr}» صار ${count(nextStock)} ${item.unit}.`);
    if (ok) setAdjusting(null);
  }

  /** From the scanner's continuous mode: applies on top of the latest saved stock. */
  async function quickAdjust(item: InventoryItem, delta: number): Promise<boolean> {
    try {
      await save((list) => {
        if (!byId(list, item.id)) throw missing();
        return list.map((row) => (row.id === item.id ? { ...row, currentStock: Math.max(0, row.currentStock + delta) } : row));
      });
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    }
  }

  async function saveRestock(item: InventoryItem, input: RestockInput, recordExpense: boolean) {
    setBusy(true);
    try {
      await save((list) => {
        if (!byId(list, item.id)) throw missing();
        return list.map((row) => (row.id === item.id ? restockedItem(row, input) : row));
      });
    } catch (caught) {
      toast.failure(errorText(caught));
      setBusy(false);
      return;
    }
    // Stock is saved; the expense is a second write and may fail on its own.
    try {
      if (recordExpense) {
        const expense = await inventory.recordExpense(item, input);
        toast.success(`أُضيف ${count(input.quantity)} ${item.unit} وسُجّل مصروف ${sar(expense.totalAmount)}.`);
      } else {
        toast.success(`أُضيف ${count(input.quantity)} ${item.unit} للمخزون.`);
      }
      setRestocking(null);
    } catch (caught) {
      setRestocking(null);
      toast.failure(`حُدّث المخزون، لكن تعذّر تسجيل المصروف: ${errorText(caught)} سجّله من صفحة المصروفات.`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const target = removing;
    const ok = await run(() => save((list) => list.filter((row) => row.id !== target.id)), `حُذف «${target.nameAr}».`);
    if (ok) setRemoving(null);
  }

  function handlePick(pick: ScanPick) {
    setScanning(false);
    if (pick.kind === 'add') setForm({ item: null, barcode: pick.code });
    else if (pick.kind === 'restock') setRestocking(pick.item);
    else setAdjusting(pick.item);
  }

  const counts = useMemo(() => {
    const tally = { critical: 0, low: 0, safe: 0, cost: 0 };
    for (const f of forecasts) {
      tally[f.status] += 1;
      tally.cost += f.suggestedCost;
    }
    return tally;
  }, [forecasts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return forecasts
      .filter((f) => filter === 'all' || f.status === filter)
      .filter((f) => {
        if (!term) return true;
        const { item } = f;
        return [item.nameAr, item.supplierName, item.location, item.barcode].some((v) => v && v.toLowerCase().includes(term));
      })
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.item.nameAr.localeCompare(b.item.nameAr, 'ar'));
  }, [forecasts, filter, search]);

  const restockForecast = restocking ? forecasts.find((f) => f.item.id === restocking.id) : undefined;
  const today = dayKey(new Date());

  const columns: Column<Forecast>[] = [
    {
      key: 'item',
      header: 'الصنف',
      render: ({ item }) => (
        <span className="block break-words sm:max-w-[16rem]">
          <span className="block font-medium text-ink">{item.nameAr}</span>
          <span className="block text-xs text-ink-muted">
            {[item.location, item.supplierName].filter(Boolean).join(' · ') || '—'}
          </span>
          {item.barcode ? (
            <span className="tabular block text-xs text-ink-muted" dir="ltr">
              {item.barcode}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'الرصيد',
      numeric: true,
      render: ({ item }) => (
        <span className="whitespace-nowrap">
          <span className="block font-medium text-ink">
            {count(item.currentStock)} {item.unit}
          </span>
          <span className="block text-xs text-ink-muted">الأمان {count(item.minStockThreshold)}</span>
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'احتياج المناسبات',
      numeric: true,
      render: ({ item, usage, remaining }) => (
        <span className="whitespace-nowrap">
          <span className="block text-ink">
            {count(usage)} {item.unit}
          </span>
          <span className={`block text-xs ${remaining < 0 ? 'text-[var(--critical)]' : 'text-ink-muted'}`}>
            يبقى {count(remaining)}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: ({ status, orderBy }) => (
        <span className="block space-y-1">
          <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
            {STATUS_LABEL[status]}
          </Badge>
          {orderBy ? (
            <span className={`block whitespace-nowrap text-xs ${orderBy <= today ? 'font-medium text-[var(--critical)]' : 'text-ink-muted'}`}>
              {orderBy <= today ? 'اطلب الآن' : `اطلب قبل ${shortDate(orderBy)}`}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'reorder',
      header: 'إعادة الطلب',
      numeric: true,
      render: ({ item, suggestedQty, suggestedCost }) =>
        suggestedQty > 0 ? (
          <span className="whitespace-nowrap">
            <span className="block text-ink">
              {count(suggestedQty)} {item.unit}
            </span>
            {suggestedCost > 0 ? <span className="block text-xs text-ink-muted">≈ {sar(suggestedCost)}</span> : null}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (f) => (
        <span className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant={f.status === 'critical' ? 'primary' : 'secondary'}
            icon={<ShoppingCart size={14} />}
            onClick={() => setRestocking(f.item)}
          >
            توريد
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="تعديل الرصيد"
            aria-label={`تعديل رصيد ${f.item.nameAr}`}
            icon={<SlidersHorizontal size={15} />}
            onClick={() => setAdjusting(f.item)}
          />
          <Button
            size="sm"
            variant="ghost"
            title="تعديل الصنف"
            aria-label={`تعديل ${f.item.nameAr}`}
            icon={<Pencil size={15} />}
            onClick={() => setForm({ item: f.item, barcode: '' })}
          />
          <Button
            size="sm"
            variant="ghost"
            title="حذف"
            aria-label={`حذف ${f.item.nameAr}`}
            icon={<Trash2 size={15} />}
            onClick={() => setRemoving(f.item)}
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المخزون"
        subtitle="أصنافك واحتياج مناسباتك القادمة منها."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" busy={res.refreshing} icon={<RefreshCw size={15} />} onClick={() => void res.reload()}>
              تحديث
            </Button>
            <Button size="sm" icon={<ScanLine size={15} />} onClick={() => setScanning(true)} disabled={res.loading}>
              مسح باركود
            </Button>
            <Button size="sm" variant="primary" icon={<PackagePlus size={15} />} onClick={() => setForm({ item: null, barcode: '' })} disabled={res.loading}>
              صنف جديد
            </Button>
          </div>
        }
      />

      {res.error ? <ErrorNote message={res.error} onRetry={() => void res.reload()} /> : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="الأصناف" value={count(items.length)} icon={<Boxes size={16} />} />
        <StatTile label="عجز متوقع" value={count(counts.critical)} hint="ما يكفي المناسبات القادمة" icon={<AlertTriangle size={16} />} />
        <StatTile label="تحت حد الأمان" value={count(counts.low)} icon={<TrendingDown size={16} />} />
        <StatTile label="تكلفة إعادة الطلب" value={sar(counts.cost)} hint="تقديرية بتكلفة الوحدة" icon={<Wallet size={16} />} />
      </div>

      <Card padded={false}>
        <div className="border-b border-line px-5 py-3 text-[13px] leading-6 text-ink-secondary">
          {events.length ? (
            <>
              التوقّع مبني على <strong className="tabular font-semibold text-ink">{count(events.length)}</strong> مناسبة قادمة في
              تقويمك بإجمالي <strong className="tabular font-semibold text-ink">{count(guests)}</strong> ضيف × استهلاك كل صنف للضيف.
            </>
          ) : (
            <>ما عندك مناسبات قادمة في التقويم، فالحالة مبنية على الرصيد مقابل حد الأمان فقط.</>
          )}{' '}
          <span className="text-ink-muted">طلبات المتجر ما تحمل عدد ضيوف، فما تدخل في التوقّع.</span>
        </div>
        <Toolbar search={search} onSearch={setSearch} placeholder="ابحث بالاسم أو المورّد أو الموقع أو الباركود">
          <FilterTabs<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'الكل', count: forecasts.length },
              { value: 'critical', label: 'عجز', count: counts.critical },
              { value: 'low', label: 'منخفض', count: counts.low },
              { value: 'safe', label: 'آمن', count: counts.safe },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(f) => f.item.id}
          loading={res.loading}
          empty={
            items.length ? (
              <EmptyState title="ما فيه أصناف تطابق البحث" body="غيّر البحث أو الفلتر." />
            ) : (
              <EmptyState
                icon={<Boxes size={26} />}
                title="المخزون فاضي"
                body="أضف أصنافك مع استهلاك كل صنف للضيف، ونحسب لك احتياج مناسباتك القادمة ومتى تطلب."
                action={
                  <Button variant="primary" size="sm" icon={<PackagePlus size={15} />} onClick={() => setForm({ item: null, barcode: '' })}>
                    صنف جديد
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <ItemFormModal
        open={!!form}
        item={form?.item ?? null}
        barcode={form?.barcode ?? ''}
        items={items}
        busy={busy}
        onClose={closeForm}
        onSave={(draft) => void saveForm(draft)}
      />

      <AdjustStockModal
        item={adjusting}
        busy={busy}
        onClose={closeAdjust}
        onSave={(item, next) => void saveAdjust(item, next)}
        onRestock={(item) => {
          setAdjusting(null);
          setRestocking(item);
        }}
      />

      <RestockModal
        item={restocking}
        suggestedQty={restockForecast?.suggestedQty ?? 0}
        busy={busy}
        onClose={closeRestock}
        onSave={(item, input, recordExpense) => void saveRestock(item, input, recordExpense)}
      />

      <ConfirmDialog
        open={!!removing}
        danger
        busy={busy}
        title="حذف الصنف"
        body={`سيُحذف «${removing?.nameAr ?? ''}» من المخزون نهائياً. المصروفات المسجّلة له تبقى كما هي.`}
        confirmLabel="حذف الصنف"
        onConfirm={() => void confirmRemove()}
        onCancel={closeRemove}
      />

      {scanning ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" role="status" aria-label="تحميل القارئ">
              <Loader2 size={26} className="animate-spin text-white" />
            </div>
          }
        >
          <BarcodeScanner items={items} onClose={closeScanner} onPick={handlePick} onQuickAdjust={quickAdjust} />
        </Suspense>
      ) : null}
    </>
  );
}
