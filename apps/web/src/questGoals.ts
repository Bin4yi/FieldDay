import type { GameEngine, Measure } from '@fieldday/engine';
import { goalMeasures } from '@fieldday/quests';
import type { QuestRunSave } from './store.js';

const LOWER_BETTER: Measure[] = ['reaction_ms', 'duration_s'];

/** The measures a quest goal checks: the relay runner's, or the best of everyone. */
export function goalMeasuresFor(game: GameEngine, run: QuestRunSave | null): Partial<Record<Measure, number>> {
  const players = game.result().players;
  const relay = run?.quest.kind === 'relay' ? run.state.stepIndex % Math.max(1, run.players.length) : null;
  const list = relay !== null && players[relay] ? [players[relay]!] : players;
  const out: Partial<Record<Measure, number>> = {};
  for (const p of list) {
    const m = goalMeasures(p.stats);
    for (const [k, v] of Object.entries(m) as [Measure, number][]) {
      const prev = out[k];
      if (prev === undefined) out[k] = v;
      else out[k] = LOWER_BETTER.includes(k) ? Math.min(prev, v) : Math.max(prev, v);
    }
  }
  return out;
}
