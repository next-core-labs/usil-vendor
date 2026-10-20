import { useEffect, useState } from 'react';
import { Download, QrCode as QrIcon } from 'lucide-react';
import { QR_QUIET_ZONE, downloadBlob, encodeQrMatrix, qrPath, qrPngBlob, qrSvgMarkup } from '../../lib/qrMatrix.ts';
import { Button, Skeleton } from '../ui/primitives.tsx';
import { useToast } from '../../state/ToastContext.tsx';

/** The module matrix for `value`, or null while it encodes (or if it failed). */
function useQrMatrix(value: string) {
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMatrix(null);
    setFailed(false);
    if (!value) return;
    encodeQrMatrix(value)
      .then((next) => {
        if (!cancelled) setMatrix(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return { matrix, failed };
}

/**
 * A real, scannable QR of `value`. Always black on white — even in dark mode —
 * because phone scanners expect dark modules on a light ground.
 */
export function QrSvg({ matrix, size = 152, label }: { matrix: boolean[][]; size?: number; label: string }) {
  const n = matrix.length + QR_QUIET_ZONE * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={n} height={n} fill="#ffffff" />
      <path d={qrPath(matrix)} fill="#000000" />
    </svg>
  );
}

/** The public store link as a QR, with PNG and SVG downloads (for print, packaging, the shop counter). */
export function StoreQr({ url, fileBase = 'usil-store-qr' }: { url: string; fileBase?: string }) {
  const toast = useToast();
  const { matrix, failed } = useQrMatrix(url);
  const [busy, setBusy] = useState(false);

  async function savePng() {
    if (!matrix) return;
    setBusy(true);
    try {
      downloadBlob(await qrPngBlob(matrix, 1024), `${fileBase}.png`);
    } catch (caught) {
      toast.failure(caught instanceof Error ? caught.message : 'تعذر تحميل رمز QR.');
    } finally {
      setBusy(false);
    }
  }

  function saveSvg() {
    if (!matrix) return;
    downloadBlob(new Blob([qrSvgMarkup(matrix, 1024)], { type: 'image/svg+xml' }), `${fileBase}.svg`);
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="grid size-[168px] shrink-0 place-items-center rounded-xl border border-line bg-white p-2">
        {matrix ? (
          <QrSvg matrix={matrix} label="رمز QR لرابط متجرك" />
        ) : failed ? (
          <span className="flex flex-col items-center gap-1 text-center text-xs text-[#52514e]">
            <QrIcon size={22} aria-hidden />
            تعذر تجهيز الرمز
          </span>
        ) : (
          <Skeleton className="size-[152px]" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-center sm:text-start">
        <p className="text-sm font-medium text-ink">امسح الرمز ويفتح متجرك مباشرة</p>
        <p className="text-[13px] leading-6 text-ink-secondary">
          اطبعه على الفاتورة أو الكرت أو التغليف، أو ضعه عند الكاشير — يوصل العميل لمنتجاتك بدون بحث.
        </p>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button size="sm" variant="primary" icon={<Download size={15} />} disabled={!matrix} busy={busy} onClick={() => void savePng()}>
            تحميل QR (PNG)
          </Button>
          <Button size="sm" icon={<Download size={15} />} disabled={!matrix} onClick={saveSvg}>
            SVG للطباعة
          </Button>
        </div>
      </div>
    </div>
  );
}
