import { useState, type ReactNode } from 'react';
import { CircleAlert, Store } from 'lucide-react';
import type { PublicUser } from '../api/types.ts';
import { useSession } from '../state/SessionContext.tsx';
import { useAccount } from '../state/AccountContext.tsx';
import { useToast } from '../state/ToastContext.tsx';
import { navigate } from '../lib/router.ts';
import { Button, ErrorNote } from '../components/ui/primitives.tsx';
import { Register } from './Register.tsx';

/**
 * Signed in, but neither a vendor nor waiting on one: the owner turned the
 * store down, the account never opened one, or it was approved after this
 * session last looked. Pending vendors never land here — they get the
 * dashboard (see `AccountContext`).
 */
export function ApplicationStatus({ user }: { user: PublicUser }) {
  const { refresh, signOut } = useSession();
  const account = useAccount();
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [checking, setChecking] = useState(false);

  if (applying) {
    return (
      <div className="flex min-h-full justify-center p-6 py-10">
        <Register
          account={user}
          onCancel={() => setApplying(false)}
          onSubmitted={async (message) => {
            toast.success(message);
            navigate('listings');
            await account.reload();
          }}
        />
      </div>
    );
  }

  const application = account.file?.application ?? null;
  const signOutButton = (
    <Button variant="ghost" onClick={() => void signOut()}>
      تسجيل الخروج
    </Button>
  );

  let body: ReactNode;
  if (account.error && !account.file) {
    body = <ErrorNote message={account.error} onRetry={() => void account.reload()} />;
  } else if (application?.status === 'rejected') {
    body = (
      <Panel
        tone="critical"
        icon={<CircleAlert size={22} />}
        title="لم يُعتمد متجرك"
        actions={
          <>
            <Button variant="primary" onClick={() => setApplying(true)}>
              افتح متجرك من جديد
            </Button>
            {signOutButton}
          </>
        }
      >
        {application.rejectReason ? (
          <span className="mb-2 block rounded-lg border border-line bg-sunken px-3 py-2 text-ink">
            سبب الرفض: {application.rejectReason}
          </span>
        ) : null}
        عدّل ما يلزم وسجّل متجرك من جديد، أو تواصل مع إدارة يوصل.
      </Panel>
    );
  } else if (application?.status === 'approved') {
    body = (
      <Panel
        tone="accent"
        icon={<Store size={22} />}
        title="اعتُمد متجرك"
        actions={
          <>
            <Button
              variant="primary"
              busy={checking}
              onClick={() => {
                setChecking(true);
                void refresh().finally(() => setChecking(false));
              }}
            >
              افتح اللوحة
            </Button>
            {signOutButton}
          </>
        }
      >
        حسابك صار حساب مورّد. افتح اللوحة للبدء.
      </Panel>
    );
  } else {
    body = (
      <Panel
        tone="accent"
        icon={<Store size={22} />}
        title="هذا الحساب ليس حساب مورّد"
        actions={
          <>
            <Button variant="primary" onClick={() => setApplying(true)}>
              افتح متجرك في يوصل
            </Button>
            {signOutButton}
          </>
        }
      >
        دخلت باسم {user.name}. افتح متجرك بهذا الحساب، أضف منتجاتك، وتراجعه إدارة يوصل للاعتماد.
      </Panel>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">{body}</div>
    </div>
  );
}

const PANEL_TONE = {
  critical: 'bg-[var(--critical-wash)] text-[var(--critical)]',
  accent: 'bg-[var(--accent-wash)] text-accent',
} as const;

function Panel({
  tone,
  icon,
  title,
  actions,
  children,
}: {
  tone: keyof typeof PANEL_TONE;
  icon: ReactNode;
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className={`mx-auto mb-4 grid size-12 place-items-center rounded-xl ${PANEL_TONE[tone]}`}>{icon}</span>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-7 text-ink-secondary">{children}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>
    </>
  );
}
