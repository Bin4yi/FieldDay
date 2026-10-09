// Turn pixels into metres using the player's real height.
// The player stands still in frame; we measure head-to-heel in pixels.
// This is only right at the player's distance from the camera: about ±10%.

export interface Calibration {
  pixelsPerMetre: number;
  /** Height in pixels of the image the calibration was made on. */
  frameHeightPx: number;
}

/** Real body height is a bit more than the eye-to-heel landmark span; MediaPipe has no top-of-head point. */
export const HEAD_TOP_FACTOR = 1.07;

export function calibrate(playerHeightM: number, bodySpanPx: number[], frameHeightPx: number): Calibration | null {
  if (playerHeightM < 0.8 || playerHeightM > 2.3) return null;
  const spans = bodySpanPx.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (spans.length < 5) return null;
  // Median of the samples taken while standing still.
  const mid = spans[Math.floor(spans.length / 2)]!;
  return { pixelsPerMetre: (mid * HEAD_TOP_FACTOR) / playerHeightM, frameHeightPx };
}

export function pxToMetres(px: number, cal: Calibration, frameHeightPx = cal.frameHeightPx): number {
  // Scale if the frame size changed (e.g. battery saver lowers the resolution).
  const ppm = cal.pixelsPerMetre * (frameHeightPx / cal.frameHeightPx);
  return px / ppm;
}
