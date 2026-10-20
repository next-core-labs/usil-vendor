import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, ErrorNote, PageHeader } from '../components/ui/primitives.tsx';
import { FilterTabs } from '../components/ui/Table.tsx';
import { ExpensesPanel } from '../components/finance/ExpensesPanel.tsx';
import { IncomeStatementPanel } from '../components/finance/IncomeStatementPanel.tsx';
import type { BookingOption, ExpenseDraft } from '../components/finance/ExpenseFormModal.tsx';
import { finance, type BrandInfo } from '../api/finance.ts';
import { orders as ordersApi, workspace } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { newExpenseId, nextVoucherNumber, type ExpenseRecord } from '../lib/finance.ts';
import { useToast } from '../state/ToastContext.tsx';

type Tab = 'expenses' | 'income';

const EMPTY_BRAND: BrandInfo = {
  brandName: '',
  phone: '',
  email: '',
  city: '',
  address: '',
  crNumber: '',
  vatNumber: '',
  logoUrl: '',
};

/**
 * المصروفات وقائمة الدخل — payment vouchers kept in the vendor's office, and a
 * simple monthly income statement built from store orders, the vendor's own
 * calendar bookings and those vouchers.
 */
export function Expenses() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('expenses');
  const [busy, setBusy] = useState(false);

  const officeRes = useResource(() => finance.load(), []);
  // Income sources load apart, so a failure there never hides the expenses.
  const incomeRes = useResource(async () => {
    const [orders, ws] = await Promise.all([ordersApi.list(), workspace.read()]);
    return { orders: orders ?? [], bookings: ws?.bookings ?? [], listings: ws?.listings ?? [] };
  }, []);

  const expenses = useMemo(() => officeRes.data?.expenses ?? [], [officeRes.data]);
  const brand = officeRes.data?.brand ?? EMPTY_BRAND;
  const orders = useMemo(() => incomeRes.data?.orders ?? [], [incomeRes.data]);
  const bookings = useMemo(() => incomeRes.data?.bookings ?? [], [incomeRes.data]);
  const brandName = brand.brandName || incomeRes.data?.listings[0]?.vendorName || '';

  const bookingOptions = useMemo<BookingOption[]>(() => {
    const fromOrders = orders.map((row) => ({
      id: row.id,
      date: row.eventDate || '',
      label: `طلب متجر ${row.id} — ${row.name || 'عميل'} (${row.eventDate || '—'})`,
    }));
    const fromBookings = bookings.map((row) => ({
      id: row.id,
      date: row.date || '',
      label: `حجز ${row.bookingNumber || row.id} — ${row.customerName || 'عميل'} (${row.date || '—'})`,
    }));
    return [...fromOrders, ...fromBookings]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ id, label }) => ({ id, label }));
  }, [orders, bookings]);

  const applyExpenses = (next: ExpenseRecord[]) =>
    officeRes.set((current) =>
      current ? { ...current, expenses: next } : { expenses: next, quotations: [], brand: EMPTY_BRAND },
    );

  const save = async (draft: ExpenseDraft, editing: ExpenseRecord | null): Promise<boolean> => {
    setBusy(true);
    try {
      if (editing) {
        applyExpenses(await finance.saveExpense({ ...draft, id: editing.id, voucherNumber: editing.voucherNumber }));
        toast.success(`حفظنا تعديل السند ${editing.voucherNumber}.`);
      } else {
        let voucher = '';
        applyExpenses(
          await finance.addExpense((current) => {
            voucher = nextVoucherNumber(current, draft.date);
            return { ...draft, id: newExpenseId(), voucherNumber: voucher };
          }),
        );
        toast.success(`سجّلنا سند الصرف ${voucher}.`);
      }
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ExpenseRecord): Promise<boolean> => {
    setBusy(true);
    try {
      applyExpenses(await finance.removeExpense(row.id));
      toast.success(`حذفنا السند ${row.voucherNumber}.`);
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reloadAll = () => {
    void officeRes.reload();
    void incomeRes.reload();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="المصروفات وقائمة الدخل"
        subtitle="سجّل سندات الصرف، واعرف صافي ربحك لكل شهر."
        action={
          <Button
            size="sm"
            icon={<RefreshCw size={15} />}
            busy={officeRes.refreshing || incomeRes.refreshing}
            onClick={reloadAll}
          >
            تحديث
          </Button>
        }
      />

      <FilterTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'expenses', label: 'المصروفات', count: expenses.length },
          { value: 'income', label: 'قائمة الدخل' },
        ]}
      />

      {officeRes.error ? <ErrorNote message={officeRes.error} onRetry={() => void officeRes.reload()} /> : null}

      {tab === 'expenses' ? (
        <ExpensesPanel
          expenses={expenses}
          loading={officeRes.loading}
          brand={brand}
          bookingOptions={bookingOptions}
          busy={busy}
          onSave={save}
          onDelete={remove}
        />
      ) : (
        <IncomeStatementPanel
          orders={orders}
          bookings={bookings}
          expenses={expenses}
          loading={officeRes.loading || incomeRes.loading}
          incomeError={incomeRes.error}
          onRetryIncome={() => void incomeRes.reload()}
          brandName={brandName}
        />
      )}
    </div>
  );
}
