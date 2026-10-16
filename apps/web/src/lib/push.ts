import { get, post } from './api';

/**
 * Push στο κινητό (Web Push): η συσκευή γράφεται **μόνο** με ρητό «ναι» του
 * χρήστη, και απεγγράφεται στο logout (κοινές συσκευές). Στο iPhone δουλεύει
 * μόνο αν η εφαρμογή έχει μπει στην αρχική οθόνη (iOS 16.4+) — γι' αυτό η βάση
 * μένει το καμπανάκι.
 */

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Η συσκευή είναι γραμμένη για push; */
export async function pushEnabled(): Promise<boolean> {
  const reg = await registration();
  return !!(await reg?.pushManager.getSubscription());
}

function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/**
 * Γράφει τη συσκευή: ζητά άδεια από τον browser, γράφεται στην υπηρεσία push
 * με το κλειδί του server και το δηλώνει στο API. Επιστρέφει τι έγινε.
 */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unavailable'> {
  const reg = await registration();
  if (!reg) return 'unavailable';
  const { publicKey } = await get<{ publicKey: string | null }>('/notifications/push/key');
  if (!publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  await post('/notifications/push', subscription.toJSON());
  return 'enabled';
}

/** Η συσκευή δεν θέλει πια push — και στο logout. Αποτυχίες δεν σταματούν τίποτα. */
export async function disablePush(): Promise<void> {
  const reg = await registration().catch(() => null);
  const subscription = await reg?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  await post('/notifications/push/remove', { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
