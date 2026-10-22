import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ChevronDown, Clock, Inbox, MapPin, MessageCircle, MessageSquareText, Phone, PlayCircle, RefreshCw, X } from 'lucide-react';
import { orders as ordersApi } from '../api/endpoints.ts';
import { office } from '../api/office.ts';
import { brandFromOffice } from '../api/finance.ts';
import { CLIENT_TEMPLATES, fillTemplate, whatsappChatUrl } from '../lib/whatsappTemplates.ts';
import type { PlatformOrder } from '../api/types.ts';
import { errorText } from '../api/client.ts';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, PageHeader, TableSkeleton, Textarea, type Tone } from '../components/ui/primitives.tsx';
import { FilterTabs } from '../components/ui/Table.tsx';
import { ConfirmDialog } from '../components/ui/Modal.tsx';
import { useResource } from '../lib/useResource.ts';
import { usePoll } from '../lib/usePoll.ts';
import { sar } from '../lib/format.ts';
import { bookingStatusLabel } from '../lib/labels.ts';
import { useToast } from '../state/ToastContext.tsx';
import { useUnread } from '../state/UnreadContext.tsx';

const PENDING = 'بانتظار موافقة المورّد';
const NEW = 'جديد';
const CONFIRMED = 'مؤكد';
const IN_PROGRESS = 'قيد التنفيذ';
const COMPLETED = 'مكتمل';
const REJECTED = 'مرفوض من المورّد';
const CANCELLED = 'ملغي';
const FINAL = new Set([COMPLETED, REJECTED, CANCELLED]);

const STATUS_TONE: Record<string, Tone> = {
  [PENDING]: 'warning',
  [NEW]: 'neutral',
  [CONFIRMED]: 'accent',
  [IN_PROGRESS]: 'accent',
  [COMPLETED]: 'good',
  [REJECTED]: 'critical',
  [CANCELLED]: 'neutral',
};

type Filter = 'pending' | 'open' | 'all';

type Action = { order: PlatformOrder; next: string; title: string; body: string; label: string; danger: boolean };

function whatsappUrl(phone: string, text: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('05') ? `966${digits.slice(1)}` : digits.startsWith('966') ? digits : '';
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : null;
}

/** The ready-made client messages (`lib/whatsappTemplates.ts`) filled for one order. */
function orderMessages(order: PlatformOrder, brand: string): Array<{ id: string; label: string; url: string }> {
  const paid = order.paymentStatus === 'paid';
  const values = {
    name: order.name,
    brand,
    service: order.serviceName || order.items?.[0]?.title || '',
    date: order.eventDate,
    time: order.eventTime,
    venue: order.city,
    city: order.city,
    bookingNumber: order.id,
    amount: order.totalAmount,
    remaining: paid ? 0 : order.totalAmount,
  };
  return CLIENT_TEMPLATES
    // A paid store order has nothing left to collect.
    .filter((template) => !(paid && template.id === 'remaining'))
    .map((template) => {
      let text = fillTemplate(template.body, values);
      if (template.id === 'remaining' && order.paymentUrl) text += `\nرابط الدفع: ${order.paymentUrl}`;
      return { id: template.id, label: template.label, url: whatsappChatUrl(order.phone, text) };
    })
    .filter((message) => Boolean(message.url));
}

/** A small menu of ready-made WhatsApp messages; each opens wa.me with the text filled in. */
function WhatsAppTemplatesMenu({ order, brand }: { order: PlatformOrder; brand: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const messages = open ? orderMessages(order, brand) : [];
  if (!whatsappChatUrl(order.phone)) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 hover:text-accent"
      >
        <MessageSquareText size={14} />
        رسائل جاهزة
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute start-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-pop)]"
        >
          {messages.map((message) => (
            <a
              key={message.id}
              role="menuitem"
              href={message.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink transition-colors hover:bg-sunken"
            >
              <MessageCircle size={14} className="shrink-0 text-ink-muted" />
              {message.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * طلبات المتجر — orders customers placed on usil.app for this vendor's
 * products. Approval-mode orders wait here unpaid: accepting one sends the
 * customer the payment link; once paid the vendor starts and completes it.
 */
export function Orders() {
  const toast = useToast();
  const { refreshOrders } = useUnread();
  const resource = useResource(() => ordersApi.list(), []);
  usePoll(() => void resource.reload(), 60_000);
  // Only signs the WhatsApp messages; without it they read «فريقنا».
  const brandRes = useResource(() => office.read().then((data) => brandFromOffice(data).brandName), []);
  const brandName = brandRes.data || '';
  const rows = resource.data ?? [];
  const pendingCount = rows.filter((row) => row.status === PENDING).length;
  const [filter, setFilter] = useState<Filter>('all');
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  // Shown to the client on their order, so they know why without a chat.
  const [reason, setReason] = useState('');

  const visible = useMemo(() => {
    const list =
      filter === 'pending'
        ? rows.filter((row) => row.status === PENDING)
        : filter === 'open'
          ? rows.filter((row) => !FINAL.has(row.status))
          : rows;
    return [...list].sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
  }, [rows, filter]);

  const ask = (order: PlatformOrder, next: string) => {
    setReason('');
    if (next === CONFIRMED) {
      setAction({
        order,
        next,
        title: 'قبول الطلب',
        body: `بتقبل طلب ${order.name} ليوم ${order.eventDate}. نرسل للعميل رابط الدفع، ويتثبت الحجز بعد ما يدفع.`,
        label: 'قبول الطلب',
        danger: false,
      });
    } else if (next === REJECTED) {
      setAction({
        order,
        next,
        title: 'رفض الطلب',
        body: `بترفض طلب ${order.name}. العميل ما دفع شيء، ونبلغه بالبريد إن الطلب مرفوض.`,
        label: 'رفض الطلب',
        danger: true,
      });
    } else if (next === CANCELLED) {
      setAction({
        order,
        next,
        title: 'إلغاء الطلب',
        body: `بتلغي طلب ${order.name} قبل الدفع. ما تقدر ترجع عن الإلغاء.`,
        label: 'إلغاء الطلب',
        danger: true,
      });
    } else {
      setAction({
        order,
        next,
        title: next === IN_PROGRESS ? 'بدء التنفيذ' : 'إتمام الطلب',
        body: next === IN_PROGRESS ? `بتبدأ تنفيذ طلب ${order.name}.` : `بتسجّل طلب ${order.name} كمكتمل.`,
        label: next === IN_PROGRESS ? 'بدء التنفيذ' : 'تم التنفيذ',
        danger: false,
      });
    }
  };

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const ending = action.next === REJECTED || action.next === CANCELLED;
      const saved = await ordersApi.setStatus(action.order.id, action.next, ending ? reason.trim() : undefined);
      // Keep the vendor's trimmed view; take only the new state from the reply.
      resource.set((current) =>
        (current ?? []).map((row) =>
          row.id === action.order.id
            ? { ...row, status: saved?.status || action.next, paymentStatus: saved?.paymentStatus || row.paymentStatus }
            : row,
        ),
      );
      refreshOrders();
      toast.success(
        action.next === CONFIRMED
          ? saved?.paymentUrl
            ? `قبلت الطلب ${action.order.id} — أرسلنا للعميل رابط الدفع`
            : `قبلت الطلب ${action.order.id} — يدفع العميل من «طلباتي»`
          : action.next === REJECTED
            ? `رفضت الطلب ${action.order.id}`
            : `تم تحديث الطلب ${action.order.id} إلى «${action.next}»`,
      );
      setAction(null);
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="طلبات المتجر"
        subtitle="الطلبات اللي تحتاج موافقتك تنتظر قرارك. العميل يدفع بعد القبول، وبعد الدفع تبدأ التنفيذ."
        action={
          <Button size="sm" icon={<RefreshCw size={15} />} busy={resource.refreshing} onClick={() => void resource.reload()}>
            تحديث
          </Button>
        }
      />

      <FilterTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'الكل', count: rows.length },
          { value: 'pending', label: 'بانتظار موافقتك', count: pendingCount },
          { value: 'open', label: 'الطلبات المفتوحة' },
        ]}
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      {resource.loading ? (
        <Card>
          <TableSkeleton rows={4} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={28} />}
            title={filter === 'pending' ? 'ما فيه طلبات تنتظر موافقتك' : 'ما فيه طلبات هنا'}
            body="أول ما يطلب عميل منتجاتك من متجر يوصل يظهر طلبه هنا، ونرسل لك إيميل."
          />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {visible.map((order) => {
            const paid = order.paymentStatus === 'paid';
            const wa = whatsappUrl(order.phone, `السلام عليكم ${order.name}، معك المورّد بخصوص طلبك ${order.id} في يوصل.`);
            return (
              <li key={order.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {order.serviceName || order.items?.[0]?.title || 'طلب من المتجر'}
                        </span>
                        <span className="tabular text-xs text-ink-muted" dir="ltr">
                          {order.id}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-secondary">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={14} />
                          <span className="tabular">
                            {order.eventDate}
                            {order.eventTime ? ` · ${order.eventTime}` : ''}
                          </span>
                        </span>
                        {order.city ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={14} />
                            {order.city}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[bookingStatusLabel(order.status)] || 'neutral'}>
                        {bookingStatusLabel(order.status)}
                      </Badge>
                      <Badge tone={paid ? 'good' : 'neutral'}>{paid ? 'مدفوع' : 'غير مدفوع'}</Badge>
                    </div>
                  </div>

                  {order.items?.length ? (
                    <ul className="space-y-0.5 text-[13px] text-ink-secondary">
                      {order.items.map((item, i) => (
                        <li key={`${item.id}-${i}`} className="flex justify-between gap-3">
                          <span className="truncate">
                            {item.title} × {item.quantity}
                          </span>
                          <span className="tabular shrink-0">{sar(Number(item.price) * Number(item.quantity || 1))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {order.notes ? (
                    <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-secondary">ملاحظات العميل: {order.notes}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-secondary">
                      <span className="font-medium text-ink">{order.name}</span>
                      {order.phone ? (
                        <a href={`tel:${order.phone}`} className="inline-flex items-center gap-1 tabular hover:text-accent" dir="ltr">
                          <Phone size={14} />
                          {order.phone}
                        </a>
                      ) : null}
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                          <MessageCircle size={14} />
                          واتساب
                        </a>
                      ) : null}
                      <WhatsAppTemplatesMenu order={order} brand={brandName} />
                      <span className="tabular font-semibold text-ink">{sar(order.totalAmount)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {order.status === PENDING ? (
                        <>
                          <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => ask(order, CONFIRMED)}>
                            قبول
                          </Button>
                          <Button size="sm" variant="danger" icon={<X size={15} />} onClick={() => ask(order, REJECTED)}>
                            رفض
                          </Button>
                        </>
                      ) : null}
                      {!paid && (order.status === CONFIRMED || order.status === NEW) ? (
                        <>
                          <Badge tone="warning" icon={<Clock size={13} />}>
                            بانتظار دفع العميل
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => ask(order, CANCELLED)}>
                            إلغاء
                          </Button>
                        </>
                      ) : null}
                      {paid && order.status === CONFIRMED ? (
                        <Button size="sm" variant="primary" icon={<PlayCircle size={15} />} onClick={() => ask(order, IN_PROGRESS)}>
                          بدء التنفيذ
                        </Button>
                      ) : null}
                      {paid && order.status === IN_PROGRESS ? (
                        <Button size="sm" variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => ask(order, COMPLETED)}>
                          تم التنفيذ
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.title || ''}
        body={action?.body || ''}
        confirmLabel={action?.label}
        danger={action?.danger}
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => (busy ? undefined : setAction(null))}
      >
        {action?.next === REJECTED || action?.next === CANCELLED ? (
          <Field label="السبب (يظهر للعميل في طلباته)">
            <Textarea
              rows={2}
              maxLength={300}
              value={reason}
              placeholder="مثال: الفريق محجوز في هذا التاريخ"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
