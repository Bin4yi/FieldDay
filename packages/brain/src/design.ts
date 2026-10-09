import { getTemplate, validateSpec, withPlayers, type GameSpec } from '@fieldday/engine';
import { generateQuest, validateQuest, type QuestSpec } from '@fieldday/quests';
import { checkFeasible } from './feasibility.js';
import { rulesDesign, rulesRemix, readNumbers } from './rules.js';
import { checkSpec, checkText } from './safety.js';
import type { DesignContext, QuestContext } from './types.js';

// The design pipeline, shared by both brains:
//   safety check → feasibility check → model → validate → repair once →
//   template fallback → safety check on the result.

export interface SpecModel {
  design(request: string, ctx: DesignContext): Promise<unknown>;
  repair(bad: unknown, errors: string[]): Promise<unknown>;
  remix?(spec: GameSpec, change: string): Promise<unknown>;
  quest?(request: string, ctx: QuestContext): Promise<unknown>;
  repairQuest?(bad: unknown, errors: string[]): Promise<unknown>;
}

export type Source = 'model' | 'repaired' | 'template' | 'rules';

export type DesignOutcome =
  | { kind: 'game'; spec: GameSpec; source: Source; notes: string[] }
  | { kind: 'unsafe'; reason: string; saferPrompt?: string }
  | { kind: 'infeasible'; why: string; nearest: GameSpec };

export type QuestOutcome =
  | { kind: 'quest'; quest: QuestSpec; source: Source; notes: string[] }
  | { kind: 'unsafe'; reason: string; saferPrompt?: string };

function finish(spec: GameSpec, ctx: DesignContext): GameSpec {
  let s = spec;
  if (ctx.kidsMode) s = { ...s, referee_style: 'calm_coach' };
  return s;
}

export async function designGame(request: string, ctx: DesignContext, model: SpecModel | null): Promise<DesignOutcome> {
  const safety = checkText(request);
  if (!safety.safe) return { kind: 'unsafe', reason: safety.reason ?? 'That game is not safe.', ...(safety.saferPrompt ? { saferPrompt: safety.saferPrompt } : {}) };

  const feasible = checkFeasible(request);
  if (!feasible.ok) {
    const nearest = getTemplate(feasible.nearest ?? 'sky_toss')!;
    return { kind: 'infeasible', why: feasible.why ?? 'The camera cannot referee that.', nearest: withPlayers(nearest, ctx.players) };
  }

  const notes: string[] = [];
  const rules = () => {
    const { spec, match } = rulesDesign(request, ctx.players);
    if (match.score === 0) notes.push('I did not catch the game type, so here is Sky Toss. Try words like throw, jump, squat or catch.');
    return spec;
  };

  let spec: GameSpec | null = null;
  let source: Source = 'rules';
  if (model) {
    let raw: unknown = null;
    try {
      raw = await model.design(request, ctx);
      const v = validateSpec(raw);
      if (v.ok) {
        spec = v.spec;
        source = 'model';
      } else {
        const fixed = await model.repair(raw, v.errors);
        const v2 = validateSpec(fixed);
        if (v2.ok) {
          spec = v2.spec;
          source = 'repaired';
        }
      }
    } catch {
      // Model failed or gave no JSON: fall through to the template.
    }
    if (!spec) {
      notes.push('The brain’s game did not pass the rule check, so I picked the closest ready-made game.');
      source = 'template';
    }
  }
  spec ??= rules();

  // Respect an explicit player count from the request.
  const nums = readNumbers(request);
  const wanted = nums.players ?? ctx.players;
  if (spec.players !== wanted && wanted >= 1 && wanted <= 8) {
    spec = withPlayers({ ...spec, min_players: Math.min(spec.min_players ?? spec.players, wanted), max_players: Math.max(spec.max_players ?? spec.players, wanted) }, wanted);
  }

  const after = checkSpec(spec);
  if (!after.safe) {
    notes.push('The designed game had an unsafe part, so I switched to a safe ready-made game.');
    spec = rules();
    source = 'template';
  }
  return { kind: 'game', spec: finish(spec, ctx), source, notes };
}

export async function remixGame(spec: GameSpec, change: string, model: SpecModel | null): Promise<DesignOutcome> {
  const safety = checkText(change);
  if (!safety.safe) return { kind: 'unsafe', reason: safety.reason ?? 'That change is not safe.' };
  if (model?.remix) {
    try {
      const raw = await model.remix(spec, change);
      let v = validateSpec(raw);
      let source: Source = 'model';
      if (!v.ok) {
        v = validateSpec(await model.repair(raw, v.errors));
        source = 'repaired';
      }
      if (v.ok && checkSpec(v.spec).safe) return { kind: 'game', spec: { ...v.spec, ...(spec.id ? { id: spec.id } : {}) }, source, notes: [] };
    } catch {
      // fall back to rules
    }
  }
  const r = rulesRemix(spec, change);
  return {
    kind: 'game',
    spec: r.spec,
    source: 'rules',
    notes: r.understood ? [] : ['I added that as a house rule. The referee will remind everyone, but cannot check it.'],
  };
}

export async function designQuest(request: string, ctx: QuestContext, model: SpecModel | null, seed = Date.now()): Promise<QuestOutcome> {
  const safety = checkText(request);
  if (!safety.safe) return { kind: 'unsafe', reason: safety.reason ?? 'That quest is not safe.', ...(safety.saferPrompt ? { saferPrompt: safety.saferPrompt } : {}) };
  const notes: string[] = [];
  if (model?.quest) {
    try {
      const raw = await model.quest(request, ctx);
      let v = validateQuest(raw);
      let source: Source = 'model';
      if (!v.ok && model.repairQuest) {
        v = validateQuest(await model.repairQuest(raw, v.errors));
        source = 'repaired';
      }
      if (v.ok && checkSpec(v.quest).safe) return { kind: 'quest', quest: v.quest, source, notes };
      notes.push('The brain’s quest did not pass the rule check, so I built one from ready-made steps.');
    } catch {
      notes.push('The brain had trouble, so I built a quest from ready-made steps.');
    }
  }
  const nums = readNumbers(request);
  const quest = generateQuest({
    seed,
    minutes: ctx.minutes ?? (nums.timerS ? Math.round(nums.timerS / 60) : 20),
    players: nums.players ?? ctx.players,
    kids: ctx.kidsMode || !!nums.kids,
    ...(/relay/i.test(request) ? { kind: 'relay' as const } : {}),
  });
  return { kind: 'quest', quest, source: model ? 'template' : 'rules', notes };
}
