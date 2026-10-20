import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode';
import { CameraOff, Flashlight, FlashlightOff, Loader2, Minus, PackagePlus, Plus, RefreshCw, ShoppingCart, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { Badge, Button, Input, Select } from '../ui/primitives.tsx';
import { count } from '../../lib/format.ts';
import { findByCode, type InventoryItem } from '../../lib/inventory.ts';

export type ScanPick =
  | { kind: 'adjust'; item: InventoryItem }
  | { kind: 'restock'; item: InventoryItem }
  | { kind: 'add'; code: string };

const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/** The same code held in front of the camera fires every frame; ignore repeats for this long. */
const REPEAT_MS = 2000;

function cameraErrorText(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
  const raw = `${name} ${String(error)}`;
  if (/NotAllowed|Permission|denied/i.test(raw)) {
    return 'رفضت إذن الكاميرا. فعّله من إعدادات المتصفح لهذا الموقع ثم اضغط «إعادة المحاولة» — أو أدخل الرمز يدوياً تحت.';
  }
  if (/NotFound|Overconstrained|not found|no camera/i.test(raw)) {
    return 'ما لقينا كاميرا في هذا الجهاز. أدخل الرمز يدوياً تحت.';
  }
  if (/NotReadable|in use|Could not start/i.test(raw)) {
    return 'الكاميرا مشغولة بتطبيق ثاني. سكّره وجرّب مرة ثانية.';
  }
  return 'تعذّر تشغيل الكاميرا. جرّب مرة ثانية أو أدخل الرمز يدوياً.';
}

/** Short confirmation tone: rising for a known item, low for an unknown code. */
function beep(ctx: AudioContext | null, known: boolean) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    osc.type = known ? 'sine' : 'square';
    osc.frequency.setValueAtTime(known ? 880 : 240, t);
    if (known) osc.frequency.setValueAtTime(1320, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {
    // Audio is a nicety; a blocked context must not break scanning.
  }
}

/**
 * Camera barcode/QR reader. Mount it only while open — unmounting stops the
 * camera. Every start/stop runs through one queue so a quick close, a camera
 * switch or React's dev double-mount never leaves two readers on the element.
 *
 * Single mode hands the first read straight to the screen (known item → adjust,
 * unknown code → add). Continuous mode keeps the camera running and shows the
 * item inline with quick ±1, for counting a shelf in one pass.
 */
export function BarcodeScanner({
  items,
  onClose,
  onPick,
  onQuickAdjust,
}: {
  items: InventoryItem[];
  onClose: () => void;
  onPick: (pick: ScanPick) => void;
  onQuickAdjust: (item: InventoryItem, delta: number) => Promise<boolean>;
}) {
  const regionId = `inv-scan-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef<AudioContext | null>(null);

  const [phase, setPhase] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [attempt, setAttempt] = useState(0);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [continuous, setContinuous] = useState(false);
  const [sound, setSound] = useState(true);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<{ code: string; itemId: string | null } | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const lastRead = useRef<{ code: string; at: number } | null>(null);
  const handedOff = useRef(false);

  function enqueue(op: () => Promise<void>) {
    queue.current = queue.current.then(op, op).catch(() => undefined);
  }

  // Read handler lives in a ref so the camera is never restarted just because
  // the item list or a toggle changed.
  const onRead = useRef<(code: string, fromCamera: boolean) => void>(() => undefined);
  onRead.current = (raw, fromCamera) => {
    const code = raw.trim();
    if (!code || handedOff.current) return;
    const now = Date.now();
    if (fromCamera && lastRead.current?.code === code && now - lastRead.current.at < REPEAT_MS) return;
    lastRead.current = { code, at: now };

    const item = findByCode(items, code);
    if (sound) beep(audioRef.current, !!item);
    try {
      navigator.vibrate?.(item ? [40, 40, 80] : [150, 80, 150]);
    } catch {
      // Not every browser allows vibration.
    }

    if (!continuous) {
      handedOff.current = true;
      onPick(item ? { kind: 'adjust', item } : { kind: 'add', code });
      return;
    }
    setResult({ code, itemId: item?.id ?? null });
  };

  // Camera lifecycle.
  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    setPhase('starting');
    setError(null);
    setTorch({ supported: false, on: false });

    enqueue(async () => {
      if (cancelled) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('الكاميرا تحتاج اتصالاً آمناً (https). افتح اللوحة من رابطها الرسمي، أو أدخل الرمز يدوياً تحت.');
        setPhase('error');
        return;
      }
      scanner = new Html5Qrcode(regionId, {
        formatsToSupport: FORMATS,
        verbose: false,
        // Native BarcodeDetector (Android Chrome) is far faster than the JS decoder.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;
      try {
        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (w: number, h: number) => {
              const width = Math.max(50, Math.floor(w * 0.8));
              return { width, height: Math.max(50, Math.floor(Math.min(h * 0.7, width * 0.6))) };
            },
          },
          (text) => onRead.current(text, true),
          () => undefined,
        );
      } catch (caught) {
        if (!cancelled) {
          setError(cameraErrorText(caught));
          setPhase('error');
        }
        return;
      }
      if (cancelled) return; // the cleanup op queued behind this one stops it
      setPhase('scanning');
      try {
        setTorch({ supported: scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported(), on: false });
      } catch {
        setTorch({ supported: false, on: false });
      }
      // Labels are only readable once permission is granted, i.e. after start.
      try {
        const list = await Html5Qrcode.getCameras();
        if (!cancelled) setCameras(list);
      } catch {
        // The switcher simply stays hidden.
      }
    });

    return () => {
      cancelled = true;
      enqueue(async () => {
        if (!scanner) return;
        try {
          if (scanner.isScanning) await scanner.stop();
        } catch {
          // Already stopped.
        }
        try {
          scanner.clear();
        } catch {
          // Element already gone.
        }
        if (scannerRef.current === scanner) scannerRef.current = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, cameraId, attempt]);

  // One audio context for the scanner's life; closed with it.
  useEffect(() => {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    try {
      audioRef.current = Ctor ? new Ctor() : null;
    } catch {
      audioRef.current = null;
    }
    return () => {
      void audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner?.isScanning) return;
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(!torch.on);
      setTorch({ supported: true, on: !torch.on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    lastRead.current = null;
    onRead.current(manual, false);
    setManual('');
  }

  async function quick(item: InventoryItem, delta: number) {
    setAdjusting(true);
    try {
      await onQuickAdjust(item, delta);
    } finally {
      setAdjusting(false);
    }
  }

  const matched = result?.itemId ? items.find((item) => item.id === result.itemId) || null : null;

  return (
    <Modal open onClose={onClose} title="مسح باركود" description="وجّه الكاميرا الخلفية على الباركود أو رمز QR.">
      {/* iOS keeps audio suspended until a tap inside the page. */}
      <div className="space-y-4" onPointerDown={() => void audioRef.current?.resume().catch(() => undefined)}>
        <div className="relative min-h-[220px] overflow-hidden rounded-xl bg-black">
          <div id={regionId} className="w-full [&_video]:block [&_video]:h-auto [&_video]:w-full!" />

          {phase === 'starting' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
              <Loader2 size={22} className="animate-spin" />
              تشغيل الكاميرا…
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff size={26} className="text-white/70" />
              <p className="max-w-xs text-[13px] leading-6 text-white">{error}</p>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => setAttempt((n) => n + 1)}>
                إعادة المحاولة
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cameras.length > 1 ? (
            <div className="min-w-[160px] flex-1">
              <Select aria-label="الكاميرا" className="h-8 text-[13px]" value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
                <option value="">الكاميرا الخلفية</option>
                {cameras.map((camera, index) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `كاميرا ${index + 1}`}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {torch.supported ? (
            <Button
              size="sm"
              variant={torch.on ? 'primary' : 'secondary'}
              icon={torch.on ? <FlashlightOff size={14} /> : <Flashlight size={14} />}
              onClick={() => void toggleTorch()}
            >
              {torch.on ? 'إطفاء الفلاش' : 'الفلاش'}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={sound}
            icon={sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            onClick={() => setSound((on) => !on)}
          >
            {sound ? 'الصوت' : 'صامت'}
          </Button>
          <label className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-ink-secondary">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(event) => {
                setContinuous(event.target.checked);
                setResult(null);
              }}
              className="size-4 accent-[var(--accent)]"
            />
            مسح متواصل
          </label>
        </div>

        {continuous && result ? (
          matched ? (
            <div className="space-y-3 rounded-xl border border-line bg-sunken p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{matched.nameAr}</p>
                  <p className="tabular text-xs text-ink-muted" dir="ltr">
                    {result.code}
                  </p>
                </div>
                <Badge tone="accent">
                  <span className="tabular">
                    {count(matched.currentStock)} {matched.unit}
                  </span>
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Minus size={14} />} disabled={adjusting || matched.currentStock <= 0} onClick={() => void quick(matched, -1)}>
                  1
                </Button>
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={adjusting} onClick={() => void quick(matched, 1)}>
                  1
                </Button>
                <Button size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={() => onPick({ kind: 'adjust', item: matched })}>
                  تعديل الرصيد
                </Button>
                <Button size="sm" variant="ghost" icon={<ShoppingCart size={14} />} onClick={() => onPick({ kind: 'restock', item: matched })}>
                  توريد
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sunken p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">رمز غير مسجّل</p>
                <p className="tabular text-xs text-ink-muted" dir="ltr">
                  {result.code}
                </p>
              </div>
              <Button size="sm" variant="primary" icon={<PackagePlus size={14} />} onClick={() => onPick({ kind: 'add', code: result.code })}>
                إضافة صنف بهذا الرمز
              </Button>
            </div>
          )
        ) : null}

        <form onSubmit={submitManual} className="flex items-center gap-2">
          <Input
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            className="tabular text-start"
            placeholder="أو اكتب رقم الباركود"
            aria-label="رقم الباركود"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <Button type="submit" disabled={!manual.trim()}>
            بحث
          </Button>
        </form>
      </div>
    </Modal>
  );
}
