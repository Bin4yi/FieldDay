import type { GameSpec, RefereeMoment, RefereeStyle } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';
import { designGame, designQuest, remixGame, type SpecModel } from './design.js';
import type { SmartBrain } from './gemma.js';
import { refereeText, type LineContext } from './referee.js';
import { checkSpec } from './safety.js';
import type { DesignContext, PhotoCheck, QuestContext, SafetyResult } from './types.js';

// Boost Mode brain. Every call goes through the FieldDay server (the API key
// never reaches the phone). The same pipeline as Gemma runs on top: safety,
// feasibility, zod validation, one repair, template fallback.

export type Post = (path: string, body: unknown) => Promise<unknown>;

class OpenAIModel implements SpecModel {
  constructor(private post: Post) {}
  private async json(body: unknown) {
    const r = (await this.post('/openai/json', body)) as { result: unknown };
    return r.result;
  }
  design(request: string, ctx: DesignContext) {
    return this.json({ task: 'design', request, ctx });
  }
  repair(bad: unknown, errors: string[]) {
    return this.json({ task: 'repair', bad, errors });
  }
  remix(spec: GameSpec, change: string) {
    return this.json({ task: 'remix', spec, change });
  }
  quest(request: string, ctx: QuestContext) {
    return this.json({ task: 'quest', request, ctx });
  }
  repairQuest(bad: unknown, errors: string[]) {
    return this.json({ task: 'repair_quest', bad, errors });
  }
}

export class OpenAIBrain implements SmartBrain {
  readonly id = 'openai' as const;
  private model: OpenAIModel;
  private lineCtx: LineContext | null = null;

  constructor(
    private post: Post,
    private health: () => Promise<boolean>,
    private toDataUrl: (b: Blob) => Promise<string>,
  ) {
    this.model = new OpenAIModel(post);
  }

  isAvailable() {
    return this.health();
  }

  /**
   * Unlike Gemma, a failed OpenAI call must throw (so the router falls back
   * to Gemma) instead of quietly using a template.
   */
  private strict(): SpecModel {
    return {
      design: (r, c) => this.model.design(r, c),
      repair: (b, e) => this.model.repair(b, e),
      remix: (s, c) => this.model.remix(s, c),
      quest: (r, c) => this.model.quest(r, c),
      repairQuest: (b, e) => this.model.repairQuest(b, e),
    };
  }

  async design(request: string, ctx: DesignContext) {
    if (!(await this.health())) throw new Error('Boost Mode server not reachable');
    const o = await designGame(request, ctx, this.strict());
    if (o.kind === 'game' && o.source === 'template') throw new Error('OpenAI answer failed validation');
    return o;
  }

  async remix(spec: GameSpec, change: string) {
    return remixGame(spec, change, this.strict());
  }

  async quest(request: string, ctx: QuestContext) {
    if (!(await this.health())) throw new Error('Boost Mode server not reachable');
    return designQuest(request, ctx, this.strict());
  }

  async designGame(prompt: string, ctx: DesignContext): Promise<GameSpec> {
    const o = await this.design(prompt, ctx);
    if (o.kind === 'game') return o.spec;
    if (o.kind === 'infeasible') return o.nearest;
    throw new Error(o.reason);
  }

  async remixGame(spec: GameSpec, change: string): Promise<GameSpec> {
    const o = await this.remix(spec, change);
    if (o.kind === 'game') return o.spec;
    throw new Error(o.kind === 'unsafe' ? o.reason : o.why);
  }

  async designQuest(prompt: string, ctx: QuestContext): Promise<QuestSpec> {
    const o = await this.quest(prompt, ctx);
    if (o.kind === 'quest') return o.quest;
    throw new Error(o.reason);
  }

  async checkSafety(spec: GameSpec | QuestSpec): Promise<SafetyResult> {
    return checkSpec(spec);
  }

  setLineContext(ctx: LineContext) {
    this.lineCtx = ctx;
  }

  async refereeLine(event: RefereeMoment, style: RefereeStyle): Promise<string> {
    return this.lineCtx ? (refereeText(event, style, this.lineCtx) ?? '') : '';
  }

  async checkPhoto(image: Blob, task: string): Promise<PhotoCheck> {
    const r = (await this.post('/openai/vision', { image: await this.toDataUrl(image), task })) as PhotoCheck;
    return r;
  }
}
