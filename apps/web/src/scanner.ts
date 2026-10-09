// Reads QR codes from the camera. Uses the built-in BarcodeDetector when the
// browser has it, otherwise jsQR (loaded only when needed).

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

export async function startScanner(video: HTMLVideoElement, onCode: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
  const jsqr = detector ? null : (await import('jsqr')).default;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let running = true;
  const tick = async () => {
    if (!running) return;
    try {
      if (video.videoWidth) {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            onCode(codes[0].rawValue);
            return;
          }
        } else if (jsqr) {
          const w = Math.min(640, video.videoWidth);
          const h = Math.round((w * video.videoHeight) / video.videoWidth);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsqr(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            onCode(code.data);
            return;
          }
        }
      }
    } catch {
      // keep trying
    }
    setTimeout(() => void tick(), 200);
  };
  void tick();
  return () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
  };
}

/** Where a scanned/pasted code should go. */
export function routeForCode(text: string): { name: 'ghost' | 'questImport'; code: string } | null {
  const g = /FDG1\.[A-Za-z0-9_-]+/.exec(text);
  if (g) return { name: 'ghost', code: g[0] };
  const q = /FDQ1\.[A-Za-z0-9_-]+/.exec(text);
  if (q) return { name: 'questImport', code: q[0] };
  return null;
}
