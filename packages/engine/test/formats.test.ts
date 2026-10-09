import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  GameSpecSchema,
  MUTATIONS,
  TEMPLATES,
  balance,
  bossRaid,
  champion,
  chaosFor,
  createGame,
  getTemplate,
  hillCrown,
  hillMatch,
  hillResult,
  makeBracket,
  nextMatch,
  recordMatch,
  startHill,
  validateSpec,
  type GameSpecInput,
} from '../src/index.js';

const squats = (over: Partial<GameSpecInput>) =>
  GameSpecSchema.parse({ ...getTemplate('squat_storm')!, players: 2, timer_s: 60, ...over });

describe('power-ups', () => {
  it('10 squats earn Double: the next squat scores 2', () => {
    const g = createGame(squats({ power_ups: [{ type: 'double', earn: { event: 'squat', count: 10 } }] }));
    g.start(0);
    const m = [];
    for (let i = 0; i < 11; i++) m.push(...g.dispatch({ type: 'squat', t: i * 100, player: 0 }));
    expect(m.filter((x) => x.kind === 'power_up')).toHaveLength(1);
    // The 10th squat earns it, the 11th uses it: 10 + 2 = 12
    expect(g.total(0)).toBe(12);
  });

  it('Shield blocks one foul', () => {
    const g = createGame(
      squats({
        power_ups: [{ type: 'shield', earn: { event: 'squat', count: 1 } }],
        fouls: [{ event: 'cross_line', penalty: 'points', points: -5 }],
      }),
    );
    g.start(0);
    g.dispatch({ type: 'squat', t: 1, player: 0 });
    const m = g.dispatch({ type: 'cross_line', t: 2, player: 0 });
    expect(m.map((x) => x.kind)).toContain('power_used');
    expect(g.total(0)).toBe(1);
    g.dispatch({ type: 'cross_line', t: 3, player: 0 });
    expect(g.total(0)).toBe(-4);
  });

  it('Steal takes 5 from the leader; Freeze halves their next score', () => {
    const g = createGame(
      squats({
        scoring: [{ event: 'squat', points: 4 }],
        power_ups: [
          { type: 'steal', earn: { event: 'jump', count: 1 } },
          { type: 'freeze', earn: { event: 'punch', count: 1 } },
        ],
      }),
    );
    g.start(0);
    g.dispatch({ type: 'squat', t: 1, player: 1 });
    g.dispatch({ type: 'squat', t: 2, player: 1 }); // P1: 8
    g.dispatch({ type: 'jump', t: 3, player: 0 }); // P0 steals 5
    expect(g.total(0)).toBe(5);
    expect(g.total(1)).toBe(3);
    g.dispatch({ type: 'punch', t: 4, player: 0 }); // freeze the leader (P0 is leading now, so P1)
    g.dispatch({ type: 'squat', t: 5, player: 1 }); // 4 / 2 = 2
    expect(g.total(1)).toBe(5);
  });
});

describe('chaos mode', () => {
  it('always gives a valid spec and a rule to read out', () => {
    for (const t of TEMPLATES) {
      for (let round = 0; round < 6; round++) {
        const { spec, mutation } = chaosFor(t, round, 42);
        expect(validateSpec(spec).ok, `${t.id} ${mutation.id}`).toBe(true);
        expect(mutation.text).toMatch(/^NEW RULE/);
      }
    }
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(6);
  });

  it('the engine can take a new rule between turns', () => {
    const base = getTemplate('jump_battle')!;
    const g = createGame(base);
    g.start(0);
    g.dispatch({ type: 'jump', t: 1, measures: { height_m: 0.4 } });
    expect(g.state.phase).toBe('between_turns');
    const doubled = { ...base, scoring: [{ event: 'jump' as const, points: 5 }] };
    const m = g.setSpec(doubled, 2, 'NEW RULE: every jump is 5 points!');
    expect(m).toEqual([{ kind: 'rule_change', t: 2, text: 'NEW RULE: every jump is 5 points!' }]);
    g.beginTurn(3);
    g.dispatch({ type: 'jump', t: 4, measures: { height_m: 0.1 } });
    expect(g.total(1)).toBe(5);
    expect(() => g.setSpec({ ...base, players: 3 }, 5)).toThrow();
  });
});

describe('king of the hill', () => {
  it('winner stays, challengers rotate, longest streak gets the crown', () => {
    let h = startHill(['A', 'B', 'C'], 5);
    expect(hillMatch(h)).toEqual([0, 1]);
    h = hillResult(h, 0); // A beats B
    expect(hillMatch(h)).toEqual([0, 2]);
    h = hillResult(h, 0); // A beats C (streak 2)
    h = hillResult(h, 1); // B beats A
    h = hillResult(h, 1); // B beats C
    h = hillResult(h, 1); // B beats A (streak 3)
    expect(h.done).toBe(true);
    expect(hillMatch(h)).toBeNull();
    expect(hillCrown(h)).toBe(1);
    expect(h.best).toEqual([2, 3, 0]);
  });
});

describe('tournament', () => {
  it('runs a 5-player bracket with byes to one champion', () => {
    let b = makeBracket(['A', 'B', 'C', 'D', 'E']);
    expect(b.rounds).toBe(3);
    let played = 0;
    for (let m = nextMatch(b); m; m = nextMatch(b)) {
      b = recordMatch(b, m.id, Math.min(m.a!, m.b!)); // lower seed always wins
      played++;
    }
    expect(played).toBe(4); // n - 1 matches
    expect(champion(b)).toBe(0);
  });

  it('2 and 8 players', () => {
    expect(makeBracket(['A', 'B']).matches).toHaveLength(1);
    expect(makeBracket(['1', '2', '3', '4', '5', '6', '7', '8']).matches).toHaveLength(7);
  });
});

describe('fair-play balancer', () => {
  it('boosts the weaker player and gives the stronger a shorter timer', () => {
    const s = balance(getTemplate('sky_toss')!, [3.0, 1.5]);
    expect(s.handicaps).toEqual([
      { player: 0, timer_s: 13 },
      { player: 1, multiplier: 1.6, zone_scale: 1.6 },
    ]);
    expect(validateSpec(s).ok).toBe(true);
  });

  it('does nothing without history', () => {
    const t = getTemplate('sky_toss')!;
    expect(balance(t, [null, 2])).toBe(t);
  });
});

describe('boss raid difficulty', () => {
  it('makes valid raids that scale with players', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const s = bossRaid(d, 3);
      expect(validateSpec(s).ok).toBe(true);
      expect(s.boss!.hp).toBe(BOSSES[d].hpPerPlayer * 3);
    }
    expect(bossRaid('hard', 2).targets).toEqual(['boss']);
  });

  it('a 2-player raid can be won', () => {
    const g = createGame(bossRaid('easy', 2), { autoAdvance: true });
    g.start(0);
    for (let i = 0; i < 30; i++) g.dispatch({ type: 'jump', t: 100 + i * 100, player: i % 2 });
    expect(g.state.bossHp).toBe(0);
    expect(g.result().winners).toEqual([0, 1]);
  });
});
