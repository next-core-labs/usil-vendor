import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

type ToastTone = 'good' | 'critical';
type Toast = { id: number; tone: ToastTone; text: string };

type ToastApi = {
  /** Confirms a write landed. */
  success: (text: string) => void;
  /** Surfaces the server's own Arabic error text. */
  failure: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, text: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, text }]);
      window.setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text: string) => push('good', text),
      failure: (text: string) => push('critical', text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rise pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 shadow-[var(--shadow-pop)] ${
              toast.tone === 'good'
                ? 'border-[color-mix(in_srgb,var(--good)_32%,transparent)] bg-[var(--good-wash)]'
                : 'border-[color-mix(in_srgb,var(--critical)_32%,transparent)] bg-[var(--critical-wash)]'
            } backdrop-blur-sm`}
          >
            {toast.tone === 'good' ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[var(--good)]" aria-hidden />
            ) : (
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[var(--critical)]" aria-hidden />
            )}
            <p className="flex-1 text-[13px] leading-6 text-ink">{toast.text}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="إغلاق التنبيه"
              className="mt-0.5 text-ink-muted transition-colors hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
