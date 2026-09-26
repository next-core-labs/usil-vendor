import type {
  ApplicationStatus,
  BlockedDateType,
  BookingMode,
  FulfillmentLane,
  PriceUnit,
  SocialLinkStatus,
  SocialNetwork,
} from '../api/types.ts';

/** Mirrors `server/auth/roles.ts`. */
export const ROLE_LABEL: Record<string, string> = {
  client: 'عميل',
  vendor: 'مورّد',
  admin: 'مدير كل الحسابات',
  accounts_manager: 'مدير الحسابات',
  courier: 'مندوب توصيل',
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

/* ── Listing vocabulary — mirrors `server/vendors/vendor-listings.ts` ──
   The server rejects anything outside these sets, so the keys must match it
   exactly. Wording is shared with the storefront so a vendor reads the same
   words the customer does. */

export const FULFILLMENT_LANES: FulfillmentLane[] = ['hour', 'same_day', 'tomorrow', 'instant'];

export const FULFILLMENT_LABEL: Record<FulfillmentLane, string> = {
  hour: 'يوصل ساعة',
  same_day: 'يوصل اليوم',
  tomorrow: 'يوصل بكرا',
  instant: 'حجز فوري',
};

export const BOOKING_MODES: BookingMode[] = ['instant', 'approval'];

export const BOOKING_MODE_LABEL: Record<BookingMode, string> = {
  instant: 'حجز فوري',
  approval: 'بموافقة المورّد',
};

export const BOOKING_MODE_HINT: Record<BookingMode, string> = {
  instant: 'العميل يحجز ويتأكد مباشرة',
  approval: 'الطلب ينتظر موافقتك قبل التأكيد',
};

export const PRICE_UNITS: PriceUnit[] = ['للمناسبة', 'للساعة', 'للشخص', 'لليوم', 'للوحدة'];

export const CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'hospitality', name: 'ضيافة وقهوة' },
  { id: 'buffet', name: 'بوفيه ومأكولات' },
  { id: 'decoration', name: 'تنسيق وديكور' },
  { id: 'photography', name: 'تصوير وتوثيق' },
  { id: 'entertainment', name: 'ألعاب وترفيه' },
  { id: 'halls', name: 'قاعات واستراحات' },
  { id: 'rental', name: 'كراسي وطاولات وتأجير' },
  { id: 'servers', name: 'صبابين وصبابات' },
  { id: 'av', name: 'صوت وإضاءة وشاشات' },
  { id: 'tents', name: 'خيام ومظلات' },
  { id: 'zaffa', name: 'زفة وفرق شعبية' },
  { id: 'cakes', name: 'كيك وحلويات المناسبات' },
  { id: 'invitations', name: 'دعوات وهدايا تذكارية' },
  { id: 'parking', name: 'تنظيم مواقف وحشود' },
  { id: 'condolence', name: 'عزاء وتجهيز مجالس' },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((item) => [item.id, item.name]),
);

export const LISTING_MIN_IMAGES = 2;
export const LISTING_MAX_IMAGES = 8;

/* ── Calendar ───────────────────────────────────────────────────────── */

export const BLOCKED_DATE_TYPES: BlockedDateType[] = ['full_day', 'maintenance', 'holiday', 'custom'];

export const BLOCKED_DATE_LABEL: Record<BlockedDateType, string> = {
  full_day: 'يوم كامل',
  maintenance: 'صيانة',
  holiday: 'إجازة',
  custom: 'إغلاق مخصص',
};

/** The values this dashboard writes. The server accepts only its canonical set (VENDOR_BOOKING_STATUSES in vendor-store.ts), which includes these. */
export const BOOKING_STATUSES = ['مؤكد', 'قيد التنفيذ', 'مكتمل', 'ملغي'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * Mirrors `REVENUE_BOOKING_STATUSES` in `server/vendors/vendor-store.ts`: only
 * these count toward revenue. Cancelled, rejected, pending-approval and
 * unpaid-deposit bookings do not.
 */
export const REVENUE_BOOKING_STATUSES: readonly string[] = [
  'confirmed',
  'in_progress',
  'completed',
  'مؤكد',
  'قيد التنفيذ',
  'مكتمل',
];

export function isRevenueBooking(booking: { status?: string }): boolean {
  return REVENUE_BOOKING_STATUSES.includes(String(booking.status || ''));
}

/* ── Socials — mirrors `server/vendors/vendor-socials.ts` ───────────── */

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  'instagram',
  'tiktok',
  'snapchat',
  'x',
  'youtube',
  'whatsapp',
];

export const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: 'إنستغرام',
  tiktok: 'تيك توك',
  snapchat: 'سناب شات',
  x: 'إكس (تويتر)',
  youtube: 'يوتيوب',
  whatsapp: 'واتساب أعمال',
};

export const SOCIAL_PLACEHOLDER: Record<SocialNetwork, string> = {
  instagram: '@yourbrand أو instagram.com/yourbrand',
  tiktok: '@yourbrand أو tiktok.com/@yourbrand',
  snapchat: 'اسم المستخدم أو snapchat.com/add/yourbrand',
  x: '@yourbrand أو x.com/yourbrand',
  youtube: '@yourbrand أو youtube.com/@yourbrand',
  whatsapp: '05xxxxxxxx',
};

export const SOCIAL_STATUS_LABEL: Record<SocialLinkStatus, string> = {
  pending: 'بانتظار الإقرار',
  linked: 'مربوط',
  verified: 'موثّق من الإدارة',
};

export function labelFor(map: Record<string, string>, key: string | undefined | null): string {
  if (!key) return '—';
  return map[key] || key;
}
