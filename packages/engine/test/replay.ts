import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, getTemplate, withPlayers, type GameEvent, type RefereeMoment } from '../src/index.js';

export type Step = GameEvent | { tick: number };

export interface EngineFixture {
  template: string;
  description?: string;
  players?: string[];
  seed?: number;
  steps: Step[];
  expect: {
    winners: number[];
    totals?: (number | null)[];
    lives?: number[];
    fouls?: number[];
    bossHp?: number;
    calls?: string[];
    moments?: Record<string, number>;
  };
}

export const FIXTURE_DIR = join(import.meta.dirname, '../../../fixtures/engine');

export function loadFixtures(): { file: string; fixture: EngineFixture }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, fixture: JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as EngineFixture }));
}

/** Run a fixture through the engine with turns starting right away. */
export function replay(fx: EngineFixture) {
  const base = getTemplate(fx.template);
  if (!base) throw new Error(`no template ${fx.template}`);
  const spec = fx.players ? withPlayers(base, fx.players.length) : base;
  const game = createGame(spec, {
    autoAdvance: true,
    seed: fx.seed ?? 1,
    ...(fx.players ? { players: fx.players.map((name) => ({ name })) } : {}),
  });
  const moments: RefereeMoment[] = [...game.start(0)];
  for (const step of fx.steps) {
    moments.push(...('tick' in step ? game.tick(step.tick) : game.dispatch(step)));
  }
  return { game, spec, moments };
}
