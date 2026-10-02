import { MessagesSquare, RefreshCw } from 'lucide-react';
import { useSession } from '../state/SessionContext.tsx';
import { Button, Card, EmptyState, PageHeader } from '../components/ui/primitives.tsx';
import { ChatInbox } from '../components/chat/ChatInbox.tsx';
import { useState } from 'react';

/**
 * «المحادثات»: where a client's «اسأل المورّد» message lands. The inbox lists
 * the vendor's client threads and the pinned thread with فريق يوصل.
 *
 * Supervisors are admitted to this dashboard (see `isVendorAccount`), but
 * `/api/chats` answers them as the *owner* side — the Usil team's shared
 * inbox with every vendor — which is the owner console's screen, not this
 * one. Showing it here would read as the vendor's own messages, so they get
 * a pointer instead.
 */
export function Chats() {
  const { user } = useSession();
  // Remounting the inbox is the simplest full refresh: list, open thread and drafts' scroll.
  const [epoch, setEpoch] = useState(0);

  if (user?.role !== 'vendor') {
    return (
      <>
        <PageHeader title="المحادثات" subtitle="رسائل العملاء من المتجر ومحادثتك مع فريق يوصل." />
        <Card>
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title="المحادثات متاحة لحسابات المورّدين فقط"
            body="دخلت بحساب مشرف. محادثات فريق يوصل مع المورّدين تُدار من لوحة المالك، وليس من هنا."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="المحادثات"
        subtitle="أسئلة العملاء التي وصلتك عبر «اسأل المورّد» من صفحات منتجاتك وملفك التجاري، ومحادثتك مع فريق يوصل."
        action={
          <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} onClick={() => setEpoch((n) => n + 1)}>
            تحديث
          </Button>
        }
      />
      <ChatInbox key={epoch} />
    </>
  );
}
