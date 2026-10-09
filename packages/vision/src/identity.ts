import { dist, mid } from './geometry.js';
import { LM } from './landmarks.js';
import type { Box, Point } from './types.js';

// Which detected person is which player? We use where they are, plus the
// colour of their shirt (a hue histogram of the torso).

export interface ImageLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export const HUE_BINS = 12;

/** Hue histogram (12 bins + 1 bin for grey/black/white), normalised to sum 1. */
export function hueHistogram(img: ImageLike, box: Box): number[] {
  const h = new Array(HUE_BINS + 1).fill(0);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.h));
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i]! / 255;
      const g = img.data[i + 1]! / 255;
      const b = img.data[i + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.25 || max < 0.15) {
        h[HUE_BINS]++;
      } else {
        let hue: number;
        if (max === r) hue = ((g - b) / (max - min)) % 6;
        else if (max === g) hue = (b - r) / (max - min) + 2;
        else hue = (r - g) / (max - min) + 4;
        hue = ((hue * 60 + 360) % 360) / 360;
        h[Math.min(HUE_BINS - 1, Math.floor(hue * HUE_BINS))]++;
      }
      n++;
    }
  }
  return n ? h.map((v) => v / n) : h;
}

/** 0 = same colours, 1 = totally different (Hellinger distance). */
export function histDistance(a: number[], b: number[]): number {
  let bc = 0;
  for (let i = 0; i < a.length; i++) bc += Math.sqrt((a[i] ?? 0) * (b[i] ?? 0));
  return Math.sqrt(Math.max(0, 1 - bc));
}

/** Torso box from a pose, for the histogram. */
export function torsoBox(lm: Point[]): Box | null {
  const ls = lm[LM.leftShoulder];
  const rs = lm[LM.rightShoulder];
  const lh = lm[LM.leftHip];
  const rh = lm[LM.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  const x0 = Math.min(ls.x, rs.x, lh.x, rh.x);
  const x1 = Math.max(ls.x, rs.x, lh.x, rh.x);
  const y0 = Math.min(ls.y, rs.y);
  const y1 = Math.max(lh.y, rh.y);
  const pad = (x1 - x0) * 0.15;
  return { x: x0 + pad, y: y0 + (y1 - y0) * 0.1, w: Math.max(1, x1 - x0 - 2 * pad), h: Math.max(1, (y1 - y0) * 0.8) };
}

interface Track {
  player: number;
  pos: Point;
  hist: number[] | null;
  lastT: number;
}

export type IdentityMode = 'track' | 'sides';

/**
 * Assigns each pose to a player.
 * - "sides": side-by-side duel, left half of the image = player 0, right = player 1.
 * - "track": follow players by position + shirt colour.
 */
export class IdentityTracker {
  private tracks: Track[] = [];

  constructor(
    private players: number,
    private mode: IdentityMode = 'track',
  ) {}

  setMode(mode: IdentityMode) {
    this.mode = mode;
  }

  /** Remember a player's shirt colour (e.g. during calibration). */
  register(player: number, hist: number[], pos: Point, t: number) {
    this.tracks = this.tracks.filter((tr) => tr.player !== player);
    this.tracks.push({ player, pos, hist, lastT: t });
  }

  /** Returns, for each pose, the player index (or -1 if unknown/extra). */
  assign(t: number, poses: Point[][], width: number, hists?: number[][]): number[] {
    const centres = poses.map((lm) => {
      const l = lm[LM.leftHip];
      const r = lm[LM.rightHip];
      return l && r ? mid(l, r) : (lm[0] ?? { x: 0, y: 0 });
    });
    if (this.mode === 'sides') {
      const sides = this.players > 1 ? this.players : 1;
      return centres.map((c) => Math.min(sides - 1, Math.max(0, Math.floor((c.x / width) * sides))));
    }
    const result = poses.map(() => -1);
    const free = new Set(this.tracks.map((tr) => tr.player));
    // Greedy: cheapest (pose, track) pairs first.
    const pairs: { i: number; tr: Track; cost: number }[] = [];
    centres.forEach((c, i) => {
      for (const tr of this.tracks) {
        const d = dist(c, tr.pos) / width;
        const h = hists?.[i] && tr.hist ? histDistance(hists[i]!, tr.hist) : 0.5;
        pairs.push({ i, tr, cost: d * 1.5 + h });
      }
    });
    pairs.sort((a, b) => a.cost - b.cost);
    for (const p of pairs) {
      if (result[p.i] !== -1 || !free.has(p.tr.player) || p.cost > 1.2) continue;
      result[p.i] = p.tr.player;
      free.delete(p.tr.player);
      p.tr.pos = centres[p.i]!;
      p.tr.lastT = t;
      if (hists?.[p.i]) p.tr.hist = p.tr.hist ? p.tr.hist.map((v, k) => v * 0.9 + hists[p.i]![k]! * 0.1) : hists[p.i]!;
    }
    // New people take the lowest unused player numbers.
    centres.forEach((c, i) => {
      if (result[i] !== -1) return;
      for (let p = 0; p < this.players; p++) {
        if (!this.tracks.some((tr) => tr.player === p)) {
          this.tracks.push({ player: p, pos: c, hist: hists?.[i] ?? null, lastT: t });
          result[i] = p;
          return;
        }
      }
    });
    return result;
  }
}
