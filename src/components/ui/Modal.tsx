import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './primitives.tsx';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Return focus to whatever opened the dialog once it closes, so keyboard
    // users are not dropped back at the top of the page.
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // Trap Tab inside the panel — without this, focus walks onto the page
      // behind the dialog while it is still covering everything.
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    // Stop the page behind the dialog from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog. The panel itself takes it (not the first
    // control) so a destructive confirm button is never one Enter away.
    panel?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      // Only pull focus back if it is still inside the (now closing) dialog.
      if (opener && typeof opener.focus === 'function' && panel?.contains(document.activeElement)) {
        opener.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-[13px] leading-6 text-ink-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق" icon={<X size={16} />} />
        </header>
        {children ? <div className="space-y-4 p-5">{children}</div> : null}
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/50 p-4">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/** Every destructive or outward-facing action goes through this first. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'تأكيد',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            إلغاء
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
