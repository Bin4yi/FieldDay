import type { Calibration } from './calibration.js';
import { pxToMetres } from './calibration.js';
import { angle, dist, inBox, median, mid } from './geometry.js';
import { LM } from './landmarks.js';
import type { Point, VisionEvent, Zone } from './types.js';

// Turns one player's pose landmarks (over time) into body events:
// jump (with height), squat, punch, lean, hands up, freeze, crossing a line,
// entering a zone and touching an object.

export interface PoseDetectorOptions {
  player?: number;
  calibration?: Calibration | null;
  /** Front camera shows a mirror image: swap left and right. */
  mirrored?: boolean;
  /** Seconds without moving that count as a freeze. */
  freezeSeconds?: number;
  /** Horizontal line (image y, px). Crossing it toward the camera = cross_line. */
  lineY?: number | null;
  zones?: Zone[];
  objects?: Zone[];
}

interface Body {
  t: number;
  nose: Point;
  shoulders: Point;
  hips: Point;
  ankles: Point;
  lw: Point;
  rw: Point;
  ls: Point;
  rs: Point;
  le: Point;
  re: Point;
  /** Torso length in px (shoulders to hips), our size unit when not calibrated. */
  torso: number;
  /** Standing body span nose -> heels, px. */
  span: number;
  points: Point[];
}

const VIS = 0.4;

function toBody(t: number, lm: Point[]): Body | null {
  const g = (i: number) => lm[i];
  const need = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle];
  for (const i of need) {
    const p = g(i);
    if (!p || (p.visibility !== undefined && p.visibility < VIS)) return null;
  }
  const shoulders = mid(g(LM.leftShoulder)!, g(LM.rightShoulder)!);
  const hips = mid(g(LM.leftHip)!, g(LM.rightHip)!);
  const ankles = mid(g(LM.leftAnkle)!, g(LM.rightAnkle)!);
  const heels = g(LM.leftHeel) && g(LM.rightHeel) ? mid(g(LM.leftHeel)!, g(LM.rightHeel)!) : ankles;
  const nose = g(LM.nose)!;
  return {
    t,
    nose,
    shoulders,
    hips,
    ankles,
    lw: g(LM.leftWrist) ?? shoulders,
    rw: g(LM.rightWrist) ?? shoulders,
    ls: g(LM.leftShoulder)!,
    rs: g(LM.rightShoulder)!,
    le: g(LM.leftElbow) ?? shoulders,
    re: g(LM.rightElbow) ?? shoulders,
    torso: Math.max(1, dist(shoulders, hips)),
    span: Math.max(1, heels.y - nose.y),
    points: lm,
  };
}

export class PoseEventDetector {
  private opts: Required<Omit<PoseDetectorOptions, 'calibration' | 'lineY'>> & {
    calibration: Calibration | null;
    lineY: number | null;
  };
  private history: Body[] = [];
  /** Standing hip height (image y) and hip-to-ankle length, learned while standing still. */
  private standHipY: number | null = null;
  private standLeg: number | null = null;
  private airborne: { startT: number; minHipY: number } | null = null;
  private squatDown = false;
  private handsUp = false;
  private lean: 'left' | 'right' | null = null;
  private lastPunchT = -Infinity;
  private stillSince: number | null = null;
  private frozen = false;
  private beyondLine: boolean | null = null;
  private inZones = new Set<string>();
  private touching = new Set<string>();

  constructor(opts: PoseDetectorOptions = {}) {
    this.opts = {
      player: opts.player ?? 0,
      calibration: opts.calibration ?? null,
      mirrored: opts.mirrored ?? false,
      freezeSeconds: opts.freezeSeconds ?? 1,
      lineY: opts.lineY ?? null,
      zones: opts.zones ?? [],
      objects: opts.objects ?? [],
    };
  }

  setCalibration(c: Calibration | null) {
    this.opts.calibration = c;
  }

  setZones(zones: Zone[], objects: Zone[] = this.opts.objects) {
    this.opts.zones = zones;
    this.opts.objects = objects;
  }

  setLine(y: number | null) {
    this.opts.lineY = y;
    this.beyondLine = null;
  }

  /** The standing ankle height (ground line), px. */
  get groundY(): number | null {
    if (this.standHipY === null || this.standLeg === null) return null;
    return this.standHipY + this.standLeg;
  }

  /** Recent nose->heel spans while standing, for calibration. */
  standingSpans(): number[] {
    return this.history.map((b) => b.span);
  }

  private metres(px: number, frameH: number): number | undefined {
    const c = this.opts.calibration;
    return c ? pxToMetres(px, c, frameH) : undefined;
  }

  update(t: number, landmarks: Point[] | null, frameH: number): VisionEvent[] {
    const out: VisionEvent[] = [];
    const b = landmarks ? toBody(t, landmarks) : null;
    if (!b) return out;
    const player = this.opts.player;
    const ev = (type: VisionEvent['type'], extra: Partial<VisionEvent> = {}): VisionEvent => ({
      type,
      t,
      player,
      ...extra,
    });

    this.history.push(b);
    while (this.history.length && t - this.history[0]!.t > 2000) this.history.shift();
    const prev = this.history.length > 1 ? this.history[this.history.length - 2]! : null;

    // --- motion (for freeze + learning the standing pose) ---
    // Compare with a frame ~200 ms ago, so landmark jitter does not look like movement.
    const ref = [...this.history].reverse().find((h) => t - h.t >= 200) ?? null;
    const motion = ref ? this.motion(ref, b) : 0; // torso lengths per second
    const still = motion < 0.35;

    // Learn the standing hip height and leg length while standing still and upright.
    const leg = b.ankles.y - b.hips.y;
    if (still && !this.airborne && (this.standLeg === null || leg > this.standLeg * 0.9)) {
      const recent = this.history.filter((h) => t - h.t < 800);
      if (recent.length >= 3) {
        const hip = median(recent.map((h) => h.hips.y));
        const legs = median(recent.map((h) => h.ankles.y - h.hips.y));
        if (this.standLeg === null || legs >= this.standLeg * 0.95) {
          this.standHipY = hip;
          this.standLeg = legs;
        }
      }
    }

    // --- jump: hips AND ankles rise clearly above standing height ---
    if (this.standHipY !== null && this.standLeg !== null) {
      const lift = this.standHipY - b.hips.y;
      const groundY = this.standHipY + this.standLeg;
      const feetUp = groundY - b.ankles.y;
      const thresh = this.standLeg * 0.06;
      if (!this.airborne && lift > thresh && feetUp > thresh) {
        this.airborne = { startT: t, minHipY: b.hips.y };
      } else if (this.airborne) {
        this.airborne.minHipY = Math.min(this.airborne.minHipY, b.hips.y);
        if (feetUp < thresh * 0.5) {
          const heightPx = this.standHipY - this.airborne.minHipY;
          const height = this.metres(heightPx, frameH);
          const air = t - this.airborne.startT;
          this.airborne = null;
          if (air >= 80) out.push(ev('jump', height !== undefined ? { measures: { height_m: round(height, 3) } } : {}));
        }
      }
    }

    // --- squat: hips drop toward ankles (works from the front) ---
    if (this.standLeg !== null && !this.airborne) {
      const ratio = leg / this.standLeg;
      if (!this.squatDown && ratio < 0.72) this.squatDown = true;
      else if (this.squatDown && ratio > 0.9) {
        this.squatDown = false;
        out.push(ev('squat', { measures: { count: 1 } }));
      }
    }

    // --- hands up: both wrists above the nose ---
    const up = b.lw.y < b.nose.y && b.rw.y < b.nose.y;
    if (up && !this.handsUp) {
      this.handsUp = true;
      out.push(ev('hands_up'));
    } else if (!up && b.lw.y > b.shoulders.y && b.rw.y > b.shoulders.y) {
      this.handsUp = false;
    }

    // --- lean: shoulders shift sideways over the hips ---
    const shift = (b.shoulders.x - b.hips.x) / b.torso;
    // In a rear-camera image the player's left is on the image right.
    const imageRight = shift > 0.35;
    const imageLeft = shift < -0.35;
    const leanNow = imageRight ? (this.opts.mirrored ? 'right' : 'left') : imageLeft ? (this.opts.mirrored ? 'left' : 'right') : null;
    if (leanNow && leanNow !== this.lean) out.push(ev(leanNow === 'left' ? 'lean_left' : 'lean_right'));
    if (Math.abs(shift) < 0.15) this.lean = null;
    else if (leanNow) this.lean = leanNow;

    // --- punch: an arm snaps out straight at shoulder height (relative to the body) ---
    if (prev && t - this.lastPunchT > 350) {
      const dt = Math.max(1, t - prev.t) / 1000;
      for (const [s, e, w, ps, pw] of [
        [b.ls, b.le, b.lw, prev.ls, prev.lw],
        [b.rs, b.re, b.rw, prev.rs, prev.rw],
      ] as const) {
        const straight = angle(s, e, w) > 150;
        const reach = dist(w, s) / b.torso;
        const reachSpeed = (reach - dist(pw, ps) / prev.torso) / dt;
        const atShoulder = Math.abs(w.y - s.y) < b.torso * 0.5;
        if (straight && atShoulder && reach > 1 && reachSpeed > 2.5) {
          this.lastPunchT = t;
          out.push(ev('punch'));
          break;
        }
      }
    }

    // --- freeze: no movement for N seconds ---
    if (still) {
      this.stillSince ??= t;
      if (!this.frozen && t - this.stillSince >= this.opts.freezeSeconds * 1000) {
        this.frozen = true;
        out.push(ev('freeze', { measures: { duration_s: round((t - this.stillSince) / 1000, 2) } }));
      }
    } else if (motion > 0.6) {
      this.stillSince = null;
      this.frozen = false;
    }

    // --- crossing the line (feet move past it toward the camera) ---
    if (this.opts.lineY !== null) {
      const beyond = b.ankles.y > this.opts.lineY;
      if (this.beyondLine === false && beyond) out.push(ev('cross_line'));
      this.beyondLine = beyond;
    }

    // --- zones (body centre) and objects (hands or feet) ---
    for (const z of this.opts.zones) {
      const inside = inBox(b.hips, z.box);
      if (inside && !this.inZones.has(z.name)) out.push(ev('enter_zone', { target: z.name }));
      if (inside) this.inZones.add(z.name);
      else this.inZones.delete(z.name);
    }
    const lf = landmarks?.[LM.leftFoot] ?? b.ankles;
    const rf = landmarks?.[LM.rightFoot] ?? b.ankles;
    for (const o of this.opts.objects) {
      const pad = b.torso * 0.15;
      const touch = [b.lw, b.rw, lf, rf].some((p) => inBox(p, o.box, pad));
      if (touch && !this.touching.has(o.name)) {
        out.push(ev('touch_object', { target: o.name }));
        this.touching.add(o.name);
      } else if (!touch) this.touching.delete(o.name);
    }

    return out;
  }

  /** Average landmark speed, in torso lengths per second. */
  private motion(a: Body, b: Body): number {
    const dt = Math.max(1, b.t - a.t) / 1000;
    const idx = [LM.nose, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle];
    let sum = 0;
    let n = 0;
    for (const i of idx) {
      const p = a.points[i];
      const q = b.points[i];
      if (!p || !q) continue;
      sum += dist(p, q);
      n++;
    }
    return n ? sum / n / dt / b.torso : 0;
  }
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
