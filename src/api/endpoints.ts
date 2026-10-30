import { api } from './client.ts';
import type {
  BlockedDate,
  BlockedDateType,
  ChatMessage,
  Conversation,
  ConversationSummary,
  ListingDraft,
  PlatformOrder,
  PublicUser,
  SocialNetwork,
  VendorBooking,
  VendorFile,
  VendorListing,
  VendorSocials,
  VendorSummary,
  MissingItem,
  QuickSignupDraft,
  VendorApplicationRow,
  VendorDetailsDraft,
  VendorWorkspace,
  VendorHubRow,
} from './types.ts';

type Listed<T> = { data: T[] };
type Wrapped<T> = { data: T };

export const auth = {
  /** `user` is null when no session cookie is present — not an error. */
  me: () => api.get<{ user: PublicUser | null }>('/api/auth/me'),
  /**
   * The server reads `identifier` as an email, or as a Saudi mobile when it
   * has no `@`, so sign-in sends `identifier`, not `email`.
   */
  login: (identifier: string, password: string, remember: boolean) =>
    api.post<{ user: PublicUser; needsEmailVerification: boolean }>('/api/auth/login', {
      identifier,
      password,
      remember,
    }),
  logout: () => api.post<unknown>('/api/auth/logout'),
  /**
   * Emails a 6-digit reset code. The answer is the same for unknown emails;
   * `resetCode` only comes back on a local server with no mail configured.
   */
  forgotPassword: (email: string) =>
    api.post<{ message?: string; resetCode?: string }>('/api/auth/forgot-password', { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post<{ message?: string }>('/api/auth/reset-password', { email, code, newPassword }),
  /**
   * Login already emails a code to an unconfirmed account; this sends a fresh
   * one. The session cookie proves ownership, so no mobile is needed.
   * `verificationCode` only comes back on a local server with no mail configured.
   */
  resendVerification: (email: string) =>
    api.post<{ message?: string; emailSent?: boolean; verificationCode?: string }>(
      '/api/auth/resend-verification',
      { email },
    ),
  verifyEmail: (email: string, code: string) =>
    api.post<{ user?: PublicUser; message?: string }>('/api/auth/verify-email', { email, code }),
};

export const applications = {
  /**
   * A new email gets a client account, signed in on the spot, with access to
   * the dashboard while pending. It becomes a vendor account — and its
   * products public — only when the owner approves.
   */
  signup: (draft: QuickSignupDraft) =>
    api.post<{ user: PublicUser | null; message?: string }>('/api/vendor-signup', draft),
  /** The whole file while pending; once approved, only the fields `missing` names (the server drops the rest). */
  saveDetails: (draft: VendorDetailsDraft) =>
    api.put<{ application: VendorApplicationRow; missing: MissingItem[] }>('/api/vendor/application', draft),
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

/** Store orders: approval-mode orders wait here for the vendor; paid ones move through delivery. */
export const orders = {
  list: () => api.get<Listed<PlatformOrder>>('/api/bookings').then((r) => r.data),
  /** `reason` goes with a rejection or cancellation and is shown to the client. */
  setStatus: (id: string, status: string, reason?: string) =>
    api
      .patch<{ booking: PlatformOrder }>(`/api/bookings/${encodeURIComponent(id)}`, reason ? { status, reason } : { status })
      .then((r) => r.booking),
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

export const chats = {
  /** The vendor's own threads, newest activity first. */
  list: () => api.get<Listed<ConversationSummary>>('/api/chats').then((r) => r.data),
  /** A single count, cheap enough to poll for the sidebar badge. */
  unread: () => api.get<Wrapped<{ count: number }>>('/api/chats/unread').then((r) => r.data.count),
  /**
   * A vendor can only START a thread with the Usil team — client threads are
   * opened by the client from the storefront. The server infers the vendor
   * from the session, so no `vendorId` is sent. There are no empty threads:
   * this creates the team thread with its first message or appends to it.
   */
  startTeamThread: (body: string) =>
    api.post<Wrapped<Conversation>>('/api/chats', { body }).then((r) => r.data),
  /** With `after`, only newer messages come back; an id the server no longer has returns them all. */
  get: (id: string, after?: string) =>
    api
      .get<Wrapped<Conversation>>(
        `/api/chats/${encodeURIComponent(id)}${after ? `?after=${encodeURIComponent(after)}` : ''}`,
      )
      .then((r) => r.data),
  send: (id: string, body: string) =>
    api.post<Wrapped<ChatMessage>>(`/api/chats/${encodeURIComponent(id)}/messages`, { body }).then((r) => r.data),
  markRead: (id: string) => api.post<unknown>(`/api/chats/${encodeURIComponent(id)}/read`),
};

/** Supervisors (admin, accounts manager) pick which vendor's dashboard to open. */
export const supervision = {
  hubs: () => api.get<Listed<VendorHubRow>>('/api/admin/vendor-hubs').then((r) => r.data),
};
