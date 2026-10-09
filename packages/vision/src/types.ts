import type { GameEvent } from '@fieldday/engine';

/** A landmark in image pixels. y grows downward. */
export interface Point {
  x: number;
  y: number;
  /** 0..1 how sure the model is that the point is visible. */
  visibility?: number;
}

/** An axis-aligned box in image pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BallObservation {
  box: Box;
  score: number;
  /** "detector" = the object model saw it; "colour" = the colour tracker followed it. */
  source: 'detector' | 'colour';
}

export interface DetectedObject {
  label: string;
  box: Box;
  score: number;
}

/** Everything the camera saw in one frame, already turned into numbers. */
export interface VisionFrame {
  /** ms, same clock as the engine. */
  t: number;
  width: number;
  height: number;
  /** One landmark list (33 points) per detected person. */
  poses: Point[][];
  ball: BallObservation | null;
  objects?: DetectedObject[];
  /** Torso hue histograms per pose (same order as poses), for player identity. */
  histograms?: number[][];
}

/** What the vision layer sends to the engine. Same shape as an engine GameEvent. */
export type VisionEvent = GameEvent;

/** A named area on screen, e.g. the goal. Pixels. */
export interface Zone {
  name: string;
  box: Box;
}
