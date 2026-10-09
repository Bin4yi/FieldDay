import { gaussian, rng } from './geometry.js';
import { POSE_POINTS, LM } from './landmarks.js';
import type { BallObservation, Point, VisionFrame } from './types.js';

// A stick-figure simulator. It makes MediaPipe-shaped landmarks for a person
// whose real size we know, so tests can check the detectors give the right
// numbers (jump height, throw height, squat count...). The app's demo mode
// uses it too.

export interface PuppetPose {
  /** Centre x, px. */
  cx: number;
  /** Ground (heel) y while standing, px. */
  groundY: number;
  /** Pixels per metre at the person's distance. */
  ppm: number;
  /** Real height, m. */
  heightM: number;
  /** Body lift (jump), m. */
  lift?: number;
  /** 0 = standing, 1 = deep squat. */
  squat?: number;
  /** 0 = arms down, 1 = both hands above head. */
  armsUp?: number;
  /** Sideways lean of the upper body, -1..1 (image left..right). */
  lean?: number;
  /** Right arm punched out sideways, 0..1. */
  punch?: number;
  /** Where the right hand is, overriding the arm pose (e.g. holding the ball). */
  rightHand?: Point;
}

export function puppet(p: PuppetPose): Point[] {
  const m = p.ppm;
  const H = p.heightM;
  const lift = (p.lift ?? 0) * m;
  const sq = p.squat ?? 0;
  const ground = p.groundY - lift;
  // Body proportions (fractions of height).
  const legLen = 0.47 * H * m;
  const hipDrop = legLen * 0.4 * sq;
  const heelY = ground;
  const ankleY = ground - 0.04 * H * m;
  const hipY = ground - legLen - 0.03 * H * m + hipDrop;
  const kneeY = (hipY + ankleY) / 2;
  const torso = 0.3 * H * m;
  const leanX = (p.lean ?? 0) * torso * 0.6;
  const shY = hipY - torso;
  const noseY = shY - 0.13 * H * m;
  const hw = 0.09 * H * m;
  const sw = 0.12 * H * m;
  const kneeSpread = hw * (1 + sq * 0.8);
  const cx = p.cx;
  const up = p.armsUp ?? 0;
  const arm = 0.35 * H * m;
  const pts: Point[] = Array.from({ length: POSE_POINTS }, () => ({ x: cx, y: hipY, visibility: 0.3 }));
  const set = (i: number, x: number, y: number) => (pts[i] = { x, y, visibility: 0.95 });
  set(LM.nose, cx + leanX * 1.2, noseY);
  set(LM.leftShoulder, cx - sw + leanX, shY);
  set(LM.rightShoulder, cx + sw + leanX, shY);
  // Arms: down at the sides, or up over the head.
  const armY = (sy: number) => sy + arm * (1 - 2 * up);
  set(LM.leftElbow, cx - sw * 1.1 + leanX, (shY + armY(shY)) / 2);
  set(LM.leftWrist, cx - sw * 1.1 + leanX, armY(shY));
  const punch = p.punch ?? 0;
  const rx = cx + sw + leanX + punch * arm;
  const ry = punch > 0 ? shY + 4 : armY(shY);
  set(LM.rightElbow, (cx + sw + leanX + rx) / 2, (shY + ry) / 2);
  set(LM.rightWrist, rx, ry);
  if (p.rightHand) set(LM.rightWrist, p.rightHand.x, p.rightHand.y);
  set(LM.leftHip, cx - hw, hipY);
  set(LM.rightHip, cx + hw, hipY);
  set(LM.leftKnee, cx - kneeSpread, kneeY);
  set(LM.rightKnee, cx + kneeSpread, kneeY);
  set(LM.leftAnkle, cx - hw, ankleY);
  set(LM.rightAnkle, cx + hw, ankleY);
  set(LM.leftHeel, cx - hw, heelY);
  set(LM.rightHeel, cx + hw, heelY);
  set(LM.leftFoot, cx - hw * 1.2, heelY);
  set(LM.rightFoot, cx + hw * 1.2, heelY);
  return pts;
}

export function addNoise(points: Point[], sigmaPx: number, r: () => number): Point[] {
  return points.map((p) => ({ ...p, x: p.x + gaussian(r) * sigmaPx, y: p.y + gaussian(r) * sigmaPx }));
}

export interface SimFrameOpts {
  width?: number;
  height?: number;
  fps?: number;
  noisePx?: number;
  seed?: number;
}

/** Build frames from a function of time (seconds) to pose(s) and ball. */
export function simulate(
  seconds: number,
  at: (s: number) => { poses: PuppetPose[]; ball?: { x: number; y: number; r: number } | null },
  o: SimFrameOpts = {},
): VisionFrame[] {
  const width = o.width ?? 720;
  const height = o.height ?? 960;
  const fps = o.fps ?? 30;
  const r = rng(o.seed ?? 1);
  const frames: VisionFrame[] = [];
  for (let i = 0; i <= seconds * fps; i++) {
    const s = i / fps;
    const scene = at(s);
    const ball: BallObservation | null = scene.ball
      ? {
          box: { x: scene.ball.x - scene.ball.r, y: scene.ball.y - scene.ball.r, w: scene.ball.r * 2, h: scene.ball.r * 2 },
          score: 0.8,
          source: 'detector',
        }
      : null;
    frames.push({
      t: Math.round(s * 1000),
      width,
      height,
      poses: scene.poses.map((p) => addNoise(puppet(p), o.noisePx ?? 1.5, r)),
      ball,
    });
  }
  return frames;
}

/** Smooth 0 -> 1 -> 0 bump between a and b. */
export function bump(s: number, a: number, b: number): number {
  if (s <= a || s >= b) return 0;
  return Math.sin(((s - a) / (b - a)) * Math.PI);
}

/** Ballistic lift (m) of a jump with this peak height, between t0 and t0+airtime. */
export function jumpLift(s: number, t0: number, peakM: number): number {
  const air = 2 * Math.sqrt((2 * peakM) / 9.81);
  const u = s - t0;
  if (u <= 0 || u >= air) return 0;
  const v0 = 9.81 * (air / 2);
  return v0 * u - 0.5 * 9.81 * u * u;
}
