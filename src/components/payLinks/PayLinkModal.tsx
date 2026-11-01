import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { Button } from '../ui/primitives.tsx';
import { Modal } from '../ui/Modal.tsx';
import { sar } from '../../lib/format.ts';
import { whatsappChatUrl, whatsappShareUrl } from '../../lib/whatsappTemplates.ts';
import type { PayLink } from '../../api/payLinks.ts';

const KIND_TITLE = { invoice: 'رابط دفع الفاتورة', quotation: 'رابط دفع العربون' } as const;

/** The text the client receives: what it is for, the amount, and the link. */
export function payLinkMessage(link: PayLink, brandName: string): string {
  const what = link.kind === 'invoice' ? `فاتورة رقم ${link.docNumber}` : `عربون عرض السعر ${link.docNumber}`;
  return [
    `مرحباً ${link.clientName}،`,
    `${what}${brandName ? ` من ${brandName}` : ''}.`,
    `المبلغ المطلوب: ${link.amount.toFixed(2)} ر.س شامل الضريبة`,
    'تقدر تدفع بمدى أو البطاقة أو Apple Pay من الرابط:',
    link.url,
    'شكراً لك.',
  ].join('\n');
}

/** Shown once a link is ready: send it by WhatsApp, copy it, or open it. */
export function PayLinkModal({ link, brandName, onClose }: { link: PayLink | null; brandName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  const message = payLinkMessage(link, brandName);
  const whatsapp = whatsappChatUrl(link.clientPhone, message) || whatsappShareUrl(message);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is on screen to copy by hand */
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={KIND_TITLE[link.kind]}
      description={`${link.docNumber} — ${link.clientName || 'العميل'}. يدفع العميل عبر ميسر، ويدخل المبلغ رصيدك بعد عمولة يوصل.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            <MessageCircle size={16} aria-hidden />
            إرسال بواتساب
          </a>
        </>
      }
    >
      <div className="rounded-lg bg-sunken px-4 py-3 text-center">
        <div className="text-xs text-ink-muted">المبلغ المطلوب شامل الضريبة</div>
        <div className="tabular text-xl font-semibold text-ink">{sar(link.amount)}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link.url}
          dir="ltr"
          aria-label="رابط الدفع"
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-xs text-ink-secondary"
        />
        <Button size="sm" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy()}>
          {copied ? 'نُسخ' : 'نسخ'}
        </Button>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="فتح صفحة الدفع"
          title="فتح صفحة الدفع"
          className="inline-flex h-8 items-center rounded-lg px-2.5 text-ink-secondary transition-colors hover:bg-sunken hover:text-ink"
        >
          <ExternalLink size={15} />
        </a>
      </div>
      {!link.clientPhone ? (
        <p className="text-xs text-ink-muted">ما فيه جوال للعميل — واتساب يفتح الرسالة وتختار المحادثة بنفسك.</p>
      ) : null}
    </Modal>
  );
}
