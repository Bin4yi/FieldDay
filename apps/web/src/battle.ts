import {
  balance,
  hillMatch,
  makeBracket,
  nextMatch,
  startHill,
  withPlayers,
  type GameSpec,
  type PowerUpType,
} from '@fieldday/engine';
import { db } from './db.js';
import { newSession, type Series, type Session } from './store.js';
import type { CameraMode } from './vision/useVision.js';

// Helpers that turn setup choices into a session.

/** Turn on power-ups, earned by repeating the game's main scoring move. */
export function withPowerUps(spec: GameSpec): GameSpec {
  const ev = spec.scoring.find((r) => r.event !== 'timer_end')?.event ?? 'jump';
  const ups: { type: PowerUpType; count: number }[] = [
    { type: 'double', count: 3 },
    { type: 'shield', count: 5 },
  ];
  if (spec.players > 1) ups.push({ type: 'steal', count: 7 }, { type: 'freeze', count: 9 });
  return { ...spec, power_ups: ups.map((u) => ({ type: u.type, earn: { event: ev, count: u.count } })) };
}

export function withTeams(spec: GameSpec): GameSpec {
  if (spec.players < 2 || spec.win_condition === 'co_op') return spec;
  const half = Math.ceil(spec.players / 2);
  return {
    ...spec,
    mode: 'team',
    win_condition: 'team_total',
    aggregate: 'sum',
    teams: [
      { name: 'Red', players: Array.from({ length: half }, (_, i) => i) },
      { name: 'Blue', players: Array.from({ length: spec.players - half }, (_, i) => i + half) },
    ],
  };
}

/** Fair-play balancer: handicaps from this phone's past results for these names. */
export async function withBalance(spec: GameSpec, players: string[]): Promise<GameSpec> {
  try {
    const rows = await db().results.where('specId').equals(spec.id ?? 'custom').toArray();
    const averages = players.map((name) => {
      const vals = rows.flatMap((r) => {
        const i = r.players.indexOf(name);
        const v = i >= 0 ? r.totals[i] : null;
        return v === null || v === undefined ? [] : [v];
      });
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    return balance(spec, averages);
  } catch {
    return spec;
  }
}

export function startKoth(base: GameSpec, names: string[], camera: CameraMode): { series: Series; session: Session } {
  const hill = startHill(names);
  const series: Series = { kind: 'koth', base, hill, camera };
  return { series, session: seriesSession(series)! };
}

export function startTournament(base: GameSpec, names: string[], camera: CameraMode): { series: Series; session: Session } {
  const bracket = makeBracket(names);
  const first = nextMatch(bracket);
  const series: Series = { kind: 'tournament', base, bracket, matchId: first?.id ?? null, camera };
  return { series, session: seriesSession(series)! };
}

/** The session for the series' next match, or null when it is over. */
export function seriesSession(series: Series): Session | null {
  const spec2 = withPlayers({ ...series.base, max_players: Math.max(2, series.base.max_players ?? 2) }, 2);
  if (series.kind === 'koth') {
    const m = hillMatch(series.hill);
    if (!m) return null;
    return { ...newSession(spec2, m.map((i) => series.hill.players[i]!), series.camera, { kind: 'koth' }), seats: m };
  }
  const m = nextMatch(series.bracket);
  if (!m || m.a === null || m.b === null) return null;
  return {
    ...newSession(spec2, [series.bracket.players[m.a]!, series.bracket.players[m.b]!], series.camera, { kind: 'tournament' }),
    seats: [m.a, m.b],
  };
}
