import {
  Boxes,
  CalendarCheck,
  FileSignature,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Palette,
  Receipt,
  Share2,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  route: string;
  label: string;
  icon: LucideIcon;
  /** Which counter, if any, badges this item. */
  badge?: 'chats' | 'orders';
};
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: 'التشغيل',
    items: [
      { route: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
      { route: 'orders', label: 'طلبات المتجر', icon: Inbox, badge: 'orders' },
      { route: 'calendar', label: 'التقويم والحجوزات', icon: CalendarCheck },
      { route: 'contracts', label: 'العقود', icon: FileSignature },
      { route: 'quotations', label: 'عروض الأسعار', icon: FileSpreadsheet },
      { route: 'chats', label: 'المحادثات', icon: MessagesSquare, badge: 'chats' },
    ],
  },
  {
    title: 'المالية',
    items: [
      { route: 'earnings', label: 'الأرباح والسحب', icon: Wallet },
      { route: 'invoices', label: 'الفواتير', icon: Receipt },
      { route: 'expenses', label: 'المصروفات وقائمة الدخل', icon: TrendingUp },
    ],
  },
  {
    title: 'متجري',
    items: [
      { route: 'listings', label: 'منتجاتي', icon: Package },
      { route: 'inventory', label: 'المخزون', icon: Boxes },
      { route: 'storefront', label: 'ملفي التجاري', icon: Store },
      { route: 'brand', label: 'الهوية والفواتير', icon: Palette },
      { route: 'socials', label: 'حسابات التواصل', icon: Share2 },
    ],
  },
];

/** Sections that need a live store: hidden until the owner approves the vendor. */
/** Sections that need a live store; brand, listings, profile and socials stay open to prepare it. */
export const PENDING_HIDDEN_ROUTES = [
  'orders',
  'calendar',
  'contracts',
  'quotations',
  'chats',
  'earnings',
  'invoices',
  'expenses',
  'inventory',
];

export function labelForRoute(route: string): string {
  for (const group of NAV) {
    const found = group.items.find((item) => item.route === route);
    if (found) return found.label;
  }
  return 'نظرة عامة';
}
