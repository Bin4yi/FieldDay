import { describe, expect, it } from 'vitest';
import type { ResultRecord } from '../src/db.js';
import { levelFor, newBadges, outsideMinutes, outsideStreak, xpFor } from '../src/progress.js';
import { ScreenTimeMeter } from '../src/screenTime.js';

const DAY = 86400000;
const now = new Date('2026-10-09T12:00:00').getTime();
const r = (over: Partial<ResultRecord>): ResultRecord => ({
  specId: 'sky_toss',
  code: 'SKY',
  title: 'Sky',
  players: ['Ama', 'Binula'],
  totals: [2, 1],
  winners: [0],
  unit: 'm',
  startedAt: now - 600000,
  finishedAt: now,
  durationMs: 600000,
  ...over,
});

describe('screen-time meter', () => {
  it('counts touches and handling, not the time the phone lies down', () => {
    const m = new ScreenTimeMeter(4000, 0.6);
    m.begin(0);
    m.touch(0); // setup tap
    m.touch(2000); // overlaps
    m.motion(30_000, 2); // picked up
    m.motion(31_000, 0.1); // lying still: ignored
    m.stop(100_000);
    expect(m.duration(200_000)).toBe(100_000);
    expect(m.fraction(200_000)).toBeCloseTo((6000 + 1000) / 100_000, 5);
  });
});

describe('progress', () => {
  it('XP and levels', () => {
    expect(xpFor(r({ outside: true }), 'Ama')).toBe(10 + 15 + 20 + 10);
    expect(xpFor(r({}), 'Binula')).toBe(30);
    expect(xpFor(r({}), 'Nobody')).toBe(0);
    expect(levelFor(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelFor(230).level).toBe(3);
  });

  it('outside minutes and streaks', () => {
    const rs = [0, 1, 2, 4].map((d) => r({ outside: true, finishedAt: now - d * DAY }));
    expect(outsideMinutes(rs, now - 3 * DAY)).toBe(30);
    expect(outsideStreak(rs, now)).toBe(3);
  });

  it('badges', () => {
    const all = [r({ outside: true })];
    expect(newBadges(all, { bestThrowM: 3.1, bossDefeated: true }, new Set(), now)).toEqual(['touch_grass', 'boss_slayer', 'sky_high']);
    expect(newBadges(all, {}, new Set(['touch_grass']), now)).toEqual([]);
  });
});
