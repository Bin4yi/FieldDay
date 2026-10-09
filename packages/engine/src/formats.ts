import { getTemplate } from './templates.js';
import { GameSpecSchema, withPlayers, type GameSpec } from './spec.js';

// Battle formats built on top of single games. All pure and tested.

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Chaos Mode ----------------

export interface Mutation {
  id: string;
  /** Read aloud: "NEW RULE: ..." */
  text: string;
  /** Can this mutation be used on this game? */
  fits(spec: GameSpec): boolean;
  apply(spec: GameSpec): GameSpec;
}

const scaleNumericPoints = (spec: GameSpec, k: number): GameSpec => ({
  ...spec,
  scoring: spec.scoring.map((r) => (typeof r.points === 'number' ? { ...r, points: Math.round(r.points * k * 10) / 10 } : r)),
});

export const MUTATIONS: Mutation[] = [
  {
    id: 'double_points',
    text: 'NEW RULE: double points this round!',
    fits: (s) => s.scoring.some((r) => typeof r.points === 'number') && s.win_condition !== 'lowest',
    apply: (s) => scaleNumericPoints(s, 2),
  },
  {
    id: 'speed_round',
    text: 'NEW RULE: speed round! Less time!',
    fits: (s) => (s.timer_s ?? 0) >= 8,
    apply: (s) => ({ ...s, timer_s: Math.max(5, Math.round((s.timer_s ?? 10) * 0.6)) }),
  },
  {
    id: 'jump_bonus',
    text: 'NEW RULE: every jump is worth a bonus point!',
    fits: (s) => s.trackers.includes('person') && !s.scoring.some((r) => r.event === 'jump') && s.win_condition !== 'lowest',
    apply: (s) => ({ ...s, scoring: [...s.scoring, { event: 'jump', points: 1 }] }),
  },
  {
    id: 'squat_bonus',
    text: 'NEW RULE: squats score a bonus point!',
    fits: (s) => s.trackers.includes('person') && !s.scoring.some((r) => r.event === 'squat') && s.win_condition !== 'lowest',
    apply: (s) => ({ ...s, scoring: [...s.scoring, { event: 'squat', points: 1 }] }),
  },
  {
    id: 'no_crossing',
    text: 'NEW RULE: cross the line and you lose 2 points!',
    fits: (s) => !s.fouls.some((f) => f.event === 'cross_line') && s.win_condition !== 'lowest' && s.win_condition !== 'co_op',
    apply: (s) => ({ ...s, fouls: [...s.fouls, { event: 'cross_line', penalty: 'points', points: -2 }] }),
  },
  { id: 'one_hand', text: 'NEW RULE: one hand only! Honour rule!', fits: () => true, apply: (s) => s },
  { id: 'weak_foot', text: 'NEW RULE: use your other foot or hand! Honour rule!', fits: () => true, apply: (s) => s },
  { id: 'big_cheer', text: 'NEW RULE: everyone cheers after every score!', fits: () => true, apply: (s) => s },
];

/** Pick this round's chaos rule (always applied to the BASE spec, so rules do not pile up). */
export function chaosFor(base: GameSpec, round: number, seed: number): { spec: GameSpec; mutation: Mutation } {
  const r = rng(seed * 31 + round);
  const ok = MUTATIONS.filter((m) => m.fits(base));
  for (let tries = 0; tries < 10; tries++) {
    const m = ok[Math.floor(r() * ok.length)]!;
    const next = GameSpecSchema.safeParse(m.apply(base));
    if (next.success) return { spec: next.data, mutation: m };
  }
  return { spec: base, mutation: MUTATIONS.find((m) => m.id === 'big_cheer')! };
}

// ---------------- Rule Draft ----------------

/** Each player adds one rule; `remix` turns a rule into a spec change (brain or rules). */
export async function draftMerge(
  base: GameSpec,
  rules: string[],
  remix: (spec: GameSpec, change: string) => Promise<GameSpec>,
): Promise<{ spec: GameSpec; applied: string[] }> {
  let spec = base;
  const applied: string[] = [];
  for (const rule of rules) {
    if (!rule.trim()) continue;
    try {
      const next = await remix(spec, rule);
      const v = GameSpecSchema.safeParse(next);
      if (v.success && v.data.players === base.players) {
        spec = v.data;
        applied.push(rule);
      }
    } catch {
      // An unsafe or broken rule is skipped.
    }
  }
  return { spec, applied };
}

// ---------------- King of the Hill ----------------

export interface HillState {
  players: string[];
  king: number;
  queue: number[];
  streaks: number[];
  best: number[];
  matches: number;
  maxMatches: number;
  done: boolean;
}

export function startHill(players: string[], maxMatches = players.length * 2): HillState {
  return {
    players,
    king: 0,
    queue: players.map((_, i) => i).slice(1),
    streaks: players.map(() => 0),
    best: players.map(() => 0),
    matches: 0,
    maxMatches: Math.max(1, maxMatches),
    done: players.length < 2,
  };
}

/** The current match: [king, challenger]. */
export function hillMatch(h: HillState): [number, number] | null {
  return h.done ? null : [h.king, h.queue[0]!];
}

/** Record the winner of the current match (an index into `players`). */
export function hillResult(h: HillState, winner: number): HillState {
  if (h.done) return h;
  const challenger = h.queue[0]!;
  const loser = winner === h.king ? challenger : h.king;
  const streaks = [...h.streaks];
  streaks[winner] = (streaks[winner] ?? 0) + 1;
  streaks[loser] = 0;
  const best = h.best.map((b, i) => Math.max(b, streaks[i]!));
  const queue = [...h.queue.slice(1), loser];
  const matches = h.matches + 1;
  return { ...h, king: winner, queue, streaks, best, matches, done: matches >= h.maxMatches };
}

/** Who wears the crown: longest streak (ties: the current king). */
export function hillCrown(h: HillState): number {
  const top = Math.max(...h.best);
  if (h.best[h.king] === top) return h.king;
  return h.best.indexOf(top);
}

// ---------------- Tournament ----------------

export interface Match {
  id: number;
  round: number;
  a: number | null;
  b: number | null;
  winner: number | null;
}

export interface Bracket {
  players: string[];
  matches: Match[];
  rounds: number;
}

/** Single elimination for up to 8 players. Byes go to the first seeds. */
export function makeBracket(players: string[]): Bracket {
  const n = Math.max(2, Math.min(8, players.length));
  const size = n <= 2 ? 2 : n <= 4 ? 4 : 8;
  const rounds = Math.log2(size);
  // Standard seeding so byes are spread out.
  const seeds = size === 2 ? [0, 1] : size === 4 ? [0, 3, 1, 2] : [0, 7, 3, 4, 1, 6, 2, 5];
  const matches: Match[] = [];
  let id = 0;
  for (let i = 0; i < size / 2; i++) {
    const a = seeds[2 * i]! < n ? seeds[2 * i]! : null;
    const b = seeds[2 * i + 1]! < n ? seeds[2 * i + 1]! : null;
    matches.push({ id: id++, round: 0, a, b, winner: a !== null && b === null ? a : b !== null && a === null ? b : null });
  }
  for (let r = 1; r < rounds; r++) {
    for (let i = 0; i < size / 2 ** (r + 1); i++) matches.push({ id: id++, round: r, a: null, b: null, winner: null });
  }
  return propagate({ players: players.slice(0, n), matches, rounds });
}

function propagate(b: Bracket): Bracket {
  const matches = b.matches.map((m) => ({ ...m }));
  for (let r = 1; r < b.rounds; r++) {
    const prev = matches.filter((m) => m.round === r - 1);
    const cur = matches.filter((m) => m.round === r);
    cur.forEach((m, i) => {
      m.a = prev[2 * i]?.winner ?? null;
      m.b = prev[2 * i + 1]?.winner ?? null;
    });
  }
  return { ...b, matches };
}

/** The next match to play, or null when there is a champion. */
export function nextMatch(b: Bracket): Match | null {
  return b.matches.find((m) => m.winner === null && m.a !== null && m.b !== null) ?? null;
}

export function recordMatch(b: Bracket, matchId: number, winner: number): Bracket {
  const matches = b.matches.map((m) => (m.id === matchId && (m.a === winner || m.b === winner) ? { ...m, winner } : m));
  return propagate({ ...b, matches });
}

export function champion(b: Bracket): number | null {
  return b.matches.find((m) => m.round === b.rounds - 1)?.winner ?? null;
}

// ---------------- Fair-Play Balancer ----------------

/**
 * Handicaps from past results. `averages[i]` is player i's average result in
 * this game (null = no history). Weaker players get a points boost and a
 * bigger target zone; the strongest gets a shorter timer.
 */
export function balance(spec: GameSpec, averages: (number | null)[]): GameSpec {
  const known = averages.filter((a): a is number => a !== null && a > 0);
  if (known.length < 2 || spec.win_condition === 'co_op') return spec;
  const lowest = spec.win_condition === 'lowest';
  const best = lowest ? Math.min(...known) : Math.max(...known);
  const handicaps: NonNullable<GameSpec['handicaps']> = [];
  averages.forEach((avg, player) => {
    if (avg === null || avg <= 0 || player >= spec.players) return;
    const gap = lowest ? avg / best : best / avg; // >= 1, how far behind
    if (gap < 1.1) {
      if (avg === best && spec.timer_s && spec.turn_order === 'turns') {
        handicaps.push({ player, timer_s: Math.max(3, Math.round(spec.timer_s * 0.85)) });
      }
      return;
    }
    const boost = Math.min(1.6, Math.round(gap * 10) / 10);
    handicaps.push({ player, ...(lowest ? {} : { multiplier: boost }), zone_scale: Math.min(2, boost) });
  });
  return handicaps.length ? { ...spec, handicaps } : spec;
}

// ---------------- Boss Raid difficulty ----------------

export type BossDifficulty = 'easy' | 'medium' | 'hard';

export const BOSSES: Record<BossDifficulty, { name: string; hpPerPlayer: number; every_s: number; window_s: number }> = {
  easy: { name: 'Thunder Rock', hpPerPlayer: 75, every_s: 15, window_s: 3 },
  medium: { name: 'Storm Cloud', hpPerPlayer: 110, every_s: 10, window_s: 3 },
  hard: { name: 'Mega Ball', hpPerPlayer: 160, every_s: 7, window_s: 2.5 },
};

export function bossRaid(difficulty: BossDifficulty, players: number): GameSpec {
  const base = withPlayers(getTemplate('boss_raid_basic')!, players);
  const b = BOSSES[difficulty];
  const spec: GameSpec = {
    ...base,
    title: `Boss Raid: ${b.name}`,
    boss: { name: b.name, hp: b.hpPerPlayer * base.players },
    calls: { events: ['freeze'], every_s: b.every_s, window_s: b.window_s },
  };
  if (difficulty === 'hard') {
    // Mega Ball also takes ball hits.
    spec.trackers = [...new Set([...spec.trackers, 'ball' as const])];
    spec.scoring = [...spec.scoring, { event: 'ball_in_zone', target: 'boss', points: 8, condition: 'not call' }];
    spec.targets = ['boss'];
  }
  return GameSpecSchema.parse(spec);
}
