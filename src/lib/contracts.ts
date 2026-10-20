import type { Contract, ContractStatus } from '../api/contracts.ts';
import type { Tone } from '../components/ui/primitives.tsx';
import { whatsappNumber } from '../api/invoices.ts';

/**
 * Wording and small pure helpers for «العقود». The default terms are ported
 * from the old dashboard (`usil/src/utils/vendorContracts.ts`).
 */

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'مسودة',
  sent: 'بانتظار توقيع العميل',
  signed: 'موقّع',
  cancelled: 'ملغي',
};

export const CONTRACT_STATUS_TONE: Record<ContractStatus, Tone> = {
  draft: 'neutral',
  sent: 'warning',
  signed: 'good',
  cancelled: 'critical',
};

export const LEGACY_LABEL = 'عقد قديم — التوقيع سجّله المورّد وليس العميل';

export const DEFAULT_CONTRACT_TERMS = [
  'يلتزم المورّد بالحضور لموقع المناسبة قبل الموعد بـ 90 دقيقة للتجهيز وفحص أدوات الضيافة.',
  'يلتزم المورّد بالزي السعودي الرسمي الموحد ونظافة أدوات التقديم وفق الاشتراطات الصحية.',
  'يحق للعميل استرداد كامل العربون إذا أُلغي الحجز قبل موعد المناسبة بـ 72 ساعة على الأقل.',
  'يضمن المورّد خلو المواد المقدمة من مسببات حساسية غير معلنة، والالتزام بجودة الخدمة المتفق عليها.',
  'يسدد العميل المتبقي في يوم المناسبة أو حسب ما يُوثّق في هذا العقد، ويُعد التوقيع الإلكتروني ملزماً للطرفين.',
];

/** The starting terms for a new contract: scope first, then the standard ones. */
export function defaultContractTerms(service: string): string[] {
  const terms = [...DEFAULT_CONTRACT_TERMS];
  if (service.trim()) terms.unshift(`نطاق الخدمة المتفق عليه: ${service.trim()}.`);
  return terms;
}

/** The WhatsApp message carrying the signing link. */
export function signLinkMessage(contract: Contract, signUrl: string, brandName: string): string {
  const from = brandName || contract.vendorName;
  return [
    `مرحباً ${contract.client.name}،`,
    `أرسل لك ${from} عقد «${contract.event.service}» رقم ${contract.number}${contract.event.date ? ` لموعد ${contract.event.date}` : ''}.`,
    'اقرأ العقد ووقّعه إلكترونياً من الرابط:',
    signUrl,
  ].join('\n');
}

export function signLinkWhatsAppUrl(contract: Contract, signUrl: string, brandName: string): string {
  return `https://wa.me/${whatsappNumber(contract.client.phone)}?text=${encodeURIComponent(signLinkMessage(contract, signUrl, brandName))}`;
}

const riyadhDateTime = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** «20 أكتوبر 2026، 6:41:05 م» in Riyadh time, whatever the device timezone. */
export function riyadhStamp(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : `${riyadhDateTime.format(date)} (توقيت الرياض)`;
}

/** Digits-only date for the PDF — Intl's Arabic output carries direction marks the PDF font lacks. */
export function riyadhStampLatin(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString();
  // Arabic suffix: a Latin «(Riyadh, UTC+3)» inside an Arabic line is reordered by the bidi pass.
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 19)} بتوقيت الرياض`;
}

/** First 16 hex chars of the fingerprint, in groups of four. */
export function shortHash(hash: string | undefined): string {
  return String(hash || '')
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, '$1 ');
}

/** «Chrome على iPhone» — a readable device line from the user agent. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = String(userAgent || '');
  if (!ua) return '—';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /CriOS|Chrome\//.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  if (!os && !browser) return ua.slice(0, 60);
  return [browser, os].filter(Boolean).join(' على ');
}
