import { describe, expect, it } from 'vitest';
import { calibrate, pxToMetres } from '../src/index.js';

describe('calibration', () => {
  it('uses the median span and scales with frame size', () => {
    const cal = calibrate(1.7, [500, 505, 498, 900, 502, 503, 10], 720)!;
    expect(cal.pixelsPerMetre).toBeCloseTo((502 * 1.07) / 1.7, 6);
    expect(pxToMetres(cal.pixelsPerMetre, cal)).toBeCloseTo(1, 6);
    expect(pxToMetres(cal.pixelsPerMetre / 2, cal, 360)).toBeCloseTo(1, 6);
  });

  it('refuses silly heights or too few samples', () => {
    expect(calibrate(3, [500, 500, 500, 500, 500], 720)).toBeNull();
    expect(calibrate(1.7, [500, 500], 720)).toBeNull();
  });
});
