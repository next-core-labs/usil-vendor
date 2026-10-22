import { api } from './client.ts';
import { normalizeIban } from './brand.ts';

/**
 * أرباح المتجر وطلبات السحب. The balance is computed by the server from the
 * store's paid orders (15% commission off each); a withdrawal request goes to
 * إدارة يوصل, which transfers by hand from the bank — nothing here moves money.
 */

/** `pending` = paid, in escrow until «مكتمل»; `excluded` = cancelled, rejected or a refund is owed. */
export type EarningsBucket = 'pending' | 'available' | 'excluded';

export type EarningsOrder = {
  id: string;
  eventDate: string;
  createdAt: string;
  status: string;
  /** Riyals — this store's own lines of the order. */
  gross: number;
  commission: number;
  net: number;
  bucket: EarningsBucket;
  refundPending: boolean;
};

export type VendorEarnings = {
  currency: 'SAR';
  commissionRate: number;
  /** In escrow: paid orders not completed yet. */
  pending: number;
  /** Withdrawable now: completed net earnings minus every open or paid request. */
  available: number;
  paidOut: number;
  /** Requested or approved, not transferred yet. */
  inReview: number;
  earned: number;
  orders: EarningsOrder[];
};

export type PayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export type PayoutRequest = {
  id: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  iban: string;
  accountHolder: string;
  bankName: string;
  status: PayoutStatus;
  note: string;
  adminNote: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  decidedBy: string;
};

export type PayoutDraft = {
  amount: number;
  iban: string;
  accountHolder: string;
  bankName: string;
  note?: string;
};

type Wrapped<T> = { data: T };

export const payouts = {
  earnings: () => api.get<Wrapped<VendorEarnings>>('/api/vendor/earnings').then((r) => r.data),
  list: () => api.get<Wrapped<PayoutRequest[]>>('/api/vendor/payouts').then((r) => r.data ?? []),
  request: (draft: PayoutDraft) => api.post<Wrapped<PayoutRequest>>('/api/vendor/payouts', draft).then((r) => r.data),
};

export { normalizeIban };

/** Same rule the server applies: `SA` + 22 digits. */
export function looksLikeSaudiIban(raw: string): boolean {
  return /^SA\d{22}$/.test(normalizeIban(raw));
}
