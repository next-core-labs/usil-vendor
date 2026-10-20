/**
 * Click-to-chat WhatsApp helpers — ported from the old dashboard
 * (`usil/src/utils/vendorWhatsApp.ts` + the client templates of
 * `VendorWhatsAppDesk.tsx`). Messages open in the vendor's own WhatsApp via
 * wa.me; nothing is sent from the server.
 */

/**
 * Saudi numbers to the international form wa.me expects:
 * `05xxxxxxxx` → `9665xxxxxxxx`, `5xxxxxxxx` → `9665xxxxxxxx`,
 * `+966…` / `00966…` → `966…`. Anything else keeps its digits.
 */
export function phoneToWhatsApp(phone: string | undefined | null): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('0') && digits.length >= 9) return `966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `966${digits}`;
  return digits;
}

/**
 * A wa.me link to that phone with the text prefilled, or '' when the phone is
 * not a usable number (shorter than a country code plus a subscriber number).
 */
export function whatsappChatUrl(phone: string | undefined | null, text = ''): string {
  const to = phoneToWhatsApp(phone);
  if (to.length < 10) return '';
  const body = text.trim();
  return body ? `https://wa.me/${to}?text=${encodeURIComponent(body)}` : `https://wa.me/${to}`;
}

/** wa.me without a number: WhatsApp asks which chat to share the text to. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text.trim())}`;
}

export type MessageTemplate = { id: string; label: string; body: string };

export const CLIENT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'confirm',
    label: 'تأكيد الحجز',
    body: 'أهلاً {name}،\nمعك {brand}. نأكد حجزك لـ {service} بتاريخ {date} الساعة {time} في {venue}.\nرقم الحجز: {bookingNumber}',
  },
  {
    id: 'reminder',
    label: 'تذكير بموعد المناسبة',
    body: 'أهلاً {name}،\nتذكير من {brand}: موعد {service} يوم {date} الساعة {time} في {venue}. نحن جاهزين، وإذا عندك أي تعديل بلغنا.',
  },
  {
    id: 'remaining',
    label: 'المبلغ المتبقي',
    body: 'أهلاً {name}،\nنذكّرك بالمبلغ المتبقي لحجز {service} ({bookingNumber}): {remaining} ر.س.\nشكراً لاختيارك {brand}.',
  },
  {
    id: 'on_the_way',
    label: 'الطاقم في الطريق',
    body: 'أهلاً {name}،\nطاقم {brand} في الطريق إلى {venue} لتجهيز {service}. نوصل قريباً بإذن الله.',
  },
  {
    id: 'thanks',
    label: 'شكر وطلب تقييم',
    body: 'أهلاً {name}،\nشكراً لثقتك في {brand} 🌟 نتمنى أن {service} كانت على قد توقعاتك. يسعدنا تقييمك لنا في يوصل.',
  },
];

/** The values a template can use. Missing ones fall back to a neutral word. */
export type TemplateValues = {
  name?: string;
  brand?: string;
  service?: string;
  date?: string;
  time?: string;
  venue?: string;
  city?: string;
  bookingNumber?: string;
  amount?: number;
  remaining?: number;
};

const money = (value: number | undefined) =>
  new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value) || 0);

/**
 * Fills `{placeholders}`. A template never goes out with raw braces: every
 * known key has a fallback, and an unknown one is left as written.
 */
export function fillTemplate(body: string, values: TemplateValues): string {
  const map: Record<string, string> = {
    name: values.name?.trim() || 'عميلنا العزيز',
    brand: values.brand?.trim() || 'فريقنا',
    service: values.service?.trim() || 'الخدمة',
    date: values.date?.trim() || 'الموعد المتفق عليه',
    time: values.time?.trim() || 'الوقت المتفق عليه',
    venue: values.venue?.trim() || values.city?.trim() || 'موقع المناسبة',
    city: values.city?.trim() || '',
    bookingNumber: values.bookingNumber?.trim() || '—',
    amount: money(values.amount),
    remaining: money(values.remaining),
  };
  return body.replace(/\{(\w+)\}/g, (match, key: string) => (key in map ? map[key] : match));
}
