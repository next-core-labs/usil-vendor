import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, ImagePlus, Save } from 'lucide-react';
import { applications } from '../../api/endpoints.ts';
import { errorText } from '../../api/client.ts';
import type { FulfillmentLane, VendorApplicationRow } from '../../api/types.ts';
import { useAccount } from '../../state/AccountContext.tsx';
import { useToast } from '../../state/ToastContext.tsx';
import {
  FULFILLMENT_LABEL,
  FULFILLMENT_LANES,
  PROJECT_TYPES,
  PROJECT_TYPE_OTHER,
  SAUDI_BANKS,
} from '../../lib/labels.ts';
import { Button, Card, CardHeader, Field, Input, Select } from '../ui/primitives.tsx';

/** `AVATAR_MAX_BYTES` in `server/auth/avatar.ts`. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

type Draft = {
  firstName: string;
  fatherName: string;
  familyName: string;
  nationalId: string;
  commercialRegister: string;
  projectName: string;
  projectType: string;
  projectTypeOther: string;
  bankName: string;
  iban: string;
  accountHolderName: string;
  fulfillment: FulfillmentLane[];
};

function draftFrom(row: VendorApplicationRow): Draft {
  // The server stores the custom wording as the type itself when «أخرى» was picked.
  const other = Boolean(row.projectTypeOther) || (row.projectType !== '' && !PROJECT_TYPES.includes(row.projectType));
  return {
    firstName: row.firstName || '',
    fatherName: row.fatherName || '',
    familyName: row.familyName || '',
    nationalId: row.nationalId || '',
    commercialRegister: row.commercialRegister || '',
    projectName: row.projectName || '',
    projectType: other ? PROJECT_TYPE_OTHER : row.projectType || '',
    projectTypeOther: other ? row.projectTypeOther || row.projectType : '',
    bankName: row.bankName || '',
    iban: row.iban || '',
    accountHolderName: row.accountHolderName || '',
    fulfillment: row.fulfillment || [],
  };
}

/**
 * A pending vendor's file, editable until the owner decides. Saving partial
 * data is fine — the banner and the owner both read what is still missing —
 * but every field sent must be valid, and the server says which one is not.
 */
export function DetailsForm({ application }: { application: VendorApplicationRow }) {
  const account = useAccount();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(application));
  const [logo, setLogo] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('ارفع شعاراً jpg أو png أو webp حتى 2 ميغابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await applications.saveDetails({ ...draft, ...(logo ? { logoDataUrl: logo } : {}) });
      setLogo('');
      await account.reload();
      toast.success('حُفظ ملفك.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const logoShown = logo || application.logoUrl;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader title="متجرك" subtitle="يظهر للعملاء بعد الاعتماد." />
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-sunken">
              {logoShown ? (
                <img src={logoShown} alt="شعار المتجر" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-ink-muted">
                  <Building2 size={22} />
                </span>
              )}
            </span>
            <div>
              <Button size="sm" icon={<ImagePlus size={14} />} onClick={() => logoInput.current?.click()}>
                {logoShown ? 'غيّر الشعار' : 'أضف شعاراً'}
              </Button>
              <p className="mt-1 text-xs text-ink-muted">اختياري — jpg أو png أو webp حتى 2 ميغابايت.</p>
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                pickLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المتجر">
              <Input value={draft.projectName} onChange={(e) => set('projectName', e.target.value)} />
            </Field>
            <Field label="نوع المشروع">
              <Select value={draft.projectType} onChange={(e) => set('projectType', e.target.value)}>
                <option value="">اختر</option>
                {PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {draft.projectType === PROJECT_TYPE_OTHER ? (
            <Field label="اكتب نوع مشروعك">
              <Input value={draft.projectTypeOther} onChange={(e) => set('projectTypeOther', e.target.value)} />
            </Field>
          ) : null}
          <Lanes value={draft.fulfillment} onChange={(next) => set('fulfillment', next)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="بياناتك" subtitle="تراها إدارة يوصل فقط، للتحقق قبل الاعتماد." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الاسم الأول">
            <Input value={draft.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="اسم الأب">
            <Input value={draft.fatherName} onChange={(e) => set('fatherName', e.target.value)} />
          </Field>
          <Field label="اسم العائلة">
            <Input value={draft.familyName} onChange={(e) => set('familyName', e.target.value)} />
          </Field>
          <Wide>
            <Field label="رقم الهوية أو الإقامة">
              <Input
                dir="ltr"
                inputMode="numeric"
                value={draft.nationalId}
                onChange={(e) => set('nationalId', e.target.value)}
                placeholder="1xxxxxxxxx"
                className="text-start"
              />
            </Field>
          </Wide>
          <Field label="السجل التجاري" hint="اختياري">
            <Input
              dir="ltr"
              value={draft.commercialRegister}
              onChange={(e) => set('commercialRegister', e.target.value)}
              className="text-start"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="الحساب البنكي" subtitle="تُحوَّل مستحقاتك لهذا الحساب." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="البنك">
            <Select value={draft.bankName} onChange={(e) => set('bankName', e.target.value)}>
              <option value="">اختر البنك</option>
              {SAUDI_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="اسم صاحب الحساب">
            <Input value={draft.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} />
          </Field>
          <Wide>
            <Field label="رقم الآيبان">
              <Input
                dir="ltr"
                value={draft.iban}
                onChange={(e) => set('iban', e.target.value)}
                placeholder="SA0000000000000000000000"
                className="text-start"
              />
            </Field>
          </Wide>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-[color-mix(in_srgb,var(--plane)_90%,transparent)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        {error ? (
          <p role="alert" className="me-auto text-[13px] text-[var(--critical)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" busy={busy} icon={<Save size={15} />}>
          حفظ الملف
        </Button>
      </div>
    </form>
  );
}

function Wide({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}

function Lanes({ value, onChange }: { value: FulfillmentLane[]; onChange: (next: FulfillmentLane[]) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">أقدر أخدم في</span>
      <div className="flex flex-wrap gap-2">
        {FULFILLMENT_LANES.map((lane) => {
          const active = value.includes(lane);
          return (
            <label
              key={lane}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                active
                  ? 'border-accent bg-[var(--accent-wash)] font-medium text-accent'
                  : 'border-line-strong bg-surface text-ink-secondary hover:border-[var(--axis)]'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={active}
                onChange={() => onChange(active ? value.filter((item) => item !== lane) : [...value, lane])}
              />
              {FULFILLMENT_LABEL[lane]}
            </label>
          );
        })}
      </div>
    </div>
  );
}
