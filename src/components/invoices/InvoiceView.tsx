import { Building2 } from 'lucide-react';
import {
  DEFAULT_BRAND_COLOR,
  inkOnColor,
  isHexColor,
  isValidSaudiVatNumber,
  type VendorBrandSettings,
} from '../../api/brand.ts';
import { CHANNEL_LABEL, type VendorInvoice } from '../../api/invoices.ts';
import { shortDate } from '../../lib/format.ts';
import { sar2 } from './InvoiceFormModal.tsx';

/**
 * The invoice on screen, laid out like the PDF. Paper-white in both themes —
 * it stands for the document the client receives.
 */
export function InvoiceView({ invoice, brand }: { invoice: VendorInvoice; brand: VendorBrandSettings }) {
  const color = isHexColor(brand.primaryColor) ? brand.primaryColor : DEFAULT_BRAND_COLOR;
  const withVat = invoice.taxRate > 0;
  const taxInvoice = withVat && isValidSaudiVatNumber(brand.vatNumber);
  const pct = Math.round(invoice.taxRate * 100);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white text-[#0f172a]">
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
        style={{ backgroundColor: color, color: inkOnColor(color) }}
      >
        <span className="text-sm font-semibold">{taxInvoice ? 'فاتورة ضريبية مبسطة' : 'فاتورة'}</span>
        <span dir="ltr" className="font-mono text-xs opacity-85">
          {invoice.invoiceNumber}
        </span>
      </div>
      <div className="h-0.5 bg-[#c0a16b]" />

      <div className="space-y-4 p-4 text-[13px]">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="size-full object-contain" />
            ) : (
              <Building2 size={20} className="text-[#94a3b8]" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{brand.brandName || '—'}</p>
            <p className="text-xs text-[#475569]">
              {[
                taxInvoice ? `الرقم الضريبي ${brand.vatNumber.replace(/\s/g, '')}` : '',
                brand.crNumber ? `س.ت ${brand.crNumber}` : '',
                brand.city,
              ]
                .filter(Boolean)
                .join(' • ') || ' '}
            </p>
          </div>
        </div>

        {brand.invoiceHeaderNote ? (
          <p className="rounded-md bg-[#f8fafc] px-3 py-2 text-xs text-[#475569]">{brand.invoiceHeaderNote}</p>
        ) : null}

        <div className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 sm:grid-cols-2">
          <div className="space-y-0.5">
            <p className="text-[11px] text-[#64748b]">العميل</p>
            <p className="font-semibold">{invoice.clientName || '—'}</p>
            {invoice.clientPhone ? (
              <p dir="ltr" className="font-mono text-xs text-[#475569]" style={{ textAlign: 'right' }}>
                {invoice.clientPhone}
              </p>
            ) : null}
            {invoice.clientTaxId ? <p className="text-xs text-[#475569]">رقم ضريبي: {invoice.clientTaxId}</p> : null}
          </div>
          <div className="space-y-0.5 text-xs text-[#475569]">
            <p>تاريخ الإصدار: {shortDate(invoice.issueDate)}</p>
            <p>تاريخ المناسبة: {shortDate(invoice.eventDate || invoice.dueDate)}</p>
            <p>طريقة الدفع: {invoice.paymentMethod || '—'}</p>
            {invoice.channelSource ? <p>المصدر: {CHANNEL_LABEL[invoice.channelSource] || invoice.channelSource}</p> : null}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]">
          <table className="w-full min-w-[420px] text-xs">
            <thead className="bg-[#f8fafc] text-[#475569]">
              <tr>
                <th className="p-2.5 text-start font-semibold">البند</th>
                <th className="p-2.5 text-center font-semibold">الكمية</th>
                <th className="p-2.5 text-start font-semibold">{withVat ? 'السعر قبل الضريبة' : 'السعر'}</th>
                <th className="p-2.5 text-start font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td className="p-2.5 font-medium">{item.description}</td>
                  <td className="tabular p-2.5 text-center">{item.quantity}</td>
                  <td className="tabular p-2.5">{sar2(item.unitPrice)}</td>
                  <td className="tabular p-2.5 font-semibold">{sar2(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2 text-xs">
            <div className="rounded-lg border border-[#e2e8f0] p-3">
              <p className="font-semibold">الحساب البنكي</p>
              <p className="text-[#475569]">
                {[brand.bankName, brand.accountHolder || brand.brandName].filter(Boolean).join(' — ') || '—'}
              </p>
              <p dir="ltr" className="font-mono font-semibold" style={{ textAlign: 'right' }}>
                {brand.iban || '—'}
              </p>
            </div>
            {invoice.terms || brand.invoiceFooterNotes ? (
              <p className="whitespace-pre-line leading-5 text-[#64748b]">{invoice.terms || brand.invoiceFooterNotes}</p>
            ) : null}
            {brand.stampUrl ? <img src={brand.stampUrl} alt="الختم" className="size-16 object-contain opacity-90" /> : null}
          </div>
          <div className="w-full space-y-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-xs sm:w-64">
            {withVat ? (
              <>
                <Row label="قبل الضريبة" value={sar2(invoice.subtotal)} />
                <Row label={`الضريبة ${pct}٪`} value={sar2(invoice.taxAmount)} />
              </>
            ) : null}
            <div className="flex justify-between border-t border-[#e2e8f0] pt-1.5 text-sm font-semibold">
              <span>الإجمالي</span>
              <span className="tabular">{sar2(invoice.total)}</span>
            </div>
            <Row label="المدفوع" value={sar2(invoice.depositPaid)} tone="#047857" />
            <Row label="المتبقي" value={sar2(invoice.remainingBalance)} tone="#be123c" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between" style={tone ? { color: tone } : undefined}>
      <span className={tone ? '' : 'text-[#475569]'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
