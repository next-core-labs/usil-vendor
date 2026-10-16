import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Store } from 'lucide-react';
import { applications } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import type { PublicUser, QuickSignupDraft } from '../api/types.ts';
import { Button, Field, Input, Select } from '../components/ui/primitives.tsx';
import { PASSWORD_MIN_LENGTH, PROJECT_TYPES, PROJECT_TYPE_OTHER } from '../lib/labels.ts';

/** A random password the server never stores — see `account` below. */
function unusedPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The short sign-up: enough to open the dashboard. Products, bank details, ID
 * and socials are added from inside, and the owner approves once it is all there.
 *
 * With `account` (a signed-in non-vendor applying again), the application is
 * filed under that account: email and phone must stay its own or the server
 * answers 409, and its password is never rewritten, so none is asked for.
 */
export function Register({
  account = null,
  onCancel,
  onSubmitted,
}: {
  account?: PublicUser | null;
  onCancel: () => void;
  onSubmitted: (message: string) => void | Promise<void>;
}) {
  const signedIn = Boolean(account);
  const [form, setForm] = useState<QuickSignupDraft & { passwordConfirm: string }>({
    name: account?.name || '',
    projectName: '',
    projectType: '',
    projectTypeOther: '',
    email: account?.email || '',
    phone: account?.phone || '',
    password: '',
    passwordConfirm: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!signedIn && form.password !== form.passwordConfirm) {
      setError('تأكيد الرقم السري لا يطابق الرقم السري');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { passwordConfirm: _confirm, ...draft } = form;
      const result = await applications.signup({
        ...draft,
        password: signedIn ? unusedPassword() : form.password,
      });
      await onSubmitted(result.message || 'أهلاً بك في يوصل! أضف منتجاتك وأكمل ملفك.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <div className="mb-6">
        <span className="mb-4 grid size-10 place-items-center rounded-xl bg-[var(--accent-wash)] text-accent">
          <Store size={20} />
        </span>
        <h2 className="text-xl font-semibold text-ink">{signedIn ? 'افتح متجرك من جديد' : 'افتح متجرك في يوصل'}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">
          دقيقة وحدة: سجّل وادخل لوحتك مباشرة، أضف منتجاتك وأكمل ملفك، وتراجعه إدارة يوصل للاعتماد.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="اسمك">
          <Input
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="الاسم الأول والعائلة"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المتجر">
            <Input
              required
              autoComplete="organization"
              value={form.projectName}
              onChange={(e) => set('projectName', e.target.value)}
            />
          </Field>
          <Field label="نوع المشروع">
            <Select required value={form.projectType} onChange={(e) => set('projectType', e.target.value)}>
              <option value="">اختر</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {form.projectType === PROJECT_TYPE_OTHER ? (
          <Field label="اكتب نوع مشروعك">
            <Input required value={form.projectTypeOther} onChange={(e) => set('projectTypeOther', e.target.value)} />
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="البريد الإلكتروني">
            <Input
              required
              type="email"
              dir="ltr"
              autoComplete="email"
              readOnly={signedIn}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="you@example.com"
              className="text-start"
            />
          </Field>
          <Field label="رقم الجوال (اختياري)">
            <Input
              type="tel"
              dir="ltr"
              autoComplete="tel"
              readOnly={signedIn}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="05xxxxxxxx"
              className="text-start"
            />
          </Field>
        </div>
        {signedIn ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الرقم السري">
              <div className="relative">
                <Input
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder={`${PASSWORD_MIN_LENGTH} خانات على الأقل`}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'إخفاء الرقم السري' : 'إظهار الرقم السري'}
                  className="absolute inset-y-0 end-2.5 my-auto text-ink-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="تأكيد الرقم السري">
              <Input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.passwordConfirm}
                onChange={(e) => set('passwordConfirm', e.target.value)}
              />
            </Field>
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] text-ink"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" busy={busy} className="w-full">
          {signedIn ? 'افتح متجري' : 'سجّل وادخل لوحتي'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          {signedIn ? 'إلغاء' : 'عندي حساب — تسجيل الدخول'}
        </Button>
      </div>
    </form>
  );
}
