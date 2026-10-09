import { z } from 'zod';
import {
  EVENT_TYPES,
  GAME_MODES,
  MEASURES,
  PENALTIES,
  POWER_UPS,
  REFEREE_STYLES,
  TRACKERS,
  TURN_ORDERS,
  WIN_CONDITIONS,
} from './blocks.js';
import { parseCondition } from './condition.js';

export const MAX_PLAYERS = 8;

const condition = z
  .string()
  .min(1)
  .max(120)
  .superRefine((text, ctx) => {
    const r = parseCondition(text);
    if (!r.ok) ctx.addIssue({ code: 'custom', message: r.error });
  });

export const EventTypeSchema = z.enum(EVENT_TYPES);
export const MeasureSchema = z.enum(MEASURES);

/** Which event to listen for. `target` narrows it to a named zone or object (e.g. "goal"). */
export const EventMatchSchema = z.object({
  event: EventTypeSchema,
  target: z.string().min(1).max(40).optional(),
  condition: condition.optional(),
});

export const ScoringRuleSchema = z
  .object({
    event: EventTypeSchema,
    target: z.string().min(1).max(40).optional(),
    measure: MeasureSchema.optional(),
    /** A fixed number of points, or "measure" to use the measured value as points. */
    points: z.union([z.number().min(-10000).max(10000), z.literal('measure')]),
    condition: condition.optional(),
    /** Only the first matching event in a turn scores. */
    once_per_turn: z.boolean().optional(),
  })
  .refine((r) => r.points !== 'measure' || r.measure !== undefined, {
    message: 'points "measure" needs a measure',
    path: ['measure'],
  });

export const FoulRuleSchema = z
  .object({
    event: EventTypeSchema,
    target: z.string().min(1).max(40).optional(),
    condition: condition.optional(),
    penalty: z.enum(PENALTIES),
    /** For penalty "points": points added to the score (use a negative number to take points away). */
    points: z.number().min(-10000).max(10000).optional(),
  })
  .refine((f) => f.penalty !== 'points' || f.points !== undefined, {
    message: 'penalty "points" needs points',
    path: ['points'],
  });

export const PowerUpSchema = z.object({
  type: z.enum(POWER_UPS),
  /** Earn it by doing `event` this many times in a game. */
  earn: z.object({ event: EventTypeSchema, count: z.number().int().min(1).max(100) }),
});

export const HandicapSchema = z.object({
  player: z.number().int().min(0).max(MAX_PLAYERS - 1),
  /** Points this player scores are multiplied by this. */
  multiplier: z.number().min(0.25).max(4).optional(),
  /** Make this player's target zone bigger (1 = normal). Used by the vision layer. */
  zone_scale: z.number().min(0.5).max(3).optional(),
  /** Give this player a different turn timer. */
  timer_s: z.number().min(1).max(600).optional(),
});

export const CallsSchema = z.object({
  /** Moves the referee can shout, e.g. FREEZE or HANDS UP. */
  events: z.array(EventTypeSchema).min(1).max(8),
  /** First call this many seconds after the turn starts, then again every `every_s`. */
  every_s: z.number().min(1).max(120),
  /** How long a call stays active. */
  window_s: z.number().min(0.5).max(30),
});

export const TeamSchema = z.object({
  name: z.string().min(1).max(24),
  players: z.array(z.number().int().min(0).max(MAX_PLAYERS - 1)).min(1),
});

export const GameSpecSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(40)
      .optional(),
    title: z.string().min(1).max(40),
    one_line_rules: z
      .string()
      .min(1)
      .max(160)
      .refine((s) => s.trim().split(/\s+/).length <= 20, { message: 'one_line_rules must be 20 words or fewer' }),
    mode: z.enum(GAME_MODES).optional(),
    players: z.number().int().min(1).max(MAX_PLAYERS),
    /** Allowed player range when picking a template. `players` is the default. */
    min_players: z.number().int().min(1).max(MAX_PLAYERS).optional(),
    max_players: z.number().int().min(1).max(MAX_PLAYERS).optional(),
    teams: z.array(TeamSchema).min(2).max(4).optional(),
    turn_order: z.enum(TURN_ORDERS),
    rounds: z.number().int().min(1).max(20),
    lives: z.number().int().min(1).max(10).optional(),
    /** Turn length (turns) or round length (simultaneous). */
    timer_s: z.number().min(1).max(600).optional(),
    /** Events that end the current player's turn. */
    turn_end: z.array(EventMatchSchema).max(6).optional(),
    trackers: z.array(z.enum(TRACKERS)).min(1),
    /** Named objects / zones the players set up, e.g. ["goal"]. */
    targets: z.array(z.string().min(1).max(40)).max(6).optional(),
    scoring: z.array(ScoringRuleSchema).min(1).max(12),
    fouls: z.array(FoulRuleSchema).max(8).default([]),
    /** How round scores add up: sum all rounds, or keep the best round. */
    aggregate: z.enum(['sum', 'best']).default('sum'),
    win_condition: z.enum(WIN_CONDITIONS),
    /** For first_to: points needed to win. */
    target_score: z.number().min(1).max(10000).optional(),
    calls: CallsSchema.optional(),
    /** For co_op (Boss Raid): the boss. Points deal damage. */
    boss: z.object({ name: z.string().min(1).max(30), hp: z.number().int().min(1).max(100000) }).optional(),
    power_ups: z.array(PowerUpSchema).max(4).optional(),
    handicaps: z.array(HandicapSchema).max(MAX_PLAYERS).optional(),
    referee_style: z.enum(REFEREE_STYLES).default('football_announcer'),
    hype_lines: z.array(z.string().max(80)).max(8).optional(),
  })
  .superRefine((s, ctx) => {
    if (s.win_condition === 'first_to' && s.target_score === undefined) {
      ctx.addIssue({ code: 'custom', path: ['target_score'], message: 'first_to needs target_score' });
    }
    if (s.win_condition === 'last_standing' && s.lives === undefined) {
      ctx.addIssue({ code: 'custom', path: ['lives'], message: 'last_standing needs lives' });
    }
    if (s.win_condition === 'co_op' && s.boss === undefined) {
      ctx.addIssue({ code: 'custom', path: ['boss'], message: 'co_op needs a boss' });
    }
    if (s.win_condition === 'team_total' && s.teams === undefined) {
      ctx.addIssue({ code: 'custom', path: ['teams'], message: 'team_total needs teams' });
    }
    if (s.min_players !== undefined && s.min_players > s.players) {
      ctx.addIssue({ code: 'custom', path: ['min_players'], message: 'min_players is more than players' });
    }
    if (s.max_players !== undefined && s.max_players < s.players) {
      ctx.addIssue({ code: 'custom', path: ['max_players'], message: 'max_players is less than players' });
    }
    s.teams?.forEach((t, i) =>
      t.players.forEach((p) => {
        if (p >= s.players) {
          ctx.addIssue({ code: 'custom', path: ['teams', i], message: `team player ${p} does not exist` });
        }
      }),
    );
    const usesCall = [...s.scoring, ...s.fouls].some((r) => r.condition && /\bcall\b/.test(r.condition));
    if (usesCall && !s.calls) {
      ctx.addIssue({ code: 'custom', path: ['calls'], message: 'rules mention "call" but there are no calls' });
    }
    if (s.turn_order === 'simultaneous' && s.timer_s === undefined && !s.turn_end?.length) {
      ctx.addIssue({ code: 'custom', path: ['timer_s'], message: 'simultaneous play needs timer_s or turn_end' });
    }
  });

export type GameSpec = z.infer<typeof GameSpecSchema>;
/** What the brain writes. Defaults are filled in by parsing. */
export type GameSpecInput = z.input<typeof GameSpecSchema>;
export type ScoringRule = z.infer<typeof ScoringRuleSchema>;
export type FoulRule = z.infer<typeof FoulRuleSchema>;
export type EventMatch = z.infer<typeof EventMatchSchema>;

export type SpecResult = { ok: true; spec: GameSpec } | { ok: false; errors: string[] };

/** Validate unknown JSON (e.g. from a brain) and return short, readable errors for a repair prompt. */
export function validateSpec(input: unknown): SpecResult {
  const r = GameSpecSchema.safeParse(input);
  if (r.success) return { ok: true, spec: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}

/** Return a copy of the spec set up for a different number of players (if the spec allows it). */
export function withPlayers(spec: GameSpec, players: number): GameSpec {
  const min = spec.min_players ?? spec.players;
  const max = spec.max_players ?? spec.players;
  const n = Math.max(min, Math.min(max, players));
  const teams = spec.teams?.map((t) => ({ ...t, players: t.players.filter((p) => p < n) }));
  const handicaps = spec.handicaps?.filter((h) => h.player < n);
  return {
    ...spec,
    players: n,
    ...(teams ? { teams } : {}),
    ...(handicaps ? { handicaps } : {}),
  };
}
