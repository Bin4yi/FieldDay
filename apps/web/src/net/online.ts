import { create } from 'zustand';
import {
  clockOffset,
  parseServerMessage,
  type ClientMessageInput,
  type NetGameEvent,
  type RoomPlayer,
  type ServerMessage,
  type SyncSample,
} from '@fieldday/net';
import type { GameEvent, GameSpec } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';

// The online connection: one WebSocket to the FieldDay server, with
// reconnect, clock sync and replay of missed events. Only small game events
// are sent — never video.

export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('fd-server');
  } catch {
    // ignore
  }
  return (saved || fromEnv || 'http://localhost:8787').replace(/\/$/, '');
}

export function setServerUrl(url: string) {
  try {
    localStorage.setItem('fd-server', url);
  } catch {
    // ignore
  }
}

export function playerId(): string {
  try {
    let id = localStorage.getItem('fd-player-id');
    if (!id) {
      id = `p_${crypto.randomUUID().slice(0, 12)}`;
      localStorage.setItem('fd-player-id', id);
    }
    return id;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 14)}`;
  }
}

export interface Score {
  player: string;
  name: string;
  total: number | null;
  flagged: boolean;
  done: boolean;
}

interface OnlineState {
  status: 'off' | 'connecting' | 'online' | 'error';
  error: string | null;
  me: string;
  room: { code: string; host: string; players: RoomPlayer[]; spec: GameSpec | null; quest: QuestSpec | null; started: boolean } | null;
  startAt: number | null;
  scores: Score[];
  bossHp: number | null;
  winners: string[] | null;
  flagged: Record<string, string>;
  votes: Record<number, Record<string, number>>;
  timeline: { player: string; name: string; step: number; done: boolean }[];
  questWinner: string | null;
  shared: Record<string, { title: string; total: number; target: number }>;
  feed: { name: string; event: string; at: number }[];
}

export const useOnline = create<OnlineState>(() => ({
  status: 'off',
  error: null,
  me: playerId(),
  room: null,
  startAt: null,
  scores: [],
  bossHp: null,
  winners: null,
  flagged: {},
  votes: {},
  timeline: [],
  questWinner: null,
  shared: {},
  feed: [],
}));

class OnlineClient {
  private ws: WebSocket | null = null;
  private name = 'Player';
  private queue: string[] = [];
  private samples: SyncSample[] = [];
  private offset = 0;
  private lastSeq = -1;
  private seq = 0;
  private wantRoom: { code: string; role: 'player' | 'spectator' } | null = null;
  private retry = 0;
  private closedByUser = false;
  private watching = new Set<string>();

  /** Server time now (ms). */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  connect(name: string) {
    this.name = name;
    this.closedByUser = false;
    if (this.ws && this.ws.readyState <= 1) {
      this.send({ type: 'hello', name, playerId: useOnline.getState().me });
      return;
    }
    useOnline.setState({ status: 'connecting', error: null });
    const url = `${serverUrl().replace(/^http/, 'ws')}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      useOnline.setState({ status: 'error', error: String(e) });
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.raw({ type: 'hello', name: this.name, playerId: useOnline.getState().me });
      for (let i = 0; i < 5; i++) setTimeout(() => this.raw({ type: 'time_sync', clientT: Date.now() }), i * 150);
      for (const q of this.watching) this.raw({ type: 'watch_shared', questId: q });
      if (this.wantRoom) this.raw({ type: 'join_room', code: this.wantRoom.code, role: this.wantRoom.role, lastSeq: this.lastSeq });
      const queued = this.queue;
      this.queue = [];
      for (const q of queued) ws.send(q);
    };
    ws.onmessage = (e) => {
      const m = parseServerMessage(String(e.data));
      if (m) this.onMessage(m);
    };
    ws.onerror = () => useOnline.setState({ error: 'Cannot reach the FieldDay server.' });
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) {
        useOnline.setState({ status: 'off' });
        return;
      }
      useOnline.setState({ status: 'connecting' });
      // Reconnect with backoff; the server replays what we missed.
      const delay = Math.min(15000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(this.name), delay);
    };
  }

  disconnect() {
    this.closedByUser = true;
    this.wantRoom = null;
    this.ws?.close();
  }

  private raw(m: ClientMessageInput) {
    const text = JSON.stringify(m);
    if (this.ws?.readyState === 1) this.ws.send(text);
    else this.queue.push(text);
  }

  send(m: ClientMessageInput) {
    this.raw(m);
  }

  createRoom(spec?: GameSpec) {
    this.lastSeq = -1;
    this.raw({ type: 'create_room', ...(spec ? { spec } : {}) });
  }

  joinRoom(code: string, role: 'player' | 'spectator' = 'player') {
    this.lastSeq = -1;
    this.wantRoom = { code, role };
    useOnline.setState({ winners: null, scores: [], startAt: null, feed: [] });
    this.raw({ type: 'join_room', code, role, lastSeq: -1 });
  }

  leaveRoom() {
    this.wantRoom = null;
    this.raw({ type: 'leave_room' });
    useOnline.setState({ room: null, startAt: null, scores: [], winners: null });
  }

  watchShared(id: string) {
    this.watching.add(id);
    this.raw({ type: 'watch_shared', questId: id });
  }

  /** Send one of my game events (with server time). */
  sendEvent(e: GameEvent) {
    const ev: NetGameEvent = {
      player: useOnline.getState().me,
      event: e.type,
      t: this.serverNow(),
      seq: this.seq++,
      ...(e.target ? { target: e.target } : {}),
      ...(e.measures ? { measures: e.measures } : {}),
    };
    this.raw({ type: 'game_event', event: ev });
  }

  private onMessage(m: ServerMessage) {
    const set = useOnline.setState;
    switch (m.type) {
      case 'welcome':
        set({ status: 'online', me: m.playerId });
        return;
      case 'room_state':
        this.wantRoom = { code: m.code, role: this.wantRoom?.role ?? 'player' };
        set({ room: { code: m.code, host: m.host, players: m.players, spec: m.spec, quest: m.quest, started: m.started } });
        return;
      case 'match_start':
        set({ startAt: m.startAt, winners: null });
        return;
      case 'game_event': {
        this.lastSeq = Math.max(this.lastSeq, m.serverSeq);
        const name = useOnline.getState().room?.players.find((p) => p.id === m.event.player)?.name ?? '?';
        set((s) => ({ feed: [...s.feed.slice(-20), { name, event: m.event.event, at: m.event.t }] }));
        return;
      }
      case 'score_update':
        set({ scores: m.scores, bossHp: m.bossHp });
        return;
      case 'match_over':
        set({ winners: m.winners });
        return;
      case 'flagged':
        set((s) => ({ flagged: { ...s.flagged, [m.player]: m.reason } }));
        return;
      case 'crowd_votes':
        set((s) => ({ votes: { ...s.votes, [m.round]: m.votes } }));
        return;
      case 'quest_timeline':
        set({ timeline: m.players, questWinner: m.winner });
        return;
      case 'quest_progress':
        set((s) => ({ shared: { ...s.shared, [m.questId]: { title: m.title, total: m.total, target: m.target } } }));
        return;
      case 'time_sync':
        this.samples.push({ clientSent: m.clientT, serverT: m.serverT, clientGot: Date.now() });
        this.offset = clockOffset(this.samples.slice(-8));
        return;
      case 'error':
        set({ error: m.message });
        return;
      default:
        return;
    }
  }
}

export const online = new OnlineClient();

/** REST helper for crews, shared quests, trending. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  return data;
}

export function crewCode(): string | null {
  try {
    return localStorage.getItem('fd-crew');
  } catch {
    return null;
  }
}

export function setCrewCode(code: string | null) {
  try {
    if (code) localStorage.setItem('fd-crew', code);
    else localStorage.removeItem('fd-crew');
  } catch {
    // ignore
  }
}

/** After a game, add this phone owner's result to their crew (online only). */
export async function postCrewResult(r: {
  specId: string;
  total: number | null;
  lowerBetter: boolean;
  best?: { measure: string; value: number } | undefined;
}): Promise<void> {
  const code = crewCode();
  if (!code || !navigator.onLine || r.total === null) return;
  const crew = await api<{ shared: { id: string }[] }>(`/crews/${code}`);
  await api(`/crews/${code}/results`, {
    playerId: useOnline.getState().me,
    specId: r.specId,
    total: r.total,
    lowerBetter: r.lowerBetter,
    ...(r.best ? { best: r.best } : {}),
    sharedQuests: crew.shared.map((q) => q.id),
  });
}
