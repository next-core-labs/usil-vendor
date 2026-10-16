import { useState, type FormEvent } from 'react';
import { Store, UserPlus } from 'lucide-react';
import { useSession } from '../state/SessionContext.tsx';
import { Button, Field, Input } from '../components/ui/primitives.tsx';
import { ResetPassword } from './ResetPassword.tsx';
import { Register } from './Register.tsx';
import { navigate } from '../lib/router.ts';

export function Login() {
  const { signIn, error, refresh } = useSession();
  // The storefront's «انضم كمورّد» links here with `?email=` once the account exists.
  const [identifier, setIdentifier] = useState(() => new URLSearchParams(window.location.search).get('email') || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset' | 'register'>('login');
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await signIn(identifier.trim(), password, remember);
    } catch {
      // `error` from the session carries the server's Arabic wording.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Brand panel — decorative, so it is dropped entirely on small screens. */}
      <div className="hidden overflow-hidden bg-accent p-12 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -start-24 size-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/15 text-sm font-bold text-white">
            يو
          </span>
          <p className="text-base font-semibold text-white">يوصل</p>
        </div>
        <div className="relative">
          <h1 className="text-3xl font-semibold leading-snug text-white">لوحة المورّد</h1>
          <p className="mt-3 max-w-sm text-sm leading-7 text-white/80">
            منتجاتك وتقويمك وحجوزاتك وملفك التجاري — كلها من مكان واحد، متصلة مباشرة بخادم يوصل.
          </p>
        </div>
        <p className="relative text-xs text-white/60">سجّل متجرك، ويفتح لك فريق يوصل اللوحة بعد مراجعة طلبك.</p>
      </div>

      <div className="flex items-center justify-center p-6 py-10">
        {mode === 'register' ? (
          <Register
            onCancel={() => setMode('login')}
            onSubmitted={async (message) => {
              // The server signs the new vendor in; open the dashboard on their products.
              const user = await refresh().catch(() => null);
              if (user) {
                navigate('listings');
                return;
              }
              setMode('login');
              setNotice(message);
            }}
          />
        ) : mode === 'reset' ? (
          <ResetPassword
            initialEmail={identifier.trim()}
            onDone={(message) => {
              setMode('login');
              setNotice(message || null);
              setPassword('');
            }}
          />
        ) : (
          <form onSubmit={onSubmit} className="w-full max-w-sm">
            <div className="mb-7">
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-[var(--accent-wash)] text-accent lg:hidden">
                <Store size={20} />
              </span>
              <h2 className="text-xl font-semibold text-ink">تسجيل الدخول</h2>
              <p className="mt-1 text-sm text-ink-secondary">ادخل ببريد حسابك في يوصل.</p>
            </div>

            <div className="space-y-4">
              <Field label="البريد الإلكتروني">
                <Input
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="vendor@usil.app"
                  className="text-start"
                />
              </Field>

              <Field label="الرقم السري">
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  أبقني مسجّلاً لمدة ٣٠ يوماً
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setMode('reset');
                  }}
                  className="shrink-0 text-[13px] font-medium text-accent hover:underline"
                >
                  نسيت الرقم السري؟
                </button>
              </div>

              {notice ? (
                <p className="rounded-lg border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-secondary">{notice}</p>
              ) : null}
              {error && !notice ? (
                <p className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] text-ink">
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="primary" busy={busy} className="w-full">
                دخول
              </Button>
            </div>

            <div className="mt-6 border-t border-line pt-5 text-center">
              <p className="text-[13px] text-ink-secondary">ما عندك حساب مورّد؟</p>
              <Button
                variant="secondary"
                icon={<UserPlus size={15} />}
                className="mt-2 w-full"
                onClick={() => {
                  setNotice(null);
                  setMode('register');
                }}
              >
                سجّل كمورّد جديد
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
