import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getTemplate } from '@fieldday/engine';
import { openDb, personalBest, saveResult } from '../src/db.js';
import { formatValue, scoreUnit } from '../src/gameInfo.js';
import { href, parseRoute } from '../src/router.js';
import { loadSettings, saveSetting, DEFAULT_SETTINGS } from '../src/settings.js';
import { padButtons } from '../src/tapPad.js';

describe('local database', () => {
  it('saves results and finds personal bests', async () => {
    const d = openDb(`test-${Math.random()}`);
    const base = {
      specId: 'sky_toss',
      code: 'SKY-TOSS-01',
      title: 'Sky Toss',
      winners: [0],
      unit: 'm',
      startedAt: 0,
      finishedAt: 1,
    };
    await saveResult(d, { ...base, players: ['Ama', 'Binula'], totals: [2.1, 1.9] });
    await saveResult(d, { ...base, players: ['Binula'], totals: [2.6] });
    expect(await personalBest(d, 'sky_toss', 'Binula', false)).toBe(2.6);
    expect(await personalBest(d, 'sky_toss', 'Ama', false)).toBe(2.1);
    expect(await personalBest(d, 'jump_battle', 'Ama', false)).toBeNull();
  });

  it('stores settings over the defaults', async () => {
    const d = openDb(`test-${Math.random()}`);
    expect(await loadSettings(d)).toEqual(DEFAULT_SETTINGS);
    await saveSetting(d, 'kidsMode', true);
    expect((await loadSettings(d)).kidsMode).toBe(true);
  });
});

describe('tap pad', () => {
  it('shows every event Sky Toss needs, with a height box on the apex', () => {
    const keys = padButtons(getTemplate('sky_toss')!).map((b) => b.key);
    expect(keys).toEqual(['ball_apex', 'cross_line', 'ball_release', 'ball_catch', 'ball_bounce', 'ball_out_of_frame']);
    expect(padButtons(getTemplate('sky_toss')!)[0]?.measure).toBe('height_m');
  });

  it('splits targets and skips clock events', () => {
    const keys = padButtons(getTemplate('sprint_tap')!).map((b) => b.key);
    expect(keys).toEqual(['touch_object:home', 'touch_object:far']);
    // reaction time comes from the clock, so there is no input box
    expect(padButtons(getTemplate('reaction_race')!)).toEqual([{ key: 'hands_up', event: 'hands_up' }]);
  });
});

describe('game words', () => {
  it('formats units', () => {
    expect(scoreUnit(getTemplate('sky_toss')!)).toBe('m');
    expect(scoreUnit(getTemplate('squat_storm')!)).toBe('pts');
    expect(formatValue(2.456, 'height_m')).toBe('2.46');
    expect(formatValue(null, null)).toBe('–');
    expect(formatValue(12, null)).toBe('12');
  });
});

describe('router', () => {
  it('round-trips routes', () => {
    for (const r of [
      { name: 'home' },
      { name: 'games' },
      { name: 'setup', id: 'sky_toss' },
      { name: 'results', id: 4 },
      { name: 'settings' },
    ] as const) {
      expect(parseRoute(href(r))).toEqual(r);
    }
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
  });
});
