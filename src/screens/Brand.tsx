import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, BadgeCheck, CreditCard, FileText, Info, Palette, Receipt, Save, Stamp } from 'lucide-react';
import {
  BRAND_COLOR_PRESETS,
  brand,
  emailProblem,
  hasBrandData,
  ibanProblem,
  isHexColor,
  isServerUpload,
  isValidSaudiVatNumber,
  mobileProblem,
  normalizeBrandSettings,
  normalizeIban,
  prefillFromVendorFile,
  vatWarning,
  type VendorBrandSettings,
} from '../api/brand.ts';
import { errorText } from '../api/client.ts';
import type { VendorFile } from '../api/types.ts';
import { useResource } from '../lib/useResource.ts';
import { navigate } from '../lib/router.ts';
import { useToast } from '../state/ToastContext.tsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../components/ui/primitives.tsx';
import { BrandImageField } from '../components/brand/BrandImageField.tsx';
import { BrandPreview } from '../components/brand/BrandPreview.tsx';

type Loaded = {
  /** What is stored on the server (normalized). */
  saved: VendorBrandSettings;
  /** What the form starts from — `saved`, or a first-use prefill from the vendor file. */
  initial: VendorBrandSettings;
  prefilled: boolean;
  file: VendorFile | null;
};

async function loadBrand(): Promise<Loaded> {
  const [stored, file] = await Promise.all([
    brand.read(),
    // The vendor file only seeds empty fields; a failure here must not block the screen.
    brand.vendorFile().catch(() => null),
  ]);
  const saved = normalizeBrandSettings(stored);
  if (hasBrandData(stored)) return { saved, initial: saved, prefilled: false, file };
  const initial = prefillFromVendorFile(saved, file);
  return { saved, initial, prefilled: JSON.stringify(initial) !== JSON.stringify(saved), file };
}

export function Brand() {
  const toast = useToast();
  const resource = useResource(loadBrand);
  const [draft, setDraft] = useState<VendorBrandSettings | null>(null);
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Start (and restart after a reload) from what was loaded.
  useEffect(() => {
    if (resource.data) setDraft(resource.data.initial);
  }, [resource.data]);

  const dirty = useMemo(
    () => !!draft && !!resource.data && JSON.stringify(draft) !== JSON.stringify(resource.data.saved),
    [draft, resource.data],
  );

  function set<K extends keyof VendorBrandSettings>(key: K, value: VendorBrandSettings[K]) {
    setFormError('');
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  const onBusyChange = (busy: boolean) => setUploading((n) => Math.max(0, n + (busy ? 1 : -1)));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!draft || !resource.data || uploading > 0) return;
    if (!draft.brandName.trim()) {
      setFormError('اكتب اسم البراند / المنشأة قبل الحفظ.');
      return;
    }
    // These print on invoices and receive transfers, so a typo is stopped here.
    const problem = emailProblem(draft.email) || ibanProblem(draft.iban);
    if (problem) {
      // The note sits at the top; the bottom save button would otherwise look like it did nothing.
      setFormError(problem);
      toast.failure(problem);
      return;
    }
    if (draft.primaryColor && !isHexColor(draft.primaryColor)) {
      setFormError('اختر لون الهوية من القائمة أو من منتقي الألوان.');
      return;
    }

    const next: VendorBrandSettings = {
      ...draft,
      brandName: draft.brandName.trim(),
      vatNumber: draft.vatNumber.replace(/\s+/g, ''),
      iban: normalizeIban(draft.iban),
    };
    const previousLogo = resource.data.saved.logoUrl;
    setSaving(true);
    try {
      const stored = await brand.save(next);
      resource.set((current) => (current ? { ...current, saved: stored, initial: stored, prefilled: false } : current));
      toast.success('حُفظت الهوية — تظهر في كل فاتورة وسند جديد.');

      // The public store shows the PROFILE logo, so a changed logo goes there too.
      // The server only takes its own uploads; an old pasted link stays invoice-only.
      const logo = next.logoUrl.trim();
      if (logo !== previousLogo && (!logo || isServerUpload(logo))) {
        const projectName = resource.data.file?.profile?.projectName || next.brandName;
        try {
          await brand.syncProfileLogo(projectName, logo);
          toast.success(logo ? 'تحدّث شعار متجرك العام.' : 'أُزيل الشعار من متجرك العام.');
        } catch (caught) {
          toast.failure(`حُفظت الهوية، لكن تعذر تحديث شعار المتجر العام: ${errorText(caught)}`);
        }
      }
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = uploading > 0 ? 'انتظر انتهاء الرفع…' : 'حفظ الهوية';

  return (
    <>
      <PageHeader
        title="الهوية والفواتير"
        subtitle="اسمك وشعارك وختمك وبياناتك البنكية — تطلع على كل فاتورة وسند قبض تصدره."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Receipt size={15} />} onClick={() => navigate('invoices')}>
              الفواتير
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Save size={15} />}
              busy={saving}
              disabled={!draft || uploading > 0 || (!dirty && !resource.data?.prefilled)}
              onClick={() => void save()}
            >
              {saveLabel}
            </Button>
          </div>
        }
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      {resource.loading || !draft ? (
        resource.error ? null : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <Skeleton className="h-96 w-full" />
            </Card>
            <Card>
              <Skeleton className="h-64 w-full" />
            </Card>
          </div>
        )
      ) : (
        <form onSubmit={(event) => void save(event)} noValidate className="grid items-start gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {resource.data?.prefilled ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-wash)] px-4 py-3 text-[13px] leading-6 text-ink">
                <Info size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
                <span>عبّينا الحقول الفاضية من ملفك التجاري. راجعها واضغط «حفظ الهوية» لتعتمدها على فواتيرك.</span>
              </div>
            ) : null}

            {formError ? (
              <p
                role="alert"
                className="rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-4 py-3 text-[13px] text-ink"
              >
                {formError}
              </p>
            ) : null}

            <Card>
              <CardHeader title="بيانات المنشأة" subtitle="كما تظهر في رأس الفاتورة." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم البراند / المنشأة *">
                  <Input value={draft.brandName} onChange={(e) => set('brandName', e.target.value)} required />
                </Field>
                <Field label="الشعار اللفظي (اختياري)">
                  <Input value={draft.slogan} onChange={(e) => set('slogan', e.target.value)} />
                </Field>
                <Field label="السجل التجاري / وثيقة العمل الحر (اختياري)">
                  <Input dir="ltr" className="text-end font-mono" value={draft.crNumber} onChange={(e) => set('crNumber', e.target.value)} />
                </Field>
                <VatField value={draft.vatNumber} onChange={(value) => set('vatNumber', value)} />
                <Field label="الجوال / الواتساب" hint={mobileProblem(draft.phone) || undefined}>
                  <Input
                    dir="ltr"
                    inputMode="tel"
                    className="text-end"
                    placeholder="05xxxxxxxx"
                    value={draft.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </Field>
                <Field label="البريد الإلكتروني" hint={emailProblem(draft.email) || undefined}>
                  <Input
                    dir="ltr"
                    type="email"
                    className="text-end"
                    value={draft.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </Field>
                <Field label="المدينة">
                  <Input value={draft.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <Field label="العنوان الوطني">
                  <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="الشعار والختم"
                subtitle="الشعار يتحدّث كمان في متجرك العام بعد الحفظ. الختم يطلع أسفل الفواتير والسندات."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <BrandImageField
                  label="شعار المتجر"
                  hint="JPG أو PNG أو WEBP حتى 5 ميجابايت."
                  value={draft.logoUrl}
                  purpose="logo"
                  onChange={(url) => set('logoUrl', url)}
                  onBusyChange={onBusyChange}
                />
                <BrandImageField
                  label="الختم / التوقيع"
                  hint="يفضّل PNG بخلفية شفافة."
                  value={draft.stampUrl || ''}
                  purpose="stamp"
                  onChange={(url) => set('stampUrl', url)}
                  onBusyChange={onBusyChange}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="لون الهوية" subtitle="لون شريط العنوان وجدول البنود في الفاتورة." />
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_COLOR_PRESETS.map((preset) => {
                  const active = draft.primaryColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => set('primaryColor', preset.value)}
                      aria-pressed={active}
                      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors ${
                        active
                          ? 'border-accent bg-[var(--accent-wash)] font-medium text-ink'
                          : 'border-line-strong text-ink-secondary hover:bg-sunken'
                      }`}
                    >
                      <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: preset.value }} />
                      {preset.name}
                    </button>
                  );
                })}
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] text-ink-secondary hover:bg-sunken">
                  <Palette size={15} aria-hidden />
                  لون مخصص
                  <input
                    type="color"
                    value={isHexColor(draft.primaryColor) ? draft.primaryColor : '#0a1a33'}
                    onChange={(e) => set('primaryColor', e.target.value.toUpperCase())}
                    className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label="اختيار لون مخصص"
                  />
                </label>
                <span dir="ltr" className="font-mono text-xs text-ink-muted">
                  {draft.primaryColor}
                </span>
              </div>
            </Card>

            <Card>
              <CardHeader title="الحساب البنكي" subtitle="يطلع في الفاتورة ليحوّل لك العميل مباشرة." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم البنك">
                  <Input value={draft.bankName} onChange={(e) => set('bankName', e.target.value)} />
                </Field>
                <Field label="اسم المستفيد">
                  <Input value={draft.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="رقم الآيبان (IBAN)" hint={ibanProblem(draft.iban) || 'SA ويتبعه 22 رقماً — يكفي تكتب الأرقام الـ22 ونحن نضيف SA.'}>
                    <Input
                      dir="ltr"
                      className="text-end font-mono"
                      placeholder="SA0000000000000000000000"
                      value={draft.iban}
                      onChange={(e) => set('iban', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="نصوص الفاتورة" />
              <div className="space-y-4">
                <Field label="رسالة في رأس الفاتورة" hint="سطر واحد، مثل: شكراً لاختياركم…">
                  <Input value={draft.invoiceHeaderNote} onChange={(e) => set('invoiceHeaderNote', e.target.value)} />
                </Field>
                <Field label="الشروط والأحكام أسفل الفاتورة" hint="تطلع في كل فاتورة جديدة (أول ثلاثة أسطر في ملف PDF).">
                  <Textarea
                    rows={4}
                    value={draft.invoiceFooterNotes}
                    onChange={(e) => set('invoiceFooterNotes', e.target.value)}
                  />
                </Field>
              </div>
            </Card>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty ? <span className="text-xs text-ink-muted">عندك تعديلات ما انحفظت.</span> : null}
              <Button
                type="submit"
                variant="primary"
                icon={<Save size={15} />}
                busy={saving}
                disabled={uploading > 0 || (!dirty && !resource.data?.prefilled)}
              >
                {saveLabel}
              </Button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card>
              <CardHeader title="معاينة الفاتورة" />
              <BrandPreview settings={draft} />
              <div className="mt-4 space-y-2 text-[13px] leading-6">
                {isValidSaudiVatNumber(draft.vatNumber) ? (
                  <p className="flex items-start gap-2 text-ink">
                    <BadgeCheck size={16} className="mt-1 shrink-0 text-[var(--good)]" aria-hidden />
                    فواتيرك تطلع «فاتورة ضريبية مبسطة» برمز QR لهيئة الزكاة (المرحلة الأولى).
                  </p>
                ) : (
                  <p className="flex items-start gap-2 text-ink-secondary">
                    <FileText size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
                    بدون رقم ضريبي صالح تطلع فواتيرك «فاتورة» عادية بدون رمز هيئة الزكاة.
                  </p>
                )}
                <p className="flex items-start gap-2 text-ink-secondary">
                  {draft.stampUrl ? (
                    <Stamp size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
                  ) : (
                    <CreditCard size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
                  )}
                  {draft.stampUrl ? 'الختم يطلع أسفل الفاتورة وفي سند القبض.' : 'أضف ختمك ليطلع على الفواتير والسندات.'}
                </p>
              </div>
            </Card>
          </aside>
        </form>
      )}
    </>
  );
}

function VatField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const warning = vatWarning(value);
  return (
    <Field label="الرقم الضريبي (اختياري)">
      <Input
        dir="ltr"
        inputMode="numeric"
        className="text-end font-mono"
        placeholder="3xxxxxxxxxxxxx3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={warning ? true : undefined}
      />
      <span className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
        {warning ? (
          <>
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--warning)]" aria-hidden />
            {warning}
          </>
        ) : isValidSaudiVatNumber(value) ? (
          <Badge tone="good" icon={<BadgeCheck size={12} />}>
            رقم ضريبي صالح
          </Badge>
        ) : (
          'فقط إذا كنت مسجّلاً في ضريبة القيمة المضافة.'
        )}
      </span>
    </Field>
  );
}
