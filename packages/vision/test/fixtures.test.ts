import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGame, getTemplate, withPlayers } from '@fieldday/engine';
import { PoseEventDetector, VisionPipeline, calibrate, decodeFrames, type VisionEvent, type VisionFixture } from '../src/index.js';

const DIR = join(import.meta.dirname, '../../../fixtures/vision');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('vision fixtures: frames → events → engine', () => {
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as VisionFixture;
    it(`${file} (${fx.source}): ${fx.description ?? ''}`, () => {
      const frames = decodeFrames(fx);
      const calUntil = fx.calibrateUntil ?? 0;

      // Calibrate from the standing frames.
      const calDet = new PoseEventDetector();
      for (const f of frames.filter((x) => x.t < calUntil)) calDet.update(f.t, f.poses[0] ?? null, f.height);
      const cal = fx.heightsM ? calibrate(fx.heightsM[0]!, calDet.standingSpans(), fx.height) : null;

      const template = fx.template ? getTemplate(fx.template) : undefined;
      const spec = template ? withPlayers(template, fx.players) : undefined;
      const pipe = new VisionPipeline({
        players: fx.players,
        needsBall: true,
        calibrations: Array.from({ length: fx.players }, () => cal),
        zones: (fx.zones ?? []).map((z) => ({ name: z.name, box: { x: z.box[0], y: z.box[1], w: z.box[2], h: z.box[3] } })),
      });
      const game = spec ? createGame(spec, { autoAdvance: true }) : null;
      game?.start(calUntil);

      const events: VisionEvent[] = [];
      for (const f of frames) {
        if (game) pipe.setActivePlayer(game.isTurnMode ? game.state.turnPlayer : null);
        const out = pipe.process(f);
        if (f.t < calUntil) continue;
        for (const e of out) {
          events.push(e);
          game?.dispatch(e);
        }
      }
      for (const e of pipe.fuser.flush(Infinity, true)) {
        events.push(e);
        game?.dispatch(e);
      }

      const exp = fx.expect ?? {};
      for (const [type, n] of Object.entries(exp.events ?? {})) {
        expect(events.filter((e) => e.type === type), `${type} count`).toHaveLength(n);
      }
      if (exp.measures) {
        exp.measures.forEach((m, i) => {
          const got = events.filter((e) => e.type === m.type)[i]?.measures?.[m.measure as 'height_m'];
          expect(got, `${m.type} #${i}`).toBeDefined();
          expect(Math.abs(got! - m.value) / m.value, `${m.type} #${i}: got ${got}, want ${m.value}`).toBeLessThan(0.1);
        });
      }
      if (exp.winners && game) {
        expect(game.state.phase).toBe('finished');
        expect(game.result().winners).toEqual(exp.winners);
      }
    });
  }
});
