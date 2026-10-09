import { z } from 'zod';
import { GameSpecSchema, MeasureSchema, getTemplate, parseCondition } from '@fieldday/engine';

// A quest is a chain of outdoor steps: games, walking, finding things.
// No step may ask for a real address or a live location. Quests must work
// in any normal park or open ground.

const goal = z
  .string()
  .min(1)
  .max(80)
  .superRefine((text, ctx) => {
    const r = parseCondition(text);
    if (!r.ok) ctx.addIssue({ code: 'custom', message: r.error });
    else if (r.clauses.some((c) => c.kind !== 'compare')) {
      ctx.addIssue({ code: 'custom', message: 'a goal can only compare measures, e.g. "count >= 20"' });
    }
  });

const instruction = z.string().min(1).max(140);

const GameStepSchema = z.object({
  type: z.enum(['game', 'boss']),
  /** A template id ("sky_toss") ... */
  spec_ref: z.string().min(1).max(40).optional(),
  /** ... or a full custom game. */
  spec: GameSpecSchema.optional(),
  goal: goal.optional(),
});

const CheckStepSchema = z.object({
  type: z.enum(['move', 'find']),
  instruction,
  /** photo = on-device photo check; confirm = the players tap "done". */
  check: z.enum(['photo', 'confirm']),
  photo_task: z.string().min(1).max(60).optional(),
});

export const QuestStepSchema = z
  .discriminatedUnion('type', [
    GameStepSchema.extend({ type: z.literal('game') }),
    GameStepSchema.extend({ type: z.literal('boss') }),
    CheckStepSchema.extend({ type: z.literal('move') }),
    CheckStepSchema.extend({ type: z.literal('find') }),
  ])
  .superRefine((step, ctx) => {
    if (step.type === 'game' || step.type === 'boss') {
      if ((step.spec_ref === undefined) === (step.spec === undefined)) {
        ctx.addIssue({ code: 'custom', message: 'a game step needs exactly one of spec_ref or spec' });
      } else if (step.spec_ref !== undefined && !getTemplate(step.spec_ref)) {
        ctx.addIssue({ code: 'custom', path: ['spec_ref'], message: `unknown game "${step.spec_ref}"` });
      }
    } else if (step.check === 'photo' && !step.photo_task) {
      ctx.addIssue({ code: 'custom', path: ['photo_task'], message: 'a photo check needs photo_task' });
    }
  });

export const QUEST_KINDS = ['chain', 'relay', 'daily', 'battle'] as const;

export const QuestSpecSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(60)
    .optional(),
  title: z.string().min(1).max(50),
  kind: z.enum(QUEST_KINDS).default('chain'),
  players: z.number().int().min(1).max(8).optional(),
  minutes: z.number().int().min(1).max(180).optional(),
  steps: z.array(QuestStepSchema).min(1).max(12),
  reward: z.object({ badge: z.string().min(1).max(40).optional(), xp: z.number().int().min(0).max(5000) }),
});

/** A big goal a whole crew or room works on together, e.g. "throw 100 metres this week". */
export const SharedQuestSpecSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  title: z.string().min(1).max(60),
  measure: MeasureSchema,
  /** Which game the results must come from (any game if left out). */
  spec_ref: z.string().min(1).max(40).optional(),
  target: z.number().positive().max(1_000_000),
  scope: z.enum(['crew', 'room']),
  /** Unix ms. */
  ends_at: z.number().int().optional(),
});

export type QuestSpec = z.infer<typeof QuestSpecSchema>;
export type QuestSpecInput = z.input<typeof QuestSpecSchema>;
export type QuestStep = z.infer<typeof QuestStepSchema>;
export type SharedQuestSpec = z.infer<typeof SharedQuestSpecSchema>;

export type QuestResult = { ok: true; quest: QuestSpec } | { ok: false; errors: string[] };

export function validateQuest(input: unknown): QuestResult {
  const r = QuestSpecSchema.safeParse(input);
  if (r.success) return { ok: true, quest: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}
