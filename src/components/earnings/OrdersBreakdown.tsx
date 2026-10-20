import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { EarningsBucket, EarningsOrder } from '../../api/payouts.ts';
import { Badge, Card, CardHeader, EmptyState } from '../ui/primitives.tsx';
import { DataTable, FilterTabs, type Column } from '../ui/Table.tsx';
import { shortDate } from '../../lib/format.ts';
import { bookingStatusLabel } from '../../lib/labels.ts';
import { BUCKET_LABEL, BUCKET_TONE, money } from './labels.ts';

type Filter = 'all' | EarningsBucket;

/** Every paid order behind the balance: what it brought in, Usil's commission, and where it sits. */
export function OrdersBreakdown({ orders, commissionRate }: { orders: EarningsOrder[]; commissionRate: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(
    () =>
      (filter === 'all' ? orders : orders.filter((row) => row.bucket === filter))
        .slice()
        .sort((a, b) => String(b.eventDate).localeCompare(String(a.eventDate))),
    [orders, filter],
  );
  const counts = (bucket: EarningsBucket) => orders.filter((row) => row.bucket === bucket).length;
  const rate = Math.round(commissionRate * 100);

  const columns: Column<EarningsOrder>[] = [
    { key: 'id', header: 'الطلب', render: (row) => <span className="font-medium">{row.id}</span> },
    { key: 'date', header: 'المناسبة', render: (row) => shortDate(row.eventDate) },
    { key: 'status', header: 'حالة الطلب', render: (row) => bookingStatusLabel(row.status) },
    { key: 'gross', header: 'قيمة طلبك', numeric: true, render: (row) => money(row.gross) },
    { key: 'commission', header: `عمولة يوصل ${rate}٪`, numeric: true, render: (row) => `− ${money(row.commission)}` },
    { key: 'net', header: 'صافي لك', numeric: true, render: (row) => <span className="font-semibold">{money(row.net)}</span> },
    {
      key: 'bucket',
      header: 'الرصيد',
      render: (row) => (
        <Badge tone={BUCKET_TONE[row.bucket]}>
          {row.refundPending ? 'استرداد معلّق' : BUCKET_LABEL[row.bucket]}
        </Badge>
      ),
    },
  ];

  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <CardHeader
          title="الطلبات المدفوعة"
          subtitle={`يُحتسب من كل طلب نصيبك من المنتجات فقط، بعد خصم عمولة يوصل ${rate}٪. الطلب يبقى في الضمان حتى يصير «مكتمل».`}
        />
      </div>
      <div className="border-b border-line px-3 pb-3">
        <FilterTabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'الكل', count: orders.length },
            { value: 'pending', label: BUCKET_LABEL.pending, count: counts('pending') },
            { value: 'available', label: 'مكتملة', count: counts('available') },
            { value: 'excluded', label: 'ملغاة/مستردة', count: counts('excluded') },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={<Inbox size={22} />}
            title="لا توجد طلبات مدفوعة هنا"
            body="تظهر الطلبات هنا بعد ما يدفعها العميل عبر يوصل."
          />
        }
      />
    </Card>
  );
}
