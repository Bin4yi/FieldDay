// Finds short loud sounds (a ball bounce, a catch, a kick) in the mic signal.
// The camera says WHICH thing happened; the mic says exactly WHEN.

export interface OnsetOptions {
  sampleRate: number;
  /** Analysis hop in samples (default ~10 ms). */
  hop?: number;
  /** How many times louder than the background a thud must be. */
  ratio?: number;
  /** Ignore anything quieter than this RMS (0..1). */
  floor?: number;
  /** Minimum gap between onsets, ms. */
  refractoryMs?: number;
}

export class OnsetDetector {
  private readonly sampleRate: number;
  private readonly hop: number;
  private readonly ratio: number;
  private readonly floor: number;
  private readonly refractory: number;
  private background = 0.003;
  private prevHf = 0;
  private lastOnset = -Infinity;
  private carry: number[] = [];
  private lastSample = 0;

  constructor(o: OnsetOptions) {
    this.sampleRate = o.sampleRate;
    this.hop = o.hop ?? Math.round(o.sampleRate / 100);
    this.ratio = o.ratio ?? 4;
    this.floor = o.floor ?? 0.02;
    this.refractory = o.refractoryMs ?? 120;
  }

  /**
   * Feed audio. `t0` is the time (ms) of the first sample in `samples`.
   * Returns onset times (ms).
   */
  push(samples: Float32Array, t0: number): number[] {
    const out: number[] = [];
    const startT = t0 - (this.carry.length / this.sampleRate) * 1000;
    const buf = this.carry.length ? Float32Array.from([...this.carry, ...samples]) : samples;
    let i = 0;
    for (; i + this.hop <= buf.length; i += this.hop) {
      // Energy of the first difference = high-frequency energy. Thuds are sharp.
      let hf = 0;
      let prev = i === 0 ? this.lastSample : buf[i - 1]!;
      for (let j = i; j < i + this.hop; j++) {
        const d = buf[j]! - prev;
        hf += d * d;
        prev = buf[j]!;
      }
      hf = Math.sqrt(hf / this.hop);
      const t = startT + (i / this.sampleRate) * 1000;
      const rising = hf > this.prevHf * 1.5;
      if (hf > this.floor && hf > this.background * this.ratio && rising && t - this.lastOnset > this.refractory) {
        this.lastOnset = t;
        out.push(t);
      }
      // Slow-moving background level (ignores the spikes themselves).
      const alpha = hf > this.background * this.ratio ? 0.002 : 0.05;
      this.background = this.background * (1 - alpha) + hf * alpha;
      this.prevHf = hf;
    }
    this.lastSample = buf[i - 1] ?? this.lastSample;
    this.carry = Array.from(buf.subarray(i));
    return out;
  }
}
