/**
 * The Usil و mark, drawn from the storefront's brand grid (usil/src/components/UsilMark.tsx)
 * and set on a navy tile so it reads the same on light and dark surfaces.
 * 120-unit system · stroke 14 · ring r=24 · turn r=14 · tail ends at x=22.
 */
export function UsilMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect width="120" height="120" rx="28" fill="#0A1A33" />
      <circle cx="68" cy="42" r="24" stroke="#FFFFFF" strokeWidth="14" />
      <path d="M68 66 V84 A14 14 0 0 1 54 98 H38" stroke="#FFFFFF" strokeWidth="14" />
      <path d="M38 98 H22" stroke="#155EEF" strokeWidth="14" />
    </svg>
  );
}
