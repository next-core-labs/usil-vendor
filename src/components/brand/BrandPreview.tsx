import { Building2, QrCode } from 'lucide-react';
import {
  DEFAULT_BRAND_COLOR,
  inkOnColor,
  isHexColor,
  isValidSaudiVatNumber,
  type VendorBrandSettings,
} from '../../api/brand.ts';

/**
 * How the invoice header will look. Drawn on white like the paper/PDF it
 * stands for, so it reads the same in light and dark mode.
 */
export function BrandPreview({ settings }: { settings: VendorBrandSettings }) {
  const color = isHexColor(settings.primaryColor) ? settings.primaryColor : DEFAULT_BRAND_COLOR;
  const ink = inkOnColor(color);
  const taxInvoice = isValidSaudiVatNumber(settings.vatNumber);
  const contact = [settings.city, settings.phone].filter(Boolean).join(' • ');

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white text-[#0f172a] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: color, color: ink }}>
        <span className="text-sm font-semibold">{taxInvoice ? 'فاتورة ضريبية مبسطة' : 'فاتورة'}</span>
        <span dir="ltr" className="font-mono text-[11px] opacity-80">
          INV-2026-0001
        </span>
      </div>
      <div className="h-0.5 bg-[#c0a16b]" />
      <div className="flex items-start gap-3 p-4">
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <Building2 size={20} className="text-[#94a3b8]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold">{settings.brandName || 'اسم المنشأة'}</p>
          {settings.slogan ? <p className="truncate text-xs text-[#475569]">{settings.slogan}</p> : null}
          {taxInvoice ? (
            <p className="text-[11px] text-[#475569]">
              الرقم الضريبي: <span className="font-mono">{settings.vatNumber.replace(/\s/g, '')}</span>
            </p>
          ) : null}
          {settings.crNumber ? (
            <p className="text-[11px] text-[#475569]">
              السجل التجاري: <span className="font-mono">{settings.crNumber}</span>
            </p>
          ) : null}
          {contact ? <p className="text-[11px] text-[#475569]">{contact}</p> : null}
        </div>
        {taxInvoice ? (
          <div className="grid size-14 shrink-0 place-items-center rounded-md border border-dashed border-[#cbd5e1] text-[#64748b]">
            <QrCode size={22} aria-label="رمز هيئة الزكاة" />
          </div>
        ) : null}
      </div>
      {settings.invoiceHeaderNote ? (
        <p className="mx-4 mb-3 rounded-md bg-[#f8fafc] px-3 py-2 text-xs text-[#475569]">{settings.invoiceHeaderNote}</p>
      ) : null}
      <div className="flex items-end justify-between gap-3 border-t border-[#e2e8f0] px-4 py-3 text-[11px]">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">الحساب البنكي</p>
          <p className="truncate text-[#475569]">
            {[settings.bankName, settings.accountHolder || settings.brandName].filter(Boolean).join(' — ') || '—'}
          </p>
          <p dir="ltr" className="truncate text-end font-mono text-[#0f172a]">
            {settings.iban || '—'}
          </p>
        </div>
        {settings.stampUrl ? (
          <img src={settings.stampUrl} alt="الختم" className="size-14 shrink-0 object-contain opacity-90" />
        ) : null}
      </div>
    </div>
  );
}
