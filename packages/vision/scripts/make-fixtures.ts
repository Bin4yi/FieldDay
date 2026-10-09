// Generates synthetic vision fixtures in fixtures/vision/ with the simulator.
// Run: pnpm --filter @fieldday/vision fixtures
// Real recordings from a phone (Field Check → "Record") use the same format.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFrame, jumpLift, simulate, type PuppetPose, type VisionFixture } from '../src/index.js';

const OUT = join(import.meta.dirname, '../../../fixtures/vision');
mkdirSync(OUT, { recursive: true });

const PPM = 330;
const H = 1.7;
const FPS = 24;
const base: PuppetPose = { cx: 360, groundY: 900, ppm: PPM, heightM: H };
const handX = 360 + 0.12 * H * PPM;
const handY = 900 - 1.4 * PPM;

function save(name: string, fx: Omit<VisionFixture, 'version' | 'source' | 'width' | 'height'>, frames: ReturnType<typeof simulate>) {
  const full: VisionFixture = { version: 1, source: 'synthetic', width: 720, height: 960, ...fx, frames: frames.map(encodeFrame) };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(full));
  console.log(name, frames.length, 'frames');
}

/** Ball position for a throw straight up from the hand, caught at hand height. */
function throwBall(u: number, apexM: number) {
  const v0 = Math.sqrt(2 * 9.81 * (apexM - 1.4));
  const air = (2 * v0) / 9.81;
  if (u <= 0 || u >= air) return null;
  return { x: handX, y: handY - (v0 * u - 4.905 * u * u) * PPM, r: 12 };
}

// --- Sky Toss, 2 players, 3 throws each, alternating on screen ---
{
  const heights = [2.0, 2.3, 2.4, 1.9, 2.2, 2.55]; // P0, P1, P0, P1, P0, P1
  const turn = 3; // seconds per turn
  const start = 2; // standing still for calibration first
  save(
    'sky_toss_2p',
    {
      description: 'Two players take turns throwing straight up. P1 throws 2.55 m in the last round.',
      template: 'sky_toss',
      players: 2,
      heightsM: [H, H],
      calibrateUntil: 1500,
      expect: {
        winners: [1],
        events: { ball_release: 6, ball_apex: 6, ball_catch: 6 },
        measures: heights.map((value) => ({ type: 'ball_apex', measure: 'height_m', value })),
      },
    },
    simulate(
      start + turn * heights.length,
      (s) => {
        const k = Math.floor((s - start) / turn);
        const u = s - start - k * turn - 1;
        const ball = s >= start && k < heights.length ? throwBall(u, heights[k]!) : null;
        return { poses: [{ ...base, rightHand: { x: handX, y: handY } }], ball: ball ?? { x: handX, y: handY, r: 12 } };
      },
      { fps: FPS, seed: 11 },
    ),
  );
}

// --- Jump Battle, 2 players ---
{
  const jumps = [0.3, 0.38, 0.42, 0.33, 0.35, 0.4];
  const start = 2;
  const turn = 2.5;
  save(
    'jump_battle_2p',
    {
      description: 'Two players take turns jumping. P0 jumps 0.42 m, P1 best is 0.40 m.',
      template: 'jump_battle',
      players: 2,
      heightsM: [H, H],
      calibrateUntil: 1500,
      expect: {
        winners: [0],
        events: { jump: 6 },
        measures: jumps.map((value) => ({ type: 'jump', measure: 'height_m', value })),
      },
    },
    simulate(
      start + turn * jumps.length,
      (s) => {
        let lift = 0;
        jumps.forEach((j, k) => (lift += jumpLift(s, start + k * turn + 0.8, j)));
        return { poses: [{ ...base, lift }] };
      },
      { fps: FPS, seed: 12 },
    ),
  );
}

// --- Bounce & Catch: 5 bounce-catch cycles ---
{
  const start = 2;
  const cycle = 2;
  const h0 = 1.0;
  const hy = 900 - h0 * PPM;
  const v0 = 3; // thrown down
  const vImpact = Math.sqrt(v0 * v0 + 2 * 9.81 * h0);
  const uGround = (vImpact - v0) / 9.81;
  const vUp = vImpact * 0.85;
  save(
    'bounce_catch_1p',
    {
      description: 'One player bounces the ball off the ground and catches it, 5 times.',
      players: 1,
      heightsM: [H],
      calibrateUntil: 1500,
      expect: { events: { ball_release: 5, ball_bounce: 5, ball_catch: 5 } },
    },
    simulate(
      start + cycle * 5,
      (s) => {
        const hand = { x: handX, y: hy };
        const k = Math.floor((s - start) / cycle);
        const u = s - start - k * cycle - 0.5;
        let ball = { x: handX, y: hy, r: 12 };
        if (s >= start && k < 5 && u > 0) {
          let hm: number | null;
          if (u < uGround) hm = h0 - v0 * u - 4.905 * u * u;
          else {
            const w = u - uGround;
            hm = vUp * w - 4.905 * w * w;
            // Caught when it comes back up to the hand.
            if (hm >= h0 - 0.02 || w > vUp / 9.81) hm = null;
          }
          if (hm !== null) ball = { x: handX, y: 900 - 12 - Math.max(0, hm) * PPM, r: 12 };
        }
        return { poses: [{ ...base, rightHand: hand }], ball };
      },
      { fps: 30, seed: 13 },
    ),
  );
}
