import { useState } from 'react';
import { CheckCircle2, Circle, Copy, ExternalLink, Fingerprint, MessageCircle, ShieldCheck, XCircle } from 'lucide-react';
import type { Contract } from '../../api/contracts.ts';
import { deviceLabel, riyadhStamp, shortHash, signLinkWhatsAppUrl } from '../../lib/contracts.ts';
import { useToast } from '../../state/ToastContext.tsx';
import { Button, Card, CardHeader } from '../ui/primitives.tsx';

/** The signing link with copy, WhatsApp and open. */
export function SignLinkCard({ contract, signUrl, brandName }: { contract: Contract; signUrl: string; brandName: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.failure('ما قدرنا ننسخ الرابط — انسخه يدوياً.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/60 p-2">
        <input
          readOnly
          dir="ltr"
          value={signUrl}
          aria-label="رابط توقيع العقد"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent px-1 font-mono text-xs text-ink outline-none"
        />
        <Button size="sm" icon={copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} onClick={() => void copy()}>
          {copied ? 'نُسخ' : 'نسخ'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={signLinkWhatsAppUrl(contract, signUrl, brandName)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-[#128C4A] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#0f7a40]"
        >
          <MessageCircle size={15} aria-hidden />
          إرسال على واتساب {contract.client.phone ? `(${contract.client.phone})` : ''}
        </a>
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken"
        >
          <ExternalLink size={15} aria-hidden />
          معاينة صفحة العميل
        </a>
      </div>
      <p className="text-xs leading-5 text-ink-muted">
        الرابط سري وخاص بهذا العميل — أي شخص يفتحه يقدر يوقّع، فأرسله للعميل نفسه فقط.
      </p>
    </div>
  );
}

/** Created → sent → signed (or cancelled), with Riyadh times. */
export function ContractTimeline({ contract }: { contract: Contract }) {
  const steps: Array<{ label: string; at?: string; done: boolean; bad?: boolean }> = [
    { label: contract.legacy ? 'أُنشئ في اللوحة القديمة' : 'أُنشئت المسودة', at: contract.createdAt, done: true },
    { label: 'أُرسل للعميل', at: contract.sentAt, done: Boolean(contract.sentAt) },
  ];
  if (contract.status === 'cancelled') steps.push({ label: 'أُلغي العقد', at: contract.cancelledAt, done: true, bad: true });
  else
    steps.push({
      label: contract.legacy ? 'سجّل المورّد توقيعاً (غير موثّق)' : 'وقّع العميل',
      at: contract.signedAt,
      done: contract.status === 'signed',
    });

  return (
    <Card>
      <CardHeader title="مسار العقد" />
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-3">
            {step.bad ? (
              <XCircle size={18} className="mt-0.5 shrink-0 text-[var(--critical)]" aria-hidden />
            ) : step.done ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--good)]" aria-hidden />
            ) : (
              <Circle size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
            )}
            <div>
              <p className={`text-[13px] font-medium ${step.done ? 'text-ink' : 'text-ink-muted'}`}>{step.label}</p>
              {step.at ? <p className="text-xs text-ink-secondary">{riyadhStamp(step.at)}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Evidence of the client's own signature. */
export function SignatureProofCard({ contract }: { contract: Contract }) {
  const signature = contract.signature;
  if (!signature || contract.legacy) return null;
  const rows: Array<[string, string, boolean?]> = [
    ['الاسم كما كتبه العميل', signature.name],
    ['وقت التوقيع', riyadhStamp(signature.signedAt)],
    ['عنوان IP', signature.ip || '—', true],
    ['الجهاز', deviceLabel(signature.userAgent)],
  ];
  return (
    <Card>
      <CardHeader
        title="إثبات توقيع العميل"
        subtitle="وقّع العميل بنفسه على الرابط الخاص بعد الموافقة على البنود."
        action={<ShieldCheck size={18} className="text-[var(--good)]" aria-hidden />}
      />
      {signature.image ? (
        <div className="mb-3 rounded-lg border border-line bg-white p-2">
          <img src={signature.image} alt={`توقيع ${signature.name}`} className="mx-auto h-24 w-auto max-w-full object-contain" />
        </div>
      ) : null}
      <dl className="space-y-2 text-[13px]">
        {rows.map(([label, value, ltr]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-secondary">{label}</dt>
            <dd className={`font-medium text-ink ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
              {value}
            </dd>
          </div>
        ))}
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="flex items-center gap-1 text-ink-secondary">
            <Fingerprint size={14} aria-hidden />
            بصمة المحتوى
          </dt>
          <dd dir="ltr" className="font-mono text-ink" title={signature.contentHash}>
            {shortHash(signature.contentHash)}
          </dd>
        </div>
      </dl>
      {signature.contentHash !== contract.contentHash ? (
        <p className="mt-3 text-xs text-[var(--critical)]">تنبيه: بصمة العقد الحالية لا تطابق البصمة الموقّعة.</p>
      ) : null}
    </Card>
  );
}
