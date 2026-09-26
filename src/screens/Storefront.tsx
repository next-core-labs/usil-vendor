import { BadgeCheck, Building2, ExternalLink, Mail, Phone, RefreshCw, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { storefront } from '../api/endpoints.ts';
import { useResource } from '../lib/useResource.ts';
import { count, shortDate } from '../lib/format.ts';
import { APPLICATION_STATUS_LABEL, FULFILLMENT_LABEL, labelFor } from '../lib/labels.ts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  type Tone,
} from '../components/ui/primitives.tsx';
import type { ApplicationStatus } from '../api/types.ts';

const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  approved: 'good',
  pending: 'warning',
  rejected: 'critical',
};

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      <span className="mt-0.5 text-ink-muted" aria-hidden>
        {icon}
      </span>
      <span className="w-32 shrink-0 text-[13px] text-ink-secondary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[13px] text-ink">{value || '—'}</span>
    </div>
  );
}

export function Storefront() {
  const resource = useResource(storefront.file);
  const profile = resource.data?.profile;
  const file = resource.data?.file;
  const application = resource.data?.application;

  return (
    <>
      <PageHeader
        title="ملفي التجاري"
        subtitle="بيانات متجرك كما يشوفها العميل في يوصل."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              busy={resource.refreshing}
              icon={<RefreshCw size={15} />}
              onClick={() => void resource.reload()}
            >
              تحديث
            </Button>
            {file ? (
              <Button
                size="sm"
                icon={<ExternalLink size={15} />}
                onClick={() => window.open(`/vendor/${encodeURIComponent(file.vendorId)}`, '_blank')}
              >
                عرض متجري
              </Button>
            ) : null}
          </div>
        }
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      {resource.loading ? (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      ) : !profile ? (
        <Card>
          <EmptyState
            icon={<Store size={26} />}
            title="ما عندك ملف مورّد بعد"
            body="ملف المتجر يُنشأ من طلب الانضمام في موقع يوصل. قدّم الطلب، وبعد اعتماد الإدارة تظهر بياناتك هنا."
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <span className="size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-sunken">
                {profile.logoUrl ? (
                  <img src={profile.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-ink-muted">
                    <Building2 size={22} />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-ink">{profile.projectName || '—'}</h2>
                <p className="mt-0.5 text-[13px] text-ink-secondary">{profile.projectType || '—'}</p>
              </div>
              <Badge
                tone={STATUS_TONE[profile.status]}
                icon={profile.status === 'approved' ? <BadgeCheck size={13} /> : undefined}
              >
                {APPLICATION_STATUS_LABEL[profile.status]}
              </Badge>
            </div>

            {application?.status === 'rejected' && application.rejectReason ? (
              <p className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--critical)_30%,transparent)] bg-[var(--critical-wash)] px-3 py-2.5 text-[13px] leading-6 text-ink">
                سبب الرفض: {application.rejectReason}
              </p>
            ) : null}

            <div className="mt-4">
              <Row icon={<Building2 size={15} />} label="اسم المسؤول" value={profile.personName} />
              <Row icon={<Mail size={15} />} label="البريد" value={profile.email} />
              <Row icon={<Phone size={15} />} label="الجوال" value={profile.phone} />
              <Row
                icon={<Building2 size={15} />}
                label="السجل التجاري"
                value={profile.commercialRegister || ''}
              />
              <Row
                icon={<Store size={15} />}
                label="المنتجات"
                value={`${count(profile.listingCount)} منتج منشور`}
              />
              {application ? (
                <Row
                  icon={<BadgeCheck size={15} />}
                  label="تاريخ الطلب"
                  value={shortDate(application.createdAt)}
                />
              ) : null}
            </div>

            {/* Editing lives with the admin because `/api/me/vendor-file` builds
                this from the vendor APPLICATION whenever one exists — a profile
                written through the workspace endpoint would save and then never
                show up here, which reads as a silently dropped edit. */}
            <p className="mt-4 text-xs leading-6 text-ink-muted">
              هذي البيانات مأخوذة من طلب انضمامك المعتمد. لتعديل الاسم أو السجل التجاري أو بيانات
              التواصل، راسل إدارة يوصل — التعديل من هنا ما ينعكس على ملفك العام.
            </p>
          </Card>

          <Card>
            <CardHeader title="مسارات التوريد" subtitle="السرعات المعتمدة لمتجرك في يوصل." />
            {profile.fulfillment.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.fulfillment.map((lane) => (
                  <Badge key={lane} tone="accent">
                    {labelFor(FULFILLMENT_LABEL, lane)}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyState title="ما فيه مسارات معتمدة" body="تُحدَّد عند اعتماد طلب الانضمام." />
            )}
          </Card>

          {file ? (
            <Card>
              <CardHeader title="رابط متجرك" subtitle="انسخه وضعه في البايو أو أرسله للعميل مباشرة." />
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2.5">
                <code dir="ltr" className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {`${window.location.origin}/vendor/${file.vendorId}`}
                </code>
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`${window.location.origin}/vendor/${file.vendorId}`)
                      .catch(() => {
                        /* a blocked clipboard is not worth an error state — the
                           link is on screen and selectable either way */
                      });
                  }}
                >
                  نسخ
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
