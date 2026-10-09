import type { BrainCallLog } from './types.js';

// Numbers for the Brain Stats screen and the write-ups:
// latency, success rate, repair rate and fallback rate, per brain and call.

export interface StatRow {
  brain: BrainCallLog['brain'];
  op: BrainCallLog['op'];
  calls: number;
  okRate: number;
  repairedRate: number;
  fallbackRate: number;
  p50: number;
  p90: number;
  mean: number;
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

export function summarizeLogs(logs: BrainCallLog[]): StatRow[] {
  const groups = new Map<string, BrainCallLog[]>();
  for (const l of logs) {
    const k = `${l.brain}|${l.op}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()]
    .map((g) => {
      const lat = g.filter((x) => x.ok).map((x) => x.latencyMs);
      return {
        brain: g[0]!.brain,
        op: g[0]!.op,
        calls: g.length,
        okRate: g.filter((x) => x.ok).length / g.length,
        repairedRate: g.filter((x) => x.repaired).length / g.length,
        fallbackRate: g.filter((x) => x.fallback).length / g.length,
        p50: pct(lat, 0.5),
        p90: pct(lat, 0.9),
        mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
      };
    })
    .sort((a, b) => (a.op === b.op ? a.brain.localeCompare(b.brain) : a.op.localeCompare(b.op)));
}
