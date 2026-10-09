import type { GameSpec } from '@fieldday/engine';
import { BallTracker } from './ball.js';
import type { Calibration } from './calibration.js';
import { OnsetFuser } from './fusion.js';
import { IdentityTracker, type IdentityMode } from './identity.js';
import { LM } from './landmarks.js';
import { PoseEventDetector } from './pose.js';
import type { Point, VisionEvent, VisionFrame, Zone } from './types.js';

// Camera frame in, game events out. One per game.

export interface PipelineOptions {
  players: number;
  needsBall: boolean;
  identity?: IdentityMode;
  calibrations?: (Calibration | null)[];
  /** Named zones/objects set up by the players (e.g. "goal"), px. */
  zones?: Zone[];
  lineY?: number | null;
  mirrored?: boolean;
  freezeSeconds?: number;
}

export function pipelineOptionsFor(spec: GameSpec, extra: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    players: spec.players,
    needsBall: spec.trackers.includes('ball'),
    identity: spec.mode === 'duel' && spec.players === 2 ? 'sides' : 'track',
    ...extra,
  };
}

export class VisionPipeline {
  readonly identity: IdentityTracker;
  readonly detectors: PoseEventDetector[];
  readonly ball: BallTracker;
  readonly fuser = new OnsetFuser();
  private active: number | null = null;
  /** Player index for each pose in the last frame. */
  lastAssignment: number[] = [];
  lastPoses: Point[][] = [];

  constructor(private opts: PipelineOptions) {
    this.identity = new IdentityTracker(opts.players, opts.identity ?? 'track');
    this.detectors = Array.from(
      { length: opts.players },
      (_, i) =>
        new PoseEventDetector({
          player: i,
          calibration: opts.calibrations?.[i] ?? null,
          zones: opts.zones ?? [],
          objects: opts.zones ?? [],
          lineY: opts.lineY ?? null,
          mirrored: opts.mirrored ?? false,
          freezeSeconds: opts.freezeSeconds ?? 1,
        }),
    );
    this.ball = new BallTracker({ calibration: opts.calibrations?.[0] ?? null, zones: opts.zones ?? [] });
  }

  /** In turn mode, whose turn it is (ball events go to them). null = everyone plays. */
  setActivePlayer(p: number | null) {
    this.active = p;
    const cal = this.opts.calibrations?.[p ?? 0] ?? null;
    this.ball.setCalibration(cal);
  }

  setCalibration(player: number, c: Calibration | null) {
    this.opts.calibrations ??= [];
    this.opts.calibrations[player] = c;
    this.detectors[player]?.setCalibration(c);
    if ((this.active ?? 0) === player) this.ball.setCalibration(c);
  }

  setZones(zones: Zone[]) {
    this.opts.zones = zones;
    for (const d of this.detectors) d.setZones(zones, zones);
    this.ball.setZones(zones);
  }

  setLine(y: number | null) {
    for (const d of this.detectors) d.setLine(y);
  }

  pushOnset(t: number) {
    this.fuser.pushOnset(t);
  }

  process(frame: VisionFrame): VisionEvent[] {
    const raw: VisionEvent[] = [];
    const assign = this.identity.assign(frame.t, frame.poses, frame.width, frame.histograms);
    this.lastAssignment = assign;
    this.lastPoses = frame.poses;
    const seen = new Set<number>();
    frame.poses.forEach((lm, i) => {
      const p = assign[i]!;
      if (p < 0 || seen.has(p)) return;
      seen.add(p);
      // In turn mode the single person on screen is the active player.
      const player = this.active !== null && frame.poses.length === 1 ? this.active : p;
      const det = this.detectors[player];
      if (det) raw.push(...det.update(frame.t, lm, frame.height));
    });

    if (this.opts.needsBall) {
      const hands: Point[] = [];
      frame.poses.forEach((lm, i) => {
        const p = this.active !== null && frame.poses.length === 1 ? this.active : assign[i];
        if (this.active !== null && p !== this.active) return;
        for (const k of [LM.leftWrist, LM.rightWrist]) if (lm[k]) hands.push(lm[k]!);
      });
      const det = this.detectors[this.active ?? 0];
      // No real calibration for the ball yet? Use the thrower's estimate.
      if (!this.opts.calibrations?.[this.active ?? 0] && det?.calibration) this.ball.setCalibration(det.calibration);
      raw.push(
        ...this.ball.update({
          t: frame.t,
          width: frame.width,
          height: frame.height,
          ball: frame.ball,
          hands,
          groundY: det?.groundY ?? null,
          ...(this.active !== null ? { player: this.active } : {}),
        }),
      );
    }
    return this.fuser.push(raw, frame.t);
  }
}
