import { describe, expect, it } from 'vitest';
import { createGame, draftMerge, getTemplate } from '@fieldday/engine';
import { GemmaBrain, rulesRemix } from '../src/index.js';

describe('Rule Draft (offline)', () => {
  it('each player adds a rule; the merged game plays to the end', async () => {
    const base = getTemplate('squat_storm')!;
    const brain = new GemmaBrain(null);
    const { spec, applied } = await draftMerge(
      base,
      ['make it 3 rounds', 'double points', 'throw the ball at each other', '20 seconds'],
      (s, change) => brain.remixGame(s, change),
    );
    expect(applied).toEqual(['make it 3 rounds', 'double points', '20 seconds']); // the unsafe one is skipped
    expect(spec.rounds).toBe(3);
    expect(spec.timer_s).toBe(20);
    expect(spec.scoring[0]!.points).toBe(2);

    const g = createGame(spec, { autoAdvance: true });
    g.start(0);
    for (let r = 0; r < 3; r++) {
      const t0 = r * 20_000;
      g.dispatch({ type: 'squat', t: t0 + 1000, player: 0 });
      g.dispatch({ type: 'squat', t: t0 + 2000, player: 1 });
      g.dispatch({ type: 'squat', t: t0 + 3000, player: 1 });
    }
    g.tick(60_000);
    expect(g.state.phase).toBe('finished');
    expect(g.result().totals).toEqual([6, 12]);
    expect(g.result().winners).toEqual([1]);
  });

  it('rulesRemix is deterministic', () => {
    expect(rulesRemix(getTemplate('sky_toss')!, '4 rounds').spec.rounds).toBe(4);
  });
});
