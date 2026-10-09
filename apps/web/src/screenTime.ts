// Screen-Time Meter: how much of a play session the screen was actually used.
// "Using the screen" = a touch in the last few seconds, or the phone being
// held/moved (motion sensor). The rest of the time the phone was down and
// people were playing.

export class ScreenTimeMeter {
  private intervals: [number, number][] = [];
  private start: number | null = null;
  private end: number | null = null;

  constructor(
    /** A touch counts as this many ms of looking at the screen. */
    private touchMs = 4000,
    /** Shake above this (m/s² std-dev) means the phone is in someone's hand. */
    private handShake = 0.6,
  ) {}

  begin(t: number) {
    this.start = t;
    this.end = null;
  }

  stop(t: number) {
    this.end = t;
  }

  touch(t: number) {
    this.add(t, t + this.touchMs);
  }

  motion(t: number, shake: number) {
    if (shake > this.handShake) this.add(t - 500, t + 500);
  }

  private add(a: number, b: number) {
    const last = this.intervals.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else this.intervals.push([a, b]);
  }

  /** Total session length, ms. */
  duration(now: number): number {
    if (this.start === null) return 0;
    return Math.max(0, (this.end ?? now) - this.start);
  }

  /** Fraction 0..1 of the session the screen was in use. */
  fraction(now: number): number {
    if (this.start === null) return 0;
    const s = this.start;
    const e = this.end ?? now;
    if (e <= s) return 0;
    let used = 0;
    for (const [a, b] of this.intervals) used += Math.max(0, Math.min(b, e) - Math.max(a, s));
    return Math.min(1, used / (e - s));
  }
}
