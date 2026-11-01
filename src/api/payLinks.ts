import { api } from './client.ts';

/**
 * روابط الدفع (`/api/vendor/pay-links`) — a Moyasar link for an invoice's
 * remaining balance or a quotation's deposit. The server takes the amount from
 * the stored document; once the client pays, the money joins the balance in
 * «الأرباح والسحب» (less Usil's commission) and the server marks the invoice
 * paid or the quotation accepted.
 */
export type PayLinkKind = 'invoice' | 'quotation';

/** `replaced` — the document's amount changed and a newer link took over. */
export type PayLinkStatus = 'open' | 'replaced' | 'paid' | 'refunded';

export type PayLink = {
  id: string;
  kind: PayLinkKind;
  docId: string;
  docNumber: string;
  clientName: string;
  clientPhone: string;
  amount: number;
  url: string;
  status: PayLinkStatus;
  paidAt?: string;
  createdAt: string;
};

type Wrapped<T> = { data: T; reused?: boolean };

export const payLinks = {
  list: () => api.get<Wrapped<PayLink[]>>('/api/vendor/pay-links').then((r) => r.data ?? []),
  /** Resends the open link while the amount is unchanged, so a client never gets two. */
  create: (kind: PayLinkKind, docId: string) =>
    api.post<Wrapped<PayLink>>('/api/vendor/pay-links', { kind, docId }).then((r) => r.data),
};

/** The newest link for a document — what its screen shows. */
export function linkFor(links: PayLink[], kind: PayLinkKind, docId: string): PayLink | null {
  return links.find((row) => row.kind === kind && row.docId === docId && row.status !== 'replaced') || null;
}

/** Adds or replaces a link in a list kept on screen, newest first. */
export function withLink(links: PayLink[], link: PayLink): PayLink[] {
  const rest = links
    .filter((row) => row.id !== link.id)
    .map((row) => (row.kind === link.kind && row.docId === link.docId && row.status === 'open' ? { ...row, status: 'replaced' as const } : row));
  return [link, ...rest];
}
