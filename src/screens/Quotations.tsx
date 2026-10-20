import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Copy, FileText, MessageCircle, Pencil, Plus, Printer, RefreshCw, Trash2, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Select, TableSkeleton, type Tone } from '../components/ui/primitives.tsx';
import { FilterTabs } from '../components/ui/Table.tsx';
import { ConfirmDialog } from '../components/ui/Modal.tsx';
import { PrintSheet } from '../components/finance/PrintSheet.tsx';
import { QuotationFormModal, type QuotationDraft } from '../components/quotations/QuotationFormModal.tsx';
import { QuotationPrint } from '../components/quotations/QuotationPrint.tsx';
import {
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LABEL,
  defaultValidUntil,
  effectiveStatus,
  hasWhatsAppPhone,
  newQuotationId,
  nextQuoteNumber,
  quotationShareText,
  type Quotation,
  type QuotationStatus,
} from '../components/quotations/model.ts';
import { finance, type BrandInfo } from '../api/finance.ts';
import { listings as listingsApi } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { count, sar } from '../lib/format.ts';
import { riyadhToday } from '../lib/finance.ts';
import { whatsappChatUrl, whatsappShareUrl } from '../lib/whatsappTemplates.ts';
import { useToast } from '../state/ToastContext.tsx';

type Filter = 'all' | QuotationStatus;

const STATUS_TONE: Record<QuotationStatus, Tone> = {
  draft: 'neutral',
  sent: 'accent',
  accepted: 'good',
  rejected: 'critical',
  expired: 'warning',
};

const EMPTY_BRAND: BrandInfo = {
  brandName: '',
  phone: '',
  email: '',
  city: '',
  address: '',
  crNumber: '',
  vatNumber: '',
  logoUrl: '',
};

/**
 * عروض الأسعار — the quotations of the old «الثقة والنمو» hub, now saved in
 * the vendor's office with real sharing: the text goes out from the vendor's
 * own WhatsApp, and a clean page prints or saves as PDF.
 */
export function Quotations() {
  const toast = useToast();
  const officeRes = useResource(() => finance.load(), []);
  // Listings only prefill items; the screen works without them.
  const listingsRes = useResource(() => listingsApi.list(), []);
  const listings = useMemo(() => listingsRes.data ?? [], [listingsRes.data]);
  const quotations = useMemo(() => officeRes.data?.quotations ?? [], [officeRes.data]);
  const officeBrand = officeRes.data?.brand ?? EMPTY_BRAND;
  const brand: BrandInfo = { ...officeBrand, brandName: officeBrand.brandName || listings[0]?.vendorName || '' };

  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [removing, setRemoving] = useState<Quotation | null>(null);
  const [printing, setPrinting] = useState<Quotation | null>(null);
  const [busy, setBusy] = useState(false);

  const today = riyadhToday();
  const counts = useMemo(() => {
    const map: Record<QuotationStatus, number> = { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
    quotations.forEach((row) => {
      map[effectiveStatus(row, today)] += 1;
    });
    return map;
  }, [quotations, today]);

  const visible = useMemo(
    () =>
      quotations
        .filter((row) => filter === 'all' || effectiveStatus(row, today) === filter)
        .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)),
    [quotations, filter, today],
  );

  const applyList = (next: Quotation[]) =>
    officeRes.set((current) =>
      current ? { ...current, quotations: next } : { expenses: [], quotations: next, brand: EMPTY_BRAND },
    );

  const run = async (work: () => Promise<Quotation[]>, success: string) => {
    setBusy(true);
    try {
      applyList(await work());
      toast.success(success);
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (draft: QuotationDraft) => {
    const now = new Date().toISOString();
    let ok: boolean;
    if (editing) {
      const sentAt = draft.status === 'sent' && !editing.sentAt ? now : editing.sentAt;
      ok = await run(
        () => finance.saveQuotation({ ...editing, ...draft, updatedAt: now, sentAt }),
        `حفظنا تعديل العرض ${editing.quoteNumber}.`,
      );
    } else {
      ok = await run(
        () =>
          finance.addQuotation((current) => {
            return {
              ...draft,
              id: newQuotationId(),
              quoteNumber: nextQuoteNumber(current, today),
              createdAt: now,
              updatedAt: now,
              sentAt: draft.status === 'sent' ? now : undefined,
            };
          }),
        'حفظنا عرض السعر.',
      );
    }
    if (ok) {
      setFormOpen(false);
      setEditing(null);
    }
  };

  const setStatus = (row: Quotation, status: QuotationStatus) => {
    if (status === row.status) return;
    const now = new Date().toISOString();
    void run(
      () => finance.saveQuotation({ ...row, status, updatedAt: now, sentAt: status === 'sent' && !row.sentAt ? now : row.sentAt }),
      `العرض ${row.quoteNumber} صار «${QUOTATION_STATUS_LABEL[status]}».`,
    );
  };

  const duplicate = (row: Quotation) => {
    const now = new Date().toISOString();
    void run(
      () =>
        finance.addQuotation((current) => {
          return {
            ...row,
            id: newQuotationId(),
            quoteNumber: nextQuoteNumber(current, today),
            status: 'draft',
            validUntil: defaultValidUntil(),
            createdAt: now,
            updatedAt: now,
            sentAt: undefined,
          };
        }),
      `نسخنا العرض ${row.quoteNumber} كمسودة جديدة.`,
    );
  };

  const share = (row: Quotation) => {
    const text = quotationShareText(row, brand.brandName);
    const url = whatsappChatUrl(row.clientPhone, text) || whatsappShareUrl(text);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Opening WhatsApp is the vendor sending it; a draft moves to «أُرسل».
    if (row.status === 'draft') setStatus(row, 'sent');
  };

  const remove = async () => {
    if (!removing) return;
    const target = removing;
    if (await run(() => finance.removeQuotation(target.id), `حذفنا العرض ${target.quoteNumber}.`)) setRemoving(null);
  };

  const stopPrinting = useCallback(() => setPrinting(null), []);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="عروض الأسعار"
        subtitle="جهّز عرض سعر للشركات والعملاء، وأرسله بواتساب أو اطبعه PDF."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<RefreshCw size={15} />} busy={officeRes.refreshing} onClick={() => void officeRes.reload()}>
              تحديث
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={openNew}>
              عرض سعر جديد
            </Button>
          </div>
        }
      />

      <FilterTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'الكل', count: quotations.length },
          ...QUOTATION_STATUSES.map((key) => ({ value: key, label: QUOTATION_STATUS_LABEL[key], count: counts[key] })),
        ]}
      />

      {officeRes.error ? <ErrorNote message={officeRes.error} onRetry={() => void officeRes.reload()} /> : null}

      {officeRes.loading ? (
        <Card>
          <TableSkeleton rows={3} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title={quotations.length ? 'ما فيه عروض بهذه الحالة' : 'ما جهّزت عروض أسعار بعد'}
            body={
              quotations.length
                ? undefined
                : 'أضف بنود الخدمة (أو اخترها من منتجاتك)، ونحسب الضريبة 15٪ والعربون. بعدها أرسله للعميل بواتساب أو اطبعه.'
            }
            action={
              quotations.length ? undefined : (
                <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                  عرض سعر جديد
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {visible.map((row) => {
            const status = effectiveStatus(row, today);
            return (
              <li key={row.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-xs text-ink-muted" dir="ltr">
                          {row.quoteNumber}
                        </span>
                        <Badge tone={STATUS_TONE[status]}>{QUOTATION_STATUS_LABEL[status]}</Badge>
                        {row.companyName ? <Badge tone="accent">{row.companyName}</Badge> : null}
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-ink">{row.eventTitle || 'عرض سعر'}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-secondary">
                        <span className="font-medium text-ink">{row.clientName}</span>
                        {row.clientPhone ? (
                          <span className="tabular" dir="ltr">
                            {row.clientPhone}
                          </span>
                        ) : null}
                        {row.eventDate || row.city ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={14} />
                            <span className="tabular">{[row.eventDate, row.city].filter(Boolean).join(' · ')}</span>
                          </span>
                        ) : null}
                        {row.guestCount > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Users size={14} />
                            {count(row.guestCount)} ضيف
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-ink-muted">الإجمالي شامل الضريبة</div>
                      <div className="tabular text-lg font-semibold text-ink">{sar(row.grandTotal)}</div>
                      {row.depositRequired > 0 ? (
                        <div className="tabular text-xs text-ink-secondary">
                          العربون {row.depositPercent}٪: {sar(row.depositRequired)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <ul className="space-y-0.5 border-t border-line pt-2 text-[13px] text-ink-secondary">
                    {row.items.map((item, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="truncate">
                          {item.title} × {item.quantity}
                        </span>
                        <span className="tabular shrink-0">{sar(item.total)}</span>
                      </li>
                    ))}
                  </ul>

                  {row.customNote ? (
                    <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-secondary">{row.customNote}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>ساري حتى {row.validUntil || '—'}</span>
                      <div className="w-32">
                        <Select
                          aria-label="حالة العرض"
                          className="h-8 text-[13px]"
                          value={row.status}
                          disabled={busy}
                          onChange={(event) => setStatus(row, event.target.value as QuotationStatus)}
                        >
                          {QUOTATION_STATUSES.map((key) => (
                            <option key={key} value={key}>
                              {QUOTATION_STATUS_LABEL[key]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<MessageCircle size={15} />}
                        title={hasWhatsAppPhone(row.clientPhone) ? `إرسال إلى ${row.clientPhone}` : 'ما فيه جوال صالح — تختار المحادثة في واتساب'}
                        onClick={() => share(row)}
                      >
                        واتساب
                      </Button>
                      <Button size="sm" icon={<Printer size={15} />} onClick={() => setPrinting(row)}>
                        طباعة / PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="تعديل"
                        title="تعديل"
                        icon={<Pencil size={15} />}
                        onClick={() => {
                          setEditing(row);
                          setFormOpen(true);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="نسخ كعرض جديد"
                        title="نسخ كعرض جديد"
                        icon={<Copy size={15} />}
                        disabled={busy}
                        onClick={() => duplicate(row)}
                      />
                      <Button size="sm" variant="ghost" aria-label="حذف" title="حذف" icon={<Trash2 size={15} />} onClick={() => setRemoving(row)} />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <QuotationFormModal
        open={formOpen}
        editing={editing}
        listings={listings}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(draft) => void save(draft)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="حذف عرض السعر"
        body={removing ? `بتحذف العرض ${removing.quoteNumber} لـ ${removing.clientName}. ما تقدر ترجع عن الحذف.` : ''}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => (busy ? undefined : setRemoving(null))}
      />

      {printing ? (
        <PrintSheet onDone={stopPrinting}>
          <QuotationPrint row={printing} brand={brand} />
        </PrintSheet>
      ) : null}
    </div>
  );
}
