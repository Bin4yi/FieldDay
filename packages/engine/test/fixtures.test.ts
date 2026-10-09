import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/index.js';
import { loadFixtures, replay } from './replay.js';

const fixtures = loadFixtures();

describe('engine fixtures', () => {
  it('has a fixture for every template', () => {
    const covered = new Set(fixtures.map((f) => f.fixture.template));
    for (const t of TEMPLATES) expect(covered, `missing fixture for ${t.id}`).toContain(t.id);
  });

  for (const { file, fixture } of fixtures) {
    it(`${file}: ${fixture.description ?? ''}`, () => {
      const { game, moments } = replay(fixture);
      const exp = fixture.expect;
      expect(game.state.phase).toBe('finished');
      expect(game.result().winners).toEqual(exp.winners);
      if (exp.totals) {
        const totals = game.result().totals;
        expect(totals).toHaveLength(exp.totals.length);
        exp.totals.forEach((v, i) => {
          if (v === null) expect(totals[i]).toBeNull();
          else expect(totals[i]).toBeCloseTo(v, 6);
        });
      }
      if (exp.lives) expect(game.state.players.map((p) => p.lives)).toEqual(exp.lives);
      if (exp.fouls) expect(game.state.players.map((p) => p.stats.fouls)).toEqual(exp.fouls);
      if (exp.bossHp !== undefined) expect(game.state.bossHp).toBe(exp.bossHp);
      if (exp.calls) {
        expect(moments.filter((m) => m.kind === 'call').map((m) => (m.kind === 'call' ? m.event : null))).toEqual(
          exp.calls,
        );
      }
      for (const [kind, n] of Object.entries(exp.moments ?? {})) {
        expect(moments.filter((m) => m.kind === kind), `moment ${kind}`).toHaveLength(n);
      }
      // The returned moments and the engine's log must agree.
      expect(game.log).toEqual(moments);
    });
  }
});
