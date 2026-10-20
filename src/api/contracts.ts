import { api } from './client.ts';

/**
 * «العقود» — `server/contracts/` on the backend. The vendor prepares a contract,
 * sends a private link, and the CLIENT signs it on the store (`/sign/<token>`).
 * The first list call also imports the old dashboard's contracts once, marked
 * `legacy` (their «signature» was recorded by the vendor, not the client).
 */

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'cancelled';
export type ContractSourceKind = 'order' | 'booking' | 'manual';

export type ContractClient = { name: string; phone: string; email?: string; nationalId?: string };
export type ContractEvent = { date: string; time?: string; location: string; service: string };
export type ContractAmounts = { total: number; deposit: number; remaining: number; currency: 'SAR' };

export type ContractSignature = {
  name: string;
  /** PNG data URL. Empty in the list (see `hasImage`) and on legacy records. */
  image: string;
  hasImage?: boolean;
  signedAt: string;
  ip: string;
  userAgent: string;
  contentHash: string;
  /** Legacy only: why this is not a verified client signature. */
  note?: string;
};

export type Contract = {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  source: { kind: ContractSourceKind; ref?: string };
  client: ContractClient;
  event: ContractEvent;
  amounts: ContractAmounts;
  terms: string[];
  notes?: string;
  status: ContractStatus;
  contentHash: string;
  /** The client's signing link — present once sent. */
  signUrl?: string;
  sentAt?: string;
  signedAt?: string;
  cancelledAt?: string;
  signature?: ContractSignature;
  vendorSignature?: { name: string; at: string };
  legacy?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** What the form sends; the server computes `remaining`, the number and the fingerprint. */
export type ContractDraft = {
  source: { kind: ContractSourceKind; ref?: string };
  client: ContractClient;
  event: ContractEvent;
  amounts: { total: number; deposit: number };
  terms: string[];
  notes?: string;
};

type Wrapped<T> = { data: T };
const one = (id: string) => `/api/vendor/contracts/${encodeURIComponent(id)}`;

export const contractsApi = {
  list: () => api.get<Wrapped<Contract[]>>('/api/vendor/contracts').then((r) => r.data ?? []),
  /** One contract with the signature image (the list leaves it out). */
  get: (id: string) => api.get<Wrapped<Contract>>(one(id)).then((r) => r.data),
  create: (draft: ContractDraft) => api.post<Wrapped<Contract>>('/api/vendor/contracts', draft).then((r) => r.data),
  update: (id: string, draft: ContractDraft) => api.patch<Wrapped<Contract>>(one(id), draft).then((r) => r.data),
  remove: (id: string) => api.delete<unknown>(one(id)),
  send: (id: string) =>
    api.post<Wrapped<Contract> & { signUrl: string }>(`${one(id)}/send`).then((r) => ({ contract: r.data, signUrl: r.signUrl })),
  cancel: (id: string) => api.post<Wrapped<Contract>>(`${one(id)}/cancel`).then((r) => r.data),
};
