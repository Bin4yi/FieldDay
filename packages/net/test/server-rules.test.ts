import { describe, expect, it } from 'vitest';
import { RateLimiter, cheatReason, clockOffset } from '../src/index.js';

describe('anti-cheat', () => {
  it('flags impossible values', () => {
    expect(cheatReason([], { event: 'ball_apex', t: 0, measures: { height_m: 14 } })).toMatch(/too high/);
    expect(cheatReason([], { event: 'ball_apex', t: 0, measures: { height_m: 3 } })).toBeNull();
    expect(cheatReason([], { event: 'jump', t: 0, measures: { height_m: 2 } })).toMatch(/jump/);
    expect(cheatReason([], { event: 'hands_up', t: 0, measures: { reaction_ms: 20 } })).toMatch(/humanly/);
  });

  it('flags 50 squats in 10 seconds', () => {
    const history = Array.from({ length: 49 }, (_, i) => ({ event: 'squat' as const, t: i * 200 }));
    expect(cheatReason(history.slice(0, 20), { event: 'squat', t: 4000 })).toBeNull();
    expect(cheatReason(history, { event: 'squat', t: 9900 })).toMatch(/50 squats/);
  });
});

describe('rate limiter', () => {
  it('allows bursts then refills', () => {
    let t = 0;
    const r = new RateLimiter(2, 3, () => t);
    expect([r.allow('a'), r.allow('a'), r.allow('a'), r.allow('a')]).toEqual([true, true, true, false]);
    expect(r.allow('b')).toBe(true);
    t = 1000;
    expect([r.allow('a'), r.allow('a'), r.allow('a')]).toEqual([true, true, false]);
  });
});

describe('clock sync', () => {
  it('uses the fastest round trips', () => {
    // True offset +5000 ms; one slow, lopsided sample.
    const off = clockOffset([
      { clientSent: 0, serverT: 5010, clientGot: 20 },
      { clientSent: 100, serverT: 5110, clientGot: 120 },
      { clientSent: 200, serverT: 5900, clientGot: 1000 },
      { clientSent: 300, serverT: 5312, clientGot: 324 },
    ]);
    expect(Math.abs(off - 5000)).toBeLessThan(2);
  });
});
