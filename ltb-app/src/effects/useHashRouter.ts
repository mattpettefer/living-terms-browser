import { useEffect } from 'preact/hooks';
import { isDestinationId } from '../state/destinations';
import { useStore } from '../state/provider';
import type { DestinationId } from '../state/types';

export type Route =
  | { view: 'overview'; category: DestinationId | 'all' }
  | { view: 'config'; category: DestinationId }
  | { view: 'article'; postId: number };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, arg] = parts;
  if (head === 'config') return { view: 'config', category: isDestinationId(arg) ? arg : 'campus-life' };
  if (head === 'article' && arg && /^\d+$/.test(arg)) return { view: 'article', postId: Number(arg) };
  return { view: 'overview', category: isDestinationId(arg) ? arg : 'all' };
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case 'config':
      return `#/config/${route.category}`;
    case 'article':
      return `#/article/${route.postId}`;
    default:
      return route.category === 'all' ? '#/overview' : `#/overview/${route.category}`;
  }
}

export function navigate(route: Route, replace = false): void {
  const hash = routeToHash(route);
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Syncs the location hash into store navigation state. */
export function useHashRouter() {
  const { dispatch } = useStore();
  useEffect(() => {
    const apply = () => {
      const route = parseHash(window.location.hash);
      if (route.view === 'overview') {
        dispatch({ type: 'SET_OVERVIEW_CATEGORY', category: route.category });
        dispatch({ type: 'NAVIGATE', view: 'overview' });
      } else if (route.view === 'config') dispatch({ type: 'NAVIGATE', view: 'config', category: route.category });
      else dispatch({ type: 'NAVIGATE', view: 'article', postId: route.postId });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [dispatch]);
}
