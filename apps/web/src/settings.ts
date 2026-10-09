import type { BrainMode } from '@fieldday/brain';
import type { RefereeStyle } from '@fieldday/engine';
import { DEFAULT_BRAIN_MODE } from './edition.js';
import type { FieldDayDB } from './db.js';

export interface Settings {
  brainMode: BrainMode;
  refereeStyle: RefereeStyle;
  kidsMode: boolean;
  voice: boolean;
  batterySaver: boolean;
  /** Names used last time, so setup is quick. */
  playerNames: string[];
  /** Player height in metres, by name (for calibration). */
  heights: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  brainMode: DEFAULT_BRAIN_MODE,
  refereeStyle: 'football_announcer',
  kidsMode: false,
  voice: true,
  batterySaver: false,
  playerNames: ['Player 1', 'Player 2'],
  heights: {},
};

export async function loadSettings(d: FieldDayDB): Promise<Settings> {
  const rows = await d.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) if (row.key in DEFAULT_SETTINGS) out[row.key] = row.value;
  return out as unknown as Settings;
}

export async function saveSetting<K extends keyof Settings>(d: FieldDayDB, key: K, value: Settings[K]): Promise<void> {
  await d.settings.put({ key, value });
}
