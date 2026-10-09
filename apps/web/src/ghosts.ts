import { encodeGhost, getTemplate, makeGhost, withPlayers, type GameResult, type Ghost } from '@fieldday/engine';
import type { ResultRecord } from './db.js';

/** Build a ghost for one player of a saved result. */
export function ghostFromRecord(r: ResultRecord, player: number): Ghost | null {
  const spec = r.spec ?? getTemplate(r.specId);
  if (!spec || !r.rounds?.[player]) return null;
  const measure = spec.scoring.find((x) => x.points === 'measure')?.measure;
  const best = r.bests?.[player];
  const fake: GameResult = {
    winners: r.winners,
    winningTeams: [],
    totals: r.totals,
    bossHp: null,
    players: r.players.map((name, i) => ({
      index: i,
      name,
      rounds: r.rounds?.[i] ?? [],
      lives: null,
      out: false,
      disqualified: false,
      stats: { count: 0, best: measure && i === player && best != null ? { [measure]: best } : {}, fouls: 0 },
      powers: [],
      halfNext: false,
      eventCounts: {},
    })),
  };
  return makeGhost(withPlayers(spec, 1), fake, player, r.players[player] ?? 'Ghost', r.finishedAt);
}

export function ghostUrl(g: Ghost): string {
  return `${location.origin}/#/ghost/${encodeGhost(g)}`;
}
