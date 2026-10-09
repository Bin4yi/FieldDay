import { rng } from './random.js';
import { QuestSpecSchema, type QuestSpec, type QuestSpecInput } from './spec.js';

// Builds quests from hand-written parts, no AI needed. Used for the Daily
// Quest (same for everyone: seeded by the date) and as the offline fallback
// when a brain cannot make a valid quest.
//
// Photo tasks only use things the phone can check offline: objects the
// detector knows (bench, bottle, ball...) and colours.

export const PHOTO_TASKS = [
  'a bench',
  'a bottle',
  'a ball',
  'a backpack',
  'a bird',
  'a plant in a pot',
  'something red',
  'something blue',
  'something yellow',
  'something green',
  'a leaf',
  'grass',
] as const;
export type PhotoTask = (typeof PHOTO_TASKS)[number];

const MOVES = [
  'Walk to the biggest tree you can see and touch it gently',
  'Jog to the far end of the grass and back',
  'Walk around the edge of the field once',
  'Skip to the nearest bench and back',
  'Do ten big steps forward and ten back',
  'Walk backwards slowly for ten steps (look behind you!)',
  'Hop on one foot five times, then switch',
  'Find a shady spot and stand there for ten seconds',
];

const FINDS: { instruction: string; task: PhotoTask }[] = [
  { instruction: 'Find something red and bring it back (or snap it)', task: 'something red' },
  { instruction: 'Find a leaf on the ground', task: 'a leaf' },
  { instruction: 'Find a bench and take a photo of it', task: 'a bench' },
  { instruction: 'Find something blue', task: 'something blue' },
  { instruction: 'Find something yellow', task: 'something yellow' },
  { instruction: 'Spot a bird (from far away!) and snap it', task: 'a bird' },
  { instruction: 'Take a photo of some grass', task: 'grass' },
  { instruction: 'Find a ball', task: 'a ball' },
];

const GAMES: { ref: string; goal: string; kidsGoal: string }[] = [
  { ref: 'sky_toss', goal: 'height_m >= 2', kidsGoal: 'height_m >= 1.3' },
  { ref: 'squat_storm', goal: 'count >= 15', kidsGoal: 'count >= 8' },
  { ref: 'jump_battle', goal: 'height_m >= 0.3', kidsGoal: 'height_m >= 0.15' },
  { ref: 'bounce_catch', goal: 'count >= 5', kidsGoal: 'count >= 3' },
  { ref: 'keepy_uppy', goal: 'count >= 5', kidsGoal: 'count >= 2' },
  { ref: 'reaction_race', goal: 'reaction_ms <= 500', kidsGoal: 'reaction_ms <= 800' },
];

const TITLES = ['Park Gauntlet', 'Grass Quest', 'Sunny Side Run', 'Field Adventure', 'Volt’s Challenge', 'Green Mile', 'Open Air Odyssey'];

export interface QuestGenOptions {
  seed: number;
  minutes?: number;
  players?: number;
  kids?: boolean;
  title?: string;
  kind?: QuestSpec['kind'];
}

export function generateQuest(o: QuestGenOptions): QuestSpec {
  const r = rng(o.seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const minutes = o.minutes ?? 20;
  const count = Math.max(3, Math.min(8, Math.round(minutes / 4)));
  const games = [...GAMES].sort(() => r() - 0.5);
  const finds = [...FINDS].sort(() => r() - 0.5);
  const moves = [...MOVES].sort(() => r() - 0.5);
  const steps: QuestSpecInput['steps'] = [];
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    if (last && minutes >= 15) {
      steps.push({ type: 'boss', spec_ref: 'boss_raid_basic' });
    } else if (i % 3 === 0) {
      const g = games[(i / 3) % games.length]!;
      steps.push({ type: 'game', spec_ref: g.ref, goal: o.kids ? g.kidsGoal : g.goal });
    } else if (i % 3 === 1) {
      steps.push({ type: 'move', instruction: moves[i % moves.length]!, check: 'confirm' });
    } else {
      const f = finds[i % finds.length]!;
      steps.push({ type: 'find', instruction: f.instruction, check: 'photo', photo_task: f.task });
    }
  }
  const input: QuestSpecInput = {
    title: o.title ?? pick(TITLES),
    kind: o.kind ?? 'chain',
    players: o.players ?? 1,
    minutes,
    steps,
    reward: { badge: o.kids ? 'Little Legend' : 'Grass Toucher', xp: count * 50 },
  };
  return QuestSpecSchema.parse(input);
}

/** Same quest for everyone on the same day. */
export function dailyQuest(date: Date, opts: Omit<QuestGenOptions, 'seed'> = {}): QuestSpec {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  return generateQuest({ minutes: 20, ...opts, seed, title: opts.title ?? `Daily Quest ${date.toISOString().slice(0, 10)}`, kind: 'daily' });
}
