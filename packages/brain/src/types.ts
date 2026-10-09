import type { GameSpec, RefereeMoment, RefereeStyle } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';

// The contract both brains follow. GemmaBrain (on device, offline) comes in
// Phase 3; OpenAIBrain (through our server) in Phase 7.

export type BrainId = 'gemma' | 'openai';
export type BrainMode = 'open' | 'boost' | 'auto';

export interface DesignContext {
  players: number;
  kidsMode: boolean;
  refereeStyle: RefereeStyle;
  /** Things the camera can see right now, e.g. ["ball", "bag"]. */
  objects?: string[];
}

export interface QuestContext {
  players: number;
  kidsMode: boolean;
  minutes?: number;
}

export interface SafetyResult {
  safe: boolean;
  /** Short, kind reason to read aloud when unsafe. */
  reason?: string;
  /** A safer version of the same idea, if there is one. */
  saferPrompt?: string;
}

export interface PhotoCheck {
  passed: boolean;
  confidence: number;
  /** What the checker saw, e.g. ["tree", "bench"]. */
  labels: string[];
}

export interface Brain {
  id: BrainId;
  isAvailable(): Promise<boolean>;
  designGame(prompt: string, ctx: DesignContext): Promise<GameSpec>;
  remixGame(spec: GameSpec, change: string): Promise<GameSpec>;
  designQuest(prompt: string, ctx: QuestContext): Promise<QuestSpec>;
  checkSafety(spec: GameSpec | QuestSpec): Promise<SafetyResult>;
  /** Short line, under 15 words. */
  refereeLine(event: RefereeMoment, style: RefereeStyle): Promise<string>;
  checkPhoto?(image: Blob, task: string): Promise<PhotoCheck>;
}

/** One logged brain call, shown on the Brain Stats screen. */
export interface BrainCallLog {
  brain: BrainId;
  op: 'designGame' | 'remixGame' | 'designQuest' | 'checkSafety' | 'refereeLine' | 'checkPhoto';
  startedAt: number;
  latencyMs: number;
  ok: boolean;
  /** The spec needed a repair round. */
  repaired?: boolean;
  /** A template or the other brain was used instead. */
  fallback?: 'template' | 'other_brain' | null;
  error?: string;
}
