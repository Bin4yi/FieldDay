// How long does our vision logic (not the MediaPipe models) take per frame?
// Run: pnpm --filter @fieldday/vision bench
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VisionPipeline, decodeFrames, type VisionFixture } from '../src/index.js';

const fx = JSON.parse(readFileSync(join(import.meta.dirname, '../../../fixtures/vision/sky_toss_2p.json'), 'utf8')) as VisionFixture;
const frames = decodeFrames(fx);
const runs = 20;
const t0 = performance.now();
for (let r = 0; r < runs; r++) {
  const p = new VisionPipeline({ players: 2, needsBall: true });
  for (const f of frames) p.process(f);
}
const ms = (performance.now() - t0) / (runs * frames.length);
console.log(`${frames.length} frames x ${runs} runs: ${ms.toFixed(3)} ms per frame (budget at 20 fps: 50 ms)`);
