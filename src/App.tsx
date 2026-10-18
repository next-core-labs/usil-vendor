import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { SessionProvider, useSession } from './state/SessionContext.tsx';
import { AccountProvider, useAccount } from './state/AccountContext.tsx';
import { ToastProvider } from './state/ToastContext.tsx';
import { UnreadProvider } from './state/UnreadContext.tsx';
import { Shell } from './components/layout/Shell.tsx';
import { PENDING_HIDDEN_ROUTES } from './components/layout/nav.ts';
import { navigate, useRoute } from './lib/router.ts';
import { Login } from './screens/Login.tsx';
import { ApplicationStatus } from './screens/ApplicationStatus.tsx';
import { Overview } from './screens/Overview.tsx';
import { Listings } from './screens/Listings.tsx';
import { Calendar } from './screens/Calendar.tsx';
import { Storefront } from './screens/Storefront.tsx';
import { Socials } from './screens/Socials.tsx';
import { Chats } from './screens/Chats.tsx';
import { Orders } from './screens/Orders.tsx';

function Screen() {
  const route = useRoute();
  const { mode } = useAccount();
  // Bookings and chats need a public store; a pending vendor is sent to the overview.
  const hidden = mode === 'pending' && PENDING_HIDDEN_ROUTES.includes(route);
  useEffect(() => {
    if (hidden) navigate('overview');
  }, [hidden]);
  if (hidden) return <Overview />;
  switch (route) {
    case 'orders':
      return <Orders />;
    case 'listings':
      return <Listings />;
    case 'calendar':
      return <Calendar />;
    case 'storefront':
      return <Storefront />;
    case 'socials':
      return <Socials />;
    case 'chats':
      return <Chats />;
    default:
      return <Overview />;
  }
}

function Spinner() {
  return (
    <div className="grid min-h-full place-items-center">
      <Loader2 size={24} className="animate-spin text-ink-muted" aria-label="جارٍ التحميل" />
    </div>
  );
}

function Workspace() {
  const { user } = useSession();
  const { mode, loading } = useAccount();
  if (loading) return <Spinner />;
  // Rejected, or never applied.
  if (mode === 'outside' && user) return <ApplicationStatus user={user} />;
  return (
    <UnreadProvider>
      <Shell>
        <Screen />
      </Shell>
    </UnreadProvider>
  );
}

function Gate() {
  const { user, loading } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  return (
    <AccountProvider key={user.id} user={user}>
      <Workspace />
    </AccountProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </ToastProvider>
  );
}
