import { create } from 'zustand';
import type { Bracket, GameSpec, HillState } from '@fieldday/engine';
import type { Calibration, Zone } from '@fieldday/vision';
import type { CameraMode } from './vision/useVision.js';
import { db } from './db.js';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from './settings.js';

export type Format =
  | { kind: 'single' }
  | { kind: 'chaos'; base: GameSpec; seed: number }
  | { kind: 'koth' }
  | { kind: 'tournament' }
  | { kind: 'quest'; step: number };

/** A run of matches (King of the Hill / Tournament) across several games. */
export type Series =
  | { kind: 'koth'; base: GameSpec; hill: HillState; camera: CameraMode }
  | { kind: 'tournament'; base: GameSpec; bracket: Bracket; matchId: number | null; camera: CameraMode };

export interface Session {
  spec: GameSpec;
  format: Format;
  /** Global player indexes of this match's players (series). */
  seats?: number[];
  players: string[];
  camera: CameraMode;
  /** Per player, from Field Check. */
  calibrations: (Calibration | null)[];
  /** Shirt colour per player, from Field Check. */
  histograms: (number[] | null)[];
  zones: Zone[];
  lineY: number | null;
}

interface AppState {
  settings: Settings;
  settingsLoaded: boolean;
  session: Session | null;
  /** A game the brain just designed, waiting for setup. */
  draft: GameSpec | null;
  setDraft(spec: GameSpec | null): void;
  series: Series | null;
  setSeries(s: Series | null): void;
  loadSettings(): Promise<void>;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  startSession(s: Session): void;
  updateSession(patch: Partial<Session>): void;
}

export const useApp = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  session: null,
  draft: null,
  setDraft(draft) {
    set({ draft });
  },
  series: null,
  setSeries(series) {
    set({ series });
  },
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
  updateSession(patch) {
    set((s) => (s.session ? { session: { ...s.session, ...patch } } : {}));
  },
}));

export function newSession(spec: GameSpec, players: string[], camera: CameraMode, format: Format = { kind: 'single' }): Session {
  return {
    spec,
    format,
    players,
    camera,
    calibrations: players.map(() => null),
    histograms: players.map(() => null),
    zones: [],
    lineY: null,
  };
}
