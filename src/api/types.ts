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
  bookingMode: BookingMode;
};

/* ── Calendar ───────────────────────────────────────────────────────── */

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
  application: { status: ApplicationStatus; rejectReason?: string; createdAt: string } | null;
  profile: VendorOwnProfile | null;
  file: VendorPublicFile | null;
};

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
