import { Loader2 } from 'lucide-react';
import { SessionProvider, isVendorAccount, useSession } from './state/SessionContext.tsx';
import { ToastProvider } from './state/ToastContext.tsx';
import { UnreadProvider } from './state/UnreadContext.tsx';
import { Shell } from './components/layout/Shell.tsx';
import { useRoute } from './lib/router.ts';
import { Login, NotAuthorized } from './screens/Login.tsx';
import { Overview } from './screens/Overview.tsx';
import { Listings } from './screens/Listings.tsx';
import { Calendar } from './screens/Calendar.tsx';
import { Storefront } from './screens/Storefront.tsx';
import { Socials } from './screens/Socials.tsx';
import { Chats } from './screens/Chats.tsx';

function Screen() {
  const route = useRoute();
  switch (route) {
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

function Gate() {
  const { user, loading, signOut } = useSession();

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Loader2 size={24} className="animate-spin text-ink-muted" aria-label="جارٍ التحميل" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (!isVendorAccount(user)) return <NotAuthorized name={user.name} onSignOut={() => void signOut()} />;

  return (
    <UnreadProvider>
      <Shell>
        <Screen />
      </Shell>
    </UnreadProvider>
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
