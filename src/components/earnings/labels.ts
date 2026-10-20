import type { Tone } from '../ui/primitives.tsx';
import type { EarningsBucket, PayoutStatus } from '../../api/payouts.ts';

/** Riyals with halalas — `sar()` rounds to whole riyals, which hides a commission's fraction. */
const sarExact = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  style: 'currency',
  currency: 'SAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: number): string {
  return sarExact.format(Number.isFinite(value) ? value : 0);
}

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  requested: 'قيد مراجعة الإدارة',
  approved: 'معتمد — بانتظار التحويل',
  paid: 'تم التحويل',
  rejected: 'مرفوض',
};

export const PAYOUT_STATUS_TONE: Record<PayoutStatus, Tone> = {
  requested: 'warning',
  approved: 'accent',
  paid: 'good',
  rejected: 'critical',
};

export const BUCKET_LABEL: Record<EarningsBucket, string> = {
  pending: 'في الضمان',
  available: 'متاح للسحب',
  excluded: 'لا يُحتسب',
};

export const BUCKET_TONE: Record<EarningsBucket, Tone> = {
  pending: 'warning',
  available: 'good',
  excluded: 'neutral',
};

/** `SA03 8000 0000 6080 1016 7519` — groups of four, read left to right. */
export function groupIban(iban: string): string {
  return String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}
