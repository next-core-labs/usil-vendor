import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const PRINT_CSS = `
.usil-print-root { display: none; }
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; color: #000 !important; height: auto !important; overflow: visible !important; }
  body > *:not(.usil-print-root) { display: none !important; }
  .usil-print-root { display: block !important; color: #000; background: #fff; direction: rtl; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .usil-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .usil-print-root table { page-break-inside: auto; }
  .usil-print-root tr { page-break-inside: avoid; }
}
`;

/**
 * A clean, light page printed with `window.print()` — everything else on the
 * page is hidden while printing, and nothing of it shows on screen. Mount it
 * with the content to print; it prints once and calls `onDone` afterwards.
 */
export function PrintSheet({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const done = () => doneRef.current();
    window.addEventListener('afterprint', done);
    // One frame so the portal is in the document before the print dialog snapshots it.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, []);

  return createPortal(
    <div className="usil-print-root" dir="rtl" lang="ar">
      <style>{PRINT_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}
