import { describe, expect, it } from 'vitest';
import { OnsetDetector, OnsetFuser, gaussian, rng } from '../src/index.js';

function makeAudio(seconds: number, sr: number, thuds: number[], seed = 3): Float32Array {
  const r = rng(seed);
  const a = new Float32Array(seconds * sr);
  for (let i = 0; i < a.length; i++) a[i] = gaussian(r) * 0.004; // quiet park noise
  for (const t of thuds) {
    const start = Math.round(t * sr);
    for (let k = 0; k < sr * 0.05 && start + k < a.length; k++) {
      a[start + k]! += Math.exp(-k / (sr * 0.008)) * Math.sin(k * 0.9) * 0.5; // sharp decaying thump
    }
  }
  return a;
}

describe('audio onsets', () => {
  it('finds thuds within 15 ms, in small chunks like a real mic', () => {
    const sr = 16000;
    const thuds = [0.5, 1.23, 2.0, 2.71];
    const audio = makeAudio(3, sr, thuds);
    const det = new OnsetDetector({ sampleRate: sr });
    const found: number[] = [];
    const chunk = 1024;
    for (let i = 0; i < audio.length; i += chunk) {
      found.push(...det.push(audio.subarray(i, i + chunk), (i / sr) * 1000));
    }
    expect(found).toHaveLength(thuds.length);
    found.forEach((t, i) => expect(Math.abs(t - thuds[i]! * 1000)).toBeLessThan(15));
  });

  it('ignores steady noise', () => {
    const det = new OnsetDetector({ sampleRate: 16000 });
    expect(det.push(makeAudio(2, 16000, []), 0)).toEqual([]);
  });
});

describe('camera + mic fusion', () => {
  it('moves a camera bounce to the sound time', () => {
    const f = new OnsetFuser();
    f.pushOnset(960);
    const out = f.push([{ type: 'ball_bounce', t: 1000 }], 1000);
    expect(out).toEqual([{ type: 'ball_bounce', t: 960 }]);
  });

  it('waits a little for a late sound, then gives up', () => {
    const f = new OnsetFuser();
    expect(f.push([{ type: 'ball_catch', t: 1000 }], 1000)).toEqual([]);
    f.pushOnset(1050);
    expect(f.flush(1060)).toEqual([{ type: 'ball_catch', t: 1050 }]);
    expect(f.push([{ type: 'ball_catch', t: 2000 }], 2000)).toEqual([]);
    expect(f.flush(2200)).toEqual([{ type: 'ball_catch', t: 2000 }]);
  });

  it('passes silent events straight through', () => {
    const f = new OnsetFuser();
    expect(f.push([{ type: 'hands_up', t: 5 }], 5)).toEqual([{ type: 'hands_up', t: 5 }]);
  });
});
