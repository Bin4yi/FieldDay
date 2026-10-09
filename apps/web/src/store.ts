import { create } from 'zustand';
import type { GameSpec } from '@fieldday/engine';
import { db } from './db.js';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from './settings.js';

export interface Session {
  spec: GameSpec;
  players: string[];
}

interface AppState {
  settings: Settings;
  settingsLoaded: boolean;
  session: Session | null;
  loadSettings(): Promise<void>;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  startSession(s: Session): void;
}

export const useApp = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  session: null,
  async loadSettings() {
    try {
      set({ settings: await loadSettings(db()), settingsLoaded: true });
    } catch {
      // Private mode or no IndexedDB: keep defaults, the app still works.
      set({ settingsLoaded: true });
    }
  },
  setSetting(key, value) {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    void saveSetting(db(), key, value).catch(() => undefined);
  },
  startSession(session) {
    set({ session });
  },
}));
