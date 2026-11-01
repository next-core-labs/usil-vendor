import { useMemo, useState } from 'react';
import { Mail, MapPin, MessageCircle, Pencil, Phone, Plus, RefreshCw, Trash2, UsersRound } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, TableSkeleton } from '../components/ui/primitives.tsx';
import { FilterTabs, Toolbar } from '../components/ui/Table.tsx';
import { ConfirmDialog } from '../components/ui/Modal.tsx';
import { ClientFormModal, type ClientDraft } from '../components/clients/ClientFormModal.tsx';
import {
  CLIENT_KIND_LABEL,
  CLIENT_SOURCE_LABEL,
  clientMatches,
  newClientId,
  type ClientKind,
  type VendorClient,
} from '../components/clients/model.ts';
import { clients as clientsApi } from '../api/clients.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { initials } from '../lib/format.ts';
import { whatsappChatUrl } from '../lib/whatsappTemplates.ts';
import { useToast } from '../state/ToastContext.tsx';

type Filter = 'all' | ClientKind;

/**
 * عملائي — the vendor's clients from outside the platform, typed in by the
 * vendor so their whole client list lives in one place, with WhatsApp and
 * call one tap away.
 */
export function Clients() {
  const toast = useToast();
  const resource = useResource(() => clientsApi.list(), []);
  const rows = useMemo(() => resource.data ?? [], [resource.data]);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorClient | null>(null);
  const [removing, setRemoving] = useState<VendorClient | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(
    () => ({ person: rows.filter((row) => row.kind === 'person').length, company: rows.filter((row) => row.kind === 'company').length }),
    [rows],
  );

  const visible = useMemo(
    () =>
      rows
        .filter((row) => (filter === 'all' || row.kind === filter) && clientMatches(row, search))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [rows, filter, search],
  );

  const run = async (work: () => Promise<VendorClient[]>, success: string) => {
    setBusy(true);
    try {
      resource.set(await work());
      toast.success(success);
      return true;
    } catch (caught) {
      toast.failure(errorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (draft: ClientDraft) => {
    const now = new Date().toISOString();
    const ok = editing
      ? await run(() => clientsApi.save({ ...editing, ...draft, updatedAt: now }), `حفظنا بيانات ${draft.name}.`)
      : await run(() => clientsApi.save({ ...draft, id: newClientId(), createdAt: now, updatedAt: now }), `أضفنا ${draft.name} إلى عملائك.`);
    if (ok) {
      setFormOpen(false);
      setEditing(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    const target = removing;
    if (await run(() => clientsApi.remove(target.id), `حذفنا ${target.name} من عملائك.`)) setRemoving(null);
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="عملائي"
        subtitle="سجّل عملاءك من خارج المنصة (واتساب، انستقرام، المعارف) عشان تكون كل قائمتك في مكان واحد."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<RefreshCw size={15} />} busy={resource.refreshing} onClick={() => void resource.reload()}>
              تحديث
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={openNew}>
              إضافة عميل
            </Button>
          </div>
        }
      />

      <FilterTabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'الكل', count: rows.length },
          { value: 'person', label: 'أفراد', count: counts.person },
          { value: 'company', label: 'شركات وجهات', count: counts.company },
        ]}
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      <Card padded={false}>
        {rows.length > 0 ? <Toolbar search={search} onSearch={setSearch} placeholder="ابحث بالاسم أو الجوال أو المدينة…" /> : null}
        {resource.loading ? (
          <TableSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={28} />}
            title={rows.length ? 'ما فيه عميل يطابق بحثك' : 'ما سجّلت عملاء بعد'}
            body={
              rows.length
                ? undefined
                : 'أضف العملاء اللي تعاملت معهم خارج يوصل: الاسم والجوال ومن وين وصلك. تقدر تراسلهم بواتساب أو تتصل فيهم من هنا.'
            }
            action={
              rows.length ? undefined : (
                <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                  إضافة أول عميل
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((row) => {
              const chat = whatsappChatUrl(row.phone, `مرحباً ${row.name}،`);
              return (
                <li key={row.id} className="flex flex-wrap items-start gap-3 p-4">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-ink-secondary"
                  >
                    {initials(row.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{row.name}</h3>
                      {row.kind === 'company' ? <Badge tone="accent">{row.companyName || CLIENT_KIND_LABEL.company}</Badge> : null}
                      <Badge>{CLIENT_SOURCE_LABEL[row.source]}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-secondary">
                      {row.phone ? (
                        <span className="tabular" dir="ltr">
                          {row.phone}
                        </span>
                      ) : null}
                      {row.email ? (
                        <span className="inline-flex items-center gap-1" dir="ltr">
                          <Mail size={13} />
                          {row.email}
                        </span>
                      ) : null}
                      {row.city ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} />
                          {row.city}
                        </span>
                      ) : null}
                    </div>
                    {row.notes ? <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-[13px] leading-6 text-ink-secondary">{row.notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {chat ? (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<MessageCircle size={15} />}
                        onClick={() => window.open(chat, '_blank', 'noopener,noreferrer')}
                      >
                        واتساب
                      </Button>
                    ) : null}
                    {row.phone ? (
                      <a
                        href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}
                        aria-label={`اتصال بـ ${row.name}`}
                        title="اتصال"
                        className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-ink-secondary transition-colors hover:bg-sunken hover:text-ink"
                      >
                        <Phone size={15} />
                      </a>
                    ) : null}
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
                    <Button size="sm" variant="ghost" aria-label="حذف" title="حذف" icon={<Trash2 size={15} />} onClick={() => setRemoving(row)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ClientFormModal
        open={formOpen}
        editing={editing}
        existing={rows}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(draft) => void save(draft)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="حذف العميل"
        body={removing ? `بتحذف ${removing.name} من قائمة عملائك. ما تقدر ترجع عن الحذف.` : ''}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => (busy ? undefined : setRemoving(null))}
      />
    </div>
  );
}
