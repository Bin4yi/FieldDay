// The fixed building blocks a Game Spec is made from.
// The brain may only use these names. The engine only understands these names.

export const TRACKERS = ['person', 'hands', 'feet', 'head', 'ball', 'named_object', 'zone'] as const;
export type Tracker = (typeof TRACKERS)[number];

export const BALL_EVENTS = [
  'ball_release',
  'ball_apex',
  'ball_bounce',
  'ball_catch',
  'ball_in_zone',
  'ball_out_of_frame',
] as const;

export const BODY_EVENTS = [
  'jump',
  'squat',
  'punch',
  'lean_left',
  'lean_right',
  'hands_up',
  'freeze',
  'touch_object',
  'enter_zone',
  'cross_line',
] as const;

export const TIME_EVENTS = ['timer_end', 'round_start', 'round_end'] as const;

export const EVENT_TYPES = [...BALL_EVENTS, ...BODY_EVENTS, ...TIME_EVENTS] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Events that come from the camera or mic (not from the clock). */
export type SensedEventType = (typeof BALL_EVENTS)[number] | (typeof BODY_EVENTS)[number];

export const MEASURES = ['height_m', 'distance_m', 'speed_mps', 'count', 'duration_s', 'reaction_ms', 'streak'] as const;
export type Measure = (typeof MEASURES)[number];

export const TURN_ORDERS = ['turns', 'simultaneous'] as const;
export type TurnOrder = (typeof TURN_ORDERS)[number];

export const WIN_CONDITIONS = ['highest', 'lowest', 'first_to', 'last_standing', 'team_total', 'co_op'] as const;
export type WinCondition = (typeof WIN_CONDITIONS)[number];

export const PENALTIES = ['round_void', 'lose_life', 'points', 'end_turn', 'disqualify'] as const;
export type Penalty = (typeof PENALTIES)[number];

export const POWER_UPS = ['shield', 'steal', 'freeze', 'double'] as const;
export type PowerUpType = (typeof POWER_UPS)[number];

export const REFEREE_STYLES = ['football_announcer', 'wrestling_hype', 'calm_coach', 'robot_ref', 'pirate'] as const;
export type RefereeStyle = (typeof REFEREE_STYLES)[number];

export const GAME_MODES = [
  'solo',
  'turn_battle',
  'duel',
  'team',
  'boss_raid',
  'rule_draft',
  'chaos',
  'king_of_the_hill',
  'tournament',
] as const;
export type GameMode = (typeof GAME_MODES)[number];
