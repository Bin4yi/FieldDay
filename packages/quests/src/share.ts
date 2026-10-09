import { packJson, unpackJson } from '@fieldday/engine';
import { QuestSpecSchema, type QuestSpec } from './spec.js';

export const QUEST_PREFIX = 'FDQ1';

/** Share a quest by link or QR (works offline: the code holds the whole quest). */
export function encodeQuest(q: QuestSpec): string {
  return packJson(QUEST_PREFIX, q);
}

export function decodeQuest(text: string): QuestSpec {
  return QuestSpecSchema.parse(unpackJson(QUEST_PREFIX, text));
}
