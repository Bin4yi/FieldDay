import type { EventType, Measure, Penalty } from './blocks.js';
import { evalCondition, type ConditionContext } from './condition.js';
import type { GameEvent } from './events.js';
import type { EventMatch, GameSpec } from './spec.js';

// The rules engine. Pure TypeScript: no DOM, no clock, no randomness
// except a seeded RNG. Feed it events with timestamps, get back
// "referee moments" that the UI and voice turn into words.

export interface PlayerInfo {
  name: string;
}

export interface EngineOptions {
  players?: PlayerInfo[];
  /** Seed for referee calls, so a game can be replayed exactly. */
  seed?: number;
  /** Start the next turn as soon as one ends (tests, ghosts). The app uses a countdown instead. */
  autoAdvance?: boolean;
}

export type RefereeMoment =
  | { kind: 'game_start'; t: number }
  | { kind: 'turn_start'; t: number; round: number; player: number | null; toBeat: number | null }
  | {
      kind: 'score';
      t: number;
      player: number;
      points: number;
      event: EventType;
      measure?: Measure;
      value?: number;
      roundScore: number;
    }
  | { kind: 'new_best'; t: number; player: number; measure: Measure; value: number }
  | { kind: 'foul'; t: number; player: number; event: EventType; penalty: Penalty; points?: number }
  | { kind: 'life_lost'; t: number; player: number; lives: number }
  | { kind: 'out'; t: number; player: number }
  | { kind: 'call'; t: number; event: EventType }
  | { kind: 'call_end'; t: number; event: EventType }
  | { kind: 'boss_hit'; t: number; player: number; damage: number; hp: number }
  | { kind: 'boss_defeated'; t: number }
  | { kind: 'lead_change'; t: number; player: number }
  | { kind: 'turn_end'; t: number; round: number; player: number | null }
  | { kind: 'game_over'; t: number; winners: number[]; winningTeams: string[] };

export type MomentKind = RefereeMoment['kind'];

export interface PlayerStats {
  /** Number of scoring events. */
  count: number;
  /** Best value seen per measure (highest, or lowest for time-like measures in "lowest" games). */
  best: Partial<Record<Measure, number>>;
  fouls: number;
}

export interface PlayerState {
  index: number;
  name: string;
  /** Score per round. null = no score that round (or the round was voided). */
  rounds: (number | null)[];
  lives: number | null;
  out: boolean;
  disqualified: boolean;
  stats: PlayerStats;
}

export type Phase = 'ready' | 'playing' | 'between_turns' | 'finished';

export interface EngineState {
  phase: Phase;
  round: number;
  /** Whose turn it is (turn mode). null in simultaneous mode. */
  turnPlayer: number | null;
  turnStartT: number;
  activeCall: { event: EventType; start: number; until: number } | null;
  nextCallT: number | null;
  bossHp: number | null;
  players: PlayerState[];
  winners: number[] | null;
  winningTeams: string[];
}

export interface GameResult {
  winners: number[];
  winningTeams: string[];
  totals: (number | null)[];
  players: PlayerState[];
  bossHp: number | null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matches(m: { event: EventType; target?: string | undefined }, ev: { type: EventType; target?: string | undefined }) {
  return m.event === ev.type && (m.target === undefined || m.target === ev.target);
}

export class GameEngine {
  readonly spec: GameSpec;
  private s: EngineState;
  private readonly rng: () => number;
  private readonly autoAdvance: boolean;
  /** Events seen this turn, per player. */
  private seen = new Map<number, Set<string>>();
  /** "player:ruleIndex" for once_per_turn rules that already scored this turn. */
  private scoredOnce = new Set<string>();
  /** Players who scored in the current turn. */
  private scoredThisTurn = new Set<number>();
  /** Players who finished the current turn (simultaneous mode). */
  private finished = new Set<number>();
  private leader: number | null = null;
  private turnId = 0;
  readonly log: RefereeMoment[] = [];

  constructor(spec: GameSpec, opts: EngineOptions = {}) {
    this.spec = spec;
    this.rng = mulberry32(opts.seed ?? 1);
    this.autoAdvance = opts.autoAdvance ?? false;
    const players: PlayerState[] = Array.from({ length: spec.players }, (_, i) => ({
      index: i,
      name: opts.players?.[i]?.name ?? `Player ${i + 1}`,
      rounds: Array.from({ length: spec.rounds }, () => null),
      lives: spec.lives ?? null,
      out: false,
      disqualified: false,
      stats: { count: 0, best: {}, fouls: 0 },
    }));
    this.s = {
      phase: 'ready',
      round: 0,
      turnPlayer: null,
      turnStartT: 0,
      activeCall: null,
      nextCallT: null,
      bossHp: spec.boss?.hp ?? null,
      players,
      winners: null,
      winningTeams: [],
    };
  }

  get state(): Readonly<EngineState> {
    return this.s;
  }

  get isTurnMode(): boolean {
    return this.spec.turn_order === 'turns';
  }

  // ---------- public API ----------

  start(t: number): RefereeMoment[] {
    if (this.s.phase !== 'ready') return [];
    const out: RefereeMoment[] = [{ kind: 'game_start', t }];
    if (this.isTurnMode) this.s.turnPlayer = this.firstAlive(0) ?? 0;
    this.startTurn(t, out);
    this.emit(out);
    return out;
  }

  /** Start the next turn (after the app's countdown). */
  beginTurn(t: number): RefereeMoment[] {
    if (this.s.phase !== 'ready' && this.s.phase !== 'between_turns') return [];
    const out: RefereeMoment[] = [];
    this.startTurn(t, out);
    this.emit(out);
    return out;
  }

  /** Move the clock forward: fires referee calls and timers, in time order. */
  tick(t: number): RefereeMoment[] {
    const out: RefereeMoment[] = [];
    for (let guard = 0; guard < 1000 && this.s.phase === 'playing'; guard++) {
      const due = this.nextDue();
      if (!due || due.at > t) break;
      const call = this.s.activeCall;
      if (due.what === 'call_end' && call) {
        this.s.activeCall = null;
        out.push({ kind: 'call_end', t: call.until, event: call.event });
      } else if (due.what === 'call_start') {
        this.startCall(due.at, out);
      } else {
        this.timerEnd(due.at, out);
      }
    }
    this.emit(out);
    return out;
  }

  /** The next clock moment (call end, call start, or turn timer), if any. */
  private nextDue(): { at: number; what: 'call_end' | 'call_start' | 'timer' } | null {
    const timer = this.turnTimer();
    const turnEnd = timer === null ? Infinity : this.s.turnStartT + timer * 1000;
    const options: { at: number; what: 'call_end' | 'call_start' | 'timer' }[] = [];
    if (this.s.activeCall) options.push({ at: this.s.activeCall.until, what: 'call_end' });
    else if (this.s.nextCallT !== null && this.s.nextCallT < turnEnd) {
      options.push({ at: this.s.nextCallT, what: 'call_start' });
    }
    if (turnEnd !== Infinity) options.push({ at: turnEnd, what: 'timer' });
    // On a tie, the call ends before the timer fires.
    options.sort((x, y) => x.at - y.at);
    return options[0] ?? null;
  }

  private startCall(start: number, out: RefereeMoment[]) {
    const calls = this.spec.calls;
    if (!calls) return;
    const event = calls.events[Math.floor(this.rng() * calls.events.length)] ?? calls.events[0]!;
    const until = start + calls.window_s * 1000;
    this.s.activeCall = { event, start, until };
    this.s.nextCallT = Math.max(start + calls.every_s * 1000, until);
    out.push({ kind: 'call', t: start, event });
  }

  private timerEnd(end: number, out: RefereeMoment[]) {
    const turn = this.turnId;
    for (const p of this.activePlayers()) {
      this.processEvent(p, { type: 'timer_end', t: end }, out);
      if (this.turnId !== turn || this.s.phase !== 'playing') return;
    }
    this.endTurn(end, out);
  }

  dispatch(ev: GameEvent): RefereeMoment[] {
    const out = this.tick(ev.t);
    if (this.s.phase !== 'playing') return out;
    const more: RefereeMoment[] = [];
    let player: number;
    if (this.isTurnMode) {
      player = this.s.turnPlayer ?? 0;
      if (ev.player !== undefined && ev.player !== player) return out;
    } else {
      player = ev.player ?? 0;
    }
    const ps = this.s.players[player];
    if (!ps || ps.out || this.finished.has(player)) return out;
    this.processEvent(player, ev, more);
    this.emit(more);
    return [...out, ...more];
  }

  /** End the current turn now (e.g. the "next player" button). */
  forceEndTurn(t: number): RefereeMoment[] {
    if (this.s.phase !== 'playing') return [];
    const out: RefereeMoment[] = [];
    this.endTurn(t, out);
    this.emit(out);
    return out;
  }

  total(player: number): number | null {
    const ps = this.s.players[player];
    if (!ps) return null;
    const scored = ps.rounds.filter((r): r is number => r !== null);
    if (scored.length === 0) return null;
    if (this.spec.aggregate === 'best') {
      return this.spec.win_condition === 'lowest' ? Math.min(...scored) : Math.max(...scored);
    }
    return scored.reduce((a, b) => a + b, 0);
  }

  standings(): { player: number; total: number | null }[] {
    const lowest = this.spec.win_condition === 'lowest';
    return this.s.players
      .map((p) => ({ player: p.index, total: this.total(p.index) }))
      .sort((a, b) => {
        if (a.total === null) return b.total === null ? 0 : 1;
        if (b.total === null) return -1;
        return lowest ? a.total - b.total : b.total - a.total;
      });
  }

  result(): GameResult {
    return {
      winners: this.s.winners ?? [],
      winningTeams: this.s.winningTeams,
      totals: this.s.players.map((p) => this.total(p.index)),
      players: this.s.players,
      bossHp: this.s.bossHp,
    };
  }

  // ---------- internals ----------

  private emit(moments: RefereeMoment[]) {
    this.log.push(...moments);
  }

  private turnTimer(): number | null {
    const p = this.s.turnPlayer;
    if (p !== null) {
      const h = this.spec.handicaps?.find((x) => x.player === p);
      if (h?.timer_s !== undefined) return h.timer_s;
    }
    return this.spec.timer_s ?? null;
  }

  private activePlayers(): number[] {
    if (this.isTurnMode) {
      const p = this.s.turnPlayer;
      return p !== null && !this.s.players[p]?.out ? [p] : [];
    }
    return this.s.players.filter((p) => !p.out && !this.finished.has(p.index)).map((p) => p.index);
  }

  private seenSet(player: number): Set<string> {
    let set = this.seen.get(player);
    if (!set) {
      set = new Set();
      this.seen.set(player, set);
    }
    return set;
  }

  private addRoundScore(player: number, pts: number): number {
    const ps = this.s.players[player]!;
    const next = (ps.rounds[this.s.round] ?? 0) + pts;
    ps.rounds[this.s.round] = next;
    return next;
  }

  private processEvent(player: number, ev: GameEvent, out: RefereeMoment[]) {
    const ps = this.s.players[player]!;
    const seen = this.seenSet(player);
    const call = this.s.activeCall;
    const measures: Partial<Record<Measure, number>> = { ...ev.measures };
    measures.duration_s ??= (ev.t - this.s.turnStartT) / 1000;
    measures.reaction_ms ??= ev.t - (call?.start ?? this.s.turnStartT);

    const ctx: ConditionContext = {
      measures,
      eventType: ev.type,
      seen: (e, target) => seen.has(target === undefined ? e : `${e}:${target}`),
      call: call?.event ?? null,
      scored: this.scoredThisTurn.has(player),
    };

    let endTurn = false;
    const foul = this.spec.fouls.find((f) => matches(f, ev) && evalCondition(f.condition, ctx));
    if (foul) {
      ps.stats.fouls++;
      out.push({
        kind: 'foul',
        t: ev.t,
        player,
        event: ev.type,
        penalty: foul.penalty,
        ...(foul.points !== undefined ? { points: foul.points } : {}),
      });
      switch (foul.penalty) {
        case 'round_void':
          ps.rounds[this.s.round] = null;
          endTurn = true;
          break;
        case 'lose_life':
          if (ps.lives !== null) {
            ps.lives = Math.max(0, ps.lives - 1);
            out.push({ kind: 'life_lost', t: ev.t, player, lives: ps.lives });
            if (ps.lives === 0) {
              ps.out = true;
              out.push({ kind: 'out', t: ev.t, player });
            }
          }
          break;
        case 'points':
          this.addRoundScore(player, foul.points ?? 0);
          break;
        case 'end_turn':
          endTurn = true;
          break;
        case 'disqualify':
          ps.out = true;
          ps.disqualified = true;
          out.push({ kind: 'out', t: ev.t, player });
          break;
      }
    } else {
      this.spec.scoring.forEach((rule, i) => {
        if (this.s.phase !== 'playing') return;
        if (!matches(rule, ev) || !evalCondition(rule.condition, ctx)) return;
        const key = `${player}:${i}`;
        if (rule.once_per_turn && this.scoredOnce.has(key)) return;
        let pts: number;
        if (rule.points === 'measure') {
          const v = rule.measure ? measures[rule.measure] : undefined;
          if (v === undefined) return;
          pts = v;
        } else {
          pts = rule.points;
        }
        const mult = this.spec.handicaps?.find((h) => h.player === player)?.multiplier ?? 1;
        pts *= mult;
        if (rule.once_per_turn) this.scoredOnce.add(key);
        ps.stats.count++;
        this.scoredThisTurn.add(player);
        const roundScore = this.addRoundScore(player, pts);
        const value = rule.measure ? measures[rule.measure] : undefined;
        out.push({
          kind: 'score',
          t: ev.t,
          player,
          points: pts,
          event: ev.type,
          roundScore,
          ...(rule.measure ? { measure: rule.measure } : {}),
          ...(value !== undefined ? { value } : {}),
        });
        if (rule.measure && value !== undefined) this.updateBest(player, rule.measure, value, ev.t, out);
        if (this.s.bossHp !== null && pts > 0) {
          this.s.bossHp = Math.max(0, this.s.bossHp - pts);
          out.push({ kind: 'boss_hit', t: ev.t, player, damage: pts, hp: this.s.bossHp });
          if (this.s.bossHp === 0) {
            out.push({ kind: 'boss_defeated', t: ev.t });
            this.finish(ev.t, out);
          }
        }
      });
    }

    seen.add(ev.type);
    if (ev.target !== undefined) seen.add(`${ev.type}:${ev.target}`);
    if (this.s.phase !== 'playing') return;

    if (this.spec.win_condition === 'first_to' && this.spec.target_score !== undefined) {
      const total = this.total(player);
      if (total !== null && total >= this.spec.target_score) {
        this.finish(ev.t, out);
        return;
      }
    }

    if (this.checkLastStanding(ev.t, out)) return;

    if (ev.type !== 'timer_end' && this.spec.turn_end) {
      const after: ConditionContext = { ...ctx, scored: this.scoredThisTurn.has(player) };
      if (this.spec.turn_end.some((m: EventMatch) => matches(m, ev) && evalCondition(m.condition, after))) endTurn = true;
    }
    if (ps.out) endTurn = true;

    if (endTurn) {
      if (this.isTurnMode) {
        this.endTurn(ev.t, out);
      } else {
        this.finished.add(player);
        if (this.activePlayers().length === 0) this.endTurn(ev.t, out);
      }
    }
  }

  private updateBest(player: number, measure: Measure, value: number, t: number, out: RefereeMoment[]) {
    const best = this.s.players[player]!.stats.best;
    const lowerIsBetter = measure === 'reaction_ms' || measure === 'duration_s';
    const prev = best[measure];
    const better = prev === undefined || (lowerIsBetter ? value < prev : value > prev);
    if (!better) return;
    best[measure] = value;
    if (prev !== undefined) out.push({ kind: 'new_best', t, player, measure, value });
  }

  private checkLastStanding(t: number, out: RefereeMoment[]): boolean {
    if (this.spec.win_condition !== 'last_standing') return false;
    const alive = this.s.players.filter((p) => !p.out).length;
    const limit = this.spec.players > 1 ? 1 : 0;
    if (alive <= limit) {
      this.finish(t, out);
      return true;
    }
    return false;
  }

  private scoreToBeat(player: number): number | null {
    if (this.spec.win_condition === 'co_op' || this.spec.win_condition === 'last_standing') return null;
    const others = this.standings().filter((s) => s.player !== player && s.total !== null);
    return others[0]?.total ?? null;
  }

  private firstAlive(from: number): number | null {
    for (let i = from; i < this.s.players.length; i++) if (!this.s.players[i]!.out) return i;
    return null;
  }

  private endTurn(t: number, out: RefereeMoment[]) {
    if (this.s.phase !== 'playing') return;
    out.push({ kind: 'turn_end', t, round: this.s.round, player: this.s.turnPlayer });
    if (this.s.activeCall) {
      out.push({ kind: 'call_end', t, event: this.s.activeCall.event });
      this.s.activeCall = null;
    }
    this.checkLeadChange(t, out);

    // Pick who plays next.
    let next: number | null = null;
    if (this.isTurnMode) next = this.firstAlive((this.s.turnPlayer ?? 0) + 1);
    if (next === null) {
      this.s.round++;
      if (this.s.round >= this.spec.rounds || this.s.players.every((p) => p.out)) {
        this.finish(t, out);
        return;
      }
      next = this.isTurnMode ? this.firstAlive(0) : null;
      if (this.isTurnMode && next === null) {
        this.finish(t, out);
        return;
      }
    }
    this.s.turnPlayer = this.isTurnMode ? next : null;
    this.s.phase = 'between_turns';
    if (this.autoAdvance) this.startTurn(t, out);
  }

  private startTurn(t: number, out: RefereeMoment[]) {
    this.turnId++;
    this.s.phase = 'playing';
    this.s.turnStartT = t;
    this.seen.clear();
    this.scoredOnce.clear();
    this.scoredThisTurn.clear();
    this.finished.clear();
    this.s.activeCall = null;
    this.s.nextCallT = this.spec.calls ? t + this.spec.calls.every_s * 1000 : null;
    const p = this.s.turnPlayer;
    out.push({ kind: 'turn_start', t, round: this.s.round, player: p, toBeat: p === null ? null : this.scoreToBeat(p) });
  }

  private checkLeadChange(t: number, out: RefereeMoment[]) {
    if (this.spec.players < 2 || this.spec.win_condition === 'co_op') return;
    const [first, second] = this.standings();
    if (!first || first.total === null) return;
    if (second && second.total === first.total) return;
    if (this.leader !== null && this.leader !== first.player) out.push({ kind: 'lead_change', t, player: first.player });
    this.leader = first.player;
  }

  private finish(t: number, out: RefereeMoment[]) {
    if (this.s.phase === 'finished') return;
    this.s.phase = 'finished';
    this.s.activeCall = null;
    const { winners, teams } = this.computeWinners();
    this.s.winners = winners;
    this.s.winningTeams = teams;
    out.push({ kind: 'game_over', t, winners, winningTeams: teams });
  }

  private computeWinners(): { winners: number[]; teams: string[] } {
    const spec = this.spec;
    const players = this.s.players.filter((p) => !p.disqualified);
    const bestBy = (list: PlayerState[], lowest: boolean) => {
      const scored = list
        .map((p) => ({ p: p.index, total: this.total(p.index) }))
        .filter((x): x is { p: number; total: number } => x.total !== null);
      if (scored.length === 0) return [];
      const target = lowest ? Math.min(...scored.map((x) => x.total)) : Math.max(...scored.map((x) => x.total));
      return scored.filter((x) => x.total === target).map((x) => x.p);
    };

    switch (spec.win_condition) {
      case 'highest':
      case 'first_to':
        return { winners: bestBy(players, false), teams: [] };
      case 'lowest':
        return { winners: bestBy(players, true), teams: [] };
      case 'last_standing': {
        const maxLives = Math.max(0, ...players.map((p) => p.lives ?? 0));
        const alive = players.filter((p) => (p.lives ?? 0) === maxLives);
        const top = bestBy(alive, false);
        return { winners: top.length ? top : alive.map((p) => p.index), teams: [] };
      }
      case 'team_total': {
        const teams = spec.teams ?? [];
        const sums = teams.map((team) =>
          team.players.reduce((acc, i) => acc + (this.s.players[i]?.disqualified ? 0 : (this.total(i) ?? 0)), 0),
        );
        const max = Math.max(...sums);
        const won = teams.filter((_, i) => sums[i] === max);
        return { winners: won.flatMap((t) => t.players), teams: won.map((t) => t.name) };
      }
      case 'co_op':
        return { winners: this.s.bossHp === 0 ? players.map((p) => p.index) : [], teams: [] };
    }
  }
}

export function createGame(spec: GameSpec, opts?: EngineOptions): GameEngine {
  return new GameEngine(spec, opts);
}
