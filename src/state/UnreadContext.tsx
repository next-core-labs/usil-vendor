import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chats } from '../api/endpoints.ts';
import { usePoll } from '../lib/usePoll.ts';
import { useSession } from './SessionContext.tsx';

/**
 * The unread-message count behind the sidebar «المحادثات» badge. Kept in one
 * place so reading a thread clears the badge without the whole app refetching.
 *
 * Only polled for `vendor` accounts. A supervisor signed in here is answered
 * by the same endpoint, but as the *owner* side — their count would be the
 * Usil team's shared inbox, not this dashboard's, so it is never shown.
 */
export type UnreadCounts = { chats: number };

type UnreadApi = UnreadCounts & {
  /** Just the chat badge — the chat screen calls it after every read. */
  refreshChats: () => void;
};

const UnreadContext = createContext<UnreadApi | null>(null);

// A conversation, so this polls faster than the dashboard's other counters; the endpoint is a single count.
const CHAT_POLL_MS = 15_000;

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const enabled = user?.role === 'vendor';
  const [chatUnread, setChatUnread] = useState(0);

  const loadChats = useCallback(async () => {
    if (!enabled) {
      setChatUnread(0);
      return;
    }
    // A failure here is invisible on purpose: a stale badge must never take the
    // dashboard down, and the chat screen itself reports the real error.
    setChatUnread(await chats.unread().catch(() => 0));
  }, [enabled]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  usePoll(() => void loadChats(), CHAT_POLL_MS, enabled);

  // Stable, because the chat screen's read handler depends on it.
  const refreshChats = useCallback(() => void loadChats(), [loadChats]);

  const value = useMemo<UnreadApi>(() => ({ chats: chatUnread, refreshChats }), [chatUnread, refreshChats]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadApi {
  const api = useContext(UnreadContext);
  if (!api) throw new Error('useUnread must be used inside <UnreadProvider>');
  return api;
}
