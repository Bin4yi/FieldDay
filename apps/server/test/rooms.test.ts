import { describe, expect, it } from 'vitest';
import { getTemplate, withPlayers } from '@fieldday/engine';
import type { ClientMessageInput, ServerMessage } from '@fieldday/net';
import { RoomManager, type Conn } from '../src/rooms.js';
import { MemoryStore } from '../src/store.js';

function setup() {
  let t = 1_000_000;
  let r = 0;
  const store = new MemoryStore();
  const rooms = new RoomManager({ store, now: () => t, random: () => ((r = (r * 9301 + 49297) % 233280), r / 233280) });
  const phone = (id: string, ip = '1.1.1.1') => {
    const inbox: ServerMessage[] = [];
    const conn: Conn = { id, ip, send: (m) => inbox.push(m), close: () => undefined };
    rooms.connect(conn);
    const send = (m: ClientMessageInput) => rooms.message(conn, JSON.stringify(m));
    const last = <K extends ServerMessage['type']>(type: K) =>
      [...inbox].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: K }> | undefined;
    return { conn, inbox, send, last };
  };
  return { rooms, store, phone, clock: { get: () => t, add: (ms: number) => (t += ms) } };
}

describe('rooms', () => {
  it('Colombo vs Kandy: same game, synced start, server keeps the score', () => {
    const { rooms, phone, clock } = setup();
    const colombo = phone('c1');
    const kandy = phone('c2', '2.2.2.2');
    colombo.send({ type: 'hello', name: 'Ama' });
    kandy.send({ type: 'hello', name: 'Binula' });
    const ama = colombo.last('welcome')!.playerId;
    const binula = kandy.last('welcome')!.playerId;
    colombo.send({ type: 'create_room', spec: withPlayers(getTemplate('sky_toss')!, 1) });
    const code = colombo.last('room_state')!.code;
    kandy.send({ type: 'join_room', code });
    expect(kandy.last('room_state')!.players.map((p) => p.name)).toEqual(['Ama', 'Binula']);

    // Only the host can start.
    kandy.send({ type: 'start_match' });
    expect(kandy.last('error')?.code).toBe('not_host');
    colombo.send({ type: 'start_match', countdown_s: 5 });
    const startAt = colombo.last('match_start')!.startAt;
    expect(kandy.last('match_start')!.startAt).toBe(startAt);
    expect(startAt).toBe(clock.get() + 5000);

    clock.add(6000);
    let seq = 0;
    const throwBall = (p: typeof colombo, height: number) => {
      const t = clock.add(1000);
      p.send({ type: 'game_event', event: { player: 'ignored', event: 'ball_apex', measures: { height_m: height }, t, seq: seq++ } });
      p.send({ type: 'game_event', event: { player: 'ignored', event: 'ball_catch', t: t + 500, seq: seq++ } });
    };
    for (const h of [2.1, 2.5, 2.3]) throwBall(colombo, h);
    // Kandy sees Colombo's events live, with the real sender id.
    expect(kandy.inbox.filter((m) => m.type === 'game_event').every((m) => m.type === 'game_event' && m.event.player === ama)).toBe(true);
    for (const h of [2.0, 2.6, 2.2]) throwBall(kandy, h);
    const scores = kandy.last('score_update')!.scores;
    expect(scores.map((s) => [s.name, s.total, s.done])).toEqual([
      ['Ama', 2.5, true],
      ['Binula', 2.6, true],
    ]);
    expect(colombo.last('match_over')!.winners).toEqual([binula]);
    expect(rooms.roomCount).toBe(1);
  });

  it('flags impossible throws: they do not win', () => {
    const { phone, clock } = setup();
    const a = phone('a');
    const b = phone('b');
    a.send({ type: 'hello', name: 'Ama' });
    b.send({ type: 'hello', name: 'Cheater' });
    a.send({ type: 'create_room', spec: { ...withPlayers(getTemplate('sky_toss')!, 1), rounds: 1 } });
    b.send({ type: 'join_room', code: a.last('room_state')!.code });
    a.send({ type: 'start_match', countdown_s: 3 });
    clock.add(4000);
    b.send({ type: 'game_event', event: { player: 'x', event: 'ball_apex', measures: { height_m: 30 }, t: clock.add(100), seq: 0 } });
    b.send({ type: 'game_event', event: { player: 'x', event: 'ball_catch', t: clock.add(100), seq: 1 } });
    expect(a.last('flagged')!.reason).toMatch(/too high/);
    a.send({ type: 'game_event', event: { player: 'x', event: 'ball_apex', measures: { height_m: 2 }, t: clock.add(100), seq: 0 } });
    a.send({ type: 'game_event', event: { player: 'x', event: 'ball_catch', t: clock.add(100), seq: 1 } });
    expect(a.last('match_over')!.winners).toEqual([a.last('welcome')!.playerId]);
  });

  it('a dropped phone rejoins and gets the events it missed', () => {
    const { rooms, phone, clock } = setup();
    const a = phone('a');
    const b = phone('b');
    a.send({ type: 'hello', name: 'Ama' });
    b.send({ type: 'hello', name: 'Binula' });
    const binula = b.last('welcome')!.playerId;
    a.send({ type: 'create_room', spec: withPlayers(getTemplate('squat_storm')!, 1) });
    const code = a.last('room_state')!.code;
    b.send({ type: 'join_room', code });
    a.send({ type: 'start_match', countdown_s: 3 });
    clock.add(3500);
    a.send({ type: 'game_event', event: { player: 'x', event: 'squat', t: clock.add(500), seq: 0 } });
    b.send({ type: 'game_event', event: { player: 'x', event: 'squat', t: clock.add(500), seq: 0 } });
    const seenByB = b.inbox.filter((m) => m.type === 'game_event').length;
    // B's network drops.
    rooms.disconnect(b.conn);
    expect(a.last('room_state')!.players.find((p) => p.name === 'Binula')!.connected).toBe(false);
    a.send({ type: 'game_event', event: { player: 'x', event: 'squat', t: clock.add(500), seq: 1 } });
    a.send({ type: 'game_event', event: { player: 'x', event: 'squat', t: clock.add(500), seq: 2 } });
    // New connection, same player id, last seq it saw.
    const b2 = phone('b2');
    b2.send({ type: 'hello', name: 'Binula', playerId: binula });
    b2.send({ type: 'join_room', code, lastSeq: 1 });
    const replay = b2.inbox.filter((m) => m.type === 'game_event');
    expect(seenByB).toBe(1);
    expect(replay.map((m) => (m.type === 'game_event' ? m.serverSeq : -1))).toEqual([2, 3]);
    expect(b2.last('match_start')).toBeDefined();
    expect(b2.last('score_update')!.scores.find((s) => s.name === 'Ama')!.total).toBe(3);
  });

  it('spectators watch and vote; late joiners become spectators', () => {
    const { phone } = setup();
    const a = phone('a');
    const s = phone('s');
    a.send({ type: 'hello', name: 'Ama' });
    s.send({ type: 'hello', name: 'Fan' });
    a.send({ type: 'create_room', spec: withPlayers(getTemplate('jump_battle')!, 1) });
    const code = a.last('room_state')!.code;
    a.send({ type: 'start_match' });
    s.send({ type: 'join_room', code });
    expect(s.last('room_state')!.players.find((p) => p.name === 'Fan')!.role).toBe('spectator');
    s.send({ type: 'crowd_vote', round: 0, player: a.last('welcome')!.playerId });
    expect(a.last('crowd_votes')!.votes).toEqual({ [a.last('welcome')!.playerId]: 1 });
    s.send({ type: 'game_event', event: { player: 'x', event: 'jump', t: Date.now(), seq: 0 } });
    expect(a.inbox.filter((m) => m.type === 'game_event')).toHaveLength(0);
  });

  it('co-op Boss Raid across phones shares one boss', () => {
    const { phone, clock } = setup();
    const a = phone('a');
    const b = phone('b');
    a.send({ type: 'hello', name: 'Ama' });
    b.send({ type: 'hello', name: 'Binula' });
    a.send({ type: 'create_room', spec: getTemplate('boss_raid_basic')! });
    b.send({ type: 'join_room', code: a.last('room_state')!.code });
    a.send({ type: 'start_match', countdown_s: 3 });
    clock.add(3100);
    for (let i = 0; i < 30; i++) {
      (i % 2 ? b : a).send({ type: 'game_event', event: { player: 'x', event: 'jump', t: clock.add(200), seq: i } });
    }
    expect(a.last('score_update')!.bossHp).toBe(0);
    expect(a.last('match_over')!.winners).toHaveLength(2);
  });

  it('shared quest progress reaches everyone watching', () => {
    const { phone, store } = setup();
    store.saveShared({ id: 'sq1', title: '500 squats today', measure: 'count', target: 500, scope: 'room', owner: 'x', total: 0, contributions: {}, endsAt: null });
    const a = phone('a');
    const b = phone('b');
    a.send({ type: 'hello', name: 'Ama' });
    b.send({ type: 'watch_shared', questId: 'sq1' });
    a.send({ type: 'watch_shared', questId: 'sq1' });
    a.send({ type: 'quest_progress', questId: 'sq1', amount: 20 });
    expect(b.last('quest_progress')).toEqual({ type: 'quest_progress', questId: 'sq1', title: '500 squats today', total: 20, target: 500 });
  });

  it('quest battles: a live timeline and the first to finish wins', () => {
    const { phone } = setup();
    const a = phone('a');
    const b = phone('b');
    a.send({ type: 'hello', name: 'Red' });
    b.send({ type: 'hello', name: 'Blue' });
    a.send({ type: 'create_room' });
    b.send({ type: 'join_room', code: a.last('room_state')!.code });
    a.send({
      type: 'set_quest',
      quest: { title: 'Race', kind: 'battle', steps: [{ type: 'move', instruction: 'Run to the tree', check: 'confirm' }], reward: { xp: 10 } },
    });
    b.send({ type: 'quest_step', step: 1, done: true });
    a.send({ type: 'quest_step', step: 1, done: true });
    const tl = a.last('quest_timeline')!;
    expect(tl.winner).toBe(b.last('welcome')!.playerId);
    expect(tl.players.map((p) => p.done)).toEqual([true, true]);
  });

  it('rejects junk and floods', () => {
    const { phone } = setup();
    const a = phone('a');
    a.conn.send = ((m: ServerMessage) => a.inbox.push(m)) as Conn['send'];
    a.send({ type: 'ping' });
    expect(a.last('pong')).toBeDefined();
    (a as { send: (m: unknown) => void }).send({ type: 'nonsense' });
    expect(a.last('error')!.code).toBe('bad_message');
    for (let i = 0; i < 100; i++) a.send({ type: 'ping' });
    expect(a.inbox.some((m) => m.type === 'error' && m.code === 'rate_limited')).toBe(true);
  });
});
