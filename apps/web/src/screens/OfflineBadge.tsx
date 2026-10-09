import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Shows that the app works with no signal. */
export function OfflineBadge() {
  const online = useOnline();
  const {
    offlineReady: [offlineReady],
  } = useRegisterSW();
  const ready = offlineReady || !!navigator.serviceWorker?.controller;
  let text: string;
  if (!online) text = 'No signal · Still works';
  else if (ready) text = 'Works offline';
  else text = 'Getting ready for offline…';
  return (
    <p className={`offline-badge ${!online ? 'offline-badge--off' : ''}`} role="status">
      <span aria-hidden="true">{online ? '✓' : '⚡'}</span> {text}
    </p>
  );
}
