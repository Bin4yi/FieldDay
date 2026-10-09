import { jumpLift, simulate, type PuppetPose, type VisionFrame } from '@fieldday/vision';
import type { FrameSource, FrameStats } from './runner.js';

// "Demo camera": a simulated player doing throws, jumps and squats.
// Lets you try the whole camera pipeline on a laptop or in tests.

const PPM = 330;
const H = 1.7;

export function demoScene(s: number): { poses: PuppetPose[]; ball: { x: number; y: number; r: number } | null } {
  const base: PuppetPose = { cx: 360, groundY: 900, ppm: PPM, heightM: H };
  const handX = 360 + 0.12 * H * PPM;
  const handY = 900 - 1.4 * PPM;
  const cycle = 8;
  const u = s % cycle;
  const k = Math.floor(s / cycle);
  const apex = 2.0 + ((k * 0.37) % 0.6);
  let ball: { x: number; y: number; r: number } | null = { x: handX, y: handY, r: 12 };
  const v0 = Math.sqrt(2 * 9.81 * (apex - 1.4));
  const air = (2 * v0) / 9.81;
  if (u > 2 && u < 2 + air) {
    const w = u - 2;
    ball = { x: handX, y: handY - (v0 * w - 4.905 * w * w) * PPM, r: 12 };
  }
  const lift = jumpLift(u, 5, 0.3 + ((k * 0.11) % 0.2));
  const squat = u > 6.2 && u < 7.4 ? Math.sin(((u - 6.2) / 1.2) * Math.PI) : 0;
  return { poses: [{ ...base, lift, squat, rightHand: { x: handX, y: handY } }], ball };
}

export class DemoSource implements FrameSource {
  private timer = 0;
  private start0 = 0;
  constructor(private clock: () => number) {}

  start(onFrame: (f: VisionFrame, stats: FrameStats) => void) {
    this.start0 = this.clock();
    let i = 0;
    this.timer = window.setInterval(() => {
      const t = this.clock();
      const s = (t - this.start0) / 1000;
      const [frame] = simulate(0, () => demoScene(s), { seed: i++ });
      onFrame({ ...frame!, t }, { fps: 30, brightness: 150, ballSeen: true });
    }, 33);
  }

  stop() {
    clearInterval(this.timer);
  }
}
