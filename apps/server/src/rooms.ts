import { createGame, gameCode, withPlayers, type GameEngine, type GameSpec } from '@fieldday/engine';
import {
  RateLimiter,
  cheatReason,
  makeRoomCode,
  parseClientMessage,
  type CheatEvent,
  type ClientMessage,
  type NetGameEvent,
  type ServerMessage,
} from '@fieldday/net';
import type { QuestSpec } from '@fieldday/quests';
import type { Store } from './store.js';

// Rooms for online play. Every phone runs its own camera and sends only small
// events; the server keeps the real score (with the same engine the phones
// use) and tells everyone.

export interface Conn {
  id: string;
  ip: string;
  send(msg: ServerMessage): void;
  close(): void;
}

interface Member {
  id: string;
  name: string;
  role: 'player' | 'spectator';
  conn: Conn | null;
  history: CheatEvent[];
  flagged: string | null;
}

interface Room {
  code: string;
  host: string;
  members: Map<string, Member>;
  spec: GameSpec | null;
  quest: QuestSpec | null;
  log: { serverSeq: number; event: NetGameEvent }[];
  startAt: number | null;
  /** One engine per player (each plays their own game), or one shared engine for co-op. */
  engines: Map<string, GameEngine>;
  shared: GameEngine | null;
  sharedOrder: string[];
  over: boolean;
  votes: Map<number, Map<string, string>>;
  timeline: Map<string, { step: number; done: boolean; at: number }>;
  questWinner: string | null;
  lastActive: number;
}

const MAX_PLAYERS = 8;
const MAX_SPECTATORS = 30;

export interface RoomOptions {
  store: Store;
  now?: () => number;
  random?: () => number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private conns = new Map<string, { conn: Conn; player: string | null; name: string; room: string | null }>();
  private watchers = new Map<string, Set<string>>(); // shared quest id -> conn ids
  private perConn = new RateLimiter(30, 60);
  private perRoom = new RateLimiter(300, 600);
  private now: () => number;
  private random: () => number;

  constructor(private o: RoomOptions) {
    this.now = o.now ?? (() => Date.now());
    this.random = o.random ?? Math.random;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  connect(conn: Conn) {
    this.conns.set(conn.id, { conn, player: null, name: 'Player', room: null });
  }

  disconnect(conn: Conn) {
    const c = this.conns.get(conn.id);
    this.conns.delete(conn.id);
    for (const set of this.watchers.values()) set.delete(conn.id);
    if (!c?.room || !c.player) return;
    const room = this.rooms.get(c.room);
    const m = room?.members.get(c.player);
    if (room && m && m.conn?.id === conn.id) {
      m.conn = null;
      this.broadcastState(room);
    }
  }

  message(conn: Conn, raw: string) {
    if (!this.perConn.allow(conn.id) || !this.perConn.allow(`ip:${conn.ip}`, 0.2)) {
      conn.send({ type: 'error', code: 'rate_limited', message: 'Too many messages. Slow down a little.' });
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      conn.send({ type: 'error', code: 'bad_message', message: 'That message was not understood.' });
      return;
    }
    this.handle(conn, msg);
  }

  private id(prefix: string): string {
    return `${prefix}_${Math.floor(this.random() * 2 ** 48).toString(36)}`;
  }

  private handle(conn: Conn, msg: ClientMessage) {
    const c = this.conns.get(conn.id);
    if (!c) return;
    const room = c.room ? this.rooms.get(c.room) : undefined;
    if (room && !this.perRoom.allow(room.code)) {
      conn.send({ type: 'error', code: 'rate_limited', message: 'This room is too busy.' });
      return;
    }
    switch (msg.type) {
      case 'hello': {
        c.player = msg.playerId ?? this.id('p');
        c.name = msg.name;
        conn.send({ type: 'welcome', playerId: c.player });
        return;
      }
      case 'ping':
        conn.send({ type: 'pong' });
        return;
      case 'time_sync':
        conn.send({ type: 'time_sync', clientT: msg.clientT, serverT: this.now() });
        return;
      case 'watch_shared': {
        const set = this.watchers.get(msg.questId) ?? new Set();
        set.add(conn.id);
        this.watchers.set(msg.questId, set);
        const q = this.o.store.getShared(msg.questId);
        if (q) conn.send({ type: 'quest_progress', questId: q.id, title: q.title, total: q.total, target: q.target });
        return;
      }
      case 'quest_progress': {
        if (!c.player) return this.needHello(conn);
        const q = this.o.store.getShared(msg.questId);
        if (!q) return conn.send({ type: 'error', code: 'room_not_found', message: 'No such shared quest.' });
        q.contributions[c.player] = (q.contributions[c.player] ?? 0) + msg.amount;
        q.total = Object.values(q.contributions).reduce((a, b) => a + b, 0);
        this.o.store.saveShared(q);
        this.notifyShared(q.id, q.title, q.total, q.target);
        return;
      }
      default:
        break;
    }
    if (!c.player) return this.needHello(conn);

    switch (msg.type) {
      case 'create_room': {
        let code = makeRoomCode(this.random);
        while (this.rooms.has(code)) code = makeRoomCode(this.random);
        const r: Room = {
          code,
          host: c.player,
          members: new Map(),
          spec: msg.spec ?? null,
          quest: null,
          log: [],
          startAt: null,
          engines: new Map(),
          shared: null,
          sharedOrder: [],
          over: false,
          votes: new Map(),
          timeline: new Map(),
          questWinner: null,
          lastActive: this.now(),
        };
        this.rooms.set(code, r);
        if (msg.spec) this.o.store.bumpTrending(gameCode(msg.spec), msg.spec.title, msg.spec, this.now());
        this.join(conn, r, 'player', -1);
        return;
      }
      case 'join_room': {
        const r = this.rooms.get(msg.code);
        if (!r) return conn.send({ type: 'error', code: 'room_not_found', message: `No room ${msg.code}.` });
        this.join(conn, r, msg.role, msg.lastSeq);
        return;
      }
    }

    if (!room) return conn.send({ type: 'error', code: 'not_in_room', message: 'Join a room first.' });
    room.lastActive = this.now();
    const me = room.members.get(c.player);
    if (!me) return conn.send({ type: 'error', code: 'not_in_room', message: 'Join a room first.' });

    switch (msg.type) {
      case 'leave_room':
        room.members.delete(me.id);
        c.room = null;
        if (room.host === me.id) room.host = [...room.members.values()].find((m) => m.role === 'player')?.id ?? room.host;
        if (room.members.size === 0) this.rooms.delete(room.code);
        else this.broadcastState(room);
        return;
      case 'set_spec':
        if (room.host !== me.id) return conn.send({ type: 'error', code: 'not_host', message: 'Only the host can pick the game.' });
        room.spec = msg.spec;
        room.quest = null;
        this.o.store.bumpTrending(gameCode(msg.spec), msg.spec.title, msg.spec, this.now());
        this.broadcastState(room);
        return;
      case 'set_quest':
        if (room.host !== me.id) return conn.send({ type: 'error', code: 'not_host', message: 'Only the host can pick the quest.' });
        room.quest = msg.quest;
        room.spec = null;
        room.timeline.clear();
        room.questWinner = null;
        this.broadcastState(room);
        return;
      case 'start_match':
        if (room.host !== me.id) return conn.send({ type: 'error', code: 'not_host', message: 'Only the host can start.' });
        this.start(room, msg.countdown_s);
        return;
      case 'game_event':
        this.onEvent(room, me, msg.event);
        return;
      case 'crowd_vote': {
        const votes = room.votes.get(msg.round) ?? new Map<string, string>();
        votes.set(me.id, msg.player);
        room.votes.set(msg.round, votes);
        const tally: Record<string, number> = {};
        for (const p of votes.values()) tally[p] = (tally[p] ?? 0) + 1;
        this.broadcast(room, { type: 'crowd_votes', round: msg.round, votes: tally });
        return;
      }
      case 'quest_step': {
        if (!room.quest || me.role !== 'player') return;
        room.timeline.set(me.id, { step: msg.step, done: msg.done, at: this.now() });
        if (msg.done && !room.questWinner) room.questWinner = me.id;
        this.broadcastTimeline(room);
        return;
      }
      default:
        return;
    }
  }

  private needHello(conn: Conn) {
    conn.send({ type: 'error', code: 'bad_message', message: 'Say hello first.' });
  }

  private join(conn: Conn, room: Room, role: 'player' | 'spectator', lastSeq: number) {
    const c = this.conns.get(conn.id)!;
    const pid = c.player!;
    let m = room.members.get(pid);
    if (!m) {
      const players = [...room.members.values()].filter((x) => x.role === 'player').length;
      const spectators = room.members.size - players;
      // Late joiners to a started match watch instead of playing.
      const wantRole = role === 'player' && room.startAt !== null ? 'spectator' : role;
      if ((wantRole === 'player' && players >= MAX_PLAYERS) || (wantRole === 'spectator' && spectators >= MAX_SPECTATORS)) {
        conn.send({ type: 'error', code: 'room_full', message: 'This room is full.' });
        return;
      }
      m = { id: pid, name: c.name, role: wantRole, conn, history: [], flagged: null };
      room.members.set(pid, m);
    } else {
      // Reconnect: same player, new connection.
      m.conn?.id !== conn.id && m.conn?.close();
      m.conn = conn;
      m.name = c.name;
    }
    c.room = room.code;
    this.broadcastState(room);
    if (room.startAt !== null) conn.send({ type: 'match_start', startAt: room.startAt });
    // Replay what this phone missed.
    for (const e of room.log) if (e.serverSeq > lastSeq) conn.send({ type: 'game_event', event: e.event, serverSeq: e.serverSeq });
    if (room.startAt !== null) conn.send(this.scores(room));
    if (room.quest) conn.send(this.timeline(room));
  }

  private start(room: Room, countdownS: number) {
    if (!room.spec) return;
    room.startAt = this.now() + countdownS * 1000;
    room.over = false;
    room.log = [];
    room.engines.clear();
    room.shared = null;
    const players = [...room.members.values()].filter((m) => m.role === 'player');
    if (room.spec.win_condition === 'co_op') {
      const spec = withPlayers({ ...room.spec, max_players: Math.max(room.spec.max_players ?? 1, players.length) }, Math.max(1, players.length));
      room.shared = createGame(spec, { autoAdvance: true, players: players.map((p) => ({ name: p.name })) });
      room.sharedOrder = players.map((p) => p.id);
      room.shared.start(0);
    } else {
      for (const p of players) {
        const solo = withPlayers({ ...room.spec, min_players: 1, teams: undefined, handicaps: undefined, win_condition: room.spec.win_condition === 'team_total' || room.spec.win_condition === 'last_standing' ? 'highest' : room.spec.win_condition }, 1);
        const g = createGame(solo, { autoAdvance: true, players: [{ name: p.name }] });
        g.start(0);
        room.engines.set(p.id, g);
      }
    }
    this.broadcast(room, { type: 'match_start', startAt: room.startAt });
    this.broadcast(room, this.scores(room));
  }

  private onEvent(room: Room, me: Member, ev: NetGameEvent) {
    if (room.startAt === null || room.over || me.role !== 'player') return;
    const event = { ...ev, player: me.id };
    const t = event.t - room.startAt;
    if (t < 0) return;
    const reason = cheatReason(me.history, { event: event.event, ...(event.measures ? { measures: event.measures } : {}), t: event.t });
    me.history.push({ event: event.event, t: event.t });
    if (me.history.length > 200) me.history.shift();
    if (reason && !me.flagged) {
      me.flagged = reason;
      this.broadcast(room, { type: 'flagged', player: me.id, reason });
    }
    const serverSeq = room.log.length;
    room.log.push({ serverSeq, event });
    const engineEvent = {
      type: event.event,
      t,
      ...(event.target ? { target: event.target } : {}),
      ...(event.measures ? { measures: event.measures } : {}),
    };
    if (room.shared) {
      const idx = room.sharedOrder.indexOf(me.id);
      if (idx >= 0) room.shared.dispatch({ ...engineEvent, player: idx });
    } else {
      room.engines.get(me.id)?.dispatch(engineEvent);
    }
    for (const m of room.members.values()) if (m.id !== me.id) m.conn?.send({ type: 'game_event', event, serverSeq });
    this.broadcast(room, this.scores(room));
    this.checkOver(room);
  }

  /** Move clocks forward (timers, calls) and clean up old rooms. Call ~5 times a second. */
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (now - room.lastActive > 2 * 3600_000 && ![...room.members.values()].some((m) => m.conn)) {
        this.rooms.delete(room.code);
        continue;
      }
      if (room.startAt === null || room.over || now < room.startAt) continue;
      const t = now - room.startAt;
      let changed = false;
      if (room.shared) changed = room.shared.tick(t).length > 0;
      for (const g of room.engines.values()) changed = g.tick(t).length > 0 || changed;
      if (changed) this.broadcast(room, this.scores(room));
      this.checkOver(room);
    }
  }

  private checkOver(room: Room) {
    if (room.over || room.startAt === null || !room.spec) return;
    let winners: string[] = [];
    if (room.shared) {
      if (room.shared.state.phase !== 'finished') return;
      winners = room.shared.result().winners.map((i) => room.sharedOrder[i]!).filter(Boolean);
    } else {
      const entries = [...room.engines.entries()];
      if (!entries.length) return;
      const lowest = room.spec.win_condition === 'lowest';
      if (room.spec.win_condition === 'first_to') {
        // First phone to reach the target wins straight away.
        const first = entries.find(([id, g]) => g.state.phase === 'finished' && !room.members.get(id)?.flagged && (g.total(0) ?? 0) >= (room.spec?.target_score ?? Infinity));
        if (first) winners = [first[0]];
        else if (!entries.every(([, g]) => g.state.phase === 'finished')) return;
      } else if (!entries.every(([, g]) => g.state.phase === 'finished')) {
        return;
      }
      if (!winners.length) {
        const fair = entries.filter(([id, g]) => !room.members.get(id)?.flagged && g.total(0) !== null);
        if (fair.length) {
          const vals = fair.map(([, g]) => g.total(0)!);
          const best = lowest ? Math.min(...vals) : Math.max(...vals);
          winners = fair.filter(([, g]) => g.total(0) === best).map(([id]) => id);
        }
      }
    }
    room.over = true;
    this.broadcast(room, this.scores(room));
    this.broadcast(room, { type: 'match_over', winners });
  }

  private scores(room: Room): ServerMessage {
    const players = [...room.members.values()].filter((m) => m.role === 'player');
    return {
      type: 'score_update',
      scores: players.map((m) => {
        const g = room.engines.get(m.id);
        const idx = room.sharedOrder.indexOf(m.id);
        const total = g ? g.total(0) : room.shared && idx >= 0 ? room.shared.total(idx) : null;
        const done = g ? g.state.phase === 'finished' : room.shared ? room.shared.state.phase === 'finished' : false;
        return { player: m.id, name: m.name, total, flagged: !!m.flagged, done };
      }),
      bossHp: room.shared?.state.bossHp ?? null,
    };
  }

  private timeline(room: Room): ServerMessage {
    return {
      type: 'quest_timeline',
      players: [...room.members.values()]
        .filter((m) => m.role === 'player')
        .map((m) => {
          const t = room.timeline.get(m.id);
          return { player: m.id, name: m.name, step: t?.step ?? 0, done: t?.done ?? false, at: t?.at ?? 0 };
        }),
      winner: room.questWinner,
    };
  }

  private broadcastTimeline(room: Room) {
    this.broadcast(room, this.timeline(room));
  }

  private broadcastState(room: Room) {
    this.broadcast(room, {
      type: 'room_state',
      code: room.code,
      host: room.host,
      players: [...room.members.values()].map((m) => ({ id: m.id, name: m.name, role: m.role, connected: !!m.conn })),
      spec: room.spec,
      quest: room.quest,
      started: room.startAt !== null,
    });
  }

  private broadcast(room: Room, msg: ServerMessage) {
    for (const m of room.members.values()) m.conn?.send(msg);
  }

  notifyShared(id: string, title: string, total: number, target: number) {
    for (const cid of this.watchers.get(id) ?? []) {
      this.conns.get(cid)?.conn.send({ type: 'quest_progress', questId: id, title, total, target });
    }
  }
}
