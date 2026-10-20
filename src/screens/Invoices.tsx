import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  MessageCircle,
  Palette,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Share2,
  Trash2,
  Wallet,
} from 'lucide-react';
import { errorText } from '../api/client.ts';
import { normalizeBrandSettings, type VendorBrandSettings } from '../api/brand.ts';
import {
  INVOICE_STATUS_LABEL,
  invoicesApi,
  nextInvoiceNumber,
  normalizeInvoices,
  replaceInvoice,
  round2,
  whatsappShareUrl,
  withPayment,
  type InvoiceStatus,
  type VendorInvoice,
} from '../api/invoices.ts';
import { useResource } from '../lib/useResource.ts';
import { navigate } from '../lib/router.ts';
import { count, sar, shortDate } from '../lib/format.ts';
import { useToast } from '../state/ToastContext.tsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Skeleton,
  type Tone,
} from '../components/ui/primitives.tsx';
import { StatTile } from '../components/ui/StatTile.tsx';
import { FilterTabs, Toolbar } from '../components/ui/Table.tsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.tsx';
import { InvoiceFormModal, sar2, type InvoiceDraft } from '../components/invoices/InvoiceFormModal.tsx';
import { InvoiceView } from '../components/invoices/InvoiceView.tsx';

const PDF_ERROR = 'تعذّر إنشاء ملف PDF. تحقق من الاتصال ثم حاول مرة أخرى.';

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  paid: 'good',
  partial: 'accent',
  unpaid: 'warning',
  draft: 'neutral',
};

type Filter = 'all' | 'open' | 'paid';

type Loaded = { invoices: VendorInvoice[]; brand: VendorBrandSettings };

async function loadInvoices(): Promise<Loaded> {
  const data = await invoicesApi.read();
  return { invoices: normalizeInvoices(data.invoices), brand: normalizeBrandSettings(data.brandSettings) };
}

/** The PDF stack (jsPDF + fonts + QR encoder) is only fetched when a document is made. */
const pdf = () => import('../lib/pdf/zatcaPdf.ts');

/** A blank tab opened synchronously in the click (popup blockers), filled once the PDF is built. */
function openPrintTab(): Window | null {
  const tab = window.open('', '_blank');
  try {
    tab?.document.write(
      '<!doctype html><meta charset="utf-8"><title>…</title><body dir="rtl" style="font-family:system-ui;padding:24px;color:#52514e">جارٍ تجهيز الفاتورة للطباعة…</body>',
    );
  } catch {
    /* the PDF replaces the tab either way */
  }
  return tab;
}

function canShareFiles(): boolean {
  try {
    const probe = new File([''], 'probe.pdf', { type: 'application/pdf' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function shareMessage(invoice: VendorInvoice, brand: VendorBrandSettings): string {
  const lines = [
    `مرحباً ${invoice.clientName}،`,
    `فاتورة رقم ${invoice.invoiceNumber}${brand.brandName ? ` من ${brand.brandName}` : ''}${
      invoice.eventDate ? ` لموعد ${invoice.eventDate}` : ''
    }.`,
    `الإجمالي: ${invoice.total.toFixed(2)} ر.س`,
  ];
  if (invoice.depositPaid > 0) lines.push(`المدفوع: ${invoice.depositPaid.toFixed(2)} ر.س`);
  if (invoice.remainingBalance > 0) {
    lines.push(`المتبقي: ${invoice.remainingBalance.toFixed(2)} ر.س`);
    if (brand.iban) lines.push(`للتحويل: ${[brand.bankName, brand.accountHolder].filter(Boolean).join(' — ')}\n${brand.iban}`);
  }
  lines.push('شكراً لك.');
  return lines.join('\n');
}

export function Invoices() {
  const toast = useToast();
  const resource = useResource(loadInvoices);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [paying, setPaying] = useState<VendorInvoice | null>(null);
  const [paidInput, setPaidInput] = useState('');
  const [removing, setRemoving] = useState<VendorInvoice | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const shareFiles = useMemo(canShareFiles, []);

  const invoices = resource.data?.invoices ?? [];
  const brand = resource.data?.brand ?? normalizeBrandSettings(null);
  const brandMissing = !!resource.data && !brand.brandName.trim();

  const sorted = useMemo(
    () =>
      [...invoices].sort(
        (a, b) => b.issueDate.localeCompare(a.issueDate) || b.invoiceNumber.localeCompare(a.invoiceNumber),
      ),
    [invoices],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((row) => {
      if (filter === 'paid' && row.status !== 'paid') return false;
      if (filter === 'open' && row.status === 'paid') return false;
      if (!q) return true;
      return [row.clientName, row.clientPhone, row.invoiceNumber].some((value) => value.toLowerCase().includes(q));
    });
  }, [sorted, search, filter]);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  const stats = useMemo(() => {
    const total = invoices.reduce((sum, row) => sum + row.total, 0);
    const collected = invoices.reduce((sum, row) => sum + row.depositPaid, 0);
    const open = invoices.filter((row) => row.status !== 'paid').length;
    return { total, collected, outstanding: Math.max(0, total - collected), open };
  }, [invoices]);

  function select(row: VendorInvoice) {
    setSelectedId(row.id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async function create(draft: InvoiceDraft) {
    setSaving(true);
    try {
      const made: { invoice?: VendorInvoice } = {};
      const saved = await invoicesApi.update((current) => {
        // Numbered against the list as stored right now, not the copy on screen.
        made.invoice = {
          ...draft,
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          invoiceNumber: nextInvoiceNumber(normalizeInvoices(current)),
        };
        return [made.invoice, ...current];
      });
      resource.set((data) => (data ? { ...data, invoices: saved } : data));
      setCreating(false);
      if (made.invoice) {
        setFilter('all');
        setSearch('');
        setSelectedId(made.invoice.id);
        toast.success(`صدرت الفاتورة ${made.invoice.invoiceNumber}.`);
      }
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!paying) return;
    const amount = Number(paidInput);
    if (!Number.isFinite(amount) || amount < 0) return toast.failure('اكتب مبلغاً صحيحاً.');
    if (amount > paying.total + 0.005) return toast.failure('المبلغ أكبر من إجمالي الفاتورة.');
    const next = withPayment(paying, amount);
    setSaving(true);
    try {
      const saved = await invoicesApi.update((current) => replaceInvoice(current, next));
      resource.set((data) => (data ? { ...data, invoices: saved } : data));
      setPaying(null);
      toast.success(`صارت الفاتورة «${INVOICE_STATUS_LABEL[next.status]}».`);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    const target = removing;
    setSaving(true);
    try {
      const saved = await invoicesApi.update((current) =>
        current.filter((row) => !(row && typeof row === 'object' && (row as { id?: unknown }).id === target.id)),
      );
      resource.set((data) => (data ? { ...data, invoices: saved } : data));
      setRemoving(null);
      toast.success(`حُذفت الفاتورة ${target.invoiceNumber}.`);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function runPdf(key: string, task: () => Promise<void>) {
    setBusyAction(key);
    try {
      await task();
    } catch (caught) {
      console.error('PDF export failed', caught);
      toast.failure(PDF_ERROR);
    } finally {
      setBusyAction(null);
    }
  }

  async function shareFile(invoice: VendorInvoice) {
    setBusyAction(`share-${invoice.id}`);
    try {
      const { invoicePdfFile } = await pdf();
      const file = await invoicePdfFile(invoice, brand);
      await navigator.share({ files: [file], title: invoice.invoiceNumber, text: shareMessage(invoice, brand) });
    } catch (caught) {
      // Closing the share sheet is not an error.
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) toast.failure(PDF_ERROR);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <PageHeader
        title="الفواتير"
        subtitle="فواتير وسندات قبض باسم منشأتك وشعارك، مع رمز هيئة الزكاة إذا عندك رقم ضريبي."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              busy={resource.refreshing}
              icon={<RefreshCw size={15} />}
              onClick={() => void resource.reload()}
            >
              تحديث
            </Button>
            <Button size="sm" icon={<Palette size={15} />} onClick={() => navigate('brand')}>
              الهوية
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={15} />}
              disabled={!resource.data}
              onClick={() => setCreating(true)}
            >
              فاتورة جديدة
            </Button>
          </div>
        }
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      {brandMissing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-wash)] px-4 py-3">
          <p className="text-[13px] leading-6 text-ink">
            ما عبّيت «الهوية والفواتير» بعد — الفاتورة تطلع بدون اسم منشأتك وشعارك وحسابك البنكي.
          </p>
          <Button size="sm" variant="secondary" icon={<Palette size={15} />} onClick={() => navigate('brand')}>
            أكمل الهوية
          </Button>
        </div>
      ) : null}

      {resource.loading ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <Skeleton className="h-80 w-full" />
          </Card>
          <Card className="lg:col-span-3">
            <Skeleton className="h-80 w-full" />
          </Card>
        </div>
      ) : resource.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="الفواتير" value={count(invoices.length)} hint={`${count(stats.open)} بانتظار السداد`} icon={<FileText size={16} />} />
            <StatTile label="إجمالي الفواتير" value={sar(stats.total)} icon={<Receipt size={16} />} />
            <StatTile label="المحصّل" value={sar(stats.collected)} icon={<Wallet size={16} />} />
            <StatTile label="المتبقي على العملاء" value={sar(stats.outstanding)} icon={<Wallet size={16} />} />
          </div>

          {!invoices.length ? (
            <Card>
              <EmptyState
                icon={<Receipt size={26} />}
                title="ما أصدرت فواتير بعد"
                body="أصدر فاتورة من طلب في متجرك، أو من حجز في التقويم، أو اكتبها يدوياً."
                action={
                  <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                    فاتورة جديدة
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-5">
              <Card padded={false} className="lg:col-span-2">
                <Toolbar search={search} onSearch={setSearch} placeholder="ابحث بالعميل أو رقم الفاتورة…">
                  <FilterTabs<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: 'all', label: 'الكل', count: invoices.length },
                      { value: 'open', label: 'غير مسددة', count: stats.open },
                      { value: 'paid', label: 'مدفوعة', count: invoices.length - stats.open },
                    ]}
                  />
                </Toolbar>
                {rows.length ? (
                  <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
                    {rows.map((row) => {
                      const active = selected?.id === row.id;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => select(row)}
                            aria-current={active ? 'true' : undefined}
                            className={`w-full px-4 py-3 text-start transition-colors ${
                              active ? 'bg-[var(--accent-wash)]' : 'hover:bg-sunken/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-ink">{row.clientName || '—'}</span>
                              <Badge tone={STATUS_TONE[row.status]}>{INVOICE_STATUS_LABEL[row.status]}</Badge>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-secondary">
                              <span dir="ltr" className="font-mono">
                                {row.invoiceNumber}
                              </span>
                              <span className="tabular font-medium text-ink">{sar2(row.total)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-ink-muted">{shortDate(row.issueDate)}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState title="ما فيه فواتير تطابق البحث" />
                )}
              </Card>

              <div ref={previewRef} className="scroll-mt-4 space-y-3 lg:col-span-3">
                {selected ? (
                  <>
                    <Card>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<Download size={15} />}
                          busy={busyAction === `pdf-${selected.id}`}
                          onClick={() =>
                            void runPdf(`pdf-${selected.id}`, async () => (await pdf()).downloadInvoicePdf(selected, brand))
                          }
                        >
                          تحميل PDF
                        </Button>
                        {selected.depositPaid > 0 ? (
                          <Button
                            size="sm"
                            icon={<Receipt size={15} />}
                            busy={busyAction === `rec-${selected.id}`}
                            onClick={() =>
                              void runPdf(`rec-${selected.id}`, async () => (await pdf()).downloadReceiptPdf(selected, brand))
                            }
                          >
                            سند قبض
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          icon={<Printer size={15} />}
                          busy={busyAction === `print-${selected.id}`}
                          onClick={() => {
                            // Opened inside the click so the popup is allowed; the PDF fills it once built.
                            const tab = openPrintTab();
                            void runPdf(`print-${selected.id}`, async () => {
                              try {
                                await (await pdf()).printInvoicePdf(selected, brand, tab);
                              } catch (caught) {
                                tab?.close();
                                throw caught;
                              }
                            });
                          }}
                        >
                          طباعة
                        </Button>
                        <a
                          href={whatsappShareUrl(selected.clientPhone, shareMessage(selected, brand))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken"
                        >
                          <MessageCircle size={15} aria-hidden />
                          واتساب
                        </a>
                        {shareFiles ? (
                          <Button
                            size="sm"
                            icon={<Share2 size={15} />}
                            busy={busyAction === `share-${selected.id}`}
                            onClick={() => void shareFile(selected)}
                          >
                            مشاركة الملف
                          </Button>
                        ) : null}
                        <span className="flex-1" />
                        {selected.status !== 'paid' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Wallet size={15} />}
                            onClick={() => {
                              setPaying(selected);
                              setPaidInput(String(selected.depositPaid || ''));
                            }}
                          >
                            تسجيل دفعة
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="حذف الفاتورة"
                          icon={<Trash2 size={15} />}
                          onClick={() => setRemoving(selected)}
                        />
                      </div>
                      {!selected.clientPhone ? (
                        <p className="mt-2 text-xs text-ink-muted">
                          ما فيه جوال للعميل — زر واتساب يفتح الرسالة وتختار المحادثة بنفسك.
                        </p>
                      ) : null}
                    </Card>
                    <InvoiceView invoice={selected} brand={brand} />
                  </>
                ) : (
                  <Card>
                    <EmptyState icon={<FileText size={22} />} title="اختر فاتورة لعرضها" />
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {resource.data ? (
        <InvoiceFormModal
          open={creating}
          onClose={() => setCreating(false)}
          brand={brand}
          existing={invoices}
          saving={saving}
          onSubmit={(draft) => void create(draft)}
        />
      ) : null}

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="تسجيل دفعة"
        description={paying ? `${paying.invoiceNumber} — الإجمالي ${sar2(paying.total)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaying(null)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="primary" busy={saving} onClick={() => void recordPayment()}>
              حفظ
            </Button>
          </>
        }
      >
        {paying ? (
          <>
            <Field
              label="إجمالي المدفوع حتى الآن"
              hint={`المتبقي بعد الحفظ: ${sar2(round2(Math.max(0, paying.total - (Number(paidInput) || 0))))}`}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
              />
            </Field>
            <Button size="sm" variant="secondary" onClick={() => setPaidInput(String(paying.total))}>
              سدد بالكامل ({sar2(paying.total)})
            </Button>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        title="حذف الفاتورة؟"
        body={removing ? `تنحذف ${removing.invoiceNumber} (${removing.clientName}) من سجل فواتيرك. ما يمكن التراجع.` : ''}
        confirmLabel="حذف"
        danger
        busy={saving}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
