/**
 * Income-statement workbook — a simplified port of
 * `usil/src/components/vendor/accounting/profitAndLossExcel.ts`. Three sheets:
 * the summary, every income line, and every expense of the period. `xlsx` is
 * loaded on demand so it never weighs on the first paint.
 */
import {
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  USIL_COMMISSION_RATE,
  periodLabel,
  riyadhToday,
  type ProfitAndLoss,
} from './finance.ts';

const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');

export async function exportProfitAndLossWorkbook(pl: ProfitAndLoss, brandName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const label = periodLabel(pl.period);
  const brand = brandName.trim() || 'المورّد';

  const summary: Array<Array<string | number>> = [
    ['قائمة الدخل'],
    ['المنشأة', brand],
    ['الفترة', label],
    ['تاريخ التصدير', riyadhToday()],
    ['العملة', 'ريال سعودي (SAR)'],
    [],
    ['البند', 'المبلغ (SAR)', 'من إجمالي الإيرادات'],
    [`طلبات متجر يوصل (${pl.storeCount}) — الإجمالي`, pl.storeGross, pct(pl.storeGross, pl.grossIncome)],
    [`عمولة يوصل ${Math.round(USIL_COMMISSION_RATE * 100)}%`, -pl.commission, pct(pl.commission, pl.grossIncome)],
    [`حجوزات خارجية ويدوية (${pl.externalCount}) — عمولة 0%`, pl.externalGross, pct(pl.externalGross, pl.grossIncome)],
    ['= صافي الإيرادات', pl.netIncome, pct(pl.netIncome, pl.grossIncome)],
    [],
    ['المصروفات (بدون ضريبة المدخلات)'],
    ...pl.costsByCategory.map((row) => [
      `${EXPENSE_CATEGORY_LABEL[row.category]} (${row.count})`,
      -row.amount,
      pct(row.amount, pl.grossIncome),
    ]),
    ['= إجمالي المصروفات', -pl.totalCosts, pct(pl.totalCosts, pl.grossIncome)],
    [],
    ['= صافي الربح', pl.netProfit, pct(pl.netProfit, pl.grossIncome)],
    [],
    ['ضريبة المدخلات المسجلة (تُخصم في الإقرار الضريبي)', pl.inputVat, ''],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 48 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

  const income: Array<Array<string | number>> = [
    ['المرجع', 'المصدر', 'العميل', 'الخدمة', 'التاريخ', 'الإجمالي (SAR)', 'العمولة (SAR)', 'الصافي (SAR)', 'الحالة'],
    ...pl.lines.map((row) => [
      row.reference,
      row.channel === 'store' ? 'متجر يوصل (15%)' : 'حجز خارجي (0%)',
      row.customer,
      row.service,
      row.date,
      row.gross,
      row.commission,
      row.net,
      row.status,
    ]),
  ];
  const wsIncome = XLSX.utils.aoa_to_sheet(income);
  wsIncome['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsIncome, 'الإيرادات');

  const expenses: Array<Array<string | number>> = [
    [
      'رقم السند',
      'التاريخ',
      'البيان',
      'التصنيف',
      'المدفوع له',
      'قبل الضريبة (SAR)',
      'الضريبة (SAR)',
      'الإجمالي (SAR)',
      'طريقة الدفع',
      'فاتورة المورّد',
      'مرتبط بحجز',
      'ملاحظات',
    ],
    ...pl.expenses.map((row) => [
      row.voucherNumber,
      row.date,
      row.title,
      EXPENSE_CATEGORY_LABEL[row.category],
      row.paidTo,
      row.amount,
      row.taxAmount,
      row.totalAmount,
      PAYMENT_METHOD_LABEL[row.paymentMethod],
      row.invoiceReference || '',
      row.relatedBookingId || '',
      row.notes || '',
    ]),
  ];
  const wsExpenses = XLSX.utils.aoa_to_sheet(expenses);
  wsExpenses['!cols'] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 30 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'المصروفات');

  // Right-to-left sheets, so Excel opens them the way the screen reads.
  wb.Workbook = { Views: [{ RTL: true }] };

  const slug = (text: string) => text.trim().replace(/\s+/g, '-');
  XLSX.writeFile(wb, `قائمة-الدخل-${slug(brand)}-${slug(label)}.xlsx`);
}
