/**
 * «عملائي» (office key `clients`) — the vendor's own clients from outside the
 * platform: people who booked by WhatsApp, Instagram, a phone call or word of
 * mouth. The vendor types them in; nothing here comes from store orders.
 */
import { phoneToWhatsApp } from '../../lib/whatsappTemplates.ts';

export type ClientKind = 'person' | 'company';

export const CLIENT_KINDS: ClientKind[] = ['person', 'company'];

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  person: 'فرد',
  company: 'شركة / جهة',
};

/** Where the client first reached the vendor. */
export type ClientSource = 'whatsapp' | 'instagram' | 'snapchat' | 'tiktok' | 'phone' | 'referral' | 'walk_in' | 'other';

export const CLIENT_SOURCES: ClientSource[] = ['whatsapp', 'instagram', 'snapchat', 'tiktok', 'phone', 'referral', 'walk_in', 'other'];

export const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  whatsapp: 'واتساب',
  instagram: 'انستقرام',
  snapchat: 'سناب شات',
  tiktok: 'تيك توك',
  phone: 'اتصال',
  referral: 'معرفة / توصية',
  walk_in: 'زيارة المحل',
  other: 'غير ذلك',
};

export type VendorClient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  kind: ClientKind;
  companyName?: string;
  city: string;
  source: ClientSource;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeClient(raw: unknown, index = 0): VendorClient | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = str(row.name).trim();
  if (!name) return null;
  const createdAt = str(row.createdAt);
  return {
    id: str(row.id) || `row-${index}`,
    name,
    phone: str(row.phone).trim(),
    email: str(row.email).trim(),
    kind: oneOf(row.kind, CLIENT_KINDS, 'person'),
    companyName: str(row.companyName).trim() || undefined,
    city: str(row.city).trim(),
    source: oneOf(row.source, CLIENT_SOURCES, 'other'),
    notes: str(row.notes).trim() || undefined,
    createdAt,
    updatedAt: str(row.updatedAt) || createdAt,
  };
}

export function newClientId(): string {
  return `cl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** `0551234567`, `+966551234567` and `966 55 123 4567` are the same client. */
export function samePhone(a: string, b: string): boolean {
  const left = phoneToWhatsApp(a);
  return left.length >= 9 && left === phoneToWhatsApp(b);
}

/** The client already saved under this phone, other than `exceptId`. */
export function clientWithPhone(clients: VendorClient[], phone: string, exceptId?: string): VendorClient | undefined {
  return clients.find((row) => row.id !== exceptId && samePhone(row.phone, phone));
}

export function clientMatches(row: VendorClient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && row.phone.replace(/\D/g, '').includes(digits)) return true;
  return [row.name, row.companyName, row.email, row.city, row.notes].some((value) => (value || '').toLowerCase().includes(q));
}
