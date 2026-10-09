import { evalGoal, getTemplate, type GameSpec, type Measure, type PlayerStats } from '@fieldday/engine';
import type { QuestSpec, QuestStep } from './spec.js';

export type StepOutcome = { step: number; passed: boolean; player: number | null; at: number };

export type QuestStatus = 'active' | 'done';

export interface QuestRunState {
  stepIndex: number;
  status: QuestStatus;
  outcomes: StepOutcome[];
  startedAt: number;
  finishedAt: number | null;
}

/** Turn a player's game stats into the measures a quest goal can check. */
export function goalMeasures(stats: PlayerStats): Partial<Record<Measure, number>> {
  return { ...stats.best, count: stats.count };
}

/** The game a step should play. */
export function stepGame(step: QuestStep): GameSpec | undefined {
  if (step.type !== 'game' && step.type !== 'boss') return undefined;
  return step.spec ?? (step.spec_ref ? getTemplate(step.spec_ref) : undefined);
}

/**
 * Walks through a quest one step at a time.
 * A failed game goal can be retried: the step stays current until it passes.
 * In a relay quest each step belongs to the next player, like a baton.
 */
export class QuestRun {
  readonly quest: QuestSpec;
  private s: QuestRunState;
  private readonly players: number;

  constructor(quest: QuestSpec, startedAt: number, players = quest.players ?? 1, state?: QuestRunState) {
    this.quest = quest;
    this.players = Math.max(1, players);
    this.s = state ? structuredClone(state) : { stepIndex: 0, status: 'active', outcomes: [], startedAt, finishedAt: null };
  }

  /** Copy of the state, to save and resume later. */
  snapshot(): QuestRunState {
    return structuredClone(this.s);
  }

  get state(): Readonly<QuestRunState> {
    return this.s;
  }

  get current(): QuestStep | null {
    return this.s.status === 'active' ? (this.quest.steps[this.s.stepIndex] ?? null) : null;
  }

  /** Whose step it is in a relay quest (null = everyone). */
  get activePlayer(): number | null {
    return this.quest.kind === 'relay' ? this.s.stepIndex % this.players : null;
  }

  get progress(): number {
    return this.s.stepIndex / this.quest.steps.length;
  }

  /** Report a finished game for a game/boss step. Returns true if the goal was met. */
  reportGame(measures: Partial<Record<Measure, number>>, won: boolean, at: number): boolean {
    const step = this.current;
    if (!step || (step.type !== 'game' && step.type !== 'boss')) return false;
    const passed = step.goal ? evalGoal(step.goal, measures) : step.type === 'boss' ? won : true;
    return this.record(passed, at);
  }

  /** Report a photo check or a "done" tap for a move/find step. */
  reportCheck(passed: boolean, at: number): boolean {
    const step = this.current;
    if (!step || (step.type !== 'move' && step.type !== 'find')) return false;
    return this.record(passed, at);
  }

  private record(passed: boolean, at: number): boolean {
    this.s.outcomes.push({ step: this.s.stepIndex, passed, player: this.activePlayer, at });
    if (passed) {
      this.s.stepIndex++;
      if (this.s.stepIndex >= this.quest.steps.length) {
        this.s.status = 'done';
        this.s.finishedAt = at;
      }
    }
    return passed;
  }
}
