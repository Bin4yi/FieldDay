import type { GameSpec, Measure, RefereeMoment, RefereeStyle } from '@fieldday/engine';
import { friendlyLine } from './safety.js';

// Referee line banks. Lines are written by hand and reviewed; the brain only
// fills slots: {name} {value} {lives} {move} {winner} {boss} {round} {adj}.
// Lines starting with "~" are friendly trash talk, removed in Kids Mode.

export type LineKind =
  | 'game_start'
  | 'turn_start'
  | 'turn_start_beat'
  | 'round_start'
  | 'score_measure'
  | 'score_points'
  | 'new_best'
  | 'foul'
  | 'timeout'
  | 'life_lost'
  | 'out'
  | 'call'
  | 'boss_hit'
  | 'boss_defeated'
  | 'boss_survived'
  | 'lead_change'
  | 'win'
  | 'team_win'
  | 'no_winner'
  | 'hydrate'
  | 'ghost_ahead'
  | 'ghost_behind'
  | 'power_up';

type Bank = Record<LineKind, string[]>;

const ADJ: Record<RefereeStyle, string[]> = {
  football_announcer: ['massive', 'brilliant', 'stunning', 'world-class', 'tremendous'],
  wrestling_hype: ['MONSTROUS', 'EARTH-SHAKING', 'LEGENDARY', 'ELECTRIC', 'UNSTOPPABLE'],
  calm_coach: ['lovely', 'smooth', 'strong', 'steady', 'great'],
  robot_ref: ['OPTIMAL', 'EFFICIENT', 'CALCULATED', 'PRECISE', 'MAXIMAL'],
  pirate: ['mighty', 'shipshape', 'fearsome', 'golden', 'swashbuckling'],
};

const BANKS: Record<RefereeStyle, Bank> = {
  football_announcer: {
    game_start: ['Welcome to {title}! {rules}', 'Kick-off time! {title}. {rules}'],
    turn_start: ['{name}, you are up!', 'Over to {name}!', 'Here comes {name}!'],
    turn_start_beat: ['{name}, the score to beat is {value}!', '{name} needs {value} to take the lead!'],
    round_start: ['Round {round}! Go!', 'Round {round}, here we go!'],
    score_measure: ['{value} from {name}! {adj}!', 'What a {adj} effort, {value}!', '{name} with {value}!'],
    score_points: ['Point to {name}!', '{name} scores!', 'Lovely stuff from {name}!'],
    new_best: ['New personal best for {name}!', 'That is a career best, {name}!'],
    foul: ['Foul! {name}, that one does not count.', 'Ooh, foul from {name}!', '~The ref saw that, {name}!'],
    timeout: ['Time! {name} ran out of time.', 'The clock beats {name} this time.'],
    life_lost: ['{name} loses a life! {lives} left.', 'Down to {lives}, {name}!'],
    out: ['{name} is out of the game!', 'And {name} is off the pitch!'],
    call: ['{move}!', 'Quick! {move}!'],
    boss_hit: ['Big hit on {boss}!', '{boss} felt that one!'],
    boss_defeated: ['{boss} is DOWN! What a team!', 'Victory! {boss} has been beaten!'],
    boss_survived: ['{boss} survives! Rematch?', 'The final whistle, and {boss} is still standing.'],
    lead_change: ['{name} takes the lead!', 'New leader: {name}!'],
    win: ['Full time! {winner} wins it!', '{winner} lifts the trophy!'],
    team_win: ['Full time! Team {winner} wins!', 'It is Team {winner}!'],
    no_winner: ['Full time! A draw today.', 'No winner this time. Go again?'],
    hydrate: ['Water break! Drink some water and find some shade.', 'Half-time break: water and shade, everyone!'],
    ghost_ahead: ['You beat the ghost with {value}!', 'Ahead of the ghost! {value}!'],
    ghost_behind: ['The ghost did {value}. You need more!', '{name}, the ghost is ahead with {value}!'],
    power_up: ['{name} earns a {move}!', 'Power-up for {name}: {move}!'],
  },
  wrestling_hype: {
    game_start: ['LADIES AND GENTLEMEN! {title}! {rules}', 'ARE YOU READY? {title}! {rules}'],
    turn_start: ['IN THIS CORNER, {name}!', 'HERE COMES {name}!'],
    turn_start_beat: ['{name} MUST BEAT {value}!', 'THE NUMBER IS {value}, {name}!'],
    round_start: ['ROUND {round}! FIGHT!', 'DING DING! ROUND {round}!'],
    score_measure: ['{value}! {adj}!', '{name} DROPS {value}!', 'OH MY! {value}!'],
    score_points: ['{name} SCORES!', 'BOOM! Point to {name}!'],
    new_best: ['A NEW RECORD FOR {name}!', 'HISTORY! {name} BREAKS THE RECORD!'],
    foul: ['FOUL! {name}!', '~The crowd boos, {name}!', 'NO NO NO, {name}! FOUL!'],
    timeout: ['TIME IS UP FOR {name}!', 'THE BELL RINGS ON {name}!'],
    life_lost: ['{name} IS HURTING! {lives} LEFT!', '{name} DOWN TO {lives}!'],
    out: ['{name} IS ELIMINATED!', '{name} LEAVES THE RING!'],
    call: ['{move}! NOW!', 'EVERYBODY {move}!'],
    boss_hit: ['{boss} IS ROCKED!', 'WHAT A HIT ON {boss}!'],
    boss_defeated: ['{boss} IS DOWN FOR THE COUNT!', 'YOU DID IT! {boss} IS FINISHED!'],
    boss_survived: ['{boss} STILL STANDS! REMATCH!', '{boss} WINS THIS ONE! RUN IT BACK!'],
    lead_change: ['{name} SEIZES THE LEAD!', 'NEW CHAMPION IN THE MAKING: {name}!'],
    win: ['AND THE WINNER IS... {winner}!', '{winner} IS YOUR CHAMPION!'],
    team_win: ['TEAM {winner} TAKES THE BELT!', 'TEAM {winner} WINS!'],
    no_winner: ['A DRAW! NOBODY WINS TONIGHT!', 'NO CHAMPION TODAY!'],
    hydrate: ['CHAMPIONS DRINK WATER! Break in the shade!', 'HYDRATION BREAK! Water and shade!'],
    ghost_ahead: ['YOU CRUSHED THE GHOST WITH {value}!', 'GHOST DEFEATED! {value}!'],
    ghost_behind: ['THE GHOST HIT {value}! BEAT IT!', 'THE GHOST LEADS WITH {value}!'],
    power_up: ['{name} GETS A {move}!', 'POWER-UP! {move} FOR {name}!'],
  },
  calm_coach: {
    game_start: ['Let us play {title}. {rules}', 'Okay team, {title}. {rules}'],
    turn_start: ['Your turn, {name}. Take your time.', 'Ready when you are, {name}.'],
    turn_start_beat: ['{name}, aim for {value}. You can do it.', 'The target is {value}, {name}.'],
    round_start: ['Round {round}. Nice and steady.', 'Round {round}. Off you go.'],
    score_measure: ['{value}. {adj} work, {name}.', 'Nice, {value}!', 'Good one, {name}: {value}.'],
    score_points: ['Well done, {name}.', 'Nice point, {name}.'],
    new_best: ['That is your best ever, {name}. Great job.', 'New personal best. Proud of you, {name}.'],
    foul: ['That one does not count, {name}. Try again.', 'Small foul, {name}. Reset and go again.'],
    timeout: ['Time, {name}. Next one will go better.', 'Out of time, {name}. That is okay.'],
    life_lost: ['{name} loses a life. {lives} left. Keep going.', '{lives} lives left, {name}.'],
    out: ['{name} is out. Great effort.', 'Well played, {name}. You can cheer the others now.'],
    call: ['{move}.', 'And... {move}.'],
    boss_hit: ['Nice hit on {boss}.', '{boss} is getting weaker.'],
    boss_defeated: ['You beat {boss} together. Lovely teamwork.', '{boss} is down. Great job, team.'],
    boss_survived: ['{boss} made it this time. Shall we try again?', 'Close one. Rest, then try again.'],
    lead_change: ['{name} is in front now.', 'Lead changes to {name}.'],
    win: ['Well played everyone. {winner} wins.', '{winner} wins. Great game, all of you.'],
    team_win: ['Team {winner} wins. Well played, everyone.', 'Nice teamwork, Team {winner}.'],
    no_winner: ['A draw. Good game, everyone.', 'Nobody wins this time. Good effort.'],
    hydrate: ['Time for a water break. Find some shade.', 'Let us drink some water and rest in the shade.'],
    ghost_ahead: ['You beat the ghost: {value}. Well done.', 'Ahead of the ghost with {value}.'],
    ghost_behind: ['The ghost did {value}. You can catch it.', 'Aim for {value} to beat the ghost.'],
    power_up: ['{name} earned a {move}.', 'Nice, {name}: {move}.'],
  },
  robot_ref: {
    game_start: ['GAME LOADED: {title}. RULES: {rules}', 'BEEP. {title} INITIALISED. {rules}'],
    turn_start: ['PLAYER {name}: BEGIN.', 'NEXT UNIT: {name}.'],
    turn_start_beat: ['{name}: TARGET {value}.', 'TARGET VALUE FOR {name}: {value}.'],
    round_start: ['ROUND {round}: START.', 'BEEP. ROUND {round}.'],
    score_measure: ['MEASURED: {value}. {adj}.', '{name}: {value}. RECORDED.'],
    score_points: ['POINT: {name}.', 'SCORE INCREMENTED: {name}.'],
    new_best: ['NEW PERSONAL MAXIMUM: {name}.', 'RECORD UPDATED FOR {name}.'],
    foul: ['FOUL DETECTED: {name}.', '~ERROR 404: RULES NOT FOUND, {name}.'],
    timeout: ['TIMER EXPIRED: {name}.', 'TIME LIMIT REACHED: {name}.'],
    life_lost: ['LIFE LOST: {name}. REMAINING: {lives}.', '{name}: LIVES {lives}.'],
    out: ['{name}: ELIMINATED.', 'UNIT {name} OFFLINE.'],
    call: ['COMMAND: {move}.', '{move}. EXECUTE.'],
    boss_hit: ['DAMAGE DEALT TO {boss}.', '{boss} INTEGRITY FALLING.'],
    boss_defeated: ['{boss}: DESTROYED. TEAM SUCCESS.', 'TARGET {boss} NEUTRALISED.'],
    boss_survived: ['{boss} SURVIVED. RETRY RECOMMENDED.', 'MISSION FAILED. REBOOT AND RETRY.'],
    lead_change: ['LEADER CHANGED: {name}.', 'NEW LEADER: {name}.'],
    win: ['WINNER COMPUTED: {winner}.', 'RESULT: {winner} WINS.'],
    team_win: ['WINNING TEAM: {winner}.', 'TEAM {winner}: VICTORY.'],
    no_winner: ['RESULT: NO WINNER.', 'TIE DETECTED.'],
    hydrate: ['WATER LEVEL LOW. DRINK WATER. FIND SHADE.', 'COOLING BREAK REQUIRED. WATER AND SHADE.'],
    ghost_ahead: ['GHOST BEATEN. VALUE {value}.', 'YOU EXCEED GHOST: {value}.'],
    ghost_behind: ['GHOST VALUE: {value}. EXCEED IT.', 'GHOST LEADS: {value}.'],
    power_up: ['POWER-UP GRANTED: {move} TO {name}.', '{name} ACQUIRED {move}.'],
  },
  pirate: {
    game_start: ['Ahoy! {title}! {rules}', 'All hands on deck! {title}! {rules}'],
    turn_start: ['{name}, step up, matey!', 'Yer turn, {name}!'],
    turn_start_beat: ['{name}, beat {value} or walk the plank!', 'The treasure is {value}, {name}!'],
    round_start: ['Round {round}! Hoist the sails!', 'Round {round}, me hearties!'],
    score_measure: ['{value}! A {adj} haul!', 'Arr! {name} gets {value}!'],
    score_points: ['Doubloon for {name}!', 'Arr, {name} scores!'],
    new_best: ['A new treasure record for {name}!', 'Shiver me timbers, a best for {name}!'],
    foul: ['Foul play, {name}! That be not counted.', '~Ye scallywag, {name}! Foul!'],
    timeout: ['The hourglass ran out, {name}!', 'Time be up, {name}!'],
    life_lost: ['{name} loses a life! {lives} left, matey.', 'Down to {lives}, {name}!'],
    out: ['{name} walks the plank!', '{name} is overboard!'],
    call: ['{move}, ye dogs!', 'All hands: {move}!'],
    boss_hit: ['A cannonball hits {boss}!', '{boss} is taking water!'],
    boss_defeated: ['{boss} sinks to the deep! Victory!', 'We beat {boss}! The treasure is ours!'],
    boss_survived: ['{boss} sails away! We will get it next time!', 'Arr, {boss} escaped. Rematch!'],
    lead_change: ['{name} takes the captain’s hat!', '{name} leads the crew now!'],
    win: ['The treasure goes to {winner}!', 'Captain {winner} wins!'],
    team_win: ['Crew {winner} wins the treasure!', 'Victory for crew {winner}!'],
    no_winner: ['No treasure today, mateys.', 'A tie on the high seas!'],
    hydrate: ['Water break, crew! Drink up and find shade.', 'Rest in the shade and drink water, me hearties!'],
    ghost_ahead: ['Ye beat the ghost ship with {value}!', 'The ghost is behind ye! {value}!'],
    ghost_behind: ['The ghost ship got {value}. Beat it!', 'Ghost leads with {value}, matey!'],
    power_up: ['{name} finds a {move}!', 'Treasure! A {move} for {name}!'],
  },
};

const UNIT: Partial<Record<Measure, { long: string; digits: number }>> = {
  height_m: { long: 'metres', digits: 2 },
  distance_m: { long: 'metres', digits: 1 },
  speed_mps: { long: 'metres per second', digits: 1 },
  duration_s: { long: 'seconds', digits: 1 },
  reaction_ms: { long: 'milliseconds', digits: 0 },
};

export function sayMeasure(value: number, measure?: Measure | null): string {
  const u = measure ? UNIT[measure] : undefined;
  if (!u) return `${Math.round(value * 10) / 10}`;
  return `${value.toFixed(u.digits)} ${u.long}`;
}

const MOVE_WORDS: Record<string, string> = {
  freeze: 'FREEZE',
  hands_up: 'HANDS UP',
  squat: 'SQUAT',
  jump: 'JUMP',
  lean_left: 'LEAN LEFT',
  lean_right: 'LEAN RIGHT',
  punch: 'PUNCH',
};

const POWER_WORDS = { shield: 'SHIELD', steal: 'STEAL', freeze: 'FREEZE RAY', double: 'DOUBLE' } as const;

export interface LineContext {
  names: string[];
  spec: GameSpec;
  kids?: boolean;
  /** Seed so tests are repeatable. */
  pick?: number;
  teamNames?: string[];
}

export function lines(style: RefereeStyle, kind: LineKind, kids = false): string[] {
  const bank = BANKS[style][kind];
  const usable = bank.filter((l) => !(kids && l.startsWith('~')));
  return (usable.length ? usable : bank).map((l) => l.replace(/^~/, ''));
}

export function fill(template: string, slots: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(slots[k] ?? ''));
}

let counter = 0;

/** Pick and fill one line. */
export function line(style: RefereeStyle, kind: LineKind, slots: Record<string, string | number>, kids = false, pick?: number): string {
  const options = lines(style, kind, kids);
  const n = pick ?? counter++;
  const adjs = ADJ[style];
  const text = fill(options[n % options.length]!, { adj: adjs[n % adjs.length]!, ...slots });
  return friendlyLine(text) ? text : fill(lines('calm_coach', kind, true)[0]!, slots);
}

/** Turn an engine moment into a referee line (or null for moments we keep quiet about). */
export function refereeText(m: RefereeMoment, style: RefereeStyle, ctx: LineContext): string | null {
  const name = (p: number | null) => (p === null ? 'everyone' : (ctx.names[p] ?? `Player ${p + 1}`));
  const measure = ctx.spec.scoring.find((r) => r.points === 'measure')?.measure ?? null;
  const kids = ctx.kids ?? false;
  const say = (kind: LineKind, slots: Record<string, string | number> = {}) =>
    line(style, kind, { title: ctx.spec.title, rules: ctx.spec.one_line_rules, ...slots }, kids, ctx.pick);
  switch (m.kind) {
    case 'game_start':
      return say('game_start');
    case 'turn_start':
      if (m.player === null) return say('round_start', { round: m.round + 1 });
      return m.toBeat !== null
        ? say('turn_start_beat', { name: name(m.player), value: sayMeasure(m.toBeat, measure) })
        : say('turn_start', { name: name(m.player) });
    case 'score':
      if (ctx.spec.win_condition === 'co_op') return null;
      if (m.value !== undefined && m.measure && m.measure !== 'count') {
        return say('score_measure', { name: name(m.player), value: sayMeasure(m.value, m.measure) });
      }
      return ctx.spec.turn_order === 'turns' ? say('score_points', { name: name(m.player) }) : null;
    case 'new_best':
      return say('new_best', { name: name(m.player) });
    case 'foul':
      return m.event === 'timer_end' ? say('timeout', { name: name(m.player) }) : say('foul', { name: name(m.player) });
    case 'life_lost':
      return m.lives > 0 ? say('life_lost', { name: name(m.player), lives: m.lives }) : null;
    case 'out':
      return say('out', { name: name(m.player) });
    case 'call':
      return say('call', { move: MOVE_WORDS[m.event] ?? m.event.toUpperCase() });
    case 'boss_hit':
      return null;
    case 'boss_defeated':
      return say('boss_defeated', { boss: ctx.spec.boss?.name ?? 'the boss' });
    case 'lead_change':
      return say('lead_change', { name: name(m.player) });
    case 'power_up':
      return say('power_up', { name: name(m.player), move: POWER_WORDS[m.power] });
    case 'power_used':
      if (m.power === 'steal' && m.target !== undefined) return `${name(m.player)} steals 5 from ${name(m.target)}!`;
      if (m.power === 'freeze' && m.target !== undefined) return `${name(m.target)} is frozen: next score counts half!`;
      if (m.power === 'shield') return `Shield! ${name(m.player)} is safe!`;
      return `Double points for ${name(m.player)}!`;
    case 'rule_change':
      return m.text;
    case 'game_over':
      if (ctx.spec.win_condition === 'co_op') {
        return m.winners.length ? null : say('boss_survived', { boss: ctx.spec.boss?.name ?? 'the boss' });
      }
      if (m.winningTeams.length) return say('team_win', { winner: m.winningTeams.join(' and ') });
      if (!m.winners.length) return say('no_winner');
      return say('win', { winner: m.winners.map((p) => name(p)).join(' and ') });
    default:
      return null;
  }
}

/** Words for the kinds the engine does not emit (hydration, ghosts, power-ups). */
export function extraLine(kind: 'hydrate' | 'ghost_ahead' | 'ghost_behind' | 'power_up', style: RefereeStyle, slots: Record<string, string | number> = {}, kids = false): string {
  return line(style, kind, slots, kids);
}
