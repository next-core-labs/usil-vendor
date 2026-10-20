/**
 * Shapes mirrored from the backend (`../usil backend/server/**`). Only the
 * fields this dashboard actually reads are declared — the API returns more on
 * some rows, and widening a type here without checking the server is how a
 * dashboard starts rendering `undefined`.
 */

export type AccountRole = 'client' | 'vendor' | 'admin' | 'accounts_manager' | 'courier';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
  avatarUrl: string;
  emailVerified: boolean;
};

/* ── Listings ───────────────────────────────────────────────────────── */

export type FulfillmentLane = 'hour' | 'same_day' | 'tomorrow' | 'instant';
export type BookingMode = 'instant' | 'approval';
export type PriceUnit = 'للمناسبة' | 'للساعة' | 'للشخص' | 'لليوم' | 'للوحدة';
/** `LISTING_AUDIENCE_IDS` in `server/vendors/vendor-listings.ts`. */
export type ListingAudience = 'women' | 'men' | 'family' | 'corporate';

/** `server/vendors/vendor-listings.ts` → `VendorListing`. */
export type VendorListing = {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  category: string;
  categoryName: string;
  shortDesc: string;
  price: number;
  priceUnit: PriceUnit;
  cities: string[];
  images?: string[];
  /** Legacy single-image field the server mirrors from `images[0]`. */
  image?: string;
  fulfillment: FulfillmentLane[];
  /** Empty or missing: suits every audience. */
  audiences?: ListingAudience[];
  bookingMode: BookingMode;
  createdAt: string;
  updatedAt: string;
};

/** What the listing modal submits. The server validates and fills the rest. */
export type ListingDraft = {
  title: string;
  category: string;
  shortDesc: string;
  price: number;
  priceUnit: PriceUnit;
  cities: string[];
  images: string[];
  fulfillment: FulfillmentLane[];
  /** Empty = everyone in the store's «الجمهور» filter. */
  audiences: ListingAudience[];
  bookingMode: BookingMode;
};

/* ── Calendar ───────────────────────────────────────────────────────── */

/** A store order as `GET /api/bookings` returns it to a vendor (only this vendor's lines). */
export type PlatformOrder = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  /** The headline listing; cleared when it is another vendor's line. */
  serviceId?: string;
  serviceName: string;
  notes?: string;
  city?: string;
  eventDate: string;
  eventTime?: string;
  items?: Array<{ id: string; title: string; quantity: number; price: number; vendorId?: string }>;
  totalAmount: number;
  bookingMode?: 'instant' | 'approval';
  status: string;
  paymentStatus: 'unpaid' | 'paid';
  /** Moyasar pay link, set once the client can pay. */
  paymentUrl?: string;
  /** UTC `YYYY-MM-DD HH:mm`. */
  createdAt?: string;
};

/** `server/vendors/vendor-store.ts` → `VendorBookingRecord`. */
export type VendorBooking = {
  id: string;
  bookingNumber: string;
  serviceId: string;
  serviceTitle: string;
  customerName: string;
  customerPhone: string;
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  venueName: string;
  guestCount: number;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  source: string;
  status: string;
  notes?: string;
  createdAt: string;
};

export type BlockedDateType = 'full_day' | 'maintenance' | 'holiday' | 'custom';

export type BlockedDate = {
  id: string;
  date: string;
  reason: string;
  type: BlockedDateType;
};

/**
 * `GET /api/vendor/workspace`. `inventoryItems` and `contracts` are untyped
 * buckets on the server (`Record<string, unknown>` with an `id`), so they are
 * counted here and never rendered field by field.
 */
export type VendorWorkspace = {
  bookings: VendorBooking[];
  blockedDates: BlockedDate[];
  inventoryItems: Array<{ id: string }>;
  contracts: Array<{ id: string }>;
  listings: VendorListing[];
  socials?: VendorSocials;
  updatedAt: string;
};

export type VendorSummary = {
  bookingCount: number;
  blockedDateCount: number;
  inventoryCount: number;
  listingCount: number;
  revenue: number;
  updatedAt: string;
};

/* ── Storefront file ────────────────────────────────────────────────── */

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

/** `server/vendors/vendor-profile.ts` → `VendorOwnProfile`. */
export type VendorOwnProfile = {
  vendorId: string;
  status: ApplicationStatus;
  projectName: string;
  personName: string;
  projectType: string;
  logoUrl?: string;
  email: string;
  phone: string;
  fulfillment: string[];
  commercialRegister?: string;
  socials?: VendorSocials;
  listingCount: number;
};

export type VendorPublicFile = {
  vendorId: string;
  projectName: string;
  personName: string;
  projectType: string;
  logoUrl?: string;
  fulfillment: string[];
  socials: VendorSocialLink[];
  listingCount: number;
  /** The storefront slug — `/vendor/:id` is what actually resolves publicly. */
  handle: string;
};

/** `GET /api/me/vendor-file`. Every field is null before the vendor applies. */
export type VendorFile = {
  application: VendorApplicationRow | null;
  /** What still blocks approval; empty unless the application is pending. */
  missing?: MissingItem[];
  profile: VendorOwnProfile | null;
  file: VendorPublicFile | null;
};

/** `publicApplication()` — the applicant's own row, without the password hash. */
export type VendorApplicationRow = {
  id: string;
  status: ApplicationStatus;
  rejectReason?: string;
  createdAt: string;
  signup?: 'quick';
  firstName: string;
  fatherName: string;
  familyName: string;
  projectName: string;
  projectType: string;
  projectTypeOther?: string;
  nationalId: string;
  commercialRegister?: string;
  email: string;
  phone: string;
  bankName: string;
  iban: string;
  accountHolderName: string;
  fulfillment: FulfillmentLane[];
  logoUrl?: string;
};

/** `POST /api/vendor-signup` — the short form; everything else is completed in the dashboard. */
export type QuickSignupDraft = {
  name: string;
  projectName: string;
  projectType: string;
  projectTypeOther: string;
  email: string;
  phone: string;
  password: string;
};

/** `PUT /api/vendor/application` — a pending vendor's own details. A sent field must be valid. */
export type VendorDetailsDraft = Partial<{
  firstName: string;
  fatherName: string;
  familyName: string;
  nationalId: string;
  commercialRegister: string;
  projectName: string;
  projectType: string;
  projectTypeOther: string;
  bankName: string;
  iban: string;
  accountHolderName: string;
  fulfillment: FulfillmentLane[];
  logoDataUrl: string;
}>;

/** `missingForApproval` in `server/vendors/vendor-applications.ts`. */
export type MissingKey = 'names' | 'nationalId' | 'bank' | 'fulfillment' | 'socials' | 'listings';
export type MissingItem = { key: MissingKey; label: string };

/* ── Socials ────────────────────────────────────────────────────────── */

export type SocialNetwork = 'instagram' | 'tiktok' | 'snapchat' | 'x' | 'youtube' | 'whatsapp';
export type SocialLinkStatus = 'pending' | 'linked' | 'verified';

export type VendorSocialLink = {
  network: SocialNetwork;
  handle: string;
  url: string;
  status: SocialLinkStatus;
  confirmedOwn: boolean;
  updatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

export type VendorSocials = {
  confirmedOwn: boolean;
  links: VendorSocialLink[];
};

/* ── Chat — mirrors `server/chat/chat-store.ts` ─────────────────────── */

/**
 * In-app chat. A vendor sees two kinds of thread: `client_vendor` (a client
 * who tapped «اسأل المورّد» on a listing or the storefront page) and one
 * `vendor_owner` thread with فريق يوصل. `canAccess` on the server scopes the
 * list to the signed-in vendor's own threads, so nothing here filters by id.
 */
export type ChatSide = 'client' | 'vendor' | 'owner';
export type ChatKind = 'client_vendor' | 'vendor_owner';

/** What a message is about — shown above it as «بخصوص: …». */
export type ChatContext = { type: 'listing' | 'booking'; id: string; title: string };

export type ChatMessage = {
  id: string;
  /** Position in its thread, 1-based and never reused. */
  seq: number;
  side: ChatSide;
  senderId: string;
  senderName: string;
  body: string;
  context?: ChatContext;
  createdAt: string;
};

type ConversationBase = {
  id: string;
  kind: ChatKind;
  vendorId: string;
  vendorName: string;
  /** Present on `client_vendor` threads only. */
  clientId?: string;
  clientName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummary = ConversationBase & { lastMessage: ChatMessage | null; unread: number };

export type Conversation = ConversationBase & { messages: ChatMessage[] };

/** A vendor workspace a supervisor can open (`GET /api/admin/vendor-hubs`). */
export type VendorHubRow = {
  vendorId: string;
  name: string;
  projectName: string;
  email: string;
  status: 'approved' | 'pending' | 'rejected';
  listingCount: number;
  bookingCount: number;
  isOwn: boolean;
};
