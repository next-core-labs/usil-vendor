import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { NAV, labelForRoute } from './nav.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { useTheme, type Theme } from '../../lib/theme.ts';
import { useSession } from '../../state/SessionContext.tsx';
import { ROLE_LABEL } from '../../lib/labels.ts';
import { count, initials } from '../../lib/format.ts';
import { useUnread } from '../../state/UnreadContext.tsx';
import { Button } from '../ui/primitives.tsx';

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'فاتح', icon: Sun },
  { value: 'dark', label: 'داكن', icon: Moon },
  { value: 'system', label: 'النظام', icon: Monitor },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-sunken p-0.5" role="group" aria-label="مظهر اللوحة">
      {THEMES.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-label={option.label}
            aria-pressed={active}
            title={option.label}
            className={`rounded-md p-1.5 transition-colors ${
              active ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const route = useRoute();
  const unread = useUnread();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-ink-muted">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = route === item.route;
              const badge = item.badge ? unread[item.badge] : 0;
              return (
                <li key={item.route}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(item.route);
                      onNavigate?.();
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-[var(--accent-wash)] font-medium text-accent'
                        : 'text-ink-secondary hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="flex-1 text-start">{item.label}</span>
                    {badge > 0 ? (
                      <span
                        className="tabular rounded-full bg-[var(--critical)] px-1.5 py-0.5 text-[11px] font-semibold text-white"
                        aria-label={`${count(badge)} رسائل غير مقروءة`}
                      >
                        {count(badge)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
        يو
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-ink">يوصل</p>
        <p className="text-[11px] text-ink-muted">لوحة المورّد</p>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { user, signOut } = useSession();
  const [drawer, setDrawer] = useState(false);

  // The drawer is a mobile affordance; a route change must always close it.
  useEffect(() => {
    setDrawer(false);
  }, [route]);

  return (
    <div className="flex min-h-full">
      {/* Sidebar — permanent from lg up, a drawer below it. */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <Brand />
        <NavList />
        <div className="border-t border-line p-3">
          <ThemeToggle />
        </div>
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} />
          <aside className="rise absolute inset-y-0 start-0 flex w-64 flex-col border-e border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line pe-2">
              <Brand />
              <Button
                variant="ghost"
                size="sm"
                aria-label="إغلاق القائمة"
                onClick={() => setDrawer(false)}
                icon={<X size={16} />}
              />
            </div>
            <NavList onNavigate={() => setDrawer(false)} />
            <div className="border-t border-line p-3">
              <ThemeToggle />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:ms-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-label="فتح القائمة"
            onClick={() => setDrawer(true)}
            icon={<Menu size={18} />}
          />
          <p className="flex-1 truncate text-sm font-medium text-ink">{labelForRoute(route)}</p>

          <div className="flex items-center gap-3">
            <div className="hidden text-end sm:block">
              <p className="text-[13px] font-medium leading-tight text-ink">{user?.name}</p>
              <p className="text-[11px] text-ink-muted">{user ? ROLE_LABEL[user.role] : ''}</p>
            </div>
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-sunken text-xs font-semibold text-ink-secondary">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initials(user?.name || '')
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              icon={<LogOut size={16} />}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
