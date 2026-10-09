// Auto Highlight Clip. Records the camera + overlay (score, ball trail) in
// rolling 6-second pieces. When something great happens we mark the piece
// that is recording; the best marked piece is kept as the game's clip.
// Clips stay on the phone; the player chooses to share.

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export class ClipRecorder {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private segTimer = 0;
  private label = '';
  private markValue: number | null = null;
  private best: { blob: Blob; value: number } | null = null;
  private readonly mime = pickMime();
  private stopped = false;
  private waiting: (() => void) | null = null;

  constructor(
    private video: () => HTMLVideoElement | null,
    private overlay: () => HTMLCanvasElement | null,
    private segmentMs = 6000,
  ) {}

  static supported(): boolean {
    return pickMime() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  start() {
    if (!this.mime) return;
    const draw = () => {
      const v = this.video();
      const o = this.overlay();
      const w = v?.videoWidth || o?.width || 480;
      const h = v?.videoHeight || o?.height || 640;
      const scale = Math.min(1, 540 / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      if (this.canvas.width !== cw) this.canvas.width = cw;
      if (this.canvas.height !== ch) this.canvas.height = ch;
      this.ctx.fillStyle = '#0B1C3D';
      this.ctx.fillRect(0, 0, cw, ch);
      if (v && v.videoWidth) this.ctx.drawImage(v, 0, 0, cw, ch);
      if (o && o.width) this.ctx.drawImage(o, 0, 0, cw, ch);
      if (this.label) {
        const fs = Math.round(ch / 14);
        this.ctx.font = `900 ${fs}px 'Archivo Black', sans-serif`;
        this.ctx.lineWidth = fs / 6;
        this.ctx.strokeStyle = '#000';
        this.ctx.fillStyle = '#FFE600';
        this.ctx.strokeText(this.label, fs * 0.4, fs * 1.3);
        this.ctx.fillText(this.label, fs * 0.4, fs * 1.3);
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
    this.segment();
  }

  private segment() {
    if (this.stopped || !this.mime) return;
    const stream = this.canvas.captureStream(24);
    const rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 1_200_000 });
    this.chunks = [];
    this.markValue = null;
    rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    rec.onstop = () => {
      const value = this.markValue;
      if (value !== null && (!this.best || value > this.best.value)) {
        this.best = { blob: new Blob(this.chunks, { type: this.mime! }), value };
      }
      this.rec = null;
      if (this.stopped) this.waiting?.();
      else this.segment();
    };
    rec.start();
    this.rec = rec;
    this.segTimer = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), this.segmentMs);
  }

  setLabel(text: string) {
    this.label = text;
  }

  /** Something great happened: keep this piece if it is the best so far. */
  mark(value: number) {
    this.markValue = Math.max(this.markValue ?? -Infinity, value);
  }

  /** Stop and return the best clip (if any). */
  finish(): Promise<Blob | null> {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.segTimer);
    return new Promise((resolve) => {
      const done = () => resolve(this.best?.blob ?? null);
      if (this.rec && this.rec.state !== 'inactive') {
        this.waiting = done;
        this.rec.stop();
      } else done();
    });
  }
}
