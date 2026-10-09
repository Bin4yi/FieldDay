import type { EventType, GameSpec, Measure } from '@fieldday/engine';
import { ASSETS, type Asset } from './assets.js';

// Small helpers to show and say game things in plain words.

export function modeIcon(spec: GameSpec): Asset {
  return ASSETS.modes[spec.mode ?? 'solo'];
}

/** Volt's intro pose for a game card. */
export function introMascot(spec: GameSpec): Asset {
  if (spec.mode === 'boss_raid') return ASSETS.mascot.bossFight;
  return spec.trackers.includes('ball') ? ASSETS.mascot.throw : ASSETS.mascot.jump;
}

/** The measure that becomes the score, if the score is a measurement. */
export function scoreMeasure(spec: GameSpec): Measure | null {
  const rule = spec.scoring.find((r) => r.points === 'measure');
  return rule?.measure ?? null;
}

const UNIT: Partial<Record<Measure, { short: string; long: string; digits: number }>> = {
  height_m: { short: 'm', long: 'metres', digits: 2 },
  distance_m: { short: 'm', long: 'metres', digits: 1 },
  speed_mps: { short: 'm/s', long: 'metres per second', digits: 1 },
  duration_s: { short: 's', long: 'seconds', digits: 1 },
  reaction_ms: { short: 'ms', long: 'milliseconds', digits: 0 },
};

export function scoreUnit(spec: GameSpec): string {
  const m = scoreMeasure(spec);
  return (m && UNIT[m]?.short) || 'pts';
}

export function formatValue(value: number | null, measure: Measure | null): string {
  if (value === null) return '–';
  const u = measure ? UNIT[measure] : undefined;
  const digits = u ? u.digits : Number.isInteger(value) ? 0 : 1;
  return value.toFixed(digits);
}

export function sayValue(value: number, measure: Measure | undefined): string {
  const u = measure ? UNIT[measure] : undefined;
  if (!u) return `${Math.round(value * 10) / 10}`;
  return `${value.toFixed(u.digits)} ${u.long}`;
}

const EVENT_WORDS: Record<EventType, string> = {
  ball_release: 'Throw',
  ball_apex: 'Top of throw',
  ball_bounce: 'Bounce',
  ball_catch: 'Catch',
  ball_in_zone: 'In the zone',
  ball_out_of_frame: 'Ball out',
  jump: 'Jump',
  squat: 'Squat',
  punch: 'Punch',
  lean_left: 'Lean left',
  lean_right: 'Lean right',
  hands_up: 'Hands up',
  freeze: 'Freeze',
  touch_object: 'Touch',
  enter_zone: 'Enter zone',
  cross_line: 'Cross line',
  timer_end: 'Time up',
  round_start: 'Round start',
  round_end: 'Round end',
};

export function eventWord(e: EventType): string {
  return EVENT_WORDS[e];
}
