import { useEffect, useState } from 'react';

/**
 * Hash routing, ~30 lines instead of a dependency. The dashboard is a flat set
 * of sections, so a hash is enough and it survives a refresh and deep links.
 */
export function currentRoute(): string {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return raw || 'overview';
}

export function navigate(route: string) {
  if (currentRoute() === route) return;
  window.location.hash = `#/${route}`;
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
