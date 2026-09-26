import { useMemo, useState } from 'react';
import { PackagePlus, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { listings as listingsApi } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import { sar } from '../lib/format.ts';
import {
  BOOKING_MODE_LABEL,
  CATEGORY_LABEL,
  FULFILLMENT_LABEL,
  labelFor,
} from '../lib/labels.ts';
import { useToast } from '../state/ToastContext.tsx';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader } from '../components/ui/primitives.tsx';
import { DataTable, Toolbar, type Column } from '../components/ui/Table.tsx';
import { ConfirmDialog } from '../components/ui/Modal.tsx';
import { ListingModal } from '../components/listings/ListingModal.tsx';
import type { ListingDraft, VendorListing } from '../api/types.ts';

function thumbOf(listing: VendorListing): string | undefined {
  return listing.images?.[0] || listing.image;
}

export function Listings() {
  const toast = useToast();
  const rows = useResource(listingsApi.list);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<VendorListing | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<VendorListing | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim();
    const all = rows.data || [];
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.title.includes(needle) ||
        row.shortDesc.includes(needle) ||
        row.cities.some((city) => city.includes(needle)) ||
        labelFor(CATEGORY_LABEL, row.category).includes(needle),
    );
  }, [rows.data, search]);

  async function save(draft: ListingDraft) {
    setBusy(true);
    try {
      if (editing) {
        await listingsApi.update(editing.id, draft);
        toast.success('تم حفظ تعديل المنتج.');
      } else {
        await listingsApi.create(draft);
        toast.success('نُشر المنتج في متجر يوصل.');
      }
      setFormOpen(false);
      setEditing(null);
      await rows.reload();
    } catch (caught) {
      // The server answers with the exact sentence the vendor needs to act on.
      toast.failure(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await listingsApi.remove(removing.id);
      toast.success('حُذف المنتج من المتجر.');
      setRemoving(null);
      await rows.reload();
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<VendorListing>[] = [
    {
      key: 'title',
      header: 'المنتج',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
            {thumbOf(row) ? (
              <img src={thumbOf(row)} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{row.title}</span>
            <span className="block truncate text-xs text-ink-muted">{row.shortDesc}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'القسم',
      render: (row) => <span className="text-ink-secondary">{labelFor(CATEGORY_LABEL, row.category)}</span>,
    },
    {
      key: 'price',
      header: 'السعر',
      numeric: true,
      render: (row) => (
        <span className="whitespace-nowrap">
          <span className="font-medium text-ink">{sar(row.price)}</span>
          <span className="ms-1 text-xs text-ink-muted">{row.priceUnit}</span>
        </span>
      ),
    },
    {
      key: 'cities',
      header: 'التغطية',
      render: (row) => (
        <span className="text-[13px] text-ink-secondary" title={row.cities.join('، ')}>
          {row.cities[0]}
          {row.cities.length > 1 ? (
            <span className="tabular text-ink-muted"> +{row.cities.length - 1}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'fulfillment',
      header: 'مسار يوصل',
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.fulfillment.map((lane) => (
            <Badge key={lane}>{FULFILLMENT_LABEL[lane]}</Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'bookingMode',
      header: 'تأكيد الحجز',
      render: (row) => (
        <Badge tone={row.bookingMode === 'instant' ? 'good' : 'neutral'}>
          {BOOKING_MODE_LABEL[row.bookingMode]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '104px',
      render: (row) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`تعديل ${row.title}`}
            title="تعديل"
            icon={<Pencil size={15} />}
            onClick={() => {
              setEditing(row);
              setFormOpen(true);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`حذف ${row.title}`}
            title="حذف"
            icon={<Trash2 size={15} />}
            onClick={() => setRemoving(row)}
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="منتجاتي"
        subtitle="كل منتج هنا يظهر مباشرة في متجر يوصل — لا يوجد كتالوج جاهز."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              busy={rows.refreshing}
              icon={<RefreshCw size={15} />}
              onClick={() => void rows.reload()}
            >
              تحديث
            </Button>
            <Button
              variant="primary"
              icon={<PackagePlus size={16} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              منتج جديد
            </Button>
          </div>
        }
      />

      {rows.error ? <ErrorNote message={rows.error} onRetry={() => void rows.reload()} /> : null}

      <Card padded={false}>
        <Toolbar search={search} onSearch={setSearch} placeholder="ابحث باسم المنتج أو المدينة أو القسم…" />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={rows.loading}
          empty={
            search ? (
              <EmptyState title="ما فيه منتج يطابق البحث" body="جرّب كلمة أقصر أو امسح البحث." />
            ) : (
              <EmptyState
                icon={<PackagePlus size={26} />}
                title="ما نشرت أي منتج بعد"
                body="أضف أول منتج بصورتين حقيقيتين وسعر شامل الضريبة، ويظهر في متجر يوصل مباشرة."
                action={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    أضف منتجاً
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <ListingModal
        open={formOpen}
        listing={editing}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(draft) => void save(draft)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="حذف المنتج؟"
        body={`«${removing?.title || ''}» يختفي من متجر يوصل فوراً، وما يمكن التراجع.`}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
