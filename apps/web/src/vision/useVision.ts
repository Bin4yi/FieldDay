import { useEffect, useRef, useState } from 'react';
import type { GameSpec } from '@fieldday/engine';
import {
  OnsetDetector,
  VisionPipeline,
  pipelineOptionsFor,
  type Calibration,
  type VisionEvent,
  type VisionFrame,
  type Zone,
} from '@fieldday/vision';
import { startCamera, startMic, stopStream } from './camera.js';
import { DemoSource } from './demo.js';
import { loadVisionModels } from './mediapipe.js';
import { drawOverlay } from './overlay.js';
import { CameraSource, type FrameSource, type FrameStats } from './runner.js';

export type CameraMode = 'camera' | 'demo' | 'off';
export type VisionStatus = 'off' | 'loading' | 'running' | 'error';

export interface UseVisionOptions {
  mode: CameraMode;
  spec: GameSpec | null;
  clock: () => number;
  batterySaver: boolean;
  calibrations: (Calibration | null)[];
  zones: Zone[];
  lineY: number | null;
  histograms?: (number[] | null)[];
  /** Whose turn it is (turn mode), read every frame. */
  activePlayer?: () => number | null;
  onEvents?: (events: VisionEvent[]) => void;
  onFrame?: (frame: VisionFrame, stats: FrameStats) => void;
  /** Listen to the mic for bounce/catch timing. */
  mic?: boolean;
}

export function useVision(o: UseVisionOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<VisionStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FrameStats>({ fps: 0, brightness: null, ballSeen: false });
  const pipelineRef = useRef<VisionPipeline | null>(null);
  const sourceRef = useRef<FrameSource | null>(null);
  const lastFrame = useRef<VisionFrame | null>(null);
  // Keep the latest callbacks without restarting the camera.
  const cb = useRef(o);
  cb.current = o;

  // (Re)build the pipeline when the game changes.
  useEffect(() => {
    if (!o.spec) return;
    const p = new VisionPipeline(
      pipelineOptionsFor(o.spec, { calibrations: o.calibrations, zones: o.zones, lineY: o.lineY }),
    );
    o.histograms?.forEach((h, i) => {
      if (h) p.identity.register(i, h, { x: 0, y: 0 }, 0);
    });
    pipelineRef.current = p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.spec]);

  useEffect(() => {
    const p = pipelineRef.current;
    if (!p) return;
    p.setZones(o.zones);
    p.setLine(o.lineY);
    o.calibrations.forEach((c, i) => p.setCalibration(i, c));
  }, [o.zones, o.lineY, o.calibrations]);

  useEffect(() => {
    if (o.mode === 'off') {
      setStatus('off');
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopMic: (() => void) | null = null;
    setStatus('loading');
    setError(null);

    const onFrame = (f: VisionFrame, s: FrameStats) => {
      lastFrame.current = f;
      const p = pipelineRef.current;
      const c = cb.current;
      let events: VisionEvent[] = [];
      if (p) {
        p.setActivePlayer(c.activePlayer?.() ?? null);
        events = p.process(f);
      }
      if (canvasRef.current) {
        drawOverlay(canvasRef.current, f, {
          assignment: p?.lastAssignment ?? [],
          trail: p?.ball.trail ?? [],
          zones: c.zones,
          lineY: c.lineY,
        });
      }
      if (events.length) c.onEvents?.(events);
      c.onFrame?.(f, s);
      setStats((prev) =>
        Math.abs(prev.fps - s.fps) > 1 || prev.ballSeen !== s.ballSeen || prev.brightness !== s.brightness ? s : prev,
      );
    };

    (async () => {
      try {
        let source: FrameSource;
        if (o.mode === 'demo') {
          source = new DemoSource(o.clock);
        } else {
          const video = videoRef.current;
          if (!video) throw new Error('no video element');
          stream = await startCamera(video, { facing: 'environment', batterySaver: o.batterySaver });
          const models = await loadVisionModels(o.spec?.players ?? 1);
          source = new CameraSource(video, models, {
            clock: o.clock,
            batterySaver: o.batterySaver,
            needsBall: o.spec?.trackers.includes('ball') ?? true,
          });
          if (o.mic) {
            try {
              let det: OnsetDetector | null = null;
              const t0 = performance.now() - o.clock();
              stopMic = await startMic((samples, t, sr) => {
                det ??= new OnsetDetector({ sampleRate: sr });
                for (const onset of det.push(samples, t - t0)) pipelineRef.current?.pushOnset(onset);
              });
            } catch {
              // No mic: camera timing only.
            }
          }
        }
        if (cancelled) return;
        sourceRef.current = source;
        source.start(onFrame);
        setStatus('running');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      sourceRef.current?.stop();
      sourceRef.current = null;
      stopStream(stream);
      stopMic?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.mode, o.batterySaver]);

  return { videoRef, canvasRef, status, error, stats, pipeline: pipelineRef, lastFrame };
}
