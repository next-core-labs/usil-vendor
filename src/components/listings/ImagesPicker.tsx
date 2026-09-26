import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploads } from '../../api/endpoints.ts';
import { errorText } from '../../api/client.ts';
import { LISTING_MAX_IMAGES, LISTING_MIN_IMAGES } from '../../lib/labels.ts';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
/** `UPLOAD_MAX_BYTES` in `server/auth/avatar.ts`. */
const MAX_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}

/**
 * Photos are uploaded the moment they are picked, not when the form is
 * submitted: the listing endpoints keep only `/uploads/…` URLs and drop a
 * `data:` one without a word, so a form full of previews would save as a
 * listing with no images.
 */
export function ImagesPicker({
  value,
  onChange,
  onBusyChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');

  const setBusy = (pending: number) => {
    setUploading(pending);
    onBusyChange?.(pending > 0);
  };

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');

    const room = LISTING_MAX_IMAGES - value.length;
    if (room <= 0) {
      setError(`الحد الأقصى ${LISTING_MAX_IMAGES} صور للمنتج`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) setError(`الحد الأقصى ${LISTING_MAX_IMAGES} صور للمنتج`);

    const valid: File[] = [];
    for (const file of chosen) {
      if (!ACCEPTED.includes(file.type)) {
        setError('الصيغة غير مدعومة — jpg أو png أو webp فقط');
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError('حجم الصورة كبير — الحد الأقصى ٥ ميغابايت');
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;

    setBusy(valid.length);
    const saved: string[] = [];
    for (const file of valid) {
      try {
        saved.push(await uploads.image(await readAsDataUrl(file)));
      } catch (caught) {
        setError(errorText(caught));
      }
    }
    setBusy(0);
    if (saved.length) onChange([...value, ...saved].slice(0, LISTING_MAX_IMAGES));
  }

  const short = value.length < LISTING_MIN_IMAGES;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">صور المنتج</span>
        <span className={`tabular text-xs ${short ? 'text-[var(--critical)]' : 'text-ink-muted'}`}>
          {value.length} / {LISTING_MAX_IMAGES}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {value.map((url, index) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-sunken">
            <img src={url} alt={`صورة ${index + 1}`} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== url))}
              aria-label={`حذف الصورة ${index + 1}`}
              className="absolute top-1 end-1 grid size-6 place-items-center rounded-md bg-black/60 text-white transition-opacity hover:bg-black/80"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {value.length < LISTING_MAX_IMAGES ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="grid aspect-square place-items-center gap-1 rounded-lg border border-dashed border-line-strong bg-surface text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {uploading > 0 ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[11px]">{uploading > 0 ? 'جارٍ الرفع' : 'أضف صورة'}</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        hidden
        onChange={(event) => {
          void pickFiles(event.target.value ? event.target.files : null);
          event.target.value = '';
        }}
      />

      <p className="mt-1.5 text-xs text-ink-muted">
        صور حقيقية من جهازك، {LISTING_MIN_IMAGES} على الأقل. jpg أو png أو webp، حتى ٥ ميغابايت للصورة.
      </p>
      {error ? <p className="mt-1 text-xs text-[var(--critical)]">{error}</p> : null}
    </div>
  );
}
