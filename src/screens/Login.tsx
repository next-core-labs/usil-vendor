import { useState, type FormEvent } from 'react';
import { Store } from 'lucide-react';
import { useSession } from '../state/SessionContext.tsx';
import { Button, Field, Input } from '../components/ui/primitives.tsx';

export function Login() {
  const { signIn, error } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
      <div className="relative hidden overflow-hidden bg-accent p-12 lg:flex lg:flex-col lg:justify-between">
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
        <p className="relative text-xs text-white/60">هذه اللوحة لأصحاب المتاجر المعتمدين في يوصل.</p>
      </div>

      <div className="flex items-center justify-center p-6">
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

            <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              أبقني مسجّلاً لمدة ٣٠ يوماً
            </label>

            {error ? (
              <p className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] text-ink">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" busy={busy} className="w-full">
              دخول
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Signed in, but not with a role the vendor API will accept. */
export function NotAuthorized({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[var(--critical-wash)] text-[var(--critical)]">
          <Store size={22} />
        </span>
        <h1 className="text-xl font-semibold text-ink">هذا الحساب لا يملك صلاحية اللوحة</h1>
        <p className="mt-2 text-sm leading-7 text-ink-secondary">
          دخلت باسم {name}، ولوحة المورّد متاحة لحسابات المورّدين المعتمدين فقط. إذا قدّمت طلب
          انضمام ولم يُعتمد بعد، راجع بريدك أو تواصل مع إدارة يوصل.
        </p>
        <Button variant="secondary" className="mt-5" onClick={onSignOut}>
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
