import type { ObjectDetector, PoseLandmarker } from '@mediapipe/tasks-vision';
import { OBJECT_LABELS, OBJECT_MODEL, POSE_MODEL, VISION_WASM } from './models.js';

// Loads MediaPipe only when the camera is used (it is big).

export interface VisionModels {
  pose: PoseLandmarker;
  objects: ObjectDetector;
  delegate: 'GPU' | 'CPU';
  close(): void;
}

let loading: Promise<VisionModels> | null = null;

export function loadVisionModels(players: number): Promise<VisionModels> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker, ObjectDetector } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(VISION_WASM);
    const make = async (delegate: 'GPU' | 'CPU') => {
      const pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: Math.min(4, Math.max(1, players)),
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      const objects = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate },
        runningMode: 'VIDEO',
        scoreThreshold: 0.3,
        maxResults: 6,
        categoryAllowlist: OBJECT_LABELS,
      });
      return { pose, objects, delegate, close: () => (pose.close(), objects.close()) };
    };
    try {
      return await make('GPU');
    } catch {
      return await make('CPU');
    }
  })();
  loading.catch(() => (loading = null));
  return loading;
}
