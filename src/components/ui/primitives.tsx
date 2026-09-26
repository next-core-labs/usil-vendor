import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

/* ── Button ─────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border-transparent',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-sunken',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-transparent text-[var(--critical)] border-[color-mix(in_srgb,var(--critical)_36%,transparent)] hover:bg-[var(--critical-wash)]',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center rounded-lg border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ── Surfaces ───────────────────────────────────────────────────────── */

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] ${padded ? 'p-5' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-secondary">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────── */

export type Tone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'accent';

const TONE_STYLE: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-secondary border-line',
  accent: 'bg-[var(--accent-wash)] text-accent border-[color-mix(in_srgb,var(--accent)_30%,transparent)]',
  good: 'bg-[var(--good-wash)] text-[var(--good)] border-[color-mix(in_srgb,var(--good)_30%,transparent)]',
  warning: 'bg-[var(--warning-wash)] text-ink border-[color-mix(in_srgb,var(--warning)_40%,transparent)]',
  serious: 'bg-[var(--serious-wash)] text-ink border-[color-mix(in_srgb,var(--serious)_40%,transparent)]',
  critical: 'bg-[var(--critical-wash)] text-[var(--critical)] border-[color-mix(in_srgb,var(--critical)_30%,transparent)]',
};

/**
 * Status is never carried by colour alone — every badge shows its label, and
 * callers pass an icon for the states that matter (warning and serious sit
 * below 3:1 on the light surface by design).
 */
export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_STYLE[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/* ── Form controls ──────────────────────────────────────────────────── */

const FIELD_BASE =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-[var(--axis)] focus:border-accent focus:outline-none disabled:opacity-60';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_BASE} h-10 ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_BASE} py-2 leading-6 ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${FIELD_BASE} h-10 appearance-none ps-8 ${className}`} {...rest}>
        {children}
      </select>
      {/* Inline-start, so it lands on the left under RTL. */}
      <ChevronDown
        size={15}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-ink-muted"
      />
    </div>
  );
}

/* ── Loading & empty states ─────────────────────────────────────────── */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pulse rounded-md bg-sunken ${className}`} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 text-ink-muted">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body ? <p className="max-w-sm text-[13px] leading-6 text-ink-secondary">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-4 py-3">
      <p className="text-[13px] text-ink">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
