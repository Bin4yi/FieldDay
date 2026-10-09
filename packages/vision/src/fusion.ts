import type { VisionEvent } from './types.js';

// Camera events that make a sound get their time from the nearest mic onset.

const SOUNDING = new Set<VisionEvent['type']>(['ball_bounce', 'ball_catch', 'touch_object', 'punch', 'jump']);

export class OnsetFuser {
  private onsets: number[] = [];
  private pending: VisionEvent[] = [];

  constructor(
    /** How far apart (ms) a camera event and a sound may be. */
    private windowMs = 180,
    /** How long to wait for a sound that arrives after the camera event. */
    private waitMs = 120,
  ) {}

  pushOnset(t: number) {
    this.onsets.push(t);
    while (this.onsets.length > 64) this.onsets.shift();
  }

  /** Add camera events; returns events that are ready now. */
  push(events: VisionEvent[], now: number): VisionEvent[] {
    for (const e of events) this.pending.push(e);
    return this.flush(now);
  }

  flush(now: number, force = false): VisionEvent[] {
    const ready: VisionEvent[] = [];
    const keep: VisionEvent[] = [];
    for (const e of this.pending) {
      if (!SOUNDING.has(e.type)) {
        ready.push(e);
        continue;
      }
      const best = this.nearest(e.t);
      if (best !== null) {
        this.onsets = this.onsets.filter((o) => o !== best);
        ready.push({ ...e, t: best });
      } else if (force || now - e.t >= this.waitMs) {
        ready.push(e);
      } else {
        keep.push(e);
      }
    }
    this.pending = keep;
    return ready.sort((a, b) => a.t - b.t);
  }

  private nearest(t: number): number | null {
    let best: number | null = null;
    for (const o of this.onsets) {
      if (Math.abs(o - t) <= this.windowMs && (best === null || Math.abs(o - t) < Math.abs(best - t))) best = o;
    }
    return best;
  }
}
