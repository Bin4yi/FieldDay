import { describe, expect, it } from 'vitest';
import {
  BallTracker,
  PoseEventDetector,
  bump,
  calibrate,
  jumpLift,
  simulate,
  type PuppetPose,
  type VisionEvent,
} from '../src/index.js';

const H = 1.7;
const PPM = 330;
const base: PuppetPose = { cx: 360, groundY: 900, ppm: PPM, heightM: H };

function runPose(frames: ReturnType<typeof simulate>, det = new PoseEventDetector()) {
  const out: VisionEvent[] = [];
  for (const f of frames) out.push(...det.update(f.t, f.poses[0] ?? null, f.height));
  return { out, det };
}

function calibrated(): PoseEventDetector {
  const det = new PoseEventDetector();
  const stand = simulate(1.5, () => ({ poses: [base] }));
  runPose(stand, det);
  const cal = calibrate(H, det.standingSpans(), 960);
  expect(cal).not.toBeNull();
  det.setCalibration(cal);
  return det;
}

describe('pose events', () => {
  it('calibrates to within 2% of the true scale', () => {
    const det = new PoseEventDetector();
    runPose(simulate(1.5, () => ({ poses: [base] })), det);
    const cal = calibrate(H, det.standingSpans(), 960)!;
    expect(Math.abs(cal.pixelsPerMetre - PPM) / PPM).toBeLessThan(0.02);
  });

  it('measures jump heights within ±10%', () => {
    const det = calibrated();
    const jumps = [0.25, 0.4, 0.55];
    const frames = simulate(7, (s) => ({
      poses: [{ ...base, lift: jumpLift(s, 1, jumps[0]!) + jumpLift(s, 3, jumps[1]!) + jumpLift(s, 5, jumps[2]!) }],
    }));
    const { out } = runPose(frames, det);
    const got = out.filter((e) => e.type === 'jump').map((e) => e.measures?.height_m ?? 0);
    expect(got).toHaveLength(3);
    got.forEach((h, i) => expect(Math.abs(h - jumps[i]!) / jumps[i]!, `jump ${i}: ${h}`).toBeLessThan(0.1));
  });

  it('without calibration, estimates heights from the assumed body height', () => {
    const det = new PoseEventDetector({ assumedHeightM: H });
    const frames = simulate(4, (s) => ({ poses: [{ ...base, lift: jumpLift(s, 2, 0.4) }] }));
    const { out } = runPose(frames, det);
    const h = out.find((e) => e.type === 'jump')?.measures?.height_m;
    expect(det.estimated).toBe(true);
    expect(Math.abs(h! - 0.4) / 0.4).toBeLessThan(0.1);
  });

  it('counts squats', () => {
    const det = calibrated();
    const frames = simulate(8, (s) => ({ poses: [{ ...base, squat: Math.max(0, Math.sin(s * Math.PI * 0.75)) }] }));
    const { out } = runPose(frames, det);
    expect(out.filter((e) => e.type === 'squat')).toHaveLength(3);
  });

  it('sees hands up, leans and punches', () => {
    const det = calibrated();
    const frames = simulate(9, (s) => ({
      poses: [
        {
          ...base,
          armsUp: bump(s, 1, 2.5) > 0.5 ? 1 : 0,
          lean: bump(s, 3, 4.5) * 1 - bump(s, 5, 6.5) * 1,
          punch: s > 7.5 && s < 7.75 ? (s - 7.5) * 4 : 0,
        },
      ],
    }));
    const { out } = runPose(frames, det);
    const types = out.map((e) => e.type);
    expect(types.filter((x) => x === 'hands_up')).toHaveLength(1);
    expect(types).toContain('lean_left');
    expect(types).toContain('lean_right');
    expect(types.indexOf('lean_left')).toBeLessThan(types.indexOf('lean_right'));
    expect(types.filter((x) => x === 'punch')).toHaveLength(1);
  });

  it('sees freeze after holding still, once', () => {
    const det = new PoseEventDetector({ freezeSeconds: 1 });
    const frames = simulate(4, (s) => ({ poses: [{ ...base, cx: s < 1.5 ? 360 + Math.sin(s * 12) * 60 : 360 }] }));
    const { out } = runPose(frames, det);
    const f = out.filter((e) => e.type === 'freeze');
    expect(f).toHaveLength(1);
    expect(f[0]!.t).toBeGreaterThan(2400);
  });

  it('crossing the line, entering a zone, touching an object', () => {
    const det = new PoseEventDetector({
      lineY: 890,
      zones: [{ name: 'pad', box: { x: 500, y: 300, w: 200, h: 600 } }],
      objects: [{ name: 'far', box: { x: 640, y: 650, w: 60, h: 60 } }],
    });
    const frames = simulate(4, (s) => ({
      poses: [{ ...base, groundY: s > 1 ? 930 : 900, cx: s > 2 ? 600 : 360 }],
    }));
    const { out } = runPose(frames, det);
    const types = out.map((e) => `${e.type}${e.target ? ':' + e.target : ''}`);
    expect(types).toContain('cross_line');
    expect(types).toContain('enter_zone:pad');
    expect(types).toContain('touch_object:far');
  });
});

// ---------------- ball ----------------

/** Ball thrown straight up from the hand, caught again. */
function throwScene(apexM: number, opts: { dropApexFrames?: boolean; catchIt?: boolean } = {}) {
  const handY = 900 - 1.4 * PPM; // hand height 1.4 m
  const rise = apexM - 1.4;
  const v0 = Math.sqrt(2 * 9.81 * rise);
  const tUp = v0 / 9.81;
  const t0 = 1;
  const tEnd = t0 + tUp * 2;
  return (s: number) => {
    const handX = 360 + 0.12 * H * PPM;
    let ball: { x: number; y: number; r: number } | null = { x: handX, y: handY, r: 12 };
    if (s > t0 && s < tEnd) {
      const u = s - t0;
      ball = { x: handX, y: handY - (v0 * u - 4.905 * u * u) * PPM, r: 12 };
      if (opts.dropApexFrames && Math.abs(u - tUp) < 0.12) ball = null; // motion blur: lost near the top
    }
    if (s >= tEnd && opts.catchIt === false) {
      // Falls past the hand to the ground, then bounces back up at half speed.
      const u = s - t0;
      const h = 1.4 + v0 * u - 4.905 * u * u;
      const uGround = (v0 + Math.sqrt(v0 * v0 + 2 * 9.81 * 1.4)) / 9.81;
      let hm = h;
      if (u > uGround) {
        const vImpact = 9.81 * uGround - v0;
        const w = u - uGround;
        hm = Math.max(0, 0.5 * vImpact * w - 4.905 * w * w);
      }
      ball = { x: handX + 40, y: 900 - 12 - hm * PPM, r: 12 };
    }
    if (ball && ball.y < 0) ball = null; // above the top of the screen
    return { poses: [{ ...base, rightHand: { x: handX, y: handY } }], ball };
  };
}

function runBall(frames: ReturnType<typeof simulate>) {
  const det = calibrated();
  const tracker = new BallTracker({ calibration: (det as unknown as { opts: { calibration: never } }).opts.calibration });
  const out: VisionEvent[] = [];
  for (const f of frames) {
    out.push(...det.update(f.t, f.poses[0] ?? null, f.height));
    const lm = f.poses[0]!;
    out.push(
      ...tracker.update({ t: f.t, width: f.width, height: f.height, ball: f.ball, hands: [lm[15]!, lm[16]!], groundY: det.groundY }),
    );
  }
  return out.filter((e) => e.type.startsWith('ball_'));
}

describe('ball tracker', () => {
  it('release → apex (±10%) → catch, even with blurred frames at the top', () => {
    for (const apex of [2.0, 2.6]) {
      const out = runBall(simulate(4, throwScene(apex, { dropApexFrames: true })));
      const types = out.map((e) => e.type);
      expect(types, JSON.stringify(out)).toEqual(['ball_release', 'ball_apex', 'ball_catch']);
      const h = out.find((e) => e.type === 'ball_apex')!.measures!.height_m!;
      expect(Math.abs(h - apex) / apex, `apex ${apex} measured ${h}`).toBeLessThan(0.1);
    }
  });

  it('estimates the apex of a throw that leaves the top of the screen', () => {
    const out = runBall(simulate(4, throwScene(3.2)));
    expect(out.map((e) => e.type).slice(0, 3)).toEqual(['ball_release', 'ball_apex', 'ball_out_of_frame']);
    const h = out.find((e) => e.type === 'ball_apex')!.measures!.height_m!;
    expect(Math.abs(h - 3.2) / 3.2).toBeLessThan(0.1);
  });

  it('sees a bounce when the ball is not caught', () => {
    const out = runBall(simulate(4, throwScene(2.5, { catchIt: false })));
    expect(out.map((e) => e.type), JSON.stringify(out)).toEqual(['ball_release', 'ball_apex', 'ball_bounce', 'ball_apex']);
  });

  it('reports out of frame (and still estimates the apex)', () => {
    const tracker = new BallTracker();
    const out: VisionEvent[] = [];
    // A ball flying up and leaving the top of the frame.
    for (let i = 0; i < 40; i++) {
      const t = i * 33;
      const y = 600 - i * 30 + i * i * 0.2;
      out.push(
        ...tracker.update({
          t,
          width: 720,
          height: 960,
          ball: y > 10 ? { box: { x: 350, y: y - 10, w: 20, h: 20 }, score: 0.9, source: 'detector' } : null,
          hands: [],
          groundY: 900,
        }),
      );
    }
    expect(out.map((e) => e.type)).toContain('ball_out_of_frame');
  });

  it('ball in a named zone', () => {
    const tracker = new BallTracker({ zones: [{ name: 'goal', box: { x: 500, y: 700, w: 150, h: 150 } }] });
    const out: VisionEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const t = i * 33;
      const x = 300 + i * 10;
      const y = 600 - i * 20 + i * i * 1.2;
      out.push(
        ...tracker.update({ t, width: 720, height: 960, ball: { box: { x, y, w: 20, h: 20 }, score: 0.9, source: 'detector' }, hands: [], groundY: 900 }),
      );
    }
    expect(out.filter((e) => e.type === 'ball_in_zone').map((e) => e.target)).toEqual(['goal']);
  });
});
