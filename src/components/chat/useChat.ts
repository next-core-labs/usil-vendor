import { useCallback, useEffect, useRef, useState } from 'react';
import { chats } from '../../api/endpoints.ts';
import type { ChatMessage, Conversation, ConversationSummary } from '../../api/types.ts';
import { errorText } from '../../api/client.ts';
import { usePoll } from '../../lib/usePoll.ts';
import { useResource } from '../../lib/useResource.ts';

/* ── Shared vocabulary ──────────────────────────────────────────────── */

/** Mirrors `MAX_CHAT_BODY` in `server/chat/chat-store.ts`, so the composer stops before a 400. */
export const MAX_CHAT_BODY = 2000;
export const INBOX_POLL_MS = 15_000;
export const THREAD_POLL_MS = 5_000;

export const USIL_TEAM_LABEL = 'فريق يوصل';

/** Who the vendor is talking to in this thread. */
export function counterpartName(row: Pick<ConversationSummary, 'kind' | 'clientName'>): string {
  return row.kind === 'vendor_owner' ? USIL_TEAM_LABEL : row.clientName || 'عميل';
}

/** The label above someone else's message. Owner-side messages always sign as the team. */
export function senderLabel(message: ChatMessage, row: Pick<Conversation, 'kind' | 'clientName'>): string {
  if (message.side === 'owner') return USIL_TEAM_LABEL;
  if (message.side === 'client') return row.clientName || message.senderName || 'عميل';
  return message.senderName;
}

/** Adds messages not already on screen, in thread order. A poll and a send can both return the same one. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!incoming.length) return current;
  const seen = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !seen.has(message.id));
  if (!fresh.length) return current;
  return [...current, ...fresh].sort((a, b) => a.seq - b.seq);
}

/* ── Inbox ──────────────────────────────────────────────────────────── */

/** The vendor's conversations, newest activity first, refreshed while the tab is visible. */
export function useChatInbox() {
  const resource = useResource(() => chats.list(), []);
  usePoll(() => void resource.reload(), INBOX_POLL_MS);
  return resource;
}

/* ── One open thread ────────────────────────────────────────────────── */

export type ThreadEvents = {
  /** A message was sent or arrived — the inbox moves the thread to the top. */
  onActivity: (id: string, message: ChatMessage) => void;
  /** The thread was marked read on the server — badges can drop. */
  onRead: (id: string) => void;
};

/**
 * Loads a thread, polls it for new messages after the last one held, and
 * marks it read whenever the other side's messages are on screen. `id` is
 * null for the Usil-team thread before its first message exists.
 */
export function useChatThread(id: string | null, events: ThreadEvents) {
  const [thread, setThread] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  // Read through a ref so a new callback identity from the parent never refetches the thread.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const polling = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const markRead = useCallback(() => {
    if (!id) return;
    chats
      .markRead(id)
      .then(() => {
        if (alive.current) eventsRef.current.onRead(id);
      })
      .catch(() => {
        // The next poll or open retries; a stale badge is not worth an error.
      });
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await chats.get(id);
      if (!alive.current) return;
      setThread(row);
      markRead();
    } catch (caught) {
      if (alive.current) setError(errorText(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [id, markRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function poll() {
    if (!id || !thread || polling.current) return;
    polling.current = true;
    try {
      const seen = new Set(thread.messages.map((message) => message.id));
      const row = await chats.get(id, thread.messages[thread.messages.length - 1]?.id);
      if (!alive.current) return;
      const fresh = row.messages.filter((message) => !seen.has(message.id));
      setThread((current) => ({ ...row, messages: mergeMessages(current?.messages ?? [], row.messages) }));
      if (fresh.length) {
        eventsRef.current.onActivity(id, fresh[fresh.length - 1]);
        if (fresh.some((message) => message.side !== 'vendor')) markRead();
      }
    } catch {
      // A missed poll is caught up by the next one.
    } finally {
      polling.current = false;
    }
  }

  usePoll(() => void poll(), THREAD_POLL_MS, Boolean(id && thread));

  /** Show a message this side just sent, without waiting for the poll. */
  const append = useCallback((message: ChatMessage) => {
    setThread((current) => (current ? { ...current, messages: mergeMessages(current.messages, [message]) } : current));
  }, []);

  return { thread, loading, error, reload: load, append };
}
