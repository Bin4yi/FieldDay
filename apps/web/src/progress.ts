import type { BadgeKey } from './assets.js';
import type { ResultRecord } from './db.js';

// XP, levels, badges, outside minutes and day streaks. Pure functions over
// the results saved on the phone.

export function xpFor(r: ResultRecord, playerName: string): number {
  const i = r.players.indexOf(playerName);
  if (i < 0) return 0;
  const minutes = (r.durationMs ?? 0) / 60000;
  return Math.round(10 + (r.winners.includes(i) ? 15 : 0) + Math.min(30, minutes * 2) + (r.outside ? 10 : 0) + (r.questXp ?? 0));
}

export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let need = 100;
  let left = xp;
  while (left >= need) {
    left -= need;
    level++;
    need = Math.round(need * 1.25);
  }
  return { level, into: left, need };
}

const DAY = 86400000;
const dayKey = (t: number) => new Date(t).toDateString();

export function outsideMinutes(results: ResultRecord[], since: number): number {
  return Math.round(
    results.filter((r) => r.outside && r.finishedAt >= since).reduce((m, r) => m + (r.durationMs ?? 0), 0) / 60000,
  );
}

/** Days in a row (ending today or yesterday) with a game played outside. */
export function outsideStreak(results: ResultRecord[], now: number): number {
  const days = new Set(results.filter((r) => r.outside).map((r) => dayKey(r.finishedAt)));
  let streak = 0;
  let t = now;
  if (!days.has(dayKey(t))) t -= DAY;
  while (days.has(dayKey(t))) {
    streak++;
    t -= DAY;
  }
  return streak;
}

export interface BadgeContext {
  /** Best throw height in this game, m. */
  bestThrowM?: number;
  bossDefeated?: boolean;
  questOffline?: boolean;
  crewQuestDone?: boolean;
}

/** Badges earned by this result (given all earlier results, including this one). */
export function newBadges(all: ResultRecord[], ctx: BadgeContext, have: Set<string>, now: number): BadgeKey[] {
  const out: BadgeKey[] = [];
  const add = (b: BadgeKey, ok: boolean) => {
    if (ok && !have.has(b)) out.push(b);
  };
  add('touch_grass', outsideMinutes(all, 0) > 0);
  add('boss_slayer', !!ctx.bossDefeated);
  add('sky_high', (ctx.bestThrowM ?? 0) >= 3);
  add('streak_7', outsideStreak(all, now) >= 7);
  add('offline_hero', !!ctx.questOffline);
  add('crew_power', !!ctx.crewQuestDone);
  return out;
}
