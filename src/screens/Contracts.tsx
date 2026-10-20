import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, Download, FilePenLine, FileSignature, Pencil, Plus, Printer, RefreshCw, Send, Trash2 } from 'lucide-react';
import { errorText } from '../api/client.ts';
import { office } from '../api/office.ts';
import { normalizeBrandSettings, type VendorBrandSettings } from '../api/brand.ts';
import { contractsApi, type Contract, type ContractDraft, type ContractStatus } from '../api/contracts.ts';
import { useResource } from '../lib/useResource.ts';
import { usePoll } from '../lib/usePoll.ts';
import { shortDate } from '../lib/format.ts';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE, LEGACY_LABEL } from '../lib/contracts.ts';
import { useToast } from '../state/ToastContext.tsx';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, PageHeader, Skeleton } from '../components/ui/primitives.tsx';
import { FilterTabs, Toolbar } from '../components/ui/Table.tsx';
import { ConfirmDialog, Modal } from '../components/ui/Modal.tsx';
import { sar2 } from '../components/invoices/InvoiceFormModal.tsx';
import { ContractFormModal } from '../components/contracts/ContractFormModal.tsx';
import { ContractView } from '../components/contracts/ContractView.tsx';
import { ContractTimeline, SignatureProofCard, SignLinkCard } from '../components/contracts/ContractSidePanels.tsx';

type Filter = 'all' | ContractStatus;
type Loaded = { contracts: Contract[]; brand: VendorBrandSettings };

const PDF_ERROR = 'تعذّر إنشاء ملف PDF. تحقق من الاتصال ثم حاول مرة أخرى.';

async function load(): Promise<Loaded> {
  // Branding is a nicety: a failed office read never hides the contracts.
  const [contracts, brand] = await Promise.all([
    contractsApi.list(),
    office
      .read()
      .then((data) => normalizeBrandSettings(data.brandSettings))
      .catch(() => normalizeBrandSettings(null)),
  ]);
  return { contracts, brand };
}

/** The PDF stack is only fetched when a document is made. */
const pdf = () => import('../lib/contractPdf.ts');

function openPrintTab(): Window | null {
  const tab = window.open('', '_blank');
  try {
    tab?.document.write(
      '<!doctype html><meta charset="utf-8"><title>…</title><body dir="rtl" style="font-family:system-ui;padding:24px;color:#52514e">جارٍ تجهيز العقد للطباعة…</body>',
    );
  } catch {
    /* the PDF replaces the tab either way */
  }
  return tab;
}

export function Contracts() {
  const toast = useToast();
  const resource = useResource(load);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'send' | 'cancel' | 'delete'; contract: Contract } | null>(null);
  const [justSent, setJustSent] = useState<{ contract: Contract; signUrl: string } | null>(null);
  /** Signed contracts with their signature image, fetched on demand. */
  const [details, setDetails] = useState<Record<string, Contract>>({});
  const previewRef = useRef<HTMLDivElement>(null);

  const contracts = resource.data?.contracts ?? [];
  const brand = resource.data?.brand ?? normalizeBrandSettings(null);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: contracts.length, draft: 0, sent: 0, signed: 0, cancelled: 0 };
    for (const row of contracts) out[row.status] += 1;
    return out;
  }, [contracts]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!q) return true;
      return [row.client.name, row.client.phone, row.number, row.event.service].some((value) =>
        String(value || '').toLowerCase().includes(q),
      );
    });
  }, [contracts, filter, search]);

  const listed = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  // A cached detail only wins while it is at least as new as the list row.
  const detail = listed ? details[listed.id] : undefined;
  const fresh = detail && listed && detail.updatedAt >= listed.updatedAt ? detail : undefined;
  const selected = fresh ?? listed;

  // While a link is out, check now and then whether the client has signed.
  usePoll(() => void resource.reload(), 30_000, counts.sent > 0);

  // A signed contract's image only comes with the single-contract read.
  useEffect(() => {
    if (!listed || !listed.signature?.hasImage || fresh?.signature?.image) return;
    let live = true;
    contractsApi
      .get(listed.id)
      .then((full) => {
        if (live) setDetails((current) => ({ ...current, [full.id]: full }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listed, fresh]);

  function replace(next: Contract) {
    setDetails((current) => ({ ...current, [next.id]: next }));
    resource.set((data) =>
      data
        ? {
            ...data,
            contracts: data.contracts.some((row) => row.id === next.id)
              ? data.contracts.map((row) => (row.id === next.id ? next : row))
              : [next, ...data.contracts],
          }
        : data,
    );
  }

  function select(row: Contract) {
    setSelectedId(row.id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async function save(draft: ContractDraft) {
    setSaving(true);
    try {
      const saved = editing ? await contractsApi.update(editing.id, draft) : await contractsApi.create(draft);
      replace(saved);
      setFormOpen(false);
      setEditing(null);
      setFilter('all');
      setSearch('');
      setSelectedId(saved.id);
      toast.success(editing ? `حُفظ تعديل ${saved.number}.` : `حُفظت المسودة ${saved.number}.`);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function runConfirmed() {
    if (!confirm) return;
    const { kind, contract } = confirm;
    setBusy(kind);
    try {
      if (kind === 'send') {
        const { contract: sent, signUrl } = await contractsApi.send(contract.id);
        replace(sent);
        setJustSent({ contract: sent, signUrl });
      } else if (kind === 'cancel') {
        replace(await contractsApi.cancel(contract.id));
        toast.success(`أُلغي العقد ${contract.number} — رابط التوقيع لم يعد يعمل.`);
      } else {
        await contractsApi.remove(contract.id);
        resource.set((data) => (data ? { ...data, contracts: data.contracts.filter((row) => row.id !== contract.id) } : data));
        setSelectedId(null);
        toast.success(`حُذفت المسودة ${contract.number}.`);
      }
      setConfirm(null);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function runPdf(key: string, job: () => Promise<void>) {
    setBusy(key);
    try {
      await job();
    } catch {
      toast.failure(PDF_ERROR);
    } finally {
      setBusy(null);
    }
  }

  /** The PDF of a signed contract must carry the signature image. */
  async function full(contract: Contract): Promise<Contract> {
    if (!contract.signature?.hasImage || contract.signature.image) return contract;
    // hasImage only appears on list rows; the fetched one carries the image itself.
    const fetched = await contractsApi.get(contract.id);
    setDetails((current) => ({ ...current, [fetched.id]: fetched }));
    return fetched;
  }

  return (
    <>
      <PageHeader
        title="العقود"
        subtitle="جهّز العقد، أرسل للعميل رابطاً خاصاً، ويوقّعه بنفسه من جواله."
        action={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              icon={<RefreshCw size={15} className={resource.refreshing ? 'animate-spin' : ''} />}
              onClick={() => void resource.reload()}
              aria-label="تحديث"
            />
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              عقد جديد
            </Button>
          </div>
        }
      />

      {resource.error && !resource.data ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

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
        !contracts.length ? (
          <Card>
            <EmptyState
              icon={<FileSignature size={26} />}
              title="ما عندك عقود بعد"
              body="أنشئ عقداً من طلب في متجرك، أو من حجز في التقويم، أو اكتبه يدوياً — ثم أرسل للعميل رابط التوقيع."
              action={
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setFormOpen(true)}>
                  عقد جديد
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <Card padded={false} className="lg:col-span-2">
              <Toolbar search={search} onSearch={setSearch} placeholder="ابحث بالعميل أو الجوال أو رقم العقد…" />
              <div className="border-b border-line p-3">
                <FilterTabs<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'الكل', count: counts.all },
                    { value: 'draft', label: CONTRACT_STATUS_LABEL.draft, count: counts.draft },
                    { value: 'sent', label: CONTRACT_STATUS_LABEL.sent, count: counts.sent },
                    { value: 'signed', label: CONTRACT_STATUS_LABEL.signed, count: counts.signed },
                    { value: 'cancelled', label: CONTRACT_STATUS_LABEL.cancelled, count: counts.cancelled },
                  ]}
                />
              </div>
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
                          className={`w-full px-4 py-3 text-start transition-colors ${active ? 'bg-[var(--accent-wash)]' : 'hover:bg-sunken/70'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-ink">{row.client.name || '—'}</span>
                            <Badge tone={CONTRACT_STATUS_TONE[row.status]}>{CONTRACT_STATUS_LABEL[row.status]}</Badge>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-secondary">
                            <span dir="ltr" className="font-mono">
                              {row.number}
                            </span>
                            <span className="tabular font-medium text-ink">{sar2(row.amounts.total)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">
                            {row.event.service} · {shortDate(row.event.date)}
                          </p>
                          {row.legacy ? <p className="mt-1 text-[11px] font-medium text-[var(--critical)]">{LEGACY_LABEL}</p> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="ما فيه عقود تطابق البحث" />
              )}
            </Card>

            <div ref={previewRef} className="scroll-mt-4 space-y-3 lg:col-span-3">
              {selected ? (
                <>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.status === 'draft' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<Send size={15} />}
                          onClick={() => setConfirm({ kind: 'send', contract: selected })}
                        >
                          إرسال للعميل للتوقيع
                        </Button>
                      ) : null}
                      {selected.status === 'draft' || selected.status === 'sent' ? (
                        <Button
                          size="sm"
                          icon={<Pencil size={15} />}
                          onClick={() => {
                            setEditing(selected);
                            setFormOpen(true);
                          }}
                        >
                          تعديل
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant={selected.status === 'signed' && !selected.legacy ? 'primary' : 'secondary'}
                        icon={<Download size={15} />}
                        busy={busy === `pdf-${selected.id}`}
                        onClick={() =>
                          void runPdf(`pdf-${selected.id}`, async () => (await pdf()).downloadContractPdf(await full(selected), brand))
                        }
                      >
                        {selected.status === 'signed' && !selected.legacy ? 'تحميل العقد الموقّع PDF' : 'تحميل PDF'}
                      </Button>
                      <Button
                        size="sm"
                        icon={<Printer size={15} />}
                        busy={busy === `print-${selected.id}`}
                        onClick={() => {
                          const tab = openPrintTab();
                          void runPdf(`print-${selected.id}`, async () =>
                            (await pdf()).printContractPdf(await full(selected), brand, tab),
                          );
                        }}
                      >
                        طباعة
                      </Button>
                      <span className="flex-1" />
                      {selected.status === 'draft' || selected.status === 'sent' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Ban size={15} />}
                          onClick={() => setConfirm({ kind: 'cancel', contract: selected })}
                        >
                          إلغاء العقد
                        </Button>
                      ) : null}
                      {selected.status === 'draft' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="حذف المسودة"
                          icon={<Trash2 size={15} />}
                          onClick={() => setConfirm({ kind: 'delete', contract: selected })}
                        />
                      ) : null}
                    </div>
                  </Card>

                  {selected.status === 'sent' && selected.signUrl ? (
                    <Card>
                      <CardHeader
                        title="بانتظار توقيع العميل"
                        subtitle="أرسل الرابط للعميل. يفتحه من جواله، يقرأ العقد، ويوقّع بإصبعه — بدون تسجيل دخول."
                      />
                      <SignLinkCard contract={selected} signUrl={selected.signUrl} brandName={brand.brandName} />
                    </Card>
                  ) : null}

                  {selected.legacy ? (
                    <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2 text-[13px] text-ink">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--critical)]" aria-hidden />
                      <span>
                        <strong>{LEGACY_LABEL}.</strong>{' '}
                        {selected.status === 'signed'
                          ? 'هذا السجل منقول من اللوحة القديمة كما هو، ولا يُعد إثباتاً لتوقيع العميل.'
                          : 'نُقل كمسودة — أرسله للعميل ليوقّعه بنفسه.'}
                      </span>
                    </p>
                  ) : null}

                  <div className="grid items-start gap-3 md:grid-cols-2">
                    <SignatureProofCard contract={selected} />
                    <ContractTimeline contract={selected} />
                  </div>
                  <ContractView contract={selected} brand={brand} />
                </>
              ) : (
                <Card>
                  <EmptyState icon={<FilePenLine size={22} />} title="اختر عقداً لعرضه" />
                </Card>
              )}
            </div>
          </div>
        )
      ) : null}

      <ContractFormModal
        open={formOpen}
        editing={editing}
        saving={saving}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(draft) => void save(draft)}
      />

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === 'send' ? 'إرسال العقد للعميل؟' : confirm?.kind === 'cancel' ? 'إلغاء العقد؟' : 'حذف المسودة؟'
        }
        body={
          !confirm
            ? ''
            : confirm.kind === 'send'
              ? `يصدر رابط توقيع خاص لـ ${confirm.contract.client.name}، ويُسجّل العقد صادراً باسم منشأتك. تقدر تعدّله قبل توقيع العميل.`
              : confirm.kind === 'cancel'
                ? `يتوقف رابط التوقيع لـ ${confirm.contract.number} ولا يقدر العميل يوقّعه. ما يمكن التراجع.`
                : `تُحذف ${confirm.contract.number} نهائياً.`
        }
        confirmLabel={confirm?.kind === 'send' ? 'إصدار رابط التوقيع' : confirm?.kind === 'cancel' ? 'إلغاء العقد' : 'حذف'}
        danger={confirm?.kind !== 'send'}
        busy={busy === confirm?.kind}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setConfirm(null)}
      />

      <Modal
        open={!!justSent}
        onClose={() => setJustSent(null)}
        title="رابط التوقيع جاهز"
        description={justSent ? `أرسله لـ ${justSent.contract.client.name} ليقرأ العقد ${justSent.contract.number} ويوقّعه.` : undefined}
        footer={
          <Button variant="primary" onClick={() => setJustSent(null)}>
            تم
          </Button>
        }
      >
        {justSent ? <SignLinkCard contract={justSent.contract} signUrl={justSent.signUrl} brandName={brand.brandName} /> : null}
      </Modal>

    </>
  );
}
