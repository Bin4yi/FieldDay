import type { GameSpec, RefereeMoment, RefereeStyle } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';
import { designGame, designQuest, remixGame, type DesignOutcome, type QuestOutcome, type SpecModel } from './design.js';
import { extractJson } from './json.js';
import { judgePhoto, type PhotoFacts } from './photo.js';
import { designPrompt, questPrompt, remixPrompt, repairPrompt } from './prompts.js';
import { refereeText, type LineContext } from './referee.js';
import { checkSpec } from './safety.js';
import type { Brain, DesignContext, PhotoCheck, QuestContext, SafetyResult } from './types.js';

/** Anything that turns a prompt into text: MediaPipe LLM Inference on the phone, or a test fake. */
export interface LlmRunner {
  generate(prompt: string): Promise<string>;
}

/** A brain that also explains what happened (fallbacks, notes). */
export interface SmartBrain extends Brain {
  design(request: string, ctx: DesignContext): Promise<DesignOutcome>;
  remix(spec: GameSpec, change: string): Promise<DesignOutcome>;
  quest(request: string, ctx: QuestContext): Promise<QuestOutcome>;
}

export class GemmaModel implements SpecModel {
  constructor(private runner: LlmRunner) {}
  async design(request: string, ctx: DesignContext) {
    return extractJson(await this.runner.generate(designPrompt(request, ctx)));
  }
  async repair(bad: unknown, errors: string[]) {
    return extractJson(await this.runner.generate(repairPrompt(JSON.stringify(bad), errors)));
  }
  async remix(spec: GameSpec, change: string) {
    return extractJson(await this.runner.generate(remixPrompt(spec, change)));
  }
  async quest(request: string, ctx: QuestContext) {
    return extractJson(await this.runner.generate(questPrompt(request, ctx)));
  }
  async repairQuest(bad: unknown, errors: string[]) {
    return extractJson(await this.runner.generate(`${repairPrompt(JSON.stringify(bad), errors)}`));
  }
}

/**
 * Open Mode brain. Uses Gemma on the phone when the model is loaded;
 * without it, the same pipeline runs on rules and templates (still offline).
 */
export class GemmaBrain implements SmartBrain {
  readonly id = 'gemma' as const;
  private model: GemmaModel | null;

  constructor(
    runner: LlmRunner | null,
    private photoFacts?: (image: Blob) => Promise<PhotoFacts>,
  ) {
    this.model = runner ? new GemmaModel(runner) : null;
  }

  setRunner(runner: LlmRunner | null) {
    this.model = runner ? new GemmaModel(runner) : null;
  }

  get hasModel(): boolean {
    return this.model !== null;
  }

  async isAvailable() {
    return true; // rules + templates always work offline
  }

  design(request: string, ctx: DesignContext) {
    return designGame(request, ctx, this.model);
  }

  remix(spec: GameSpec, change: string) {
    return remixGame(spec, change, this.model);
  }

  quest(request: string, ctx: QuestContext) {
    return designQuest(request, ctx, this.model);
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

  private lineCtx: LineContext | null = null;

  /** Names and game for referee lines (set when a game starts). */
  setLineContext(ctx: LineContext) {
    this.lineCtx = ctx;
  }

  /** Instant: hand-written line banks, slots filled in. */
  async refereeLine(event: RefereeMoment, style: RefereeStyle): Promise<string> {
    if (!this.lineCtx) return '';
    return refereeText(event, style, this.lineCtx) ?? '';
  }

  async checkPhoto(image: Blob, task: string): Promise<PhotoCheck> {
    if (!this.photoFacts) return { passed: true, confidence: 0, labels: [] };
    return judgePhoto(task, await this.photoFacts(image));
  }
}
