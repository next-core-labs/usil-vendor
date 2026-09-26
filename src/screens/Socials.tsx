import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { socials as socialsApi } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import { useResource } from '../lib/useResource.ts';
import {
  SOCIAL_LABEL,
  SOCIAL_NETWORKS,
  SOCIAL_PLACEHOLDER,
  SOCIAL_STATUS_LABEL,
} from '../lib/labels.ts';
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
} from '../components/ui/primitives.tsx';
import type { SocialNetwork, VendorSocials } from '../api/types.ts';

type Draft = Record<SocialNetwork, string>;

function emptyDraft(): Draft {
  return Object.fromEntries(SOCIAL_NETWORKS.map((network) => [network, ''])) as Draft;
}

function draftFrom(socials: VendorSocials | null): Draft {
  const draft = emptyDraft();
  for (const link of socials?.links || []) draft[link.network] = link.handle || link.url;
  return draft;
}

export function Socials() {
  const toast = useToast();
  const resource = useResource(socialsApi.read);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirmedOwn, setConfirmedOwn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!resource.data) return;
    setDraft(draftFrom(resource.data));
    setConfirmedOwn(resource.data.confirmedOwn);
  }, [resource.data]);

  async function save() {
    setBusy(true);
    try {
      // A full replace, not a patch: the server rebuilds `links` from whatever
      // this body carries, so every network is sent and a blank one is a removal.
      const saved = await socialsApi.save({ ...draft, confirmedOwn });
      resource.set(saved);
      toast.success('حُفظت حسابات التواصل.');
    } catch (caught) {
      toast.failure(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const linkFor = (network: SocialNetwork) =>
    resource.data?.links.find((link) => link.network === network);

  return (
    <>
      <PageHeader
        title="حسابات التواصل"
        subtitle="تظهر في ملف متجرك العام ليتأكد العميل أنك أنت."
        action={
          <Button
            size="sm"
            variant="ghost"
            busy={resource.refreshing}
            icon={<RefreshCw size={15} />}
            onClick={() => void resource.reload()}
          >
            تحديث
          </Button>
        }
      />

      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      <Card>
        <CardHeader
          title="الحسابات"
          subtitle="اكتب اسم المستخدم أو الرابط الكامل. اترك الحقل فارغاً لإزالة الحساب."
        />

        {resource.loading ? (
          <div className="space-y-3">
            {SOCIAL_NETWORKS.map((network) => (
              <Skeleton key={network} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {SOCIAL_NETWORKS.map((network) => {
              const link = linkFor(network);
              return (
                <div key={network}>
                  <Field label={SOCIAL_LABEL[network]}>
                    <Input
                      dir="ltr"
                      className="text-start"
                      placeholder={SOCIAL_PLACEHOLDER[network]}
                      value={draft[network]}
                      onChange={(event) => setDraft({ ...draft, [network]: event.target.value })}
                    />
                  </Field>
                  {link ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={link.status === 'verified' ? 'good' : link.status === 'linked' ? 'accent' : 'neutral'}
                        icon={link.status === 'verified' ? <BadgeCheck size={13} /> : undefined}
                      >
                        {SOCIAL_STATUS_LABEL[link.status]}
                      </Badge>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        dir="ltr"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {link.url}
                        <ExternalLink size={12} aria-hidden />
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <label className="flex items-start gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2.5">
              <input
                type="checkbox"
                checked={confirmedOwn}
                onChange={(event) => setConfirmedOwn(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span className="text-[13px] leading-6 text-ink">
                أقرّ أن هذي الحسابات تخص متجري وأتحمّل مسؤوليتها.
                <span className="mt-0.5 block text-xs text-ink-muted">
                  بدون هذا الإقرار تبقى الحسابات «بانتظار الإقرار»، والتوثيق يتم من إدارة يوصل.
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <Button variant="primary" busy={busy} onClick={() => void save()}>
                حفظ الحسابات
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
