import type { Point, VisionFrame } from './types.js';

// Compact JSON format for recorded (or simulated) camera sessions.
// The app's recorder writes this; tests replay it through the pipeline.

export interface VisionFixture {
  version: 1;
  /** "recorded" = from a real phone; "synthetic" = made by the simulator. */
  source: 'recorded' | 'synthetic';
  description?: string;
  /** Game template to run the events through (optional). */
  template?: string;
  players: number;
  width: number;
  height: number;
  /** Real heights (m) used for calibration, per player. */
  heightsM?: number[];
  /** Calibrate from frames before this time (ms): the player stands still. */
  calibrateUntil?: number;
  zones?: { name: string; box: [number, number, number, number] }[];
  frames: { t: number; p: number[][]; b: [number, number, number, number] | null }[];
  onsets?: number[];
  expect?: {
    winners?: number[];
    events?: Record<string, number>;
    /** Expected measure per scoring event, in order (checked ±10%). */
    measures?: { type: string; measure: string; value: number }[];
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function encodeFrame(f: VisionFrame): VisionFixture['frames'][number] {
  return {
    t: Math.round(f.t),
    p: f.poses.map((pose) => pose.flatMap((pt) => [r1(pt.x), r1(pt.y), Math.round((pt.visibility ?? 1) * 100) / 100])),
    b: f.ball ? [r1(f.ball.box.x), r1(f.ball.box.y), r1(f.ball.box.w), r1(f.ball.box.h)] : null,
  };
}

export function decodeFrames(fx: VisionFixture): VisionFrame[] {
  return fx.frames.map((f) => ({
    t: f.t,
    width: fx.width,
    height: fx.height,
    poses: f.p.map((flat) => {
      const pts: Point[] = [];
      for (let i = 0; i < flat.length; i += 3) pts.push({ x: flat[i]!, y: flat[i + 1]!, visibility: flat[i + 2]! });
      return pts;
    }),
    ball: f.b ? { box: { x: f.b[0], y: f.b[1], w: f.b[2], h: f.b[3] }, score: 0.8, source: 'detector' } : null,
  }));
}
