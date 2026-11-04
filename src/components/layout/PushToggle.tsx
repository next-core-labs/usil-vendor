import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { enablePush, followPushTaps, pushState, type PushState } from '../../lib/push.ts';
import { useToast } from '../../state/ToastContext.tsx';
import { Button } from '../ui/primitives.tsx';

const LABEL: Record<Exclude<PushState, 'unsupported'>, string> = {
  on: 'الإشعارات مفعّلة على هذا المتصفح',
  off: 'تفعيل الإشعارات',
  denied: 'الإشعارات محظورة — اسمح بها من إعدادات الموقع في المتصفح',
};

const ENABLED = 'تم تفعيل الإشعارات. تصلك الطلبات الجديدة والعقود الموقّعة وتحديثات السحب هنا.';
const FAILED = 'تعذّر تفعيل الإشعارات. حاول مرة أخرى.';

/** The header's bell: hidden where the browser or the backend cannot do push. */
export function PushToggle() {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    void pushState().then((next) => {
      if (!active) return;
      setState(next);
      // Already allowed: keep this browser's token on whoever is signed in now.
      if (next === 'on') void enablePush().catch(() => undefined);
    });
    const stop = followPushTaps();
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (state === 'unsupported') return null;
  const Icon = state === 'on' ? BellRing : state === 'denied' ? BellOff : Bell;

  async function turnOn() {
    if (state === 'on') return toast.success(LABEL.on);
    if (state === 'denied') return toast.failure(LABEL.denied);
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'on') toast.success(ENABLED);
      else if (next === 'denied') toast.failure(LABEL.denied);
    } catch {
      toast.failure(FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      busy={busy}
      onClick={() => void turnOn()}
      aria-label={LABEL[state]}
      title={LABEL[state]}
      icon={<Icon size={16} className={state === 'on' ? 'text-accent' : undefined} />}
    />
  );
}
