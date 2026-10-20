import { useMemo, useState, type ReactNode } from 'react';
import { FileSpreadsheet, Percent, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Select, Skeleton } from '../ui/primitives.tsx';
import { DataTable, type Column } from '../ui/Table.tsx';
import { StatTile } from '../ui/StatTile.tsx';
import { count, sar } from '../../lib/format.ts';
import {
  ALL_PERIODS,
  EXPENSE_CATEGORY_LABEL,
  USIL_COMMISSION_RATE,
  computeProfitAndLoss,
  marginText,
  periodLabel,
  periodOptions,
  riyadhMonth,
  type ExpenseRecord,
  type IncomeLine,
} from '../../lib/finance.ts';
import type { PlatformOrder, VendorBooking } from '../../api/types.ts';
import { exportProfitAndLossWorkbook } from '../../lib/financeExcel.ts';
import { useToast } from '../../state/ToastContext.tsx';
import { errorText } from '../../api/client.ts';

/**
 * A simple income statement for one Riyadh month (or all time) — a simplified
 * port of `VendorProfitAndLoss.tsx`. Every figure comes from real records:
 * paid store orders, the vendor's own calendar bookings, and the expenses.
 */
export function IncomeStatementPanel({
  orders,
  bookings,
  expenses,
  loading,
  incomeError,
  onRetryIncome,
  brandName,
}: {
  orders: PlatformOrder[];
  bookings: VendorBooking[];
  expenses: ExpenseRecord[];
  loading: boolean;
  incomeError: string | null;
  onRetryIncome: () => void;
  brandName: string;
}) {
  const toast = useToast();
  const [period, setPeriod] = useState(() => riyadhMonth());
  const [exporting, setExporting] = useState(false);

  const options = useMemo(() => periodOptions(orders, bookings, expenses), [orders, bookings, expenses]);
  const pl = useMemo(() => computeProfitAndLoss(period, orders, bookings, expenses), [period, orders, bookings, expenses]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportProfitAndLossWorkbook(pl, brandName);
      toast.success(`صدّرنا قائمة الدخل (${periodLabel(period)}) كملف Excel.`);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setExporting(false);
    }
  };

  const lineColumns: Column<IncomeLine>[] = [
    { key: 'date', header: 'التاريخ', numeric: true, render: (row) => row.date || '—' },
    {
      key: 'channel',
      header: 'المصدر',
      render: (row) =>
        row.channel === 'store' ? <Badge tone="accent">متجر يوصل</Badge> : <Badge>حجز خارجي</Badge>,
    },
    {
      key: 'customer',
      header: 'العميل',
      render: (row) => (
        <div className="min-w-0">
          <div className="text-ink">{row.customer}</div>
          <div className="truncate text-xs text-ink-muted">{row.service}</div>
        </div>
      ),
    },
    { key: 'gross', header: 'الإجمالي', numeric: true, render: (row) => sar(row.gross) },
    {
      key: 'commission',
      header: 'العمولة',
      numeric: true,
      render: (row) => (row.commission ? `− ${sar(row.commission)}` : <span className="text-ink-muted">0٪</span>),
    },
    { key: 'net', header: 'الصافي', numeric: true, render: (row) => <span className="font-semibold">{sar(row.net)}</span> },
  ];

  const profitTone = pl.netProfit >= 0 ? 'text-[var(--good)]' : 'text-[var(--critical)]';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block w-full sm:w-60">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">الفترة (بتوقيت الرياض)</span>
          <Select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {options.map((key) => (
              <option key={key} value={key}>
                {periodLabel(key)}
              </option>
            ))}
            <option value={ALL_PERIODS}>كل الفترات</option>
          </Select>
        </label>
        <Button icon={<FileSpreadsheet size={16} />} busy={exporting} disabled={loading} onClick={() => void exportExcel()}>
          تصدير Excel
        </Button>
      </div>

      {incomeError ? (
        <ErrorNote message={`ما قدرنا نحمّل الطلبات والحجوزات، فالإيرادات قد تكون ناقصة: ${incomeError}`} onRetry={onRetryIncome} />
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="إجمالي الإيرادات"
            value={sar(pl.grossIncome)}
            hint={`${count(pl.storeCount + pl.externalCount)} طلب وحجز`}
            icon={<TrendingUp size={16} />}
          />
          <StatTile
            label="صافي الإيرادات"
            value={sar(pl.netIncome)}
            hint={`بعد عمولة يوصل ${sar(pl.commission)}`}
            icon={<Wallet size={16} />}
          />
          <StatTile
            label="المصروفات"
            value={sar(pl.totalCosts)}
            hint={`${count(pl.expenses.length)} سند · بدون ضريبة المدخلات`}
            icon={<TrendingDown size={16} />}
          />
          <StatTile
            label="صافي الربح"
            value={sar(pl.netProfit)}
            hint={`هامش الربح ${marginText(pl.margin)}`}
            icon={<Percent size={16} />}
          />
        </div>
      )}

      <Card>
        <CardHeader title={`قائمة الدخل — ${periodLabel(period)}`} subtitle="الإيرادات حسب تاريخ المناسبة، والمصروفات حسب تاريخ الصرف." />
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8" />
            ))}
          </div>
        ) : (
          <div className="text-sm">
            <Section title="الإيرادات" />
            <Row
              label="طلبات متجر يوصل (مدفوعة)"
              hint={`${count(pl.storeCount)} طلب · الإجمالي قبل العمولة`}
              value={sar(pl.storeGross)}
            />
            <Row
              label={`عمولة يوصل ${Math.round(USIL_COMMISSION_RATE * 100)}٪`}
              hint="على طلبات المتجر فقط"
              value={pl.commission ? `− ${sar(pl.commission)}` : sar(0)}
              muted
            />
            <Row
              label="حجوزات خارجية ويدوية"
              hint={`${count(pl.externalCount)} حجز من التقويم · عمولة 0٪`}
              value={sar(pl.externalGross)}
            />
            <Row label="صافي الإيرادات" value={sar(pl.netIncome)} strong />

            <Section title="المصروفات (بدون ضريبة المدخلات)" />
            {pl.costsByCategory.length ? (
              pl.costsByCategory.map((row) => (
                <Row
                  key={row.category}
                  label={EXPENSE_CATEGORY_LABEL[row.category]}
                  hint={`${count(row.count)} سند`}
                  value={`− ${sar(row.amount)}`}
                  muted
                />
              ))
            ) : (
              <Row label="ما فيه مصروفات في هذه الفترة" value={sar(0)} muted />
            )}
            <Row label="إجمالي المصروفات" value={pl.totalCosts ? `− ${sar(pl.totalCosts)}` : sar(0)} strong />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-3">
              <div className="font-semibold text-ink">
                صافي الربح
                <span className="ms-2 text-xs font-normal text-ink-muted">هامش {marginText(pl.margin)} من إجمالي الإيرادات</span>
              </div>
              <div className={`tabular text-lg font-bold ${profitTone}`}>{sar(pl.netProfit)}</div>
            </div>
            {pl.inputVat > 0 ? (
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                ضريبة المدخلات المسجلة في هذه الفترة {sar(pl.inputVat)} — ما تُحسب كمصروف لأنها تُخصم من ضريبة المبيعات في الإقرار.
              </p>
            ) : null}
          </div>
        )}
      </Card>

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader title="بنود الإيرادات" subtitle="كل طلب وحجز دخل في هذه الفترة." />
        </div>
        <DataTable
          columns={lineColumns}
          rows={pl.lines}
          rowKey={(row) => row.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<TrendingUp size={26} />}
              title="ما فيه إيرادات في هذه الفترة"
              body="تظهر هنا طلبات المتجر المدفوعة والحجوزات اللي تضيفها في التقويم."
            />
          }
        />
      </Card>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <div className="mt-4 mb-1 border-b border-line pb-1.5 text-xs font-semibold tracking-wide text-ink-muted first:mt-0">{title}</div>;
}

function Row({
  label,
  hint,
  value,
  strong = false,
  muted = false,
}: {
  label: ReactNode;
  hint?: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? 'border-t border-line font-semibold' : ''}`}>
      <div className="min-w-0">
        <span className={strong ? 'text-ink' : 'text-ink-secondary'}>{label}</span>
        {hint ? <span className="ms-2 text-xs text-ink-muted">{hint}</span> : null}
      </div>
      <div className={`tabular shrink-0 ${muted ? 'text-ink-secondary' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
