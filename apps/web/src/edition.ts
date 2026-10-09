import type { BrainMode } from '@fieldday/brain';

// One codebase, two hackathon builds. The flag only changes defaults and copy.
export type Edition = 'devto' | 'hack47';

export const EDITION: Edition = import.meta.env.VITE_EDITION === 'hack47' ? 'hack47' : 'devto';

export const DEFAULT_BRAIN_MODE: BrainMode = EDITION === 'hack47' ? 'auto' : 'open';

export const LANDING =
  EDITION === 'hack47'
    ? { tagline: 'Say any game. Play it outside.', sub: 'Boost Mode adds a live talking referee when you are online.' }
    : { tagline: 'Say any game. Play it outside.', sub: 'Open Mode: the brain runs on your phone. No signal needed.' };
