import type { Box, Point } from './types.js';

export const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Angle at b (degrees) between a-b-c. */
export function angle(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function inBox(p: Point, b: Box, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

/**
 * Least-squares fit of y = a t² + b t + c. Returns null if there are too few
 * points or the system is singular. t should be small numbers (seconds, shifted).
 */
export function fitParabola(ts: number[], ys: number[]): { a: number; b: number; c: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  let s0 = 0,
    s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0,
    y0 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i]!;
    const y = ys[i]!;
    const t2 = t * t;
    s0 += 1;
    s1 += t;
    s2 += t2;
    s3 += t2 * t;
    s4 += t2 * t2;
    y0 += y;
    y1 += y * t;
    y2 += y * t2;
  }
  // Solve [s4 s3 s2; s3 s2 s1; s2 s1 s0] [a b c] = [y2 y1 y0]
  const det = (m: number[]) =>
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
  const M = [s4, s3, s2, s3, s2, s1, s2, s1, s0];
  const D = det(M);
  if (Math.abs(D) < 1e-12) return null;
  const a = det([y2, s3, s2, y1, s2, s1, y0, s1, s0]) / D;
  const b = det([s4, y2, s2, s3, y1, s1, s2, y0, s0]) / D;
  const c = det([s4, s3, y2, s3, s2, y1, s2, s1, y0]) / D;
  return { a, b, c };
}

/** Small seeded RNG + gaussian noise, used by the simulator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
