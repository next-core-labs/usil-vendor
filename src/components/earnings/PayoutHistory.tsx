import { History } from 'lucide-react';
import type { PayoutRequest } from '../../api/payouts.ts';
import { Badge, Card, CardHeader, EmptyState } from '../ui/primitives.tsx';
import { DataTable, type Column } from '../ui/Table.tsx';
import { shortDate } from '../../lib/format.ts';
import { PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE, groupIban, money } from './labels.ts';

/** The vendor's withdrawal requests, newest first, with the admin's answer on each. */
export function PayoutHistory({ rows }: { rows: PayoutRequest[] }) {
  const columns: Column<PayoutRequest>[] = [
    {
      key: 'when',
      header: 'التاريخ',
      render: (row) => (
        <div>
          <p>{shortDate(row.createdAt)}</p>
          <p className="text-xs text-ink-muted">{row.id}</p>
        </div>
      ),
    },
    { key: 'amount', header: 'المبلغ', numeric: true, render: (row) => <span className="font-semibold">{money(row.amount)}</span> },
    {
      key: 'account',
      header: 'الحساب',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.bankName}</p>
          <p dir="ltr" className="tabular text-xs text-ink-muted text-end">
            {groupIban(row.iban)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => <Badge tone={PAYOUT_STATUS_TONE[row.status]}>{PAYOUT_STATUS_LABEL[row.status]}</Badge>,
    },
    {
      key: 'details',
      header: 'التفاصيل',
      render: (row) => (
        <div className="max-w-[280px] space-y-0.5 text-[13px] leading-6">
          {row.status === 'paid' && row.reference ? (
            <p>
              مرجع التحويل: <span dir="ltr" className="tabular font-medium">{row.reference}</span>
            </p>
          ) : null}
          {row.adminNote ? <p className="text-ink-secondary">الإدارة: {row.adminNote}</p> : null}
          {row.note ? <p className="text-ink-muted">ملاحظتك: {row.note}</p> : null}
          {!row.reference && !row.adminNote && !row.note ? <span className="text-ink-muted">—</span> : null}
        </div>
      ),
    },
  ];

  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <CardHeader title="طلبات السحب" subtitle="كل طلب تراجعه إدارة يوصل، وتصلك رسالة على بريدك عند كل تحديث." />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={<EmptyState icon={<History size={22} />} title="ما أرسلت أي طلب سحب بعد" />}
      />
    </Card>
  );
}
