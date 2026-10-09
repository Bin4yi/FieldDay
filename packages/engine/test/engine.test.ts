import { describe, expect, it } from 'vitest';
import { GameSpecSchema, createGame, getTemplate, type GameSpecInput } from '../src/index.js';

const spec = (over: Partial<GameSpecInput>) =>
  GameSpecSchema.parse({
    title: 'Test',
    one_line_rules: 'Test game.',
    players: 2,
    turn_order: 'simultaneous',
    rounds: 1,
    timer_s: 60,
    trackers: ['person'],
    scoring: [{ event: 'jump', points: 1 }],
    win_condition: 'highest',
    ...over,
  });

describe('engine', () => {
  it('waits for beginTurn between turns when autoAdvance is off', () => {
    const g = createGame(getTemplate('jump_battle')!);
    g.start(0);
    expect(g.state.turnPlayer).toBe(0);
    g.dispatch({ type: 'jump', t: 1000, measures: { height_m: 0.4 } });
    expect(g.state.phase).toBe('between_turns');
    expect(g.state.turnPlayer).toBe(1);
    // Events between turns are ignored.
    expect(g.dispatch({ type: 'jump', t: 1500, measures: { height_m: 0.9 } })).toEqual([]);
    const m = g.beginTurn(4000);
    expect(m).toEqual([{ kind: 'turn_start', t: 4000, round: 0, player: 1, toBeat: 0.4 }]);
    g.dispatch({ type: 'jump', t: 5000, measures: { height_m: 0.5 } });
    expect(g.total(1)).toBe(0.5);
  });

  it('ends the game as soon as someone reaches first_to', () => {
    const g = createGame(spec({ win_condition: 'first_to', target_score: 3 }), { autoAdvance: true });
    g.start(0);
    g.dispatch({ type: 'jump', t: 1, player: 0 });
    g.dispatch({ type: 'jump', t: 2, player: 1 });
    g.dispatch({ type: 'jump', t: 3, player: 1 });
    expect(g.state.phase).toBe('playing');
    const m = g.dispatch({ type: 'jump', t: 4, player: 1 });
    expect(m.at(-1)).toEqual({ kind: 'game_over', t: 4, winners: [1], winningTeams: [] });
  });

  it('adds up team totals', () => {
    const g = createGame(
      spec({
        players: 4,
        win_condition: 'team_total',
        teams: [
          { name: 'Red', players: [0, 1] },
          { name: 'Blue', players: [2, 3] },
        ],
      }),
      { autoAdvance: true },
    );
    g.start(0);
    for (const [p, n] of [
      [0, 3],
      [1, 1],
      [2, 2],
      [3, 1],
    ] as const) {
      for (let i = 0; i < n; i++) g.dispatch({ type: 'jump', t: 10, player: p });
    }
    g.tick(60_000);
    expect(g.result().winningTeams).toEqual(['Red']);
    expect(g.result().winners).toEqual([0, 1]);
  });

  it('applies handicap multipliers and timers', () => {
    const g = createGame(
      spec({
        turn_order: 'turns',
        rounds: 1,
        timer_s: 10,
        handicaps: [
          { player: 0, multiplier: 2 },
          { player: 1, timer_s: 20 },
        ],
      }),
      { autoAdvance: true },
    );
    g.start(0);
    g.dispatch({ type: 'jump', t: 1000 });
    g.tick(10_000); // player 0's 10 s timer
    expect(g.state.turnPlayer).toBe(1);
    g.tick(25_000); // player 1 still has time
    expect(g.state.phase).toBe('playing');
    g.dispatch({ type: 'jump', t: 26_000 });
    g.tick(30_000);
    expect(g.result().totals).toEqual([2, 1]);
  });

  it('a fouled event does not also score', () => {
    const g = createGame(
      spec({
        fouls: [{ event: 'jump', condition: 'height_m > 2', penalty: 'points', points: -5 }],
        scoring: [{ event: 'jump', measure: 'height_m', points: 'measure' }],
      }),
    );
    g.start(0);
    g.dispatch({ type: 'jump', t: 1, player: 0, measures: { height_m: 9 } });
    expect(g.total(0)).toBe(-5);
  });

  it('disqualified players cannot win', () => {
    const g = createGame(spec({ fouls: [{ event: 'punch', penalty: 'disqualify' }] }), { autoAdvance: true });
    g.start(0);
    g.dispatch({ type: 'jump', t: 1, player: 0 });
    g.dispatch({ type: 'jump', t: 2, player: 0 });
    g.dispatch({ type: 'punch', t: 3, player: 0 });
    g.dispatch({ type: 'jump', t: 4, player: 0 });
    g.dispatch({ type: 'jump', t: 5, player: 1 });
    g.tick(60_000);
    expect(g.result().winners).toEqual([1]);
  });

  it('announces lead changes and new personal bests', () => {
    const g = createGame(getTemplate('jump_battle')!, { autoAdvance: true });
    const m = [
      ...g.start(0),
      ...g.dispatch({ type: 'jump', t: 1, measures: { height_m: 0.4 } }),
      ...g.dispatch({ type: 'jump', t: 2, measures: { height_m: 0.3 } }),
      ...g.dispatch({ type: 'jump', t: 3, measures: { height_m: 0.35 } }),
      ...g.dispatch({ type: 'jump', t: 4, measures: { height_m: 0.5 } }),
    ];
    expect(m.filter((x) => x.kind === 'lead_change')).toEqual([{ kind: 'lead_change', t: 4, player: 1 }]);
    expect(m.filter((x) => x.kind === 'new_best')).toEqual([
      { kind: 'new_best', t: 4, player: 1, measure: 'height_m', value: 0.5 },
    ]);
  });

  it('derives duration_s and reaction_ms from the clock', () => {
    const g = createGame(spec({ scoring: [{ event: 'hands_up', measure: 'reaction_ms', points: 'measure' }] }));
    g.start(1000);
    g.dispatch({ type: 'hands_up', t: 1420, player: 0 });
    expect(g.total(0)).toBe(420);
  });

  it('is deterministic for the same seed', () => {
    const run = (seed: number) => {
      const g = createGame(getTemplate('mirror_me')!, { autoAdvance: true, seed });
      g.start(0);
      g.tick(30_000);
      return g.log.filter((m) => m.kind === 'call');
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('boss survives if time runs out', () => {
    const g = createGame(getTemplate('boss_raid_basic')!, { autoAdvance: true });
    g.start(0);
    g.dispatch({ type: 'jump', t: 1000, player: 0 });
    g.tick(90_000);
    expect(g.state.phase).toBe('finished');
    expect(g.state.bossHp).toBe(145);
    expect(g.result().winners).toEqual([]);
  });
});
