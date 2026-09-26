import { api } from './client.ts';
import type {
  BlockedDate,
  BlockedDateType,
  ListingDraft,
  PublicUser,
  SocialNetwork,
  VendorBooking,
  VendorFile,
  VendorListing,
  VendorSocials,
  VendorSummary,
  VendorWorkspace,
} from './types.ts';

type Listed<T> = { data: T[] };
type Wrapped<T> = { data: T };

export const auth = {
  /** `user` is null when no session cookie is present — not an error. */
  me: () => api.get<{ user: PublicUser | null }>('/api/auth/me'),
  /**
   * The server reads the address from `identifier` and requires it to contain
   * an `@` when no phone is supplied, so sign-in sends `identifier`, not `email`.
   */
  login: (identifier: string, password: string, remember: boolean) =>
    api.post<{ user: PublicUser; needsEmailVerification: boolean }>('/api/auth/login', {
      identifier,
      password,
      remember,
    }),
  logout: () => api.post<unknown>('/api/auth/logout'),
};

export const workspace = {
  read: () => api.get<Wrapped<VendorWorkspace>>('/api/vendor/workspace').then((r) => r.data),
  summary: () => api.get<Wrapped<VendorSummary>>('/api/vendor/summary').then((r) => r.data),
};

export const listings = {
  list: () => api.get<Listed<VendorListing>>('/api/vendor/listings').then((r) => r.data),
  create: (input: ListingDraft) =>
    api.post<{ listing: VendorListing }>('/api/vendor/listings', input).then((r) => r.listing),
  update: (id: string, input: ListingDraft) =>
    api
      .patch<{ listing: VendorListing }>(`/api/vendor/listings/${encodeURIComponent(id)}`, input)
      .then((r) => r.listing),
  remove: (id: string) => api.delete<unknown>(`/api/vendor/listings/${encodeURIComponent(id)}`),
};

export const bookings = {
  create: (input: Partial<VendorBooking>) =>
    api.post<{ booking: VendorBooking }>('/api/vendor/bookings', input).then((r) => r.booking),
  update: (id: string, input: Partial<VendorBooking>) =>
    api
      .patch<{ booking: VendorBooking }>(`/api/vendor/bookings/${encodeURIComponent(id)}`, input)
      .then((r) => r.booking),
  remove: (id: string) => api.delete<unknown>(`/api/vendor/bookings/${encodeURIComponent(id)}`),
};

export const blockedDates = {
  create: (input: { date: string; reason: string; type: BlockedDateType }) =>
    api.post<{ blockedDate: BlockedDate }>('/api/vendor/blocked-dates', input).then((r) => r.blockedDate),
  remove: (id: string) => api.delete<unknown>(`/api/vendor/blocked-dates/${encodeURIComponent(id)}`),
};

export const storefront = {
  /**
   * Returns `{application, profile, file}` all null before the vendor has an
   * application or a seeded workspace, so every caller must handle nulls.
   */
  file: () => api.get<VendorFile & { success: boolean }>('/api/me/vendor-file'),
};

export const socials = {
  read: () => api.get<Wrapped<VendorSocials>>('/api/vendor/socials').then((r) => r.data),
  /**
   * The body is a FLAT map of network → handle plus `confirmedOwn` — the server's
   * `parseVendorSocials` reads `body[network]`, not a `links` array. An empty
   * string clears that network.
   */
  save: (input: Partial<Record<SocialNetwork, string>> & { confirmedOwn: boolean }) =>
    api.put<Wrapped<VendorSocials>>('/api/vendor/socials', input).then((r) => r.data),
};

/**
 * Listing photos must already be on the server before the listing is saved:
 * `parseListingImages` keeps only `/uploads/…` URLs and silently drops a
 * `data:` one, which surfaces as "أضف صورتين على الأقل" on an apparently full
 * form. So every picked file is uploaded here first.
 */
export const uploads = {
  image: (dataUrl: string) =>
    api.post<{ url: string }>('/api/uploads', { prefix: 'listing', dataUrl }).then((r) => r.url),
};
