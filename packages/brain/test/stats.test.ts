import { describe, expect, it } from 'vitest';
import { summarizeLogs, type BrainCallLog } from '../src/index.js';

describe('brain stats', () => {
  it('summarises per brain and call', () => {
    const logs: BrainCallLog[] = [
      { brain: 'gemma', op: 'designGame', startedAt: 0, latencyMs: 800, ok: true },
      { brain: 'gemma', op: 'designGame', startedAt: 0, latencyMs: 1200, ok: true, repaired: true },
      { brain: 'gemma', op: 'designGame', startedAt: 0, latencyMs: 2000, ok: true, fallback: 'template' },
      { brain: 'openai', op: 'designGame', startedAt: 0, latencyMs: 15000, ok: false },
    ];
    const rows = summarizeLogs(logs);
    expect(rows).toHaveLength(2);
    const g = rows.find((r) => r.brain === 'gemma')!;
    expect(g.calls).toBe(3);
    expect(g.okRate).toBe(1);
    expect(g.repairedRate).toBeCloseTo(1 / 3);
    expect(g.fallbackRate).toBeCloseTo(1 / 3);
    expect(g.p50).toBe(1200);
    expect(rows.find((r) => r.brain === 'openai')!.okRate).toBe(0);
  });
});
