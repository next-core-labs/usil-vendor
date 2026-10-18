import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chats, orders } from '../api/endpoints.ts';
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
/** `orders` = store orders still waiting for this vendor's approval. */
export type UnreadCounts = { chats: number; orders: number };

type UnreadApi = UnreadCounts & {
  /** Just the chat badge — the chat screen calls it after every read. */
  refreshChats: () => void;
  /** The orders badge — the orders screen calls it after approving or rejecting. */
  refreshOrders: () => void;
};

const UnreadContext = createContext<UnreadApi | null>(null);

// A conversation, so this polls faster than the dashboard's other counters; the endpoint is a single count.
const CHAT_POLL_MS = 15_000;
// A new order is worth knowing about within a minute, not within seconds.
const ORDER_POLL_MS = 60_000;
const PENDING_APPROVAL = 'بانتظار موافقة المورّد';

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const enabled = user?.role === 'vendor';
  const [chatUnread, setChatUnread] = useState(0);
  const [ordersWaiting, setOrdersWaiting] = useState(0);

  const loadChats = useCallback(async () => {
    if (!enabled) {
      setChatUnread(0);
      return;
    }
    // A failure here is invisible on purpose: a stale badge must never take the
    // dashboard down, and the chat screen itself reports the real error.
    setChatUnread(await chats.unread().catch(() => 0));
  }, [enabled]);

  const loadOrders = useCallback(async () => {
    if (!enabled) {
      setOrdersWaiting(0);
      return;
    }
    const rows = await orders.list().catch(() => null);
    if (rows) setOrdersWaiting(rows.filter((row) => row.status === PENDING_APPROVAL).length);
  }, [enabled]);

  useEffect(() => {
    void loadChats();
    void loadOrders();
  }, [loadChats, loadOrders]);

  usePoll(() => void loadChats(), CHAT_POLL_MS, enabled);
  usePoll(() => void loadOrders(), ORDER_POLL_MS, enabled);

  // Stable, because the chat screen's read handler depends on it.
  const refreshChats = useCallback(() => void loadChats(), [loadChats]);

  const refreshOrders = useCallback(() => void loadOrders(), [loadOrders]);

  const value = useMemo<UnreadApi>(
    () => ({ chats: chatUnread, orders: ordersWaiting, refreshChats, refreshOrders }),
    [chatUnread, ordersWaiting, refreshChats, refreshOrders],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadApi {
  const api = useContext(UnreadContext);
  if (!api) throw new Error('useUnread must be used inside <UnreadProvider>');
  return api;
}
