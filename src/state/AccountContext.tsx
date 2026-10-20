import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storefront, supervision } from '../api/endpoints.ts';
import { setActingVendor } from '../api/client.ts';
import type { MissingItem, PublicUser, VendorFile } from '../api/types.ts';
import { usePoll } from '../lib/usePoll.ts';
import { isVendorAccount, useSession } from './SessionContext.tsx';

/**
 * - `vendor`: an approved vendor (or a supervisor) — the full dashboard.
 * - `pending`: signed up, waiting on the owner — the dashboard minus bookings
 *   and chats, with a checklist of what still blocks approval.
 * - `outside`: any other account — rejected, or never applied.
 */
export type AccountMode = 'vendor' | 'pending' | 'outside' | 'pick';

/** The vendor a supervisor is acting for. */
export type SupervisedVendor = { vendorId: string; name: string };

const SUPERVISE_KEY = 'usil_vendor_supervise';

/** `?vendorId=` (a link from the owner console) wins over the last choice in this tab. */
function initialSupervised(): SupervisedVendor | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('vendorId')?.trim();
    if (fromUrl) return { vendorId: fromUrl, name: '' };
    const saved = JSON.parse(sessionStorage.getItem(SUPERVISE_KEY) || 'null') as SupervisedVendor | null;
    return saved?.vendorId ? saved : null;
  } catch {
    return null;
  }
}

type AccountState = {
  mode: AccountMode;
  /** Null for vendors (not needed) and until the first load. */
  file: VendorFile | null;
  missing: MissingItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Admin or accounts manager: they open a vendor's dashboard instead of their own. */
  isSupervisor: boolean;
  supervised: SupervisedVendor | null;
  chooseVendor: (vendor: SupervisedVendor) => void;
  /** Back to the vendor picker. */
  leaveVendor: () => void;
};

const AccountContext = createContext<AccountState | null>(null);

/** How often a pending vendor's dashboard looks for the owner's decision. */
const DECISION_POLL_MS = 30_000;

export function AccountProvider({ user, children }: { user: PublicUser; children: ReactNode }) {
  const { refresh } = useSession();
  const vendor = isVendorAccount(user);
  const isSupervisor = user.role === 'admin' || user.role === 'accounts_manager';
  const [supervised, setSupervised] = useState<SupervisedVendor | null>(() => {
    const initial = isSupervisor ? initialSupervised() : null;
    // Set before any screen renders, so the first request already carries ?vendorId=.
    setActingVendor(initial?.vendorId || null);
    return initial;
  });

  const chooseVendor = useCallback((next: SupervisedVendor) => {
    setActingVendor(next.vendorId);
    setSupervised(next);
    try {
      sessionStorage.setItem(SUPERVISE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    // Drop ?vendorId= from the address so a refresh keeps the sessionStorage choice.
    const url = new URL(window.location.href);
    if (url.searchParams.has('vendorId')) {
      url.searchParams.delete('vendorId');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  const leaveVendor = useCallback(() => {
    setActingVendor(null);
    setSupervised(null);
    try {
      sessionStorage.removeItem(SUPERVISE_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  // A vendor opened by link arrives with an id only: fill in its name for the banner.
  useEffect(() => {
    if (!isSupervisor || !supervised || supervised.name) return;
    let active = true;
    supervision
      .hubs()
      .then((hubs) => {
        const hub = hubs.find((row) => row.vendorId === supervised.vendorId);
        if (active && hub) chooseVendor({ vendorId: hub.vendorId, name: hub.projectName || hub.name });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSupervisor, supervised, chooseVendor]);
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
      mode: isSupervisor && !supervised ? 'pick' : vendor ? 'vendor' : pending ? 'pending' : 'outside',
      file,
      missing: pending ? file?.missing || [] : [],
      loading,
      error,
      reload,
      isSupervisor,
      supervised,
      chooseVendor,
      leaveVendor,
    }),
    [vendor, pending, file, loading, error, reload, isSupervisor, supervised, chooseVendor, leaveVendor],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const state = useContext(AccountContext);
  if (!state) throw new Error('useAccount must be used inside <AccountProvider>');
  return state;
}
