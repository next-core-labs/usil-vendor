import { useMemo } from 'react';
import { Hourglass, Landmark, RefreshCw, Wallet } from 'lucide-react';
import { payouts, type PayoutRequest, type VendorEarnings } from '../api/payouts.ts';
import { office } from '../api/office.ts';
import { Button, ErrorNote, PageHeader, Skeleton } from '../components/ui/primitives.tsx';
import { StatTile } from '../components/ui/StatTile.tsx';
import { OrdersBreakdown } from '../components/earnings/OrdersBreakdown.tsx';
import { PayoutForm, type BankPrefill } from '../components/earnings/PayoutForm.tsx';
import { PayoutHistory } from '../components/earnings/PayoutHistory.tsx';
import { money } from '../components/earnings/labels.ts';
import { useResource } from '../lib/useResource.ts';

type Loaded = { earnings: VendorEarnings; requests: PayoutRequest[] };

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * الأرباح والسحب — the store's balance from orders paid on usil.app, computed
 * by the server (15% commission off each order), and withdrawal requests to
 * إدارة يوصل. Usil transfers by hand from the bank; nothing here moves money.
 */
export function Earnings() {
  const resource = useResource<Loaded>(
    () => Promise.all([payouts.earnings(), payouts.list()]).then(([earnings, requests]) => ({ earnings, requests })),
    [],
  );
  // Bank details saved in «الهوية والفواتير», if any — a missing office is not an error here.
  const bank = useResource<BankPrefill | null>(
    () =>
      office
        .read()
        .then((data) => {
          const brand = data.brandSettings ?? {};
          return { iban: text(brand.iban), accountHolder: text(brand.accountHolder), bankName: text(brand.bankName) };
        })
        .catch(() => null),
    [],
  );

  const earnings = resource.data?.earnings;
  const requests = useMemo(() => resource.data?.requests ?? [], [resource.data]);
  const openRequest = requests.find((row) => row.status === 'requested') ?? null;

  const onSent = (row: PayoutRequest) => {
    resource.set((current) =>
      current
        ? {
            earnings: {
              ...current.earnings,
              available: Math.max(0, Math.round((current.earnings.available - row.amount) * 100) / 100),
              inReview: Math.round((current.earnings.inReview + row.amount) * 100) / 100,
            },
            requests: [row, ...current.requests],
          }
        : current,
    );
    void resource.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأرباح والسحب"
        subtitle="رصيدك من طلبات المتجر المدفوعة عبر يوصل، وطلبات تحويله لحسابك البنكي."
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={15} />}
            busy={resource.refreshing}
            onClick={() => void resource.reload()}
          >
            تحديث
          </Button>
        }
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      {resource.loading && !earnings ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-[104px]" />
          ))}
        </div>
      ) : earnings ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="في الضمان"
              value={money(earnings.pending)}
              hint="طلبات مدفوعة لم تكتمل بعد"
              icon={<Hourglass size={16} />}
            />
            <StatTile
              label="متاح للسحب"
              value={money(earnings.available)}
              hint={earnings.inReview > 0 ? `${money(earnings.inReview)} في طلبات قيد المراجعة` : 'صافي الطلبات المكتملة بعد العمولة'}
              icon={<Wallet size={16} />}
            />
            <StatTile
              label="تم تحويله"
              value={money(earnings.paidOut)}
              hint="حوّلته إدارة يوصل لحسابك"
              icon={<Landmark size={16} />}
            />
          </div>

          <p className="text-[13px] leading-6 text-ink-secondary">
            عمولة يوصل {Math.round(earnings.commissionRate * 100)}٪ من قيمة كل طلب. لا يتحرّك أي مبلغ تلقائياً: ترسل
            طلب السحب، تراجعه إدارة يوصل، ثم تحوّله يدوياً من البنك وتسجّل لك رقم مرجع التحويل.
          </p>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <PayoutForm
              available={earnings.available}
              openRequest={openRequest}
              prefill={bank.data ?? null}
              onSent={onSent}
            />
            <PayoutHistory rows={requests} />
          </div>

          <OrdersBreakdown orders={earnings.orders} commissionRate={earnings.commissionRate} />
        </>
      ) : null}
    </div>
  );
}
