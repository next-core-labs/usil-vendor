import { sar } from '../../lib/format.ts';
import type { BrandInfo } from '../../api/finance.ts';
import type { Quotation } from './model.ts';

/** The quotation as a clean A4 page — rendered inside `PrintSheet`. */
export function QuotationPrint({ row, brand }: { row: Quotation; brand: BrandInfo }) {
  const contact = [brand.phone, brand.email].filter(Boolean).join(' · ');
  const place = [brand.city, brand.address].filter(Boolean).join(' — ');
  return (
    <div className="mx-auto max-w-[760px] text-[13px] leading-6 text-black">
      <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex items-start gap-3">
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-14 w-14 rounded object-contain" /> : null}
          <div>
            <h1 className="text-xl font-bold">{brand.brandName || 'عرض سعر'}</h1>
            {place ? <p>{place}</p> : null}
            {contact ? <p dir="auto">{contact}</p> : null}
            {brand.crNumber ? <p>السجل التجاري: {brand.crNumber}</p> : null}
            {brand.vatNumber ? <p>الرقم الضريبي: {brand.vatNumber}</p> : null}
          </div>
        </div>
        <div className="text-end">
          <p className="text-lg font-bold">عرض سعر</p>
          <p dir="ltr">{row.quoteNumber}</p>
          <p>التاريخ: {row.createdAt.slice(0, 10)}</p>
          {row.validUntil ? <p>ساري حتى: {row.validUntil}</p> : null}
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold">إلى</p>
          <p>{row.clientName}</p>
          {row.companyName ? <p>{row.companyName}</p> : null}
          {row.clientPhone ? <p dir="ltr" className="text-end">{row.clientPhone}</p> : null}
        </div>
        <div>
          <p className="font-semibold">المناسبة</p>
          {row.eventTitle ? <p>{row.eventTitle}</p> : null}
          {row.eventDate || row.city ? <p>{[row.eventDate, row.city].filter(Boolean).join(' · ')}</p> : null}
          {row.guestCount > 0 ? <p>عدد الضيوف: {row.guestCount}</p> : null}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-2 text-start">#</th>
            <th className="py-2 text-start">البند</th>
            <th className="py-2 text-center">الكمية</th>
            <th className="py-2 text-center">سعر الوحدة</th>
            <th className="py-2 text-end">المجموع</th>
          </tr>
        </thead>
        <tbody>
          {row.items.map((item, index) => (
            <tr key={index} className="border-b border-neutral-300 align-top">
              <td className="py-2">{index + 1}</td>
              <td className="py-2">
                <div className="font-semibold">{item.title}</div>
                {item.description ? <div className="text-neutral-600">{item.description}</div> : null}
              </td>
              <td className="py-2 text-center">{item.quantity}</td>
              <td className="py-2 text-center">{sar(item.unitPrice)}</td>
              <td className="py-2 text-end">{sar(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-auto mt-4 w-full max-w-[300px] space-y-1">
        <Line label="المجموع" value={sar(row.subtotal)} />
        {row.discountAmount > 0 ? <Line label="الخصم" value={`− ${sar(row.discountAmount)}`} /> : null}
        <Line label="ضريبة القيمة المضافة 15٪" value={sar(row.vatAmount)} />
        <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
          <span>الإجمالي</span>
          <span>{sar(row.grandTotal)}</span>
        </div>
        {row.depositRequired > 0 ? <Line label={`العربون المطلوب (${row.depositPercent}٪)`} value={sar(row.depositRequired)} /> : null}
      </div>

      {row.customNote ? (
        <section className="mt-6 border-t border-neutral-300 pt-3">
          <p className="font-semibold">ملاحظات</p>
          <p className="whitespace-pre-line">{row.customNote}</p>
        </section>
      ) : null}

      <div className="mt-16 grid grid-cols-2 gap-10 text-center">
        <div className="border-t border-black pt-2">توقيع المورّد</div>
        <div className="border-t border-black pt-2">موافقة العميل</div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
