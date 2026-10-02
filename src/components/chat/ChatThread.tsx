import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Headset, MessagesSquare, Send, Tag } from 'lucide-react';
import { chats } from '../../api/endpoints.ts';
import type { ChatMessage, Conversation, ConversationSummary } from '../../api/types.ts';
import { errorText } from '../../api/client.ts';
import { clockTime, count, dayHeading, dayKey, initials, parseServerDate } from '../../lib/format.ts';
import { Button, EmptyState, ErrorNote, Skeleton, Textarea } from '../ui/primitives.tsx';
import { MAX_CHAT_BODY, counterpartName, senderLabel, useChatThread, type ThreadEvents } from './useChat.ts';

export type ChatThreadProps = ThreadEvents & {
  /** null while the Usil-team thread has no messages yet; the first send starts it via `onStart`. */
  id: string | null;
  summary: ConversationSummary | null;
  /** The Usil team thread shows the support mark instead of an initial, as in the list. */
  team: boolean;
  /** Drafts outlive switching threads, so a half-written reply is not lost. */
  drafts: Map<string, string>;
  /** Shown on narrow screens, where the thread replaces the list. */
  onBack: () => void;
  /** Starts the team thread with its first message. Required when `id` is null. */
  onStart?: (body: string) => Promise<Conversation>;
};

export function ChatThread({ id, summary, team, drafts, onBack, onActivity, onRead, onStart }: ChatThreadProps) {
  const { thread, loading, error, reload, append } = useChatThread(id, { onActivity, onRead });
  const draftKey = id ?? 'team';
  const [draft, setDraft] = useState(() => drafts.get(draftKey) ?? '');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Follow new messages only while the vendor is already at the bottom, so a
  // poll never yanks them away from something older they are reading.
  const pinned = useRef(true);

  const messageCount = thread?.messages.length ?? 0;
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [messageCount]);

  function updateDraft(value: string) {
    setDraft(value);
    if (value) drafts.set(draftKey, value);
    else drafts.delete(draftKey);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || body.length > MAX_CHAT_BODY || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (id) {
        const message = await chats.send(id, body);
        pinned.current = true;
        append(message);
        updateDraft('');
        onActivity(id, message);
      } else if (onStart) {
        await onStart(body);
        updateDraft('');
      }
    } catch (caught) {
      // The draft stays put so nothing typed is lost; 429 carries the server's own wording.
      setSendError(errorText(caught));
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  const row = thread ?? summary;
  const name = row ? counterpartName(row) : counterpartName({ kind: team ? 'vendor_owner' : 'client_vendor' });
  const subtitle = team ? 'الدعم والاستفسارات عن حسابك' : 'عميل · راسلك من المتجر';
  const trimmed = draft.trim();
  const canSend = Boolean(trimmed) && (Boolean(thread) || (!id && Boolean(onStart)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          className="max-lg:size-11 lg:hidden"
          aria-label="رجوع إلى المحادثات"
          onClick={onBack}
          icon={<ArrowRight size={18} />}
        />
        <Avatar name={name} team={team} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{name}</h2>
          <p className="text-[11px] text-ink-muted">{subtitle}</p>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
        role="log"
        aria-live="polite"
        aria-busy={loading}
        aria-label={`الرسائل مع ${name}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 focus-visible:outline-offset-[-2px] sm:px-5"
      >
        {loading ? (
          <ThreadSkeleton />
        ) : error ? (
          <ErrorNote message={error} onRetry={() => void reload()} />
        ) : thread?.messages.length ? (
          <MessageList messages={thread.messages} row={thread} />
        ) : (
          <div className="grid h-full place-items-center">
            <EmptyState
              icon={<MessagesSquare size={22} />}
              title={team ? 'ابدأ المحادثة مع فريق يوصل' : 'لا توجد رسائل في هذه المحادثة'}
              body={
                team
                  ? 'اكتب سؤالك عن الحساب أو المنتجات أو الدفعات، ويرد عليك فريق يوصل هنا.'
                  : undefined
              }
            />
          </div>
        )}
      </div>

      <form onSubmit={(event) => void send(event)} className="space-y-2 border-t border-line p-3">
        {sendError ? <ErrorNote message={sendError} /> : null}
        <div className="flex items-end gap-2">
          <Textarea
            ref={input}
            rows={2}
            value={draft}
            maxLength={MAX_CHAT_BODY}
            readOnly={sending}
            aria-label={`رسالة إلى ${name}`}
            placeholder="اكتب ردك… (Enter للإرسال، Shift+Enter لسطر جديد)"
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-11 resize-none"
            disabled={Boolean(error) && !thread}
          />
          <Button
            type="submit"
            variant="primary"
            className="shrink-0 max-lg:size-11 max-lg:px-0"
            busy={sending}
            disabled={!canSend}
            icon={<Send size={16} className="rtl:-scale-x-100" />}
          >
            <span className="max-lg:sr-only">إرسال</span>
          </Button>
        </div>
        <p
          // LTR so the figures read «0 / 2,000» rather than mirrored under the RTL page.
          dir="ltr"
          className={`tabular text-start text-[11px] ${
            draft.length >= MAX_CHAT_BODY ? 'text-[var(--critical)]' : 'text-ink-muted'
          }`}
        >
          {count(draft.length)} / {count(MAX_CHAT_BODY)}
        </p>
      </form>
    </div>
  );
}

/** The support mark for the Usil team, an initial for a client — same as the inbox row. */
export function Avatar({ name, team }: { name: string; team: boolean }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
        team ? 'bg-[var(--accent-wash)] text-accent' : 'bg-sunken text-ink-secondary'
      }`}
      aria-hidden
    >
      {team ? <Headset size={16} /> : initials(name)}
    </span>
  );
}

function dayOf(raw: string): string {
  const parsed = parseServerDate(raw);
  return parsed ? dayKey(parsed) : '';
}

function MessageList({ messages, row }: { messages: ChatMessage[]; row: Conversation }) {
  return (
    <ol className="space-y-1.5">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
        const newRun = newDay || previous.side !== message.side;
        return (
          <li key={message.id}>
            {newDay ? (
              <p className="my-3 flex items-center gap-3 text-[11px] font-medium text-ink-muted" role="separator">
                <span className="h-px flex-1 bg-[var(--line)]" aria-hidden />
                {dayHeading(message.createdAt)}
                <span className="h-px flex-1 bg-[var(--line)]" aria-hidden />
              </p>
            ) : null}
            <Bubble message={message} row={row} showSender={newRun} spaced={newRun && !newDay} />
          </li>
        );
      })}
    </ol>
  );
}

function Bubble({
  message,
  row,
  showSender,
  spaced,
}: {
  message: ChatMessage;
  row: Conversation;
  showSender: boolean;
  spaced: boolean;
}) {
  const mine = message.side === 'vendor';
  const sender = mine ? 'أنت' : senderLabel(message, row);
  return (
    // The vendor's own replies sit at the inline end (left under RTL), the other side at the start.
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${spaced ? 'pt-2' : ''}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        {showSender && !mine ? (
          <p className="mb-1 px-1 text-[11px] font-medium text-ink-muted">{sender}</p>
        ) : (
          <span className="sr-only">{sender}:</span>
        )}
        <div
          className={`rounded-2xl border px-3.5 py-2 ${
            mine
              ? 'rounded-ee-md border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[var(--accent-wash)]'
              : 'rounded-es-md border-line bg-sunken'
          }`}
        >
          {message.context ? (
            // What the client was looking at when they asked — the listing «اسأل المورّد» was tapped on.
            <p className="mb-1 flex items-center gap-1 text-[12px] font-medium text-ink-secondary">
              <Tag size={12} className="shrink-0" aria-hidden />
              <span className="truncate">بخصوص: {message.context.title || message.context.id}</span>
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink" dir="auto">
            {message.body}
          </p>
          <p className="tabular mt-0.5 text-end text-[11px] text-ink-muted">
            <time dateTime={message.createdAt}>{clockTime(message.createdAt)}</time>
          </p>
        </div>
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="space-y-3">
      {['w-2/3', 'ms-auto w-1/2', 'w-3/5', 'ms-auto w-2/5'].map((width, index) => (
        <Skeleton key={index} className={`h-14 rounded-2xl ${width}`} />
      ))}
    </div>
  );
}
