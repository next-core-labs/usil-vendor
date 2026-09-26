import { CalendarCheck, LayoutDashboard, Package, Share2, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = { route: string; label: string; icon: LucideIcon };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: 'التشغيل',
    items: [
      { route: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
      { route: 'calendar', label: 'التقويم والحجوزات', icon: CalendarCheck },
    ],
  },
  {
    title: 'متجري',
    items: [
      { route: 'listings', label: 'منتجاتي', icon: Package },
      { route: 'storefront', label: 'ملفي التجاري', icon: Store },
      { route: 'socials', label: 'حسابات التواصل', icon: Share2 },
    ],
  },
];

export function labelForRoute(route: string): string {
  for (const group of NAV) {
    const found = group.items.find((item) => item.route === route);
    if (found) return found.label;
  }
  return 'نظرة عامة';
}
