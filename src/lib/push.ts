import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { api } from '../api/client.ts';

/**
 * Browser notifications through Firebase Cloud Messaging. The backend holds
 * the Firebase web config (GET /api/push/config) and sends to the token
 * registered here for the signed-in account; /firebase-messaging-sw.js draws
 * each notification and opens its link on a tap.
 */

const APP = 'vendor';
const TOKEN_KEY = 'usil-vendor-push-token';
const WORKER_URL = '/firebase-messaging-sw.js';

type PushConfig = { enabled: boolean; web: { firebase: FirebaseOptions; vapidKey: string } | null };

/** `unsupported` also covers a backend without Firebase set up: nothing to offer. */
export type PushState = 'unsupported' | 'off' | 'denied' | 'on';

let config: Promise<PushConfig['web']> | null = null;

function webConfig(): Promise<PushConfig['web']> {
  config ??= api
    .get<PushConfig>('/api/push/config')
    .then((result) => (result.enabled ? result.web : null))
    .catch(() => null);
  return config;
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the server copy is what counts */
  }
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported';
  if (!(await isSupported().catch(() => false)) || !(await webConfig())) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'on' : 'off';
}

/**
 * Registers this browser for the signed-in account. Asks for permission when
 * it has not been given yet, so call it from a click; with permission already
 * granted it only refreshes the token.
 */
export async function enablePush(): Promise<PushState> {
  const web = await webConfig();
  if (!web || !('Notification' in window)) return 'unsupported';
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';

  const registration = await navigator.serviceWorker.register(WORKER_URL);
  const app = getApps()[0] || initializeApp(web.firebase);
  const token = await getToken(getMessaging(app), { vapidKey: web.vapidKey, serviceWorkerRegistration: registration });
  await api.post('/api/push/register', { token, platform: 'web', app: APP });
  storeToken(token);
  return 'on';
}

/** Before logout, while the session still owns the token. */
export async function disablePush(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  storeToken(null);
  await api.post('/api/push/unregister', { token }).catch(() => undefined);
}

/** A tap on a notification while a console tab is open: the worker asks that tab to go there. */
export function followPushTaps(): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; link?: string } | null;
    if (data?.type === 'usil-push-open' && typeof data.link === 'string') window.location.assign(data.link);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
