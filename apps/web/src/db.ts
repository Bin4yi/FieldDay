import Dexie, { type EntityTable } from 'dexie';
import type { BrainCallLog } from '@fieldday/brain';
import type { GameSpec } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';

// Everything is stored on the phone (IndexedDB). Nothing here is sent anywhere.

export interface SavedGame {
  id?: number;
  code: string;
  spec: GameSpec;
  source: 'template' | 'gemma' | 'openai' | 'import';
  createdAt: number;
}

export interface ResultRecord {
  id?: number;
  specId: string;
  code: string;
  title: string;
  players: string[];
  totals: (number | null)[];
  winners: number[];
  unit: string;
  startedAt: number;
  finishedAt: number;
  /** % of the session the screen was touched/looked at (Screen-Time Meter). */
  screenTimePct?: number;
  durationMs?: number;
  /** Played outside (the "I'm outside" toggle, or a bright daylight camera). */
  outside?: boolean;
  /** Format the game was part of: chaos, koth, tournament, quest… */
  format?: string;
  /** XP from a quest step, added to this result. */
  questXp?: number;
  badges?: string[];
  clipId?: number;
  /** The game played (for ghosts and replays of custom games). */
  spec?: GameSpec;
  /** Round scores per player. */
  rounds?: (number | null)[][];
  /** Best measured value per player (e.g. best throw). */
  bests?: (number | null)[];
  /** Raced a ghost. */
  ghost?: { name: string; total: number | null };
}

export interface BadgeRecord {
  id: string;
  earnedAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface QuestRecord {
  id?: number;
  title: string;
  quest: QuestSpec;
  createdAt: number;
  doneAt?: number;
}

export interface GhostRecord {
  id?: number;
  code: string;
  ghost: unknown;
  createdAt: number;
}

export interface ClipRecord {
  id?: number;
  resultId: number;
  blob: Blob;
  createdAt: number;
}

export interface BrainLogRecord extends BrainCallLog {
  id?: number;
}

export type FieldDayDB = Dexie & {
  games: EntityTable<SavedGame, 'id'>;
  results: EntityTable<ResultRecord, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
  quests: EntityTable<QuestRecord, 'id'>;
  ghosts: EntityTable<GhostRecord, 'id'>;
  clips: EntityTable<ClipRecord, 'id'>;
  brainLogs: EntityTable<BrainLogRecord, 'id'>;
  badges: EntityTable<BadgeRecord, 'id'>;
};

export function openDb(name = 'fieldday'): FieldDayDB {
  const db = new Dexie(name) as FieldDayDB;
  db.version(1).stores({
    games: '++id, &code, createdAt',
    results: '++id, specId, finishedAt',
    settings: '&key',
    quests: '++id, createdAt',
    ghosts: '++id, code, createdAt',
    clips: '++id, resultId, createdAt',
    brainLogs: '++id, brain, op, startedAt',
  });
  db.version(2).stores({ badges: '&id, earnedAt' });
  return db;
}

let shared: FieldDayDB | null = null;
export function db(): FieldDayDB {
  shared ??= openDb();
  return shared;
}

export async function saveResult(d: FieldDayDB, r: Omit<ResultRecord, 'id'>): Promise<number> {
  return (await d.results.add(r)) as number;
}

/** Personal record for a game: best total for a player name. */
export async function personalBest(
  d: FieldDayDB,
  specId: string,
  player: string,
  lowerIsBetter: boolean,
): Promise<number | null> {
  const rows = await d.results.where('specId').equals(specId).toArray();
  let best: number | null = null;
  for (const r of rows) {
    const i = r.players.indexOf(player);
    const v = i >= 0 ? r.totals[i] : null;
    if (v === null || v === undefined) continue;
    if (best === null || (lowerIsBetter ? v < best : v > best)) best = v;
  }
  return best;
}
