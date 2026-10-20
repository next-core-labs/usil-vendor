import { useCallback, useMemo, useState } from 'react';
import { Pencil, Plus, Printer, Receipt, Trash2, Wallet } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Select } from '../ui/primitives.tsx';
import { DataTable, Toolbar, type Column } from '../ui/Table.tsx';
import { ConfirmDialog } from '../ui/Modal.tsx';
import { StatTile } from '../ui/StatTile.tsx';
import { count, sar } from '../../lib/format.ts';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  riyadhMonth,
  type ExpenseCategory,
  type ExpenseRecord,
} from '../../lib/finance.ts';
import type { BrandInfo } from '../../api/finance.ts';
import { ExpenseFormModal, type BookingOption, type ExpenseDraft } from './ExpenseFormModal.tsx';
import { PrintSheet } from './PrintSheet.tsx';

type CategoryFilter = 'all' | ExpenseCategory;

/**
 * Payment vouchers — a port of `VendorExpenseManager.tsx`: KPIs, category
 * filter, search, add / edit / delete and a printable voucher.
 */
export function ExpensesPanel({
  expenses,
  loading,
  brand,
  bookingOptions,
  busy,
  onSave,
  onDelete,
}: {
  expenses: ExpenseRecord[];
  loading: boolean;
  brand: BrandInfo;
  bookingOptions: BookingOption[];
  busy: boolean;
  /** Resolves true when saved, so the form closes only then. */
  onSave: (draft: ExpenseDraft, editing: ExpenseRecord | null) => Promise<boolean>;
  onDelete: (row: ExpenseRecord) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [removing, setRemoving] = useState<ExpenseRecord | null>(null);
  const [printing, setPrinting] = useState<ExpenseRecord | null>(null);

  const bookingLabel = useMemo(() => new Map(bookingOptions.map((option) => [option.id, option.label])), [bookingOptions]);

  const month = riyadhMonth();
  const totals = useMemo(() => {
    const thisMonth = expenses.filter((row) => row.date.startsWith(month));
    return {
      total: expenses.reduce((sum, row) => sum + row.totalAmount, 0),
      vat: expenses.reduce((sum, row) => sum + row.taxAmount, 0),
      monthTotal: thisMonth.reduce((sum, row) => sum + row.totalAmount, 0),
      monthCount: thisMonth.length,
    };
  }, [expenses, month]);

  const usedCategories = useMemo(() => {
    const counts = new Map<ExpenseCategory, number>();
    expenses.forEach((row) => counts.set(row.category, (counts.get(row.category) || 0) + 1));
    return counts;
  }, [expenses]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return expenses
      .filter((row) => category === 'all' || row.category === category)
      .filter((row) => {
        if (!needle) return true;
        return [row.title, row.paidTo, row.voucherNumber, row.invoiceReference || '', row.notes || '']
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.voucherNumber.localeCompare(a.voucherNumber));
  }, [expenses, category, search]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const submit = async (draft: ExpenseDraft) => {
    if (await onSave(draft, editing)) {
      setFormOpen(false);
      setEditing(null);
    }
  };

  const remove = async () => {
    if (removing && (await onDelete(removing))) setRemoving(null);
  };

  const stopPrinting = useCallback(() => setPrinting(null), []);

  const columns: Column<ExpenseRecord>[] = [
    {
      key: 'voucher',
      header: 'السند',
      render: (row) => (
        <div>
          <div className="tabular text-[13px] font-semibold text-ink" dir="ltr">
            {row.voucherNumber}
          </div>
          <div className="tabular text-xs text-ink-muted">{row.date}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'البيان',
      render: (row) => (
        <div className="min-w-0 max-w-xs">
          <div className="font-medium text-ink">{row.title}</div>
          {row.notes ? <div className="truncate text-xs text-ink-muted">{row.notes}</div> : null}
          {row.relatedBookingId ? (
            <div className="mt-0.5 text-xs text-accent">مرتبط بـ {bookingLabel.get(row.relatedBookingId) || row.relatedBookingId}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'التصنيف',
      render: (row) => <Badge>{EXPENSE_CATEGORY_LABEL[row.category]}</Badge>,
    },
    {
      key: 'paidTo',
      header: 'المدفوع له',
      render: (row) => (
        <div>
          <div className="text-ink">{row.paidTo || '—'}</div>
          {row.invoiceReference ? (
            <div className="text-xs text-ink-muted">
              فاتورة: <span dir="ltr">{row.invoiceReference}</span>
            </div>
          ) : null}
        </div>
      ),
    },
    { key: 'amount', header: 'قبل الضريبة', numeric: true, render: (row) => sar(row.amount) },
    {
      key: 'vat',
      header: 'الضريبة',
      numeric: true,
      render: (row) => (row.taxAmount > 0 ? sar(row.taxAmount) : <span className="text-ink-muted">0٪</span>),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      numeric: true,
      render: (row) => <span className="font-semibold">{sar(row.totalAmount)}</span>,
    },
    {
      key: 'method',
      header: 'الدفع',
      render: (row) => <span className="text-[13px] text-ink-secondary">{PAYMENT_METHOD_LABEL[row.paymentMethod]}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" aria-label="طباعة السند" title="طباعة السند" icon={<Printer size={15} />} onClick={() => setPrinting(row)} />
          <Button
            size="sm"
            variant="ghost"
            aria-label="تعديل"
            title="تعديل"
            icon={<Pencil size={15} />}
            onClick={() => {
              setEditing(row);
              setFormOpen(true);
            }}
          />
          <Button size="sm" variant="ghost" aria-label="حذف" title="حذف" icon={<Trash2 size={15} />} onClick={() => setRemoving(row)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="إجمالي المصروفات"
          value={sar(totals.total)}
          hint={`${count(expenses.length)} سند صرف · شامل الضريبة`}
          icon={<Wallet size={16} />}
        />
        <StatTile
          label="ضريبة المدخلات القابلة للخصم"
          value={sar(totals.vat)}
          hint="من الفواتير الضريبية 15٪ — تُخصم من ضريبة المبيعات في الإقرار"
          icon={<Receipt size={16} />}
        />
        <StatTile
          label="مصروفات هذا الشهر"
          value={sar(totals.monthTotal)}
          hint={`${count(totals.monthCount)} سند · بتوقيت الرياض`}
        />
      </div>

      <Card padded={false}>
        <Toolbar search={search} onSearch={setSearch} placeholder="ابحث بالبيان أو المورّد أو رقم السند…">
          <div className="w-full sm:w-56">
            <Select aria-label="التصنيف" value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}>
              <option value="all">كل التصنيفات ({count(expenses.length)})</option>
              {EXPENSE_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {EXPENSE_CATEGORY_LABEL[key]} ({count(usedCategories.get(key) || 0)})
                </option>
              ))}
            </Select>
          </div>
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
            سند صرف جديد
          </Button>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<Receipt size={26} />}
              title={expenses.length ? 'ما فيه سندات تطابق البحث' : 'ما سجلت مصروفات بعد'}
              body={
                expenses.length
                  ? undefined
                  : 'سجّل مشترياتك وأجور الطاقم والوقود والإيجار هنا، وتنعكس مباشرة على قائمة الدخل.'
              }
              action={
                expenses.length ? undefined : (
                  <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                    سند صرف جديد
                  </Button>
                )
              }
            />
          }
        />
      </Card>

      <ExpenseFormModal
        open={formOpen}
        editing={editing}
        bookingOptions={bookingOptions}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(draft) => void submit(draft)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="حذف سند الصرف"
        body={removing ? `بتحذف السند ${removing.voucherNumber} (${removing.title}) بمبلغ ${sar(removing.totalAmount)}. ما تقدر ترجع عن الحذف.` : ''}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => (busy ? undefined : setRemoving(null))}
      />

      {printing ? (
        <PrintSheet onDone={stopPrinting}>
          <VoucherSheet row={printing} brand={brand} linkedTo={printing.relatedBookingId ? bookingLabel.get(printing.relatedBookingId) : undefined} />
        </PrintSheet>
      ) : null}
    </div>
  );
}

function VoucherSheet({ row, brand, linkedTo }: { row: ExpenseRecord; brand: BrandInfo; linkedTo?: string }) {
  const lines: Array<[string, string]> = [
    ['التاريخ', row.date],
    ['المدفوع له', row.paidTo || '—'],
    ['البيان', row.title],
    ['التصنيف', EXPENSE_CATEGORY_LABEL[row.category]],
    ['طريقة الدفع', PAYMENT_METHOD_LABEL[row.paymentMethod]],
  ];
  if (row.invoiceReference) lines.push(['رقم فاتورة المورّد', row.invoiceReference]);
  if (row.relatedBookingId) lines.push(['مرتبط بـ', linkedTo || row.relatedBookingId]);
  if (row.notes) lines.push(['ملاحظات', row.notes]);

  return (
    <div className="mx-auto max-w-[720px] text-[13px] leading-6 text-black">
      <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          <h1 className="text-xl font-bold">{brand.brandName || 'سند صرف'}</h1>
          {brand.crNumber ? <p>السجل التجاري: {brand.crNumber}</p> : null}
          {brand.vatNumber ? <p>الرقم الضريبي: {brand.vatNumber}</p> : null}
        </div>
        <div className="text-end">
          <p className="text-lg font-bold">سند صرف</p>
          <p dir="ltr">{row.voucherNumber}</p>
        </div>
      </header>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map(([label, value]) => (
            <tr key={label} className="border-b border-neutral-300">
              <th className="w-40 py-2 text-start font-semibold">{label}</th>
              <td className="py-2">{value}</td>
            </tr>
          ))}
          <tr className="border-b border-neutral-300">
            <th className="py-2 text-start font-semibold">المبلغ قبل الضريبة</th>
            <td className="py-2">{sar(row.amount)}</td>
          </tr>
          <tr className="border-b border-neutral-300">
            <th className="py-2 text-start font-semibold">ضريبة القيمة المضافة</th>
            <td className="py-2">{row.taxAmount > 0 ? sar(row.taxAmount) : 'معفى (0٪)'}</td>
          </tr>
          <tr>
            <th className="py-2 text-start text-base font-bold">الإجمالي</th>
            <td className="py-2 text-base font-bold">{sar(row.totalAmount)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-16 grid grid-cols-2 gap-10 text-center">
        <div className="border-t border-black pt-2">توقيع المستلم</div>
        <div className="border-t border-black pt-2">توقيع المحاسب / المالك</div>
      </div>
    </div>
  );
}
