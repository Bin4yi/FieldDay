import {
  brightness,
  hueHistogram,
  sampleColour,
  torsoBox,
  trackColour,
  type BallObservation,
  type Box,
  type ColourModel,
  type DetectedObject,
  type Point,
  type VisionFrame,
} from '@fieldday/vision';
import { BALL_LABEL } from './models.js';
import type { VisionModels } from './mediapipe.js';

// The camera loop: video frame → landmarks + ball box (+ shirt colours) → VisionFrame.

export interface FrameStats {
  fps: number;
  brightness: number | null;
  ballSeen: boolean;
}

export interface FrameSource {
  start(onFrame: (f: VisionFrame, stats: FrameStats) => void): void;
  stop(): void;
}

const SMALL_W = 160;

export class CameraSource implements FrameSource {
  private running = false;
  private handle = 0;
  private n = 0;
  private small = document.createElement('canvas');
  private sctx = this.small.getContext('2d', { willReadFrequently: true })!;
  private lastPoses: Point[][] = [];
  private ball: Box | null = null;
  private ballColour: ColourModel | null = null;
  private objects: DetectedObject[] = [];
  private hists: number[][] = [];
  private bright: number | null = null;
  private times: number[] = [];
  private lastVideoT = -1;

  constructor(
    private video: HTMLVideoElement,
    private models: VisionModels,
    private opts: { clock: () => number; batterySaver: boolean; needsBall: boolean },
  ) {}

  start(onFrame: (f: VisionFrame, stats: FrameStats) => void) {
    this.running = true;
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const loop = () => {
      if (!this.running) return;
      try {
        const f = this.process();
        if (f) onFrame(f, this.stats());
      } catch (e) {
        console.warn('vision frame failed', e);
      }
      this.handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    const v = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.handle);
    else cancelAnimationFrame(this.handle);
  }

  get detectedObjects(): DetectedObject[] {
    return this.objects;
  }

  private stats(): FrameStats {
    const ts = this.times;
    const fps = ts.length > 1 ? ((ts.length - 1) * 1000) / (ts[ts.length - 1]! - ts[0]!) : 0;
    return { fps, brightness: this.bright, ballSeen: !!this.ball };
  }

  private process(): VisionFrame | null {
    const video = this.video;
    const W = video.videoWidth;
    const H = video.videoHeight;
    if (!W || !H || video.readyState < 2) return null;
    const now = performance.now();
    if (now <= this.lastVideoT) return null;
    this.lastVideoT = now;
    this.n++;
    this.times.push(now);
    while (this.times.length > 30) this.times.shift();

    // Small copy of the frame for colour work.
    const sh = Math.round((SMALL_W * H) / W);
    if (this.small.width !== SMALL_W || this.small.height !== sh) {
      this.small.width = SMALL_W;
      this.small.height = sh;
    }
    this.sctx.drawImage(video, 0, 0, SMALL_W, sh);
    const img = this.sctx.getImageData(0, 0, SMALL_W, sh);
    const k = SMALL_W / W;

    // Pose: every frame (every 2nd in battery saver).
    if (!this.opts.batterySaver || this.n % 2 === 0) {
      const r = this.models.pose.detectForVideo(video, now);
      this.lastPoses = r.landmarks.map((lm) => lm.map((p) => ({ x: p.x * W, y: p.y * H, visibility: p.visibility })));
    }

    // Ball: detector every 4th frame, colour tracker in between.
    let ball: BallObservation | null = null;
    if (this.n % 4 === 0) {
      const r = this.models.objects.detectForVideo(video, now + 0.01);
      this.objects = r.detections
        .filter((d) => d.boundingBox && d.categories[0])
        .map((d) => ({
          label: d.categories[0]!.categoryName,
          score: d.categories[0]!.score,
          box: { x: d.boundingBox!.originX, y: d.boundingBox!.originY, w: d.boundingBox!.width, h: d.boundingBox!.height },
        }));
      const best = this.objects.filter((o) => o.label === BALL_LABEL).sort((a, b) => b.score - a.score)[0];
      if (best) {
        this.ball = best.box;
        const sb = { x: best.box.x * k, y: best.box.y * k, w: best.box.w * k, h: best.box.h * k };
        this.ballColour = sampleColour(img, sb);
        ball = { box: best.box, score: best.score, source: 'detector' };
      } else if (this.ball && this.ballColour) {
        ball = this.followColour(img, k);
      }
    } else if (this.opts.needsBall && this.ball && this.ballColour) {
      ball = this.followColour(img, k);
    }

    if (this.n % 10 === 1) {
      this.hists = this.lastPoses.map((lm) => {
        const b = torsoBox(lm);
        return b ? hueHistogram(img, { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }) : [];
      });
    }
    if (this.n % 15 === 1) this.bright = brightness(img);

    return {
      t: this.opts.clock(),
      width: W,
      height: H,
      poses: this.lastPoses,
      ball,
      objects: this.objects,
      histograms: this.hists,
    };
  }

  private followColour(img: ImageData, k: number): BallObservation | null {
    const prev = this.ball!;
    const found = trackColour(img, { x: prev.x * k, y: prev.y * k, w: prev.w * k, h: prev.h * k }, this.ballColour!);
    if (!found) {
      this.ball = null;
      return null;
    }
    this.ball = { x: found.x / k, y: found.y / k, w: found.w / k, h: found.h / k };
    return { box: this.ball, score: 0.5, source: 'colour' };
  }
}
