import { normalise } from './rules.js';

// Can the camera and mic actually referee this? If not, say so and offer the
// nearest game that works.

const CANT: { re: RegExp; why: string; nearest: string }[] = [
  { re: /\b(spin|rpm|rotation|curve|swerve)\b/, why: 'The camera cannot measure spin on a ball.', nearest: 'sky_toss' },
  { re: /\b(heart ?rate|pulse|calories|breath(ing)?|sweat)\b/, why: 'The phone cannot measure your heart rate or calories.', nearest: 'squat_storm' },
  { re: /\b(km\/?h|mph|kilometres?|kilometers?|miles?|marathon|5k|10k)\b/, why: 'The camera can only see a few metres, not long runs.', nearest: 'sprint_tap' },
  { re: /\b(hide and seek|hide-and-seek|hiding)\b/, why: 'The camera cannot see people who are hiding.', nearest: 'freeze_statue' },
  { re: /\b(bike|bicycle|skateboard|scooter|rollerblad\w*|skates?)\b/, why: 'Wheels move too fast and too far for the camera.', nearest: 'sprint_tap' },
  { re: /\b(night|in the dark|dark room)\b/, why: 'The camera needs daylight to see you.', nearest: 'squat_storm' },
  { re: /\b(golf|cricket bat|tennis serve|racket|racquet|badminton)\b/, why: 'Fast rackets and bats are too quick for the camera.', nearest: 'target_toss' },
  { re: /\b(push-?ups?|plank|sit-?ups?|burpees?)\b/, why: 'Lying on the ground hides your body from the camera.', nearest: 'squat_storm' },
];

export interface Feasibility {
  ok: boolean;
  why?: string;
  /** Template id of the nearest game that works. */
  nearest?: string;
}

export function checkFeasible(text: string): Feasibility {
  const t = normalise(text);
  for (const c of CANT) if (c.re.test(t)) return { ok: false, why: c.why, nearest: c.nearest };
  return { ok: true };
}
