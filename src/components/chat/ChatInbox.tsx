import { useCallback, useMemo, useRef, useState } from 'react';
import { MessagesSquare, Search } from 'lucide-react';
import { chats } from '../../api/endpoints.ts';
import type { ChatMessage, ConversationSummary } from '../../api/types.ts';
import { count, shortWhen } from '../../lib/format.ts';
import { useUnread } from '../../state/UnreadContext.tsx';
import { Badge, Card, EmptyState, ErrorNote, Skeleton } from '../ui/primitives.tsx';
import { Avatar, ChatThread } from './ChatThread.tsx';
import { USIL_TEAM_LABEL, counterpartName, useChatInbox } from './useChat.ts';

/**
 * Which conversation is open. The Usil-team thread is pinned to the top even
 * before it exists (threads only exist once a message is sent), so it has its
 * own selection kind that resolves to a thread id once the first send lands.
 */
type Selection = { type: 'thread'; id: string } | { type: 'team' } | null;

function preview(row: ConversationSummary): string {
  const last = row.lastMessage;
  if (!last) return '';
  const body = last.body.replace(/\s+/g, ' ');
  return last.side === 'vendor' ? `أنت: ${body}` : body;
}

/**
 * The vendor's inbox: clients who tapped «اسأل المورّد» on a listing or the
 * storefront page, plus the one thread with فريق يوصل. Everything comes from
 * `/api/chats`, which the server already scopes to the signed-in vendor.
 */
export function ChatInbox() {
  const resource = useChatInbox();
  const { refreshChats } = useUnread();
  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState('');
  // Drafts outlive switching threads, so a half-written reply is not lost.
  const drafts = useRef(new Map<string, string>()).current;

  const rows = useMemo(() => resource.data ?? [], [resource.data]);
  const teamRow = useMemo(() => rows.find((row) => row.kind === 'vendor_owner') ?? null, [rows]);
  const clientRows = useMemo(() => rows.filter((row) => row.kind === 'client_vendor'), [rows]);
  const visibleClients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return clientRows;
    return clientRows.filter((row) => counterpartName(row).toLowerCase().includes(needle));
  }, [clientRows, search]);

  // A «team» selection whose thread now exists is the same conversation as that thread.
  const selectedId =
    selection?.type === 'thread' ? selection.id : selection?.type === 'team' ? (teamRow?.id ?? null) : null;
  const teamOpen = selection?.type === 'team' || (Boolean(teamRow) && selectedId === teamRow?.id);
  const selectedRow = selectedId ? (rows.find((row) => row.id === selectedId) ?? null) : null;

  const setRows = resource.set;

  // A message sent or received moves its thread to the top, as the server would order it.
  const onActivity = useCallback(
    (id: string, message: ChatMessage) =>
      setRows((current) => {
        const row = current?.find((item) => item.id === id);
        if (!current || !row || (row.lastMessage && row.lastMessage.seq >= message.seq)) return current;
        const next = { ...row, lastMessage: message, updatedAt: message.createdAt, unread: 0 };
        return [next, ...current.filter((item) => item.id !== id)];
      }),
    [setRows],
  );

  const onRead = useCallback(
    (id: string) => {
      setRows((current) => current?.map((row) => (row.id === id ? { ...row, unread: 0 } : row)) ?? current);
      refreshChats();
    },
    [setRows, refreshChats],
  );

  // The first message to the team creates the thread; the list is refetched so the pin resolves to it.
  const startTeamThread = useCallback(
    async (body: string) => {
      const conversation = await chats.startTeamThread(body);
      await resource.reload();
      setSelection({ type: 'thread', id: conversation.id });
      return conversation;
    },
    [resource],
  );

  if (resource.error && !resource.data) {
    return <ErrorNote message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const listHidden = selection ? 'max-lg:hidden' : '';

  return (
    <>
      {resource.error ? <ErrorNote message={resource.error} onRetry={() => void resource.reload()} /> : null}

      <Card padded={false} className="flex h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden">
        {resource.loading ? (
          <ListSkeleton />
        ) : (
          <>
            <div className={`flex w-full min-w-0 flex-col lg:w-80 lg:shrink-0 lg:border-e lg:border-line ${listHidden}`}>
              {clientRows.length > 5 ? (
                <div className="border-b border-line p-3">
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-muted"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="ابحث باسم العميل…"
                      aria-label="ابحث باسم العميل"
                      className="h-11 w-full rounded-lg border border-line-strong bg-surface ps-9 pe-3 text-base text-ink placeholder:text-ink-muted transition-colors hover:border-[var(--axis)] focus:border-accent focus:outline-none sm:text-sm lg:h-9"
                    />
                  </div>
                </div>
              ) : null}

              <ul className="min-h-0 flex-1 divide-y divide-[var(--line)] overflow-y-auto" aria-label="المحادثات">
                <ThreadRow
                  title={USIL_TEAM_LABEL}
                  team
                  preview={teamRow ? preview(teamRow) : 'الدعم والاستفسارات عن حسابك'}
                  when={teamRow?.lastMessage?.createdAt}
                  unread={teamOpen ? 0 : (teamRow?.unread ?? 0)}
                  active={teamOpen}
                  onOpen={() => setSelection(teamRow ? { type: 'thread', id: teamRow.id } : { type: 'team' })}
                />
                {visibleClients.map((row) => (
                  <ThreadRow
                    key={row.id}
                    title={counterpartName(row)}
                    preview={preview(row)}
                    when={row.lastMessage?.createdAt ?? row.updatedAt}
                    // The open thread is being read right now; a list poll landing before the
                    // read marker must not flash a badge on it.
                    unread={row.id === selectedId ? 0 : row.unread}
                    active={row.id === selectedId}
                    onOpen={() => setSelection({ type: 'thread', id: row.id })}
                  />
                ))}
                {!clientRows.length ? (
                  <li>
                    <EmptyState
                      icon={<MessagesSquare size={22} />}
                      title="لا توجد رسائل من العملاء بعد"
                      body="عندما يضغط عميل «اسأل المورّد» في صفحة منتج أو في ملفك التجاري، تظهر محادثته هنا."
                    />
                  </li>
                ) : search.trim() && !visibleClients.length ? (
                  <li>
                    <EmptyState title="لا توجد محادثة بهذا الاسم" />
                  </li>
                ) : null}
              </ul>
            </div>

            <div className={`min-w-0 flex-1 flex-col ${selection ? 'flex' : 'hidden lg:flex'}`}>
              {selection ? (
                <ChatThread
                  key={selectedId ?? 'team'}
                  id={selectedId}
                  summary={selectedRow}
                  team={teamOpen}
                  drafts={drafts}
                  onBack={() => setSelection(null)}
                  onActivity={onActivity}
                  onRead={onRead}
                  onStart={teamOpen && !selectedId ? startTeamThread : undefined}
                />
              ) : (
                <div className="grid flex-1 place-items-center">
                  <EmptyState
                    icon={<MessagesSquare size={22} />}
                    title="اختر محادثة"
                    body="افتح محادثة من القائمة لقراءة أسئلة العميل والرد عليها."
                  />
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

/* ── Thread list ────────────────────────────────────────────────────── */

function ThreadRow({
  title,
  team = false,
  preview,
  when,
  unread,
  active,
  onOpen,
}: {
  title: string;
  team?: boolean;
  preview: string;
  when?: string;
  unread: number;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-start gap-3 px-4 py-3 text-start transition-colors focus-visible:outline-offset-[-2px] ${
          active ? 'bg-[var(--accent-wash)]' : 'hover:bg-sunken/60'
        }`}
      >
        <Avatar name={title} team={team} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm text-ink ${unread ? 'font-semibold' : 'font-medium'}`}>{title}</span>
            {when ? (
              <time dateTime={when} className="tabular shrink-0 text-[11px] text-ink-muted">
                {shortWhen(when)}
              </time>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] ${unread ? 'text-ink' : 'text-ink-secondary'}`} dir="auto">
              {preview}
            </span>
            {unread ? (
              <Badge tone="accent">
                <span className="tabular">{count(unread)}</span>
                <span className="sr-only">رسائل غير مقروءة</span>
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="w-full space-y-2 p-4 lg:w-80 lg:border-e lg:border-line">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
