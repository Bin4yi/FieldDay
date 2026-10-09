import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { getTemplate, withPlayers } from '@fieldday/engine';
import { parseServerMessage, type ClientMessageInput, type ServerMessage } from '@fieldday/net';
import { readConfig, startServer } from '../src/server.js';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer(readConfig({ ALLOWED_ORIGINS: 'http://localhost:5173' }), 0);
});
afterAll(async () => {
  await srv.close();
});

function client() {
  const ws = new WebSocket(`ws://localhost:${srv.port}/ws`, { headers: { origin: 'http://localhost:5173' } });
  const inbox: ServerMessage[] = [];
  const waiters: { type: string; resolve: (m: ServerMessage) => void }[] = [];
  ws.on('message', (d) => {
    const m = parseServerMessage(String(d));
    if (!m) return;
    inbox.push(m);
    for (const w of [...waiters]) {
      if (w.type === m.type) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  const open = new Promise<void>((r) => ws.on('open', () => r()));
  return {
    open,
    send: (m: ClientMessageInput) => ws.send(JSON.stringify(m)),
    next: <K extends ServerMessage['type']>(type: K) =>
      new Promise<Extract<ServerMessage, { type: K }>>((resolve) => waiters.push({ type, resolve: resolve as (m: ServerMessage) => void })),
    close: () => ws.close(),
  };
}

describe('real WebSocket server', () => {
  it('two phones play a live battle over the network', async () => {
    const a = client();
    const b = client();
    await Promise.all([a.open, b.open]);
    a.send({ type: 'hello', name: 'Colombo' });
    b.send({ type: 'hello', name: 'Kandy' });
    const [wa] = await Promise.all([a.next('welcome'), b.next('welcome')]);
    a.send({ type: 'create_room', spec: { ...withPlayers(getTemplate('jump_battle')!, 1), rounds: 1 } });
    const state = await a.next('room_state');
    b.send({ type: 'join_room', code: state.code });
    await b.next('room_state');
    a.send({ type: 'time_sync', clientT: 1 });
    const sync = await a.next('time_sync');
    expect(sync.clientT).toBe(1);
    a.send({ type: 'start_match', countdown_s: 3 });
    const start = await b.next('match_start');
    const t = start.startAt + 100; // a moment after the shared start
    a.send({ type: 'game_event', event: { player: 'x', event: 'jump', measures: { height_m: 0.5 }, t, seq: 0 } });
    b.send({ type: 'game_event', event: { player: 'x', event: 'jump', measures: { height_m: 0.4 }, t, seq: 0 } });
    const over = await a.next('match_over');
    expect(over.winners).toEqual([wa.playerId]);
    a.close();
    b.close();
  });

  it('refuses other websites', async () => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`, { headers: { origin: 'https://evil.example' } });
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(1008);
  });
});
