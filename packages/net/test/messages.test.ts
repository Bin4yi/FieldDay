import { describe, expect, it } from 'vitest';
import { getTemplate } from '@fieldday/engine';
import { ROOM_CODE, makeRoomCode, parseClientMessage, parseServerMessage } from '../src/index.js';

describe('net messages', () => {
  it('parses a valid game event', () => {
    const m = parseClientMessage(
      JSON.stringify({
        type: 'game_event',
        event: { player: 'p1', event: 'ball_apex', measures: { height_m: 2.4 }, t: 1000, seq: 3 },
      }),
    );
    expect(m?.type).toBe('game_event');
  });

  it('rejects junk, unknown events and bad room codes', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'game_event', event: { player: 'p1', event: 'teleport', t: 1, seq: 0 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'join_room', code: 'abc' }))).toBeNull();
  });

  it('fills defaults on join', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'join_room', code: 'ABC234' }));
    expect(m).toEqual({ type: 'join_room', code: 'ABC234', role: 'player', lastSeq: -1 });
  });

  it('carries a full game spec in room_state', () => {
    const spec = getTemplate('sky_toss')!;
    const m = parseServerMessage(
      JSON.stringify({ type: 'room_state', code: 'ABC234', host: 'p1', players: [], spec }),
    );
    expect(m?.type === 'room_state' && m.spec?.id).toBe('sky_toss');
  });

  it('makes valid room codes', () => {
    for (let i = 0; i < 50; i++) expect(makeRoomCode()).toMatch(ROOM_CODE);
  });
});
