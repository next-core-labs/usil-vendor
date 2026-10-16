import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storefront } from '../api/endpoints.ts';
import type { MissingItem, PublicUser, VendorFile } from '../api/types.ts';
import { usePoll } from '../lib/usePoll.ts';
import { isVendorAccount, useSession } from './SessionContext.tsx';

/**
 * - `vendor`: an approved vendor (or a supervisor) — the full dashboard.
 * - `pending`: signed up, waiting on the owner — the dashboard minus bookings
 *   and chats, with a checklist of what still blocks approval.
 * - `outside`: any other account — rejected, or never applied.
 */
export type AccountMode = 'vendor' | 'pending' | 'outside';

type AccountState = {
  mode: AccountMode;
  /** Null for vendors (not needed) and until the first load. */
  file: VendorFile | null;
  missing: MissingItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

/** How often a pending vendor's dashboard looks for the owner's decision. */
const DECISION_POLL_MS = 30_000;

export function AccountProvider({ user, children }: { user: PublicUser; children: ReactNode }) {
  const { refresh } = useSession();
  const vendor = isVendorAccount(user);
  const [file, setFile] = useState<VendorFile | null>(null);
  const [loading, setLoading] = useState(!vendor);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (vendor) return;
    try {
      setFile(await storefront.file());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل حالة الحساب');
    } finally {
      setLoading(false);
    }
  }, [vendor]);

  useEffect(() => {
    void reload();
  }, [reload, user.id]);

  const pending = !vendor && file?.application?.status === 'pending';

  // Approval turns this same account into a vendor; a rejection ends the pending
  // state. Either way the session and the file are what change, so re-read both.
  usePoll(
    () => {
      void refresh()
        .then(() => reload())
        .catch(() => undefined);
    },
    DECISION_POLL_MS,
    pending,
  );

  const value = useMemo<AccountState>(
    () => ({
      mode: vendor ? 'vendor' : pending ? 'pending' : 'outside',
      file,
      missing: pending ? file?.missing || [] : [],
      loading,
      error,
      reload,
    }),
    [vendor, pending, file, loading, error, reload],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const state = useContext(AccountContext);
  if (!state) throw new Error('useAccount must be used inside <AccountProvider>');
  return state;
}
