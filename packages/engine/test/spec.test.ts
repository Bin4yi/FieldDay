import { describe, expect, it } from 'vitest';
import { TEMPLATES, gameCode, validateSpec, withPlayers } from '../src/index.js';

describe('game spec', () => {
  it('ships at least 12 valid templates with unique ids', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(validateSpec(t).ok, t.id).toBe(true);
  });

  it('accepts the example spec from the brief and fills defaults', () => {
    const r = validateSpec({
      title: 'Sky Toss Showdown',
      one_line_rules: 'Throw the ball as high as you can. Three throws each. Highest throw wins.',
      players: 2,
      turn_order: 'turns',
      rounds: 3,
      trackers: ['ball', 'person'],
      scoring: [{ event: 'ball_apex', measure: 'height_m', points: 'measure' }],
      fouls: [{ event: 'cross_line', condition: 'before ball_release', penalty: 'round_void' }],
      win_condition: 'highest',
      referee_style: 'football_announcer',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.aggregate).toBe('sum');
  });

  it('returns short path-based errors that can be sent back to the brain', () => {
    const r = validateSpec({
      title: 'Bad',
      one_line_rules: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone',
      players: 2,
      turn_order: 'turns',
      rounds: 3,
      trackers: ['ball'],
      scoring: [{ event: 'ball_spin', points: 'measure' }],
      fouls: [{ event: 'jump', condition: 'when it feels right', penalty: 'round_void' }],
      win_condition: 'first_to',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = r.errors.join('\n');
      expect(text).toContain('one_line_rules: one_line_rules must be 20 words or fewer');
      expect(text).toContain('scoring.0.event');
      expect(text).toContain('fouls.0.condition: cannot read condition');
    }
  });

  it('checks cross-field rules', () => {
    const base = TEMPLATES.find((t) => t.id === 'squat_storm')!;
    const errs = (x: object) => {
      const r = validateSpec({ ...base, ...x });
      return r.ok ? [] : r.errors;
    };
    expect(errs({ win_condition: 'first_to' })).toContain('target_score: first_to needs target_score');
    expect(errs({ win_condition: 'last_standing' })).toContain('lives: last_standing needs lives');
    expect(errs({ win_condition: 'co_op' })).toContain('boss: co_op needs a boss');
    expect(errs({ win_condition: 'team_total' })).toContain('teams: team_total needs teams');
    expect(errs({ timer_s: undefined })).toContain('timer_s: simultaneous play needs timer_s or turn_end');
    expect(errs({ scoring: [{ event: 'squat', points: 1, condition: 'is call' }] })).toContain(
      'calls: rules mention "call" but there are no calls',
    );
  });

  it('changes the player count within the allowed range', () => {
    const t = TEMPLATES.find((x) => x.id === 'freeze_statue')!;
    expect(withPlayers(t, 1).players).toBe(2);
    expect(withPlayers(t, 5).players).toBe(5);
    expect(withPlayers(t, 99).players).toBe(6);
  });

  it('makes stable, readable game codes', () => {
    const sky = TEMPLATES.find((x) => x.id === 'sky_toss')!;
    const code = gameCode(sky);
    expect(code).toMatch(/^SKY-TOSS-\d{2}$/);
    expect(gameCode({ ...sky })).toBe(code);
    expect(gameCode({ ...sky, rounds: 5 })).not.toBe(code);
  });
});
