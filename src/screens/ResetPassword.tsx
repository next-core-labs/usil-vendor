import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { auth } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { Button, Field, Input } from '../components/ui/primitives.tsx';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Two steps against the shared auth API: the server emails a 6-digit code,
 * then the code plus a new password replaces the old one and signs out every
 * other session.
 */
export function ResetPassword({ initialEmail, onDone }: { initialEmail: string; onDone: (notice?: string) => void }) {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await auth.forgotPassword(email.trim());
      if (result.resetCode) setCode(result.resetCode);
      setNotice(result.message || 'إن كان البريد مسجّلاً فسيصلك رمز من 6 أرقام.');
      setStep('reset');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`الرقم السري يجب ألا يقل عن ${PASSWORD_MIN_LENGTH} خانات.`);
      return;
    }
    setBusy(true);
    try {
      const result = await auth.resetPassword(email.trim(), code.replace(/\D/g, ''), password);
      onDone(result.message || 'تم تغيير الرقم السري. ادخل الآن.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={step === 'request' ? requestCode : resetPassword} className="w-full max-w-sm">
      <div className="mb-7">
        <span className="mb-4 grid size-10 place-items-center rounded-xl bg-[var(--accent-wash)] text-accent">
          <KeyRound size={20} />
        </span>
        <h2 className="text-xl font-semibold text-ink">استعادة الحساب</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {step === 'request'
            ? 'أدخل بريد حسابك ونرسل إليه رمز استعادة من 6 أرقام.'
            : 'أدخل الرمز الذي وصلك على بريدك، ثم الرقم السري الجديد.'}
        </p>
      </div>

      <div className="space-y-4">
        <Field label="البريد الإلكتروني">
          <Input
            type="email"
            dir="ltr"
            autoComplete="username"
            required
            readOnly={step === 'reset'}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vendor@usil.app"
            className="text-start"
          />
        </Field>

        {step === 'reset' ? (
          <>
            <Field label="رمز الاستعادة">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                required
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="text-center font-mono tracking-[0.4em]"
              />
            </Field>
            <Field label="الرقم السري الجديد">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </>
        ) : null}

        {notice && !error ? (
          <p className="rounded-lg border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-secondary">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] text-ink">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" busy={busy} className="w-full">
          {step === 'request' ? 'أرسل الرمز' : 'غيّر الرقم السري'}
        </Button>
        {step === 'reset' ? (
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setStep('request')}>
            لم يصلك الرمز؟ أعد الإرسال
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full" icon={<ArrowRight size={15} />} onClick={() => onDone()}>
          رجوع لتسجيل الدخول
        </Button>
      </div>
    </form>
  );
}
