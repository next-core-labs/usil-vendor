import { CheckCircle2, ChevronLeft, Clock } from 'lucide-react';
import type { MissingKey } from '../../api/types.ts';
import { navigate } from '../../lib/router.ts';
import { useAccount } from '../../state/AccountContext.tsx';

/** Every check in `missingForApproval`, so progress reads as «n of 6». */
const TOTAL_CHECKS = 6;

const ROUTE_FOR: Record<MissingKey, string> = {
  names: 'storefront',
  nationalId: 'storefront',
  bank: 'storefront',
  fulfillment: 'storefront',
  socials: 'socials',
  listings: 'listings',
};

/**
 * The pending vendor's to-do list, on every screen: the same items the owner
 * sees, and approval is refused until it is empty.
 */
export function PendingBanner() {
  const { mode, missing } = useAccount();
  if (mode !== 'pending') return null;

  const done = TOTAL_CHECKS - missing.length;
  const complete = missing.length === 0;

  return (
    <section
      aria-label="حالة متجرك"
      className="rounded-xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 text-ink" aria-hidden>
          {complete ? <CheckCircle2 size={18} /> : <Clock size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {complete ? 'ملفك مكتمل — بانتظار موافقة إدارة يوصل' : 'متجرك قيد المراجعة — أكمل هذي الخطوات'}
          </p>
          <p className="mt-0.5 text-[13px] leading-6 text-ink-secondary">
            {complete
              ? 'نراجع متجرك ونرسل لك بريداً عند الاعتماد. تقدر تضيف منتجات أكثر وأنت تنتظر.'
              : 'منتجاتك محفوظة، وتظهر للعملاء بعد موافقة الإدارة. الإدارة ما تقدر تعتمد متجرك قبل اكتمال الملف.'}
          </p>
        </div>
        <span className="tabular shrink-0 text-xs font-medium text-ink-secondary">
          {done} / {TOTAL_CHECKS}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--warning)_25%,transparent)]" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / TOTAL_CHECKS) * 100}%` }} />
      </div>

      {complete ? null : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {missing.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => navigate(ROUTE_FOR[item.key])}
                className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {item.label}
                <ChevronLeft size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
