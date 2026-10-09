import type { PhotoCheck } from './types.js';

// Offline photo check for quests. The phone gives us object labels (from the
// on-device detector) and simple colour numbers from the middle of the photo.

export interface PhotoFacts {
  labels: { label: string; score: number }[];
  /** Share of centre pixels by colour (0..1). */
  colours: { red: number; blue: number; yellow: number; green: number; brown: number };
  brightness: number;
}

const OBJECT_TASKS: Record<string, string[]> = {
  'a bench': ['bench', 'chair'],
  'a bottle': ['bottle', 'cup'],
  'a ball': ['sports ball', 'frisbee'],
  'a backpack': ['backpack', 'handbag', 'suitcase'],
  'a bird': ['bird'],
  'a plant in a pot': ['potted plant'],
  'a dog': ['dog'],
  'a bicycle': ['bicycle'],
};

export function judgePhoto(task: string, f: PhotoFacts): PhotoCheck {
  const t = task.toLowerCase().trim();
  const labels = f.labels.map((l) => l.label);
  const wanted = OBJECT_TASKS[t];
  if (wanted) {
    const hit = f.labels.filter((l) => wanted.includes(l.label)).sort((a, b) => b.score - a.score)[0];
    return { passed: !!hit && hit.score >= 0.35, confidence: hit?.score ?? 0, labels };
  }
  const colour = /\b(red|blue|yellow|green)\b/.exec(t)?.[1] as keyof PhotoFacts['colours'] | undefined;
  if (colour && /\bsomething\b/.test(t)) {
    const share = f.colours[colour];
    return { passed: share >= 0.18, confidence: Math.min(1, share * 3), labels };
  }
  if (t === 'a leaf' || t === 'grass') {
    const share = f.colours.green + (t === 'a leaf' ? f.colours.brown * 0.7 + f.colours.yellow * 0.5 : 0);
    return { passed: share >= 0.3, confidence: Math.min(1, share * 2), labels };
  }
  // Unknown task offline: we cannot check it, so we trust the player.
  return { passed: true, confidence: 0, labels };
}

/** Colour shares from RGBA pixels (centre crop), for judgePhoto. */
export function colourFacts(data: Uint8ClampedArray | number[], width: number, height: number): Pick<PhotoFacts, 'colours' | 'brightness'> {
  const c = { red: 0, blue: 0, yellow: 0, green: 0, brown: 0 };
  let n = 0;
  let light = 0;
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.ceil(height * 0.75);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      light += max;
      n++;
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.3 || max < 0.18) continue;
      let h: number;
      if (max === r) h = ((g - b) / (max - min) + 6) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h *= 60;
      if (h < 15 || h >= 340) c.red++;
      else if (h < 40) (max < 0.6 ? c.brown++ : c.red++);
      else if (h < 70) c.yellow++;
      else if (h < 165) c.green++;
      else if (h < 260) c.blue++;
    }
  }
  const k = n || 1;
  return {
    colours: { red: c.red / k, blue: c.blue / k, yellow: c.yellow / k, green: c.green / k, brown: c.brown / k },
    brightness: (light / k) * 255,
  };
}
