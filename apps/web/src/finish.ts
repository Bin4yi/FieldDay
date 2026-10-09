import { hillResult, recordMatch, type GameEngine } from '@fieldday/engine';
import { db, saveResult, type ResultRecord } from './db.js';
import { scoreUnit } from './gameInfo.js';
import { newBadges } from './progress.js';
import { useApp, type Session } from './store.js';

// Everything that happens when a game ends: save the result, the clip and
// new badges, and move a King of the Hill / Tournament series forward.

export interface FinishInput {
  session: Session;
  game: GameEngine;
  startedAt: number;
  durationMs: number;
  screenFraction: number;
  outside: boolean;
  clip: Blob | null;
  bestThrowM: number;
  extra?: Partial<ResultRecord>;
}

export async function finishGame(f: FinishInput): Promise<number> {
  const { session, game } = f;
  const r = game.result();
  const d = db();
  const now = Date.now();
  const record: Omit<ResultRecord, 'id'> = {
    specId: session.spec.id ?? 'custom',
    code: session.spec.id ?? 'custom',
    title: session.spec.title,
    players: session.players,
    totals: r.totals,
    winners: r.winners,
    unit: scoreUnit(session.spec),
    startedAt: f.startedAt,
    finishedAt: now,
    durationMs: f.durationMs,
    screenTimePct: Math.round(f.screenFraction * 1000) / 10,
    outside: f.outside,
    format: session.format.kind,
    spec: session.spec,
    rounds: r.players.map((p) => p.rounds),
    bests: r.players.map((p) => {
      const m = session.spec.scoring.find((x) => x.points === 'measure')?.measure;
      return m ? (p.stats.best[m] ?? null) : null;
    }),
    ...(session.ghost ? { ghost: { name: session.ghost.name, total: session.ghost.total } } : {}),
    ...f.extra,
  };
  const id = await saveResult(d, record);

  try {
    const all = await d.results.toArray();
    const have = new Set((await d.badges.toArray()).map((b) => b.id));
    const earned = newBadges(all, { bestThrowM: f.bestThrowM, bossDefeated: session.spec.win_condition === 'co_op' && r.winners.length > 0 }, have, now);
    if (earned.length) {
      await d.badges.bulkPut(earned.map((b) => ({ id: b, earnedAt: now })));
    }
    let clipId: number | undefined;
    if (f.clip) clipId = (await d.clips.add({ resultId: id, blob: f.clip, createdAt: now })) as number;
    await d.results.update(id, { badges: earned, ...(clipId !== undefined ? { clipId } : {}) });
  } catch {
    // Badges/clips are extras: the result is already saved.
  }

  // Series: winner stays on / moves up the bracket.
  const { series, setSeries } = useApp.getState();
  const seats = session.seats;
  if (series && seats && seats.length === 2) {
    const w = r.winners.length === 1 ? seats[r.winners[0]!]! : null;
    if (series.kind === 'koth') {
      setSeries({ ...series, hill: hillResult(series.hill, w ?? series.hill.king) });
    } else if (series.kind === 'tournament') {
      const match = series.bracket.matches.find((m) => m.a === seats[0] && m.b === seats[1] && m.winner === null);
      // A tie in a knockout: the higher seed goes through.
      if (match) setSeries({ ...series, bracket: recordMatch(series.bracket, match.id, w ?? Math.min(seats[0]!, seats[1]!)) });
    }
  }
  return id;
}
