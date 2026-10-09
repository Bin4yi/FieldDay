import { useEffect, useRef, useState } from 'react';
import { BigButton } from '@fieldday/ui';

/** A QR code + link for a ghost or quest. The code holds everything, so it works offline. */
export function ShareSheet({ url, title, text }: { url: string; title: string; text: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void import('qrcode')
      .then((QR) => {
        if (alive && canvas.current) return QR.toCanvas(canvas.current, url, { errorCorrectionLevel: 'L', margin: 2, width: 300 });
        return undefined;
      })
      .catch(() => setErr('Could not draw the QR code. Use the link instead.'));
    return () => {
      alive = false;
    };
  }, [url]);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // cancelled
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
  };

  return (
    <div className="stack" style={{ alignItems: 'stretch' }}>
      <canvas ref={canvas} className="qr" role="img" aria-label={`QR code: ${title}`} />
      {err ? <p className="note">{err}</p> : null}
      <p className="note">Scan with FieldDay (works with no internet) or any phone camera.</p>
      <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
      <BigButton tone="yellow" icon="↗" onClick={() => void share()}>
        {copied ? 'Link copied!' : 'Share link'}
      </BigButton>
    </div>
  );
}
