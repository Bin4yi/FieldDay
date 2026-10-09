import { BrainRouter, GemmaBrain, colourFacts, type BrainCallLog, type SmartBrain } from '@fieldday/brain';
import { db } from '../db.js';
import { useApp } from '../store.js';
import { gemmaLoaded, gemmaRunner } from './gemma.js';

// One brain router for the whole app.

const gemma = new GemmaBrain(null, photoFacts);
let openai: SmartBrain | null = null;

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

function log(entry: BrainCallLog) {
  void db()
    .brainLogs.add(entry)
    .catch(() => undefined);
}

export const brain = new BrainRouter({
  mode: () => useApp.getState().settings.brainMode,
  online: () => navigator.onLine,
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
