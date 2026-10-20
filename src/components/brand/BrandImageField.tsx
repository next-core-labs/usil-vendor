import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { BRAND_IMAGE_TYPES, brand } from '../../api/brand.ts';
import { errorText } from '../../api/client.ts';
import { Button } from '../ui/primitives.tsx';

/**
 * Pick an image from the device → upload → preview, with replace and remove.
 * The value is the server URL (`/uploads/…`), never a data URL.
 */
export function BrandImageField({
  label,
  hint,
  value,
  purpose,
  onChange,
  onBusyChange,
}: {
  label: string;
  hint: string;
  value: string;
  purpose: 'logo' | 'stamp';
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    onBusyChange(true);
    try {
      onChange(await brand.uploadImage(file, purpose));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">{label}</span>
      <div className="flex items-center gap-3 rounded-lg border border-line-strong bg-sunken/50 p-3">
        {/* White ground on purpose: logos and stamps are drawn for paper. */}
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
          {value ? (
            <img src={value} alt={label} className="size-full object-contain" />
          ) : (
            <ImageIcon size={22} className="text-[#898781]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              busy={busy}
              icon={<Upload size={14} />}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'جارٍ الرفع…' : value ? 'تغيير' : 'رفع صورة'}
            </Button>
            {value && !busy ? (
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => onChange('')}>
                إزالة
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-ink-muted">{hint}</p>
          {error ? (
            <p role="alert" className="text-xs font-medium text-[var(--critical)]">
              {error}
            </p>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={BRAND_IMAGE_TYPES.join(',')}
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}
