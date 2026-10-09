// Token bucket: `rate` actions per second, bursts up to `burst`.
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private rate: number,
    private burst: number,
    private now: () => number = () => Date.now(),
  ) {}

  allow(key: string, cost = 1): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: t };
    b.tokens = Math.min(this.burst, b.tokens + ((t - b.at) / 1000) * this.rate);
    b.at = t;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.prune(t);
    return ok;
  }

  private prune(t: number) {
    for (const [k, b] of this.buckets) if (t - b.at > 60_000) this.buckets.delete(k);
  }
}
