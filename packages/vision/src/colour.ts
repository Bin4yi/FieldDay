import type { ImageLike } from './identity.js';
import type { Box } from './types.js';

// Fast ball follower between object-detector runs: looks for pixels with the
// ball's colour near where the ball was, and returns their centre.

export interface ColourModel {
  r: number;
  g: number;
  b: number;
}

/** Average colour in the middle of a box (the ball). */
export function sampleColour(img: ImageLike, box: Box): ColourModel {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rad = Math.max(1, Math.min(box.w, box.h) * 0.3);
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      r += img.data[i]!;
      g += img.data[i + 1]!;
      b += img.data[i + 2]!;
      n++;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
}

/** Search around `prev` (grown by `grow`) for pixels close to the colour. */
export function trackColour(img: ImageLike, prev: Box, model: ColourModel, grow = 2.5, tolerance = 60): Box | null {
  const cx = prev.x + prev.w / 2;
  const cy = prev.y + prev.h / 2;
  const hw = (prev.w * grow) / 2 + 4;
  const hh = (prev.h * grow) / 2 + 4;
  const x0 = Math.max(0, Math.floor(cx - hw));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + hw));
  const y0 = Math.max(0, Math.floor(cy - hh));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + hh));
  let sx = 0,
    sy = 0,
    n = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const tol2 = tolerance * tolerance;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      const dr = img.data[i]! - model.r;
      const dg = img.data[i + 1]! - model.g;
      const db = img.data[i + 2]! - model.b;
      if (dr * dr + dg * dg + db * db > tol2) continue;
      sx += x;
      sy += y;
      n++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const area = prev.w * prev.h;
  if (n < Math.max(4, area * 0.15)) return null;
  const w = Math.max(prev.w * 0.5, Math.min(prev.w * 1.6, maxX - minX + 1));
  const h = Math.max(prev.h * 0.5, Math.min(prev.h * 1.6, maxY - minY + 1));
  return { x: sx / n - w / 2, y: sy / n - h / 2, w, h };
}

/** Mean brightness 0..255 (for the Field Check light test). */
export function brightness(img: ImageLike, step = 8): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < img.width * img.height * 4; i += 4 * step) {
    s += 0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!;
    n++;
  }
  return n ? s / n : 0;
}
