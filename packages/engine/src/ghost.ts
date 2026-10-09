import { z } from 'zod';
import { canonicalJson } from './code.js';
import type { GameResult } from './engine.js';
import { packJson, unpackJson } from './pack.js';
import { GameSpecSchema, MeasureSchema, type GameSpec } from './spec.js';
import { getTemplate } from './templates.js';

// Ghost Challenge: your game, your scores and your best moment, packed small
// enough for a QR code. A friend plays the same game and races your ghost.
// No video, ever.

export const GhostSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(24),
  /** Template id when the game is a plain template (keeps the QR small)… */
  ref: z.string().max(40).optional(),
  /** …or the whole spec for custom games. */
  spec: GameSpecSchema.optional(),
  rounds: z.array(z.number().nullable()).max(20),
  total: z.number().nullable(),
  best: z.object({ measure: MeasureSchema, value: z.number() }).optional(),
  at: z.number(),
});

export type Ghost = z.infer<typeof GhostSchema>;

export const GHOST_PREFIX = 'FDG1';

export function makeGhost(spec: GameSpec, result: GameResult, player: number, name: string, at: number): Ghost {
  const p = result.players[player]!;
  const template = spec.id ? getTemplate(spec.id) : undefined;
  const same = template && canonicalJson(template) === canonicalJson({ ...spec, players: template.players });
  const measure = spec.scoring.find((r) => r.points === 'measure')?.measure;
  const bestValue = measure ? p.stats.best[measure] : undefined;
  return {
    v: 1,
    name,
    ...(same ? { ref: spec.id! } : { spec: { ...spec, players: 1, min_players: 1, teams: undefined, handicaps: undefined } }),
    rounds: p.rounds,
    total: result.totals[player] ?? null,
    ...(measure && bestValue !== undefined ? { best: { measure, value: bestValue } } : {}),
    at,
  };
}

export function ghostSpec(g: Ghost): GameSpec | null {
  if (g.spec) return g.spec;
  return g.ref ? (getTemplate(g.ref) ?? null) : null;
}

export function encodeGhost(g: Ghost): string {
  return packJson(GHOST_PREFIX, g);
}

export function decodeGhost(text: string): Ghost {
  return GhostSchema.parse(unpackJson(GHOST_PREFIX, text));
}

/** Is the player ahead of the ghost? Compares like the game does (highest/lowest). */
export function aheadOfGhost(spec: GameSpec, mine: number | null, ghost: number | null): boolean | null {
  if (mine === null || ghost === null) return null;
  return spec.win_condition === 'lowest' ? mine < ghost : mine > ghost;
}
