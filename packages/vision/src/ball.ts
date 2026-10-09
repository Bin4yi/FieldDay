import type { Calibration } from './calibration.js';
import { pxToMetres } from './calibration.js';
import { boxCenter, fitParabola, inBox } from './geometry.js';
import type { BallObservation, Point, VisionEvent, Zone } from './types.js';

// Follows the ball through the air and turns its path into events:
// release, apex (with height), bounce (with distance), catch, in-zone, out-of-frame.
// A parabola is fitted to the flight, so the apex is found even when the top
// frames are blurred or missing.

export type BallState = 'idle' | 'held' | 'flight';

export interface BallTrackerOptions {
  calibration?: Calibration | null;
  zones?: Zone[];
  /** Ball missing this long during flight = out of frame. */
  lostMs?: number;
}

export interface BallContext {
  t: number;
  width: number;
  height: number;
  ball: BallObservation | null;
  /** Wrist points of the player(s) who may hold the ball. */
  hands: Point[];
  /** Ground line (standing ankle y) from the pose detector, px. */
  groundY: number | null;
  player?: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

const G = 9.81;

export class BallTracker {
  state: BallState = 'idle';
  private opts: { calibration: Calibration | null; zones: Zone[]; lostMs: number };
  private flight: Sample[] = [];
  private flightStart: Sample | null = null;
  private apexDone = false;
  private nearCount = 0;
  private lastSeen: Sample | null = null;
  private lastSize = 20;
  private zonesHit = new Set<string>();
  /** Recent samples for drawing the trail. */
  readonly trail: Sample[] = [];

  constructor(opts: BallTrackerOptions = {}) {
    this.opts = { calibration: opts.calibration ?? null, zones: opts.zones ?? [], lostMs: opts.lostMs ?? 600 };
  }

  setCalibration(c: Calibration | null) {
    this.opts.calibration = c;
  }

  setZones(z: Zone[]) {
    this.opts.zones = z;
  }

  /** Pixels per metre from the fitted gravity curve (a = g/2 * ppm), if the flight was good. */
  private gravityPpm(fitA: number): number | null {
    const ppm = (2 * fitA) / G;
    return ppm > 0 ? ppm : null;
  }

  private toMetres(px: number, frameH: number, fitA?: number): number | undefined {
    if (this.opts.calibration) return pxToMetres(px, this.opts.calibration, frameH);
    if (fitA !== undefined) {
      const ppm = this.gravityPpm(fitA);
      if (ppm) return px / ppm;
    }
    return undefined;
  }

  update(ctx: BallContext): VisionEvent[] {
    const out: VisionEvent[] = [];
    const { t } = ctx;
    const ev = (type: VisionEvent['type'], extra: Partial<VisionEvent> = {}): VisionEvent => ({
      type,
      t,
      ...(ctx.player !== undefined ? { player: ctx.player } : {}),
      ...extra,
    });

    if (!ctx.ball) {
      if (this.state === 'flight' && this.lastSeen) {
        const nearEdge =
          this.lastSeen.x < ctx.width * 0.04 ||
          this.lastSeen.x > ctx.width * 0.96 ||
          this.lastSeen.y < ctx.height * 0.03;
        const gone = t - this.lastSeen.t;
        if (gone > this.opts.lostMs || (nearEdge && gone > 200)) {
          // A ball thrown off the top of the screen still has an apex we can estimate.
          this.tryApex(t, ctx, out, true);
          out.push(ev('ball_out_of_frame'));
          this.reset();
        }
      }
      return out;
    }

    const c = boxCenter(ctx.ball.box);
    this.lastSize = Math.max(ctx.ball.box.w, ctx.ball.box.h);
    const s: Sample = { t, x: c.x, y: c.y };
    this.trail.push(s);
    while (this.trail.length > 40) this.trail.shift();
    const prev = this.lastSeen;
    this.lastSeen = s;

    const handR = Math.max(this.lastSize * 2.2, ctx.height * 0.07);
    const near = ctx.hands.some((h) => Math.hypot(h.x - c.x, h.y - c.y) < handR);
    this.nearCount = near ? this.nearCount + 1 : 0;

    switch (this.state) {
      case 'idle':
        if (this.nearCount >= 2) this.state = 'held';
        else if (prev && Math.abs(s.y - prev.y) / Math.max(1, t - prev.t) > ctx.height / 4000) {
          // A ball already flying (we missed the release): just follow it.
          this.startFlight(prev);
          this.flight.push(s);
        }
        break;
      case 'held':
        if (!near && prev) {
          const speed = Math.hypot(s.x - prev.x, s.y - prev.y) / Math.max(1, t - prev.t);
          if (speed > ctx.height / 3000) {
            out.push(ev('ball_release'));
            this.startFlight(prev);
            this.flight.push(s);
          }
        }
        break;
      case 'flight': {
        this.flight.push(s);
        for (const z of this.opts.zones) {
          if (!this.zonesHit.has(z.name) && inBox(c, z.box)) {
            this.zonesHit.add(z.name);
            out.push(ev('ball_in_zone', { target: z.name }));
          }
        }
        this.tryApex(t, ctx, out, false);

        // Bounce: was falling, now rising, low in the frame.
        const n = this.flight.length;
        if (n >= 3) {
          const a = this.flight[n - 3]!;
          const b = this.flight[n - 2]!;
          const falling = b.y - a.y > 1;
          const rising = s.y - b.y < -1;
          const low = ctx.groundY === null ? b.y > ctx.height * 0.6 : b.y > ctx.groundY - this.lastSize * 3;
          if (falling && rising && low) {
            const start = this.flightStart;
            const distance = start ? this.toMetres(Math.abs(b.x - start.x), ctx.height, this.lastFitA ?? undefined) : undefined;
            out.push(ev('ball_bounce', distance !== undefined ? { measures: { distance_m: round(distance, 2) } } : {}));
            // A new flight segment starts at the bounce.
            this.flight = [b, s];
            this.apexDone = false;
            this.zonesHit.clear();
            break;
          }
        }

        const elapsed = this.flightStart ? t - this.flightStart.t : 0;
        // A catch: near the hand AND the ball has slowed down (not just falling past it).
        const speed = prev ? Math.hypot(s.x - prev.x, s.y - prev.y) / Math.max(1, t - prev.t) : Infinity;
        if (near && elapsed > 250 && speed < ctx.height / 1500) {
          this.tryApex(t, ctx, out, true);
          out.push(ev('ball_catch'));
          this.state = 'held';
          this.flight = [];
          this.flightStart = null;
          this.zonesHit.clear();
        }
        break;
      }
    }
    return out;
  }

  private lastFitA: number | null = null;

  private startFlight(from: Sample) {
    this.state = 'flight';
    this.flight = [from];
    this.flightStart = from;
    this.apexDone = false;
    this.zonesHit.clear();
  }

  /** Emit the apex once the fitted curve says the ball is coming down (or the flight ended). */
  private tryApex(t: number, ctx: BallContext, out: VisionEvent[], ending: boolean) {
    if (this.apexDone || this.flight.length < 4) return;
    const t0 = this.flight[0]!.t;
    const ts = this.flight.map((p) => (p.t - t0) / 1000);
    const ys = this.flight.map((p) => p.y);
    const fit = fitParabola(ts, ys);
    if (!fit || fit.a <= 0) return;
    this.lastFitA = fit.a;
    const tApex = -fit.b / (2 * fit.a);
    const now = (t - t0) / 1000;
    if (tApex <= 0) return;
    // Wait until we are clearly past the top (or the flight is ending).
    if (!ending && now < tApex + 0.08) return;
    const yApex = fit.c - (fit.b * fit.b) / (4 * fit.a);
    const ground = ctx.groundY ?? ctx.height;
    const heightPx = Math.max(0, ground - yApex);
    const h = this.toMetres(heightPx, ctx.height, fit.a);
    this.apexDone = true;
    out.push({
      type: 'ball_apex',
      t,
      ...(ctx.player !== undefined ? { player: ctx.player } : {}),
      ...(h !== undefined ? { measures: { height_m: round(h, 2) } } : {}),
    });
  }

  private reset() {
    this.state = 'idle';
    this.flight = [];
    this.flightStart = null;
    this.apexDone = false;
    this.nearCount = 0;
    this.zonesHit.clear();
  }
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
