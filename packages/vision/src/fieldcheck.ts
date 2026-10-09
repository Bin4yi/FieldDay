import { LM } from './landmarks.js';
import type { Point } from './types.js';

// The "Field Check" before playing: is the setup good enough to referee?

export type CheckId = 'stable' | 'light' | 'body' | 'ball' | 'space';
export type CheckState = 'ok' | 'bad' | 'wait';

export interface CheckItem {
  id: CheckId;
  state: CheckState;
  label: string;
  /** What to say/do if it is not ok. */
  fix: string;
}

export interface FieldCheckInput {
  /** Device shake (m/s² std-dev from DeviceMotion). null = sensor not available. */
  shake: number | null;
  /** Mean frame brightness 0..255. */
  brightness: number | null;
  /** Latest pose landmarks (px). */
  pose: Point[] | null;
  width: number;
  height: number;
  needsBall: boolean;
  ballSeen: boolean;
  /** Players confirmed there is free space around them. */
  spaceConfirmed: boolean;
}

const BODY_POINTS = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle];

export function wholeBodyVisible(pose: Point[] | null, width: number, height: number): boolean {
  if (!pose) return false;
  return BODY_POINTS.every((i) => {
    const p = pose[i];
    if (!p) return false;
    if (p.visibility !== undefined && p.visibility < 0.5) return false;
    return p.x > width * 0.02 && p.x < width * 0.98 && p.y > height * 0.01 && p.y < height * 0.99;
  });
}

export function fieldCheck(i: FieldCheckInput): CheckItem[] {
  const items: CheckItem[] = [
    {
      id: 'stable',
      state: i.shake === null ? 'wait' : i.shake < 0.25 ? 'ok' : 'bad',
      label: 'Phone is steady',
      fix: 'Lean the phone on something so it does not move.',
    },
    {
      id: 'light',
      state: i.brightness === null ? 'wait' : i.brightness >= 60 ? 'ok' : 'bad',
      label: 'Enough light',
      fix: 'It is too dark. Face the camera away from the sun but toward the light.',
    },
    {
      id: 'body',
      state: wholeBodyVisible(i.pose, i.width, i.height) ? 'ok' : 'bad',
      label: 'Whole body in view',
      fix: 'Step back until your head and feet are on screen.',
    },
  ];
  if (i.needsBall) {
    items.push({
      id: 'ball',
      state: i.ballSeen ? 'ok' : 'bad',
      label: 'Ball found',
      fix: 'Hold the ball up to the camera.',
    });
  }
  items.push({
    id: 'space',
    state: i.spaceConfirmed ? 'ok' : 'wait',
    label: 'Free space around you',
    fix: 'Check there is nothing and nobody close around you, then tap "Space is clear".',
  });
  return items;
}

export function allGood(items: CheckItem[]): boolean {
  // "wait" for the motion sensor is fine: some phones have none.
  return items.every((c) => c.state === 'ok' || (c.id === 'stable' && c.state === 'wait'));
}
