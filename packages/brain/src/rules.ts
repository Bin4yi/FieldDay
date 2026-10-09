import { GameSpecSchema, TEMPLATES, getTemplate, withPlayers, type GameSpec } from '@fieldday/engine';

// The offline, no-AI designer. It reads the request for known words and
// numbers, picks the closest template, and changes it. Used when the Gemma
// model is not downloaded yet, and as the final fallback when a model
// answer cannot be repaired.

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  hundred: 100,
  a: 1,
  an: 1,
  single: 1,
  double: 2,
  couple: 2,
};

/** Lowercase, numbers as digits ("three rounds" → "3 rounds"). */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/\b([a-z]+)\b/g, (w) => (w in NUMBER_WORDS && !['a', 'an', 'double', 'single'].includes(w) ? String(NUMBER_WORDS[w]) : w))
    .replace(/\s+/g, ' ')
    .trim();
}

const KEYWORDS: Record<string, [RegExp, number][]> = {
  sky_toss: [
    [/\bhigh(est|er)?\b/, 2],
    [/\bthrow|toss|chuck|lob\b/, 2],
    [/\bsky|up\b/, 1],
  ],
  long_throw: [
    [/\bfar(thest|ther)?|long(est)?|distance\b/, 3],
    [/\bthrow|toss|chuck\b/, 1],
  ],
  target_toss: [
    [/\btarget|goal|bag|bin|bucket|basket|aim|hoop\b/, 3],
    [/\bthrow|toss|shoot\b/, 1],
  ],
  bounce_catch: [
    [/\bbounce|bouncing\b/, 3],
    [/\bcatch(es|ing)?\b/, 2],
  ],
  keepy_uppy: [
    [/\bkeep(y|ie)?[- ]?up(py|s)?|juggl\w*|keep it (up|in the air)\b/, 4],
    [/\bkick|header|football|soccer\b/, 1],
  ],
  jump_battle: [
    [/\bjump(s|ing)?|leap|hop\b/, 3],
    [/\bhigh(est)?\b/, 1],
  ],
  squat_storm: [
    [/\bsquat(s)?\b/, 4],
    [/\bexercise|workout|fitness|reps?\b/, 1],
  ],
  freeze_statue: [
    [/\bfreeze|statue|still|stop and go|musical\b/, 4],
    [/\bdance|dancing\b/, 2],
  ],
  reaction_race: [
    [/\breaction|reflex|quick(est)?|fast(est)? (hands|reaction)|when i say go|hands up\b/, 4],
  ],
  mirror_me: [
    [/\bmirror|copy|simon says|follow the leader|same move\b/, 4],
    [/\bmoves?|pose\b/, 1],
  ],
  sprint_tap: [
    [/\bsprint|run(ning)?|race|dash|shuttle|relay\b/, 3],
    [/\btouch|tap|cone|marker|tree\b/, 1],
  ],
  boss_raid_basic: [
    [/\bboss|monster|raid|dragon|giant|villain|team up|together|co-?op\b/, 4],
    [/\bfight|battle|defeat\b/, 1],
  ],
};

export interface RulesMatch {
  templateId: string;
  /** How sure we are (0 = nothing matched, the default game was picked). */
  score: number;
}

export function matchTemplate(text: string): RulesMatch {
  const t = normalise(text);
  let best: RulesMatch = { templateId: 'sky_toss', score: 0 };
  for (const [id, rules] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const [re, w] of rules) if (re.test(t)) score += w;
    if (score > best.score) best = { templateId: id, score };
  }
  return best;
}

export interface RequestNumbers {
  players?: number;
  rounds?: number;
  timerS?: number;
  firstTo?: number;
  lives?: number;
  teams?: boolean;
  kids?: boolean;
  together?: boolean;
}

export function readNumbers(text: string): RequestNumbers {
  const t = normalise(text);
  const n = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : undefined;
  };
  const out: RequestNumbers = {};
  const players = n(/\b(\d+)\s*(players?|people|kids|friends|of us|persons?)\b/) ?? n(/\bfor\s*(\d+)\b/);
  if (players !== undefined) out.players = players;
  if (/\b(solo|just me|by myself|alone|1 player)\b/.test(t)) out.players = 1;
  const rounds = n(/\b(\d+)\s*(rounds?|turns?|throws?|jumps?|goes|tries|attempts?)\b/);
  if (rounds !== undefined) out.rounds = rounds;
  const secs = n(/\b(\d+)\s*(seconds?|secs?|s)\b/);
  const mins = n(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?)\b/);
  if (secs !== undefined) out.timerS = secs;
  else if (mins !== undefined) out.timerS = Math.round(mins * 60);
  const firstTo = n(/\bfirst to\s*(\d+)\b/);
  if (firstTo !== undefined) out.firstTo = firstTo;
  const lives = n(/\b(\d+)\s*lives\b/);
  if (lives !== undefined) out.lives = lives;
  if (/\bteams?|vs|versus|red and blue\b/.test(t)) out.teams = true;
  if (/\bkids?|children|little ones|my son|my daughter\b/.test(t)) out.kids = true;
  if (/\btogether|co-?op|team up\b/.test(t)) out.together = true;
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Apply numbers from a request to a spec, keeping it valid. */
export function applyNumbers(spec: GameSpec, nums: RequestNumbers): GameSpec {
  let s: GameSpec = { ...spec };
  if (nums.players !== undefined) {
    const p = clamp(nums.players, 1, 8);
    s = { ...s, max_players: Math.max(s.max_players ?? s.players, p), min_players: Math.min(s.min_players ?? s.players, p) };
    s = withPlayers(s, p);
  }
  if (nums.rounds !== undefined) s.rounds = clamp(nums.rounds, 1, 20);
  if (nums.timerS !== undefined) s.timer_s = clamp(nums.timerS, 3, 600);
  if (nums.lives !== undefined) s.lives = clamp(nums.lives, 1, 10);
  if (nums.firstTo !== undefined && s.win_condition !== 'co_op' && s.win_condition !== 'lowest') {
    s.win_condition = 'first_to';
    s.target_score = clamp(nums.firstTo, 1, 10000);
    s.aggregate = 'sum';
    s.rounds = Math.max(s.rounds, 20);
  }
  if (nums.teams && s.players >= 2 && s.win_condition !== 'co_op') {
    const half = Math.ceil(s.players / 2);
    s.teams = [
      { name: 'Red', players: Array.from({ length: half }, (_, i) => i) },
      { name: 'Blue', players: Array.from({ length: s.players - half }, (_, i) => i + half) },
    ];
    if (s.teams[1]!.players.length === 0) delete s.teams;
    else {
      s.win_condition = 'team_total';
      s.mode = 'team';
      s.aggregate = 'sum';
    }
  }
  if (nums.kids) {
    if (s.timer_s) s.timer_s = Math.min(600, Math.round(s.timer_s * 1.3));
    s.referee_style = 'calm_coach';
    s.handicaps = undefined;
  }
  if (s.players === 1 && s.mode && s.mode !== 'boss_raid') s.mode = 'solo';
  return s;
}

/** The whole offline designer: text in, valid spec out. */
export function rulesDesign(text: string, players?: number): { spec: GameSpec; match: RulesMatch } {
  const match = matchTemplate(text);
  const base = getTemplate(match.templateId) ?? TEMPLATES[0]!;
  const nums = readNumbers(text);
  if (nums.players === undefined && players !== undefined) nums.players = players;
  const spec = applyNumbers(base, nums);
  const checked = GameSpecSchema.safeParse(spec);
  return { spec: checked.success ? checked.data : base, match };
}

/** Offline remix: "make it 5 rounds", "first to 10", "double points", "30 seconds". */
export function rulesRemix(spec: GameSpec, change: string): { spec: GameSpec; understood: boolean } {
  const t = normalise(change);
  const nums = readNumbers(change);
  let s = applyNumbers(spec, nums);
  let understood = Object.keys(nums).length > 0;
  if (/\bdouble points?|2x|twice the points\b/.test(t)) {
    s = { ...s, scoring: s.scoring.map((r) => (typeof r.points === 'number' ? { ...r, points: r.points * 2 } : r)) };
    understood = true;
  }
  if (/\b(lowest|least|slowest) wins?\b/.test(t) && s.win_condition === 'highest') {
    s = { ...s, win_condition: 'lowest' };
    understood = true;
  }
  if (/\bharder|faster|shorter\b/.test(t) && s.timer_s) {
    s = { ...s, timer_s: Math.max(3, Math.round(s.timer_s * 0.7)) };
    understood = true;
  }
  if (/\beasier|longer|slower\b/.test(t) && s.timer_s) {
    s = { ...s, timer_s: Math.min(600, Math.round(s.timer_s * 1.4)) };
    understood = true;
  }
  if (!understood) {
    // Keep it as an honour rule the referee reads out.
    const rule = change.trim().slice(0, 70);
    s = { ...s, hype_lines: [...(s.hype_lines ?? []), `House rule: ${rule}`].slice(-8) };
  }
  const checked = GameSpecSchema.safeParse(s);
  return { spec: checked.success ? checked.data : spec, understood };
}
