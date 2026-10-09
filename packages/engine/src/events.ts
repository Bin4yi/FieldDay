import { z } from 'zod';
import { EventTypeSchema, MeasureSchema } from './spec.js';

/**
 * Something that happened in the real world, as seen by the camera/mic.
 * The vision layer makes these. The engine never sees pixels.
 */
export const GameEventSchema = z.object({
  type: EventTypeSchema,
  /** Time in ms (any clock, but the same clock for the whole game). */
  t: z.number(),
  /** Player index. In turn mode it can be left out: the current player is used. */
  player: z.number().int().min(0).max(7).optional(),
  /** Named zone or object, e.g. "goal". */
  target: z.string().max(40).optional(),
  measures: z.partialRecord(MeasureSchema, z.number()).optional(),
});

export type GameEvent = z.infer<typeof GameEventSchema>;
