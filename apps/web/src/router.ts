import { useEffect, useState } from 'react';

// Tiny hash router: works offline and from any static host.

export type Route =
  | { name: 'home' }
  | { name: 'games' }
  | { name: 'setup'; id: string }
  | { name: 'play' }
  | { name: 'check' }
  | { name: 'say' }
  | { name: 'bracket' }
  | { name: 'me' }
  | { name: 'stats' }
  | { name: 'results'; id: number }
  | { name: 'history' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'games':
      return { name: 'games' };
    case 'setup':
      return parts[1] ? { name: 'setup', id: parts[1] } : { name: 'games' };
    case 'play':
      return { name: 'play' };
    case 'check':
      return { name: 'check' };
    case 'say':
      return { name: 'say' };
    case 'bracket':
      return { name: 'bracket' };
    case 'me':
      return { name: 'me' };
    case 'stats':
      return { name: 'stats' };
    case 'results': {
      const id = Number(parts[1]);
      return Number.isInteger(id) ? { name: 'results', id } : { name: 'history' };
    }
    case 'history':
      return { name: 'history' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'setup':
      return `#/setup/${r.id}`;
    case 'results':
      return `#/results/${r.id}`;
    default:
      return `#/${r.name}`;
  }
}

export function go(r: Route) {
  window.location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
