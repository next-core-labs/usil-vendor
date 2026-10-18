/**
 * Where clients see the store. The console runs on its own host
 * (vendor.usil.app, or :5190 in dev), and its `/vendor/<id>` route is the
 * console itself, so public links must point at the storefront instead.
 */
export function publicSiteOrigin(location: Pick<Location, 'protocol' | 'hostname'> = window.location): string {
  const fromEnv = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const { protocol, hostname } = location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:3000`;
  return `${protocol}//${hostname.replace(/^vendor\./, '')}`;
}

export function publicStoreUrl(vendorId: string): string {
  return `${publicSiteOrigin()}/vendor/${encodeURIComponent(vendorId)}`;
}
