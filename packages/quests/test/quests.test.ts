import { describe, expect, it } from 'vitest';
import { QuestRun, validateQuest } from '../src/index.js';

const parkGauntlet = {
  title: 'Park Gauntlet',
  steps: [
    { type: 'game', spec_ref: 'sky_toss', goal: 'height_m >= 2' },
    { type: 'move', instruction: 'Walk to the biggest tree you can see', check: 'photo', photo_task: 'a tree' },
    { type: 'game', spec_ref: 'squat_storm', goal: 'count >= 20' },
    { type: 'find', instruction: 'Find something red and bring it back', check: 'photo', photo_task: 'a red object' },
    { type: 'boss', spec_ref: 'boss_raid_basic' },
  ],
  reward: { badge: 'Gauntlet Runner', xp: 300 },
};

describe('quest spec', () => {
  it('accepts the Park Gauntlet example', () => {
    const r = validateQuest(parkGauntlet);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.quest.kind).toBe('chain');
  });

  it('rejects unknown games, missing photo tasks and bad goals', () => {
    const r = validateQuest({
      ...parkGauntlet,
      steps: [
        { type: 'game', spec_ref: 'moon_jump' },
        { type: 'find', instruction: 'Find a leaf', check: 'photo' },
        { type: 'game', spec_ref: 'sky_toss', goal: 'before ball_release' },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('steps.0.spec_ref: unknown game "moon_jump"');
      expect(r.errors).toContain('steps.1.photo_task: a photo check needs photo_task');
      expect(r.errors.some((e) => e.startsWith('steps.2.goal'))).toBe(true);
    }
  });
});

describe('quest runner', () => {
  it('runs a 5-step quest, retrying a failed goal', () => {
    const r = validateQuest(parkGauntlet);
    if (!r.ok) throw new Error('invalid');
    const run = new QuestRun(r.quest, 0);
    expect(run.reportGame({ height_m: 1.6 }, true, 1)).toBe(false);
    expect(run.state.stepIndex).toBe(0);
    expect(run.reportGame({ height_m: 2.3 }, true, 2)).toBe(true);
    expect(run.reportGame({ count: 99 }, true, 3)).toBe(false); // wrong step type: it is a "move" step
    expect(run.reportCheck(true, 4)).toBe(true);
    expect(run.reportGame({ count: 21 }, true, 5)).toBe(true);
    expect(run.reportCheck(true, 6)).toBe(true);
    expect(run.progress).toBe(0.8);
    expect(run.reportGame({}, false, 7)).toBe(false); // boss not beaten
    expect(run.reportGame({}, true, 8)).toBe(true);
    expect(run.state.status).toBe('done');
    expect(run.state.finishedAt).toBe(8);
    expect(run.current).toBeNull();
  });

  it('passes the baton in relay quests', () => {
    const r = validateQuest({ ...parkGauntlet, kind: 'relay', players: 2 });
    if (!r.ok) throw new Error('invalid');
    const run = new QuestRun(r.quest, 0);
    expect(run.activePlayer).toBe(0);
    run.reportGame({ height_m: 3 }, true, 1);
    expect(run.activePlayer).toBe(1);
    run.reportCheck(true, 2);
    expect(run.activePlayer).toBe(0);
  });
});
