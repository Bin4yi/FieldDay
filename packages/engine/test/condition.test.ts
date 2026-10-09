import { describe, expect, it } from 'vitest';
import { evalCondition, evalGoal, parseCondition, type ConditionContext } from '../src/index.js';

const ctx = (over: Partial<ConditionContext> = {}): ConditionContext => ({
  measures: {},
  eventType: 'jump',
  seen: () => false,
  call: null,
  scored: false,
  ...over,
});

describe('condition language', () => {
  it('parses every clause kind', () => {
    for (const text of [
      'height_m >= 2',
      'reaction_ms < 100',
      'before ball_release',
      'without freeze',
      'after touch_object:far',
      'during call',
      'is call',
      'not call',
      'no score',
      'has score',
      'during call and not call',
    ]) {
      expect(parseCondition(text).ok, text).toBe(true);
    }
  });

  it('rejects unknown words with a readable error', () => {
    expect(parseCondition('spin_rpm > 3')).toEqual({ ok: false, error: 'unknown measure "spin_rpm"' });
    expect(parseCondition('before teleport')).toEqual({ ok: false, error: 'unknown event "teleport"' });
    expect(parseCondition('height_m > lots')).toEqual({ ok: false, error: '"lots" is not a number' });
    expect(parseCondition('whenever you like').ok).toBe(false);
  });

  it('compares measures', () => {
    expect(evalCondition('height_m >= 2', ctx({ measures: { height_m: 2 } }))).toBe(true);
    expect(evalCondition('height_m > 2', ctx({ measures: { height_m: 2 } }))).toBe(false);
    expect(evalCondition('height_m > 2', ctx())).toBe(false);
  });

  it('checks seen events, with and without targets', () => {
    const seen = (e: string, t?: string) => (t ? `${e}:${t}` === 'touch_object:far' : e === 'touch_object');
    expect(evalCondition('after touch_object:far', ctx({ seen }))).toBe(true);
    expect(evalCondition('after touch_object:home', ctx({ seen }))).toBe(false);
    expect(evalCondition('before ball_release', ctx({ seen }))).toBe(true);
  });

  it('checks referee calls', () => {
    expect(evalCondition('is call', ctx({ call: 'jump' }))).toBe(true);
    expect(evalCondition('during call and not call', ctx({ call: 'squat' }))).toBe(true);
    expect(evalCondition('during call and not call', ctx({ call: 'jump' }))).toBe(false);
    expect(evalCondition('during call', ctx())).toBe(false);
  });

  it('evaluates quest goals on measures only', () => {
    expect(evalGoal('count >= 20', { count: 21 })).toBe(true);
    expect(evalGoal('height_m >= 2', { height_m: 1.5 })).toBe(false);
    expect(evalGoal('before jump', {})).toBe(false);
  });
});
