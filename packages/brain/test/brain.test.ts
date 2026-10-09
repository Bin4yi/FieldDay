import { describe, expect, it } from 'vitest';
import { createGame, getTemplate, validateSpec, REFEREE_STYLES, type RefereeMoment } from '@fieldday/engine';
import { validateQuest } from '@fieldday/quests';
import {
  BrainRouter,
  GemmaBrain,
  checkFeasible,
  checkSpec,
  checkText,
  colourFacts,
  extractJson,
  friendlyLine,
  judgePhoto,
  lines,
  matchTemplate,
  readNumbers,
  refereeText,
  rulesDesign,
  rulesRemix,
  type BrainCallLog,
  type LlmRunner,
  type SmartBrain,
} from '../src/index.js';

const ctx = { players: 2, kidsMode: false, refereeStyle: 'football_announcer' as const };

/** A fake on-device model that answers from a script. */
function fakeRunner(answers: string[]): LlmRunner & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async generate(p) {
      prompts.push(p);
      const a = answers.shift();
      if (a === undefined) throw new Error('no more answers');
      return a;
    },
  };
}

describe('offline rules designer', () => {
  it('turns the Phase 3 sentence into a valid 2-player, 3-round throw battle', () => {
    const { spec, match } = rulesDesign('highest throw battle, 3 rounds, 2 players');
    expect(match.templateId).toBe('sky_toss');
    expect(spec.players).toBe(2);
    expect(spec.rounds).toBe(3);
    expect(validateSpec(spec).ok).toBe(true);
  });

  it('understands many ways of saying things', () => {
    expect(matchTemplate('who can jump the highest').templateId).toBe('jump_battle');
    expect(matchTemplate('throw the ball into my bag').templateId).toBe('target_toss');
    expect(matchTemplate('keepy uppy with a football').templateId).toBe('keepy_uppy');
    expect(matchTemplate('statues! dance and freeze').templateId).toBe('freeze_statue');
    expect(matchTemplate('fight a giant monster together').templateId).toBe('boss_raid_basic');
    expect(matchTemplate('simon says copy my moves').templateId).toBe('mirror_me');
    expect(matchTemplate('most squats').templateId).toBe('squat_storm');
    expect(readNumbers('five rounds for four players, thirty seconds')).toEqual({ players: 4, rounds: 5, timerS: 30 });
    expect(readNumbers('first to ten, red vs blue').firstTo).toBe(10);
  });

  it('applies teams and first-to', () => {
    const t = rulesDesign('squat battle red vs blue, 4 players').spec;
    expect(t.win_condition).toBe('team_total');
    expect(t.teams?.map((x) => x.players)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    const f = rulesDesign('bounce and catch, first to 5').spec;
    expect(f.win_condition).toBe('first_to');
    expect(f.target_score).toBe(5);
  });

  it('remixes', () => {
    const sky = getTemplate('sky_toss')!;
    expect(rulesRemix(sky, 'make it 5 rounds').spec.rounds).toBe(5);
    const odd = rulesRemix(sky, 'one hand only');
    expect(odd.understood).toBe(false);
    expect(odd.spec.hype_lines).toContain('House rule: one hand only');
  });
});

describe('JSON from a small model', () => {
  it('pulls JSON out of chatty, fenced or cut-off answers', () => {
    expect(extractJson('Sure! ```json\n{"a": 1, "b": [1,2,],}\n``` hope it helps')).toEqual({ a: 1, b: [1, 2] });
    expect(extractJson("{title: 'x', n: 2}")).toEqual({ title: 'x', n: 2 });
    expect(extractJson('{"a": {"b": [1, 2')).toEqual({ a: { b: [1, 2] } });
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('Gemma brain pipeline', () => {
  const good = JSON.stringify({
    title: 'Throw Off',
    one_line_rules: 'Throw high. Highest wins.',
    players: 2,
    turn_order: 'turns',
    rounds: 3,
    trackers: ['ball'],
    scoring: [{ event: 'ball_apex', measure: 'height_m', points: 'measure' }],
    win_condition: 'highest',
  });

  it('uses a valid model answer', async () => {
    const brain = new GemmaBrain(fakeRunner([`Here you go: ${good}`]));
    const o = await brain.design('throw off', ctx);
    expect(o.kind === 'game' && o.source).toBe('model');
  });

  it('sends errors back once to repair', async () => {
    const bad = good.replace('"win_condition":"highest"', '"win_condition":"most_awesome"');
    const runner = fakeRunner([bad, good]);
    const o = await new GemmaBrain(runner).design('throw off', ctx);
    expect(o.kind === 'game' && o.source).toBe('repaired');
    expect(runner.prompts[1]).toContain('win_condition');
  });

  it('falls back to the closest template if the repair also fails', async () => {
    const o = await new GemmaBrain(fakeRunner(['nonsense', '{"also": "bad"}'])).design('jump battle', ctx);
    expect(o.kind).toBe('game');
    if (o.kind === 'game') {
      expect(o.source).toBe('template');
      expect(o.spec.id).toBe('jump_battle');
      expect(o.notes.length).toBe(1);
    }
  });

  it('works with no model at all (offline rules)', async () => {
    const o = await new GemmaBrain(null).design('highest throw battle, 3 rounds, 2 players', ctx);
    expect(o.kind === 'game' && o.source).toBe('rules');
    if (o.kind === 'game') {
      // And the game actually plays.
      const g = createGame(o.spec, { autoAdvance: true });
      g.start(0);
      g.dispatch({ type: 'ball_apex', t: 1, measures: { height_m: 2 } });
      g.dispatch({ type: 'ball_catch', t: 2 });
      expect(g.total(0)).toBe(2);
    }
  });

  it('refuses unsafe requests kindly and offers a safer version', async () => {
    const o = await new GemmaBrain(null).design('throw the ball at my brother', ctx);
    expect(o.kind).toBe('unsafe');
    if (o.kind === 'unsafe') expect(o.saferPrompt).toContain('into a bag goal');
  });

  it('explains what the camera cannot do and offers the nearest game', async () => {
    const o = await new GemmaBrain(null).design('who can put the most spin on the ball', ctx);
    expect(o.kind).toBe('infeasible');
    if (o.kind === 'infeasible') expect(o.nearest.id).toBe('sky_toss');
  });

  it('rejects an unsafe model answer even if it is valid JSON', async () => {
    const unsafe = good.replace('Throw high. Highest wins.', 'Throw the ball at each other. Hit wins.');
    const o = await new GemmaBrain(fakeRunner([unsafe])).design('throw game', ctx);
    expect(o.kind === 'game' && o.source).toBe('template');
  });

  it('designs quests, falling back to ready-made steps', async () => {
    const o = await new GemmaBrain(fakeRunner(['not json'])).quest('a 20 minute park adventure for 4 kids', {
      players: 4,
      kidsMode: false,
    });
    expect(o.kind).toBe('quest');
    if (o.kind === 'quest') {
      expect(validateQuest(o.quest).ok).toBe(true);
      expect(o.quest.players).toBe(4);
    }
  });
});

describe('safety', () => {
  it('blocks dangerous ideas', () => {
    for (const t of [
      'kick the ball at people',
      'race across the road',
      'jump into the pool',
      'climb the tree and jump off',
      'play with fireworks',
      'tackle each other',
      'blindfold tag',
      'take photos of strangers',
    ]) {
      expect(checkText(t).safe, t).toBe(false);
    }
  });

  it('allows normal games', () => {
    for (const t of [
      'highest throw battle',
      'throw the ball into the bag',
      'take a water break',
      'jump as high as you can',
      'run to the tree and back',
      'trick shot target toss',
    ]) {
      expect(checkText(t).safe, t).toBe(true);
    }
  });

  it('all templates pass the safety check', () => {
    for (const id of ['sky_toss', 'boss_raid_basic', 'mirror_me']) expect(checkSpec(getTemplate(id)!).safe).toBe(true);
  });

  it('feasibility', () => {
    expect(checkFeasible('jump highest').ok).toBe(true);
    expect(checkFeasible('run a 5k').ok).toBe(false);
  });
});

describe('referee lines', () => {
  const spec = getTemplate('sky_toss')!;
  const names = ['Binula', 'Ama'];
  const moments: RefereeMoment[] = [
    { kind: 'game_start', t: 0 },
    { kind: 'turn_start', t: 0, round: 0, player: 1, toBeat: 2.4 },
    { kind: 'score', t: 1, player: 0, points: 2.4, event: 'ball_apex', measure: 'height_m', value: 2.4, roundScore: 2.4 },
    { kind: 'foul', t: 1, player: 1, event: 'cross_line', penalty: 'round_void' },
    { kind: 'game_over', t: 2, winners: [0], winningTeams: [] },
  ];

  it('every style has lines, all friendly and under 15 words once filled', () => {
    for (const style of REFEREE_STYLES) {
      for (const m of moments) {
        for (let pick = 0; pick < 3; pick++) {
          const text = refereeText(m, style, { names, spec: { ...spec, one_line_rules: 'Short.' }, pick });
          expect(text, `${style} ${m.kind}`).toBeTruthy();
          expect(friendlyLine(text!)).toBe(true);
          if (m.kind !== 'game_start') expect(text!.split(/\s+/).length, text!).toBeLessThan(15);
        }
      }
    }
  });

  it('fills names and numbers', () => {
    const text = refereeText(moments[1]!, 'football_announcer', { names, spec, pick: 0 });
    expect(text).toBe('Ama, the score to beat is 2.40 metres!');
  });

  it('kids mode removes trash talk', () => {
    expect(lines('pirate', 'foul', true).some((l) => l.includes('scallywag'))).toBe(false);
    expect(lines('pirate', 'foul', false).some((l) => l.includes('scallywag'))).toBe(true);
  });

  it('the friendly filter catches insults', () => {
    expect(friendlyLine('You are so slow, loser')).toBe(false);
    expect(friendlyLine('Massive throw!')).toBe(true);
  });
});

describe('photo check (offline)', () => {
  const img = (rgb: [number, number, number]) => {
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
    return colourFacts(data, 40, 40);
  };
  it('checks objects and colours', () => {
    expect(judgePhoto('a bench', { labels: [{ label: 'bench', score: 0.7 }], ...img([90, 90, 90]) }).passed).toBe(true);
    expect(judgePhoto('a bench', { labels: [{ label: 'dog', score: 0.9 }], ...img([90, 90, 90]) }).passed).toBe(false);
    expect(judgePhoto('something red', { labels: [], ...img([220, 30, 30]) }).passed).toBe(true);
    expect(judgePhoto('something red', { labels: [], ...img([30, 30, 220]) }).passed).toBe(false);
    expect(judgePhoto('grass', { labels: [], ...img([40, 160, 50]) }).passed).toBe(true);
  });
});

function asOpenAI(b: GemmaBrain): SmartBrain {
  Object.defineProperty(b, 'id', { value: 'openai' });
  return b as unknown as SmartBrain;
}

describe('brain router', () => {
  it('Open Mode uses Gemma only', async () => {
    const r = new BrainRouter({ mode: () => 'open', online: () => true, gemma: new GemmaBrain(null) });
    expect((await r.design('jump battle', ctx)).brain).toBe('gemma');
  });

  it('Boost Mode falls back to Gemma when OpenAI fails, and logs both calls', async () => {
    const log: BrainCallLog[] = [];
    const broken = asOpenAI(new GemmaBrain(null));
    broken.design = async () => {
      throw new Error('network down');
    };
    const r = new BrainRouter({ mode: () => 'boost', online: () => true, gemma: new GemmaBrain(null), openai: broken, log: (e) => log.push(e) });
    const o = await r.design('jump battle', ctx);
    expect(o.brain).toBe('gemma');
    expect(log.map((l) => [l.brain, l.ok])).toEqual([
      ['openai', false],
      ['gemma', true],
    ]);
    expect(log[1]!.fallback).toBe('template');
  });

  it('Auto uses Gemma when offline', () => {
    const openai = asOpenAI(new GemmaBrain(null));
    const r = new BrainRouter({ mode: () => 'auto', online: () => false, gemma: new GemmaBrain(null), openai });
    expect(r.current()).toBe('gemma');
  });
});
