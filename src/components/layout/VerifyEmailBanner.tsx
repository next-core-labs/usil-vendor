import { useState, type FormEvent } from 'react';
import { MailWarning } from 'lucide-react';
import { auth } from '../../api/endpoints.ts';
import { errorText } from '../../api/client.ts';
import { useSession } from '../../state/SessionContext.tsx';
import { useToast } from '../../state/ToastContext.tsx';
import { Button, Input } from '../ui/primitives.tsx';

/**
 * `emailVerified: false` is the server's `needsEmailVerification`: login has
 * already emailed a 6-digit code, so the vendor confirms it here on any screen.
 */
export function VerifyEmailBanner() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  if (!user || user.emailVerified !== false) return null;
  const email = user.email;

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy('verify');
    try {
      const result = await auth.verifyEmail(email, code.replace(/\D/g, ''));
      toast.success(result.message || 'تم تأكيد بريدك الإلكتروني.');
      // The fresh session carries `emailVerified: true`, which hides this banner.
      await refresh();
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('resend');
    try {
      const result = await auth.resendVerification(email);
      if (result.verificationCode) setCode(result.verificationCode);
      toast.success(result.message || 'أرسلنا رمزاً جديداً إلى بريدك.');
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="تأكيد البريد الإلكتروني"
      className="rounded-xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ink" aria-hidden>
          <MailWarning size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">بريدك الإلكتروني غير مؤكد</p>
          <p className="mt-0.5 text-[13px] leading-6 text-ink-secondary">
            أرسلنا رمزاً من 6 أرقام إلى{' '}
            <span dir="ltr" className="break-all font-medium text-ink">
              {email}
            </span>
            . أدخله هنا لتأكيد بريدك، أو اطلب رمزاً جديداً.
          </p>
        </div>
      </div>

      <form onSubmit={verify} className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          placeholder="000000"
          aria-label="رمز التأكيد"
          className="tabular h-9 w-32 text-center tracking-[0.3em]"
        />
        <Button type="submit" size="sm" variant="primary" busy={busy === 'verify'} disabled={code.length !== 6 || busy !== null}>
          تأكيد البريد
        </Button>
        <Button size="sm" variant="ghost" busy={busy === 'resend'} disabled={busy !== null} onClick={() => void resend()}>
          إرسال رمز جديد
        </Button>
      </form>
    </section>
  );
}
