import type { EventType, GameSpec, Measure, RefereeMoment } from '@fieldday/engine';

// Small helpers to show and say game things in plain words.

const MODE_ICON: Record<string, string> = {
  solo: 'mode_solo',
  turn_battle: 'mode_turn_battle',
  duel: 'mode_duel',
  team: 'mode_team',
  boss_raid: 'mode_boss_raid',
  rule_draft: 'mode_rule_draft',
  chaos: 'mode_chaos',
  king_of_the_hill: 'mode_king_hill',
  tournament: 'mode_tournament',
};

export function modeIcon(spec: GameSpec): string {
  return `img/icons/${MODE_ICON[spec.mode ?? 'solo'] ?? 'mode_solo'}.webp`;
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

/**
 * Plain referee text for a moment. Phase 3 replaces this with styled line
 * banks; this version keeps Phase 1 playable and testable.
 */
export function describeMoment(m: RefereeMoment, names: string[], spec: GameSpec): string | null {
  const name = (p: number | null) => (p === null ? 'Everyone' : (names[p] ?? `Player ${p + 1}`));
  switch (m.kind) {
    case 'game_start':
      return `${spec.title}! ${spec.one_line_rules}`;
    case 'turn_start':
      if (m.player === null) return spec.rounds > 1 ? `Round ${m.round + 1}. Go!` : 'Go!';
      return m.toBeat !== null
        ? `${name(m.player)}, you're up. Score to beat: ${sayValue(m.toBeat, scoreMeasure(spec) ?? undefined)}.`
        : `${name(m.player)}, you're up!`;
    case 'score':
      if (m.value !== undefined && m.measure && m.measure !== 'count') return `${name(m.player)}: ${sayValue(m.value, m.measure)}!`;
      return null;
    case 'new_best':
      return `New personal best for ${name(m.player)}!`;
    case 'foul':
      return m.event === 'timer_end' ? `Time! ${name(m.player)} missed it.` : `Foul! ${name(m.player)}.`;
    case 'life_lost':
      return m.lives > 0 ? `${name(m.player)} loses a life. ${m.lives} left.` : null;
    case 'out':
      return `${name(m.player)} is out!`;
    case 'call':
      return `${eventWord(m.event).toUpperCase()}!`;
    case 'call_end':
      return null;
    case 'boss_hit':
      return null;
    case 'boss_defeated':
      return `The boss is down! You did it together!`;
    case 'lead_change':
      return `${name(m.player)} takes the lead!`;
    case 'turn_end':
      return null;
    case 'game_over':
      if (spec.win_condition === 'co_op') return m.winners.length ? 'Victory!' : 'The boss survived. Rematch?';
      if (m.winningTeams.length) return `${m.winningTeams.join(' and ')} wins!`;
      if (m.winners.length === 0) return 'Game over!';
      return `Game over! ${m.winners.map((p) => name(p)).join(' and ')} wins!`;
  }
}
