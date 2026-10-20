import { AlertTriangle, Building2 } from 'lucide-react';
import { DEFAULT_BRAND_COLOR, inkOnColor, isHexColor, type VendorBrandSettings } from '../../api/brand.ts';
import type { Contract } from '../../api/contracts.ts';
import { longDayLabel } from '../../lib/riyadh.ts';
import { CONTRACT_STATUS_LABEL, LEGACY_LABEL, riyadhStamp } from '../../lib/contracts.ts';
import { sar2 } from '../invoices/InvoiceFormModal.tsx';

/**
 * The contract on screen, laid out like the PDF and like the client's signing
 * page. Paper-white in both themes — it stands for the signed document.
 */
export function ContractView({ contract, brand }: { contract: Contract; brand: VendorBrandSettings }) {
  const color = isHexColor(brand.primaryColor) ? brand.primaryColor : DEFAULT_BRAND_COLOR;
  const signature = contract.signature;

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white text-[#0f172a]">
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
        style={{ backgroundColor: color, color: inkOnColor(color) }}
      >
        <span className="text-sm font-semibold">عقد تقديم خدمات</span>
        <span className="flex items-center gap-2 text-xs opacity-90">
          <span>{CONTRACT_STATUS_LABEL[contract.status]}</span>
          <span dir="ltr" className="font-mono">
            {contract.number}
          </span>
        </span>
      </div>
      <div className="h-0.5 bg-[#c0a16b]" />

      <div className="space-y-4 p-4 text-[13px] leading-6">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="size-full object-contain" />
            ) : (
              <Building2 size={20} className="text-[#94a3b8]" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{brand.brandName || contract.vendorName}</p>
            <p className="text-xs text-[#475569]">
              {[brand.crNumber ? `س.ت ${brand.crNumber}` : '', brand.city].filter(Boolean).join(' • ') || ' '}
            </p>
          </div>
        </div>

        {contract.legacy ? (
          <p className="flex items-start gap-2 rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#b91c1c]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {LEGACY_LABEL}
          </p>
        ) : null}

        <section className="grid gap-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] text-[#64748b]">الطرف الأول (المورّد)</p>
            <p className="font-semibold">{contract.vendorName}</p>
            {brand.crNumber ? <p className="text-xs text-[#475569]">سجل تجاري {brand.crNumber}</p> : null}
          </div>
          <div>
            <p className="text-[11px] text-[#64748b]">الطرف الثاني (العميل)</p>
            <p className="font-semibold">{contract.client.name}</p>
            <p dir="ltr" className="font-mono text-xs text-[#475569]" style={{ textAlign: 'right' }}>
              {contract.client.phone}
            </p>
            {contract.client.nationalId ? <p className="text-xs text-[#475569]">هوية {contract.client.nationalId}</p> : null}
            {contract.client.email ? (
              <p dir="ltr" className="text-xs text-[#475569]" style={{ textAlign: 'right' }}>
                {contract.client.email}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-[#64748b]">المناسبة والخدمة</h3>
          <p>
            <span className="text-[#64748b]">الخدمة: </span>
            {contract.event.service}
          </p>
          <p>
            <span className="text-[#64748b]">التاريخ: </span>
            {longDayLabel(contract.event.date)}
            {contract.event.time ? ` — الساعة ${contract.event.time}` : ''}
          </p>
          {contract.event.location ? (
            <p>
              <span className="text-[#64748b]">الموقع: </span>
              {contract.event.location}
            </p>
          ) : null}
        </section>

        <section className="grid grid-cols-3 gap-2">
          {[
            ['الإجمالي', contract.amounts.total],
            ['العربون', contract.amounts.deposit],
            ['المتبقي', contract.amounts.remaining],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-[#e2e8f0] p-2">
              <p className="text-[11px] text-[#64748b]">{label}</p>
              <p className="font-semibold tabular">{sar2(value as number)}</p>
            </div>
          ))}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold text-[#64748b]">البنود</h3>
          <ol className="list-decimal space-y-1.5 ps-5">
            {contract.terms.map((term, index) => (
              <li key={index} className="whitespace-pre-line">
                {term}
              </li>
            ))}
          </ol>
        </section>

        {contract.notes ? (
          <section>
            <h3 className="mb-1 text-xs font-semibold text-[#64748b]">ملاحظات</h3>
            <p className="whitespace-pre-line">{contract.notes}</p>
          </section>
        ) : null}

        <section className="grid gap-3 border-t border-[#e2e8f0] pt-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-[11px] text-[#64748b]">صادر من المورّد</p>
            <p className="font-semibold">{contract.vendorSignature?.name || '—'}</p>
            <p className="text-xs text-[#475569]">
              {contract.vendorSignature ? riyadhStamp(contract.vendorSignature.at) : 'لم يُرسل للعميل بعد'}
            </p>
          </div>
          <div className="rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-[11px] text-[#64748b]">{contract.legacy ? 'توقيع مسجّل من المورّد' : 'توقيع العميل'}</p>
            {signature ? (
              <>
                {signature.image ? (
                  <img src={signature.image} alt={`توقيع ${signature.name}`} className="my-1 h-16 w-auto max-w-full object-contain" />
                ) : null}
                <p className="font-semibold">{signature.name}</p>
                <p className="text-xs text-[#475569]">{riyadhStamp(signature.signedAt)}</p>
              </>
            ) : (
              <p className="text-xs text-[#475569]">{contract.status === 'cancelled' ? 'أُلغي العقد' : 'بانتظار توقيع العميل'}</p>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
