import { BrainRouter, GemmaBrain, OpenAIBrain, colourFacts, type BrainCallLog, type SmartBrain } from '@fieldday/brain';
import { serverUrl } from '../net/online.js';
import { db } from '../db.js';
import { useApp } from '../store.js';
import { gemmaLoaded, gemmaRunner } from './gemma.js';

// One brain router for the whole app.

const gemma = new GemmaBrain(null, photoFacts);

// Boost Mode brain: through the FieldDay server.
let boostCache: { at: number; ok: boolean } | null = null;
export async function boostAvailable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  if (boostCache && Date.now() - boostCache.at < 30_000) return boostCache.ok;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = (await (await fetch(`${serverUrl()}/health`, { signal: ctl.signal })).json()) as { boost?: boolean };
    clearTimeout(t);
    boostCache = { at: Date.now(), ok: !!r.boost };
  } catch {
    boostCache = { at: Date.now(), ok: false };
  }
  return boostCache.ok;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  return data;
}

async function toDataUrl(blob: Blob): Promise<string> {
  // Shrink the photo first: small, low-detail is enough for a quest check.
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

let openai: SmartBrain | null = new OpenAIBrain(post, boostAvailable, toDataUrl);

export function setOpenAIBrain(b: SmartBrain | null) {
  openai = b;
}

/** Call after the Gemma model loads (or is removed). */
export function refreshGemma() {
  gemma.setRunner(gemmaLoaded() ? gemmaRunner : null);
}

export function gemmaBrain(): GemmaBrain {
  return gemma;
}

export function log(entry: BrainCallLog) {
  void db()
    .brainLogs.add(entry)
    .catch(() => undefined);
}

export const brain = new BrainRouter({
  mode: () => useApp.getState().settings.brainMode,
  // Only try OpenAI when the server said Boost is set up (or we don't know yet).
  online: () => navigator.onLine && boostCache?.ok !== false,
  gemma,
  get openai() {
    return openai;
  },
  log,
} as ConstructorParameters<typeof BrainRouter>[0]);

/** Labels + colours of a photo, from the on-device detector. */
async function photoFacts(image: Blob) {
  const bmp = await createImageBitmap(image);
  const c = document.createElement('canvas');
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  let labels: { label: string; score: number }[] = [];
  try {
    const { loadVisionModels } = await import('../vision/mediapipe.js');
    const m = await loadVisionModels(1);
    const r = m.objects.detectForVideo(c, performance.now());
    labels = r.detections.flatMap((d) => d.categories.map((cat) => ({ label: cat.categoryName, score: cat.score })));
  } catch {
    // No detector available: colours only.
  }
  return { labels, ...colourFacts(data.data, c.width, c.height) };
}
