// Where the on-device models come from. Checked against the official
// MediaPipe model bucket (storage.googleapis.com/mediapipe-models).
// They are fetched once, then the service worker keeps them for offline play.

export const VISION_WASM = '/mediapipe/vision';

export const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const OBJECT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';

/** COCO labels we care about. The ball is "sports ball". */
export const BALL_LABEL = 'sports ball';
export const OBJECT_LABELS = [
  'sports ball',
  'backpack',
  'handbag',
  'suitcase',
  'bottle',
  'cup',
  'bench',
  'chair',
  'frisbee',
  'umbrella',
  'potted plant',
  'dog',
  'cat',
  'bird',
  'person',
  'bicycle',
];
