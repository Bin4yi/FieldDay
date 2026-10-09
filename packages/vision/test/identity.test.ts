import { describe, expect, it } from 'vitest';
import {
  IdentityTracker,
  allGood,
  brightness,
  fieldCheck,
  hueHistogram,
  histDistance,
  puppet,
  sampleColour,
  trackColour,
  type ImageLike,
} from '../src/index.js';

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

const person = (cx: number) => puppet({ cx, groundY: 900, ppm: 300, heightM: 1.7 });

describe('player identity', () => {
  it('side-by-side duel: left half is player 1, right half is player 2', () => {
    const id = new IdentityTracker(2, 'sides');
    expect(id.assign(0, [person(500), person(150)], 720)).toEqual([1, 0]);
  });

  it('keeps players apart by shirt colour even when they swap places', () => {
    const red = image(10, 10, () => [220, 30, 30]);
    const blue = image(10, 10, () => [30, 60, 220]);
    const hr = hueHistogram(red, { x: 0, y: 0, w: 10, h: 10 });
    const hb = hueHistogram(blue, { x: 0, y: 0, w: 10, h: 10 });
    expect(histDistance(hr, hb)).toBeGreaterThan(0.9);
    expect(histDistance(hr, hr)).toBeLessThan(0.01);
    const id = new IdentityTracker(2);
    id.register(0, hr, { x: 200, y: 500 }, 0);
    id.register(1, hb, { x: 500, y: 500 }, 0);
    // They walk past each other: the red shirt is now on the right.
    expect(id.assign(100, [person(330), person(370)], 720, [hb, hr])).toEqual([1, 0]);
  });
});

describe('colour tracker', () => {
  it('follows an orange ball that moved', () => {
    const ball = (bx: number, by: number) =>
      image(200, 200, (x, y) => ((x - bx) ** 2 + (y - by) ** 2 < 100 ? [255, 120, 20] : [40, 120, 40]));
    const first = ball(50, 50);
    const model = sampleColour(first, { x: 40, y: 40, w: 20, h: 20 });
    const next = trackColour(ball(62, 58), { x: 40, y: 40, w: 20, h: 20 }, model);
    expect(next).not.toBeNull();
    expect(Math.abs(next!.x + next!.w / 2 - 62)).toBeLessThan(2);
    expect(Math.abs(next!.y + next!.h / 2 - 58)).toBeLessThan(2);
    expect(trackColour(image(200, 200, () => [40, 120, 40]), { x: 40, y: 40, w: 20, h: 20 }, model)).toBeNull();
  });

  it('measures brightness', () => {
    expect(brightness(image(16, 16, () => [255, 255, 255]))).toBeCloseTo(255, 0);
    expect(brightness(image(16, 16, () => [0, 0, 0]))).toBe(0);
  });
});

describe('field check', () => {
  it('passes a good setup and explains a bad one', () => {
    const good = fieldCheck({
      shake: 0.05,
      brightness: 140,
      pose: person(360),
      width: 720,
      height: 960,
      needsBall: true,
      ballSeen: true,
      spaceConfirmed: true,
    });
    expect(allGood(good)).toBe(true);
    const bad = fieldCheck({
      shake: 2,
      brightness: 20,
      pose: puppet({ cx: 360, groundY: 1200, ppm: 300, heightM: 1.7 }),
      width: 720,
      height: 960,
      needsBall: true,
      ballSeen: false,
      spaceConfirmed: false,
    });
    expect(allGood(bad)).toBe(false);
    expect(bad.filter((c) => c.state === 'bad').map((c) => c.id)).toEqual(['stable', 'light', 'body', 'ball']);
  });
});
