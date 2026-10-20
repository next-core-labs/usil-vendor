import { api } from './client.ts';

/**
 * المكتب الخلفي — the vendor's own records kept on the server
 * (`/api/vendor/office`). The server only checks the shape: each list key is
 * an array, `brandSettings` an object.
 *
 * Always save with `office.patch({ key: list })`: it replaces only the keys
 * you send, so the invoices screen and the expenses screen never overwrite
 * each other. Never PUT the whole office from a screen.
 */
export type OfficeListKey =
  | 'invoices'
  | 'expenses'
  | 'quotations'
  | 'payouts'
  | 'posSales'
  | 'posItems'
  | 'receivables'
  | 'crewMembers'
  | 'payrollEntries'
  | 'consolidatedVouchers'
  | 'trackings'
  | 'workLogs'
  | 'attendance';

export type VendorOffice = Partial<Record<OfficeListKey, unknown[]>> & {
  brandSettings?: Record<string, unknown>;
};

type Wrapped<T> = { data: T };

export const office = {
  read: () => api.get<Wrapped<VendorOffice>>('/api/vendor/office').then((r) => r.data ?? {}),
  patch: (partial: VendorOffice) => api.patch<Wrapped<VendorOffice>>('/api/vendor/office', partial).then((r) => r.data ?? {}),
};
