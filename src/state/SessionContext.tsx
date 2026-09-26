import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../api/endpoints.ts';
import { errorText } from '../api/client.ts';
import type { PublicUser } from '../api/types.ts';

type SessionState = {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  signIn: (identifier: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Every `/api/vendor/*` route is behind `requireRole(['vendor', 'admin'])`, and
 * `roleAllowed` also lets `accounts_manager` through as an admin. Supervisors
 * are admitted because the same routes answer for them — they land on their own
 * (usually empty) workspace unless they pass `?vendorId=`, which this dashboard
 * never does. Anyone else is shown the door rather than an empty dashboard.
 */
export function isVendorAccount(user: PublicUser | null): boolean {
  return user?.role === 'vendor' || user?.role === 'admin' || user?.role === 'accounts_manager';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore the cookie session on first paint, so a refresh does not sign out.
  useEffect(() => {
    let active = true;
    auth
      .me()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string, remember: boolean) => {
    setError(null);
    try {
      const result = await auth.login(identifier, password, remember);
      setUser(result.user);
    } catch (caught) {
      setError(errorText(caught));
      throw caught;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      // Whatever the server said, this browser is done with the session.
      setUser(null);
      setError(null);
    }
  }, []);

  const value = useMemo<SessionState>(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession must be used inside <SessionProvider>');
  return state;
}
