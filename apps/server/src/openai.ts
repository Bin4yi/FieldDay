import { z } from 'zod';
import { designPrompt, questPrompt, remixPrompt, repairPrompt } from '@fieldday/brain';
import { GameSpecSchema, type GameSpec } from '@fieldday/engine';
import { QuestSpecSchema } from '@fieldday/quests';
import type { ServerConfig } from './app.js';

// Boost Mode: the server talks to OpenAI so the API key never reaches a phone.
// Model names come from env vars (OPENAI_DESIGN_MODEL, OPENAI_VISION_MODEL,
// OPENAI_REALTIME_MODEL). Requests follow the Responses API and the GA
// Realtime client-secret API.

const DEFAULT_API = 'https://api.openai.com/v1';

export class BoostOff extends Error {
  constructor(what: string) {
    super(`Boost Mode is off on this server (${what} not set).`);
  }
}

function schemaFor(s: z.ZodType): Record<string, unknown> {
  const { $schema: _s, ...rest } = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
}

const GAME_SCHEMA = schemaFor(GameSpecSchema);
const QUEST_SCHEMA = schemaFor(QuestSpecSchema);
const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    confidence: { type: 'number' },
    labels: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'confidence', 'labels'],
  additionalProperties: false,
};

/** Text of a Responses API result (raw HTTP: output[].content[].text). */
export function outputText(res: unknown): string {
  const r = res as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (typeof r.output_text === 'string') return r.output_text;
  return (r.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
}

export const JsonTaskSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('design'),
    request: z.string().min(1).max(500),
    ctx: z.object({
      players: z.number().int().min(1).max(8),
      kidsMode: z.boolean(),
      refereeStyle: z.string().max(40),
      objects: z.array(z.string().max(40)).max(10).optional(),
    }),
  }),
  z.object({ task: z.literal('repair'), bad: z.unknown(), errors: z.array(z.string().max(300)).max(20) }),
  z.object({ task: z.literal('remix'), spec: GameSpecSchema, change: z.string().min(1).max(300) }),
  z.object({
    task: z.literal('quest'),
    request: z.string().min(1).max(500),
    ctx: z.object({ players: z.number().int().min(1).max(8), kidsMode: z.boolean(), minutes: z.number().optional() }),
  }),
  z.object({ task: z.literal('repair_quest'), bad: z.unknown(), errors: z.array(z.string().max(300)).max(20) }),
]);
export type JsonTask = z.infer<typeof JsonTaskSchema>;

export class OpenAIProxy {
  constructor(
    private cfg: ServerConfig,
    private f: typeof fetch = fetch,
  ) {}

  private get api(): string {
    return (this.cfg.baseUrl ?? DEFAULT_API).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return !!this.cfg.openaiKey;
  }

  private async responses(model: string | undefined, input: unknown, format: { name: string; schema: Record<string, unknown> }) {
    if (!this.cfg.openaiKey) throw new BoostOff('OPENAI_API_KEY');
    if (!model) throw new BoostOff('model name');
    const res = await this.f(`${this.api}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        // Not strict: our zod schemas have optional fields; the app validates
        // with zod and repairs once anyway.
        text: { format: { type: 'json_schema', name: format.name, schema: format.schema, strict: false } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = outputText(await res.json());
    return JSON.parse(text) as unknown;
  }

  /** Game/quest design, repair and remix with structured outputs. */
  json(t: JsonTask): Promise<unknown> {
    const model = this.cfg.designModel;
    switch (t.task) {
      case 'design':
        return this.responses(model, designPrompt(t.request, { ...t.ctx, refereeStyle: t.ctx.refereeStyle as GameSpec['referee_style'] }), {
          name: 'game_spec',
          schema: GAME_SCHEMA,
        });
      case 'repair':
        return this.responses(model, repairPrompt(JSON.stringify(t.bad).slice(0, 4000), t.errors), { name: 'game_spec', schema: GAME_SCHEMA });
      case 'remix':
        return this.responses(model, remixPrompt(t.spec, t.change), { name: 'game_spec', schema: GAME_SCHEMA });
      case 'quest':
        return this.responses(model, questPrompt(t.request, t.ctx), { name: 'quest_spec', schema: QUEST_SCHEMA });
      case 'repair_quest':
        return this.responses(model, repairPrompt(JSON.stringify(t.bad).slice(0, 4000), t.errors), { name: 'quest_spec', schema: QUEST_SCHEMA });
    }
  }

  /** Quest photo check with a vision model. The photo is not stored. */
  async photo(imageDataUrl: string, task: string): Promise<{ passed: boolean; confidence: number; labels: string[] }> {
    const out = await this.responses(
      this.cfg.visionModel,
      [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Quest photo check for a kids-friendly outdoor game. Does this photo clearly show: "${task}"? Answer JSON with passed, confidence (0-1) and up to 5 short labels of what you see. Do not describe people.`,
            },
            { type: 'input_image', image_url: imageDataUrl, detail: 'low' },
          ],
        },
      ],
      { name: 'photo_check', schema: PHOTO_SCHEMA },
    );
    const r = z.object({ passed: z.boolean(), confidence: z.number(), labels: z.array(z.string()) }).parse(out);
    return { ...r, labels: r.labels.slice(0, 5) };
  }

  /** Short-lived token for the browser's live Realtime voice referee. */
  async realtimeToken(style: string, kids: boolean): Promise<{ value: string; expires_at: number; model: string }> {
    if (!this.cfg.openaiKey) throw new BoostOff('OPENAI_API_KEY');
    const model = this.cfg.realtimeModel;
    if (!model) throw new BoostOff('OPENAI_REALTIME_MODEL');
    const instructions = [
      `You are the live referee of FieldDay, an outdoor game. Voice: ${style.replace(/_/g, ' ')}.`,
      'When you get a game moment, say ONE short line (under 15 words) out loud, with energy.',
      'Friendly only: no insults about bodies, ability or identity. Never invent scores; use the numbers given.',
      kids ? 'Kids are playing: be gentle and encouraging, no teasing.' : 'Light friendly trash talk is fine.',
    ].join(' ');
    const res = await this.f(`${this.api}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: { type: 'realtime', model, instructions, output_modalities: ['audio'], audio: { output: { voice: 'marin' } } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { value: string; expires_at: number };
    return { value: body.value, expires_at: body.expires_at, model };
  }
}
