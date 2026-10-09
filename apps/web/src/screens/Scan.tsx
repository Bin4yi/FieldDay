import { useEffect, useRef, useState } from 'react';
import { BigButton } from '@fieldday/ui';
import { go } from '../router.js';
import { routeForCode, startScanner } from '../scanner.js';
import { Screen } from './Layout.js';

export function Scan() {
  const video = useRef<HTMLVideoElement | null>(null);
  const [msg, setMsg] = useState('Point the camera at a FieldDay QR code.');
  const [text, setText] = useState('');

  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    if (video.current) {
      startScanner(video.current, (code) => {
        const r = routeForCode(code);
        if (r) go(r);
        else setMsg('That is not a FieldDay code.');
      })
        .then((s) => (alive ? (stop = s) : s()))
        .catch(() => setMsg('No camera here. Paste the code or link below.'));
    }
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  const open = () => {
    const r = routeForCode(text);
    if (r) go(r);
    else setMsg('That is not a FieldDay code.');
  };

  return (
    <Screen title="Scan a code">
      <div className="camera" style={{ aspectRatio: '1 / 1' }}>
        <video ref={video} playsInline muted aria-label="Camera for scanning" />
      </div>
      <p className="note" role="status">
        {msg}
      </p>
      <label className="stack">
        <span className="note">Or paste a ghost / quest link:</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…#/ghost/FDG1.…" aria-label="Paste a code or link" />
      </label>
      <BigButton tone="yellow" disabled={!text} onClick={open}>
        Open
      </BigButton>
    </Screen>
  );
}
