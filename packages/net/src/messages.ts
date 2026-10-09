import { z } from 'zod';
import { EventTypeSchema, GameSpecSchema, MeasureSchema } from '@fieldday/engine';
import { QuestSpecSchema } from '@fieldday/quests';

// Messages between phones and the server. Video never goes over the network:
// only small game events like {player, event, measure, t}.

export const ROOM_CODE = /^[A-Z0-9]{6}$/;
export const RoomCodeSchema = z.string().regex(ROOM_CODE);
export const PlayerIdSchema = z.string().min(1).max(40);
export const NameSchema = z.string().trim().min(1).max(24);

/** The only thing a phone sends about play: a small event. */
export const NetGameEventSchema = z.object({
  player: PlayerIdSchema,
  event: EventTypeSchema,
  target: z.string().max(40).optional(),
  measures: z.partialRecord(MeasureSchema, z.number().finite()).optional(),
  /** Server-synced time in ms. */
  t: z.number().finite(),
  /** Per-sender sequence number, used to replay missed events after a reconnect. */
  seq: z.number().int().min(0),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), name: NameSchema, playerId: PlayerIdSchema.optional() }),
  z.object({ type: z.literal('create_room'), spec: GameSpecSchema.optional() }),
  z.object({
    type: z.literal('join_room'),
    code: RoomCodeSchema,
    role: z.enum(['player', 'spectator']).default('player'),
    /** Last event seq this phone has, to replay what it missed. */
    lastSeq: z.number().int().min(-1).default(-1),
  }),
  z.object({ type: z.literal('leave_room') }),
  z.object({ type: z.literal('set_spec'), spec: GameSpecSchema }),
  z.object({ type: z.literal('start_match'), countdown_s: z.number().int().min(3).max(30).default(5) }),
  z.object({ type: z.literal('game_event'), event: NetGameEventSchema }),
  z.object({ type: z.literal('crowd_vote'), round: z.number().int().min(0), player: PlayerIdSchema }),
  z.object({ type: z.literal('quest_progress'), questId: z.string().min(1).max(60), amount: z.number().finite().min(0).max(100000) }),
  z.object({ type: z.literal('watch_shared'), questId: z.string().min(1).max(60) }),
  z.object({ type: z.literal('set_quest'), quest: QuestSpecSchema }),
  z.object({ type: z.literal('quest_step'), step: z.number().int().min(0).max(20), done: z.boolean().default(false) }),
  z.object({ type: z.literal('time_sync'), clientT: z.number() }),
  z.object({ type: z.literal('ping') }),
]);

export const RoomPlayerSchema = z.object({
  id: PlayerIdSchema,
  name: NameSchema,
  role: z.enum(['player', 'spectator']),
  connected: z.boolean(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), playerId: PlayerIdSchema }),
  z.object({
    type: z.literal('room_state'),
    code: RoomCodeSchema,
    host: PlayerIdSchema,
    players: z.array(RoomPlayerSchema),
    spec: GameSpecSchema.nullable(),
    quest: QuestSpecSchema.nullable().default(null),
    started: z.boolean().default(false),
  }),
  z.object({ type: z.literal('match_start'), startAt: z.number() }),
  z.object({ type: z.literal('game_event'), event: NetGameEventSchema, serverSeq: z.number().int().min(0) }),
  z.object({
    type: z.literal('score_update'),
    scores: z.array(
      z.object({
        player: PlayerIdSchema,
        name: NameSchema,
        total: z.number().nullable(),
        flagged: z.boolean(),
        done: z.boolean().default(false),
      }),
    ),
    bossHp: z.number().nullable().default(null),
  }),
  z.object({ type: z.literal('match_over'), winners: z.array(PlayerIdSchema) }),
  z.object({ type: z.literal('flagged'), player: PlayerIdSchema, reason: z.string().max(200) }),
  z.object({
    type: z.literal('quest_timeline'),
    players: z.array(z.object({ player: PlayerIdSchema, name: NameSchema, step: z.number().int(), done: z.boolean(), at: z.number() })),
    winner: PlayerIdSchema.nullable(),
  }),
  z.object({ type: z.literal('crowd_votes'), round: z.number().int(), votes: z.record(PlayerIdSchema, z.number()) }),
  z.object({
    type: z.literal('quest_progress'),
    questId: z.string(),
    title: z.string().max(60).default(''),
    total: z.number(),
    target: z.number(),
  }),
  z.object({ type: z.literal('time_sync'), clientT: z.number(), serverT: z.number() }),
  z.object({ type: z.literal('pong') }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['bad_message', 'room_not_found', 'room_full', 'rate_limited', 'not_host', 'not_in_room']),
    message: z.string().max(200),
  }),
]);

export type NetGameEvent = z.infer<typeof NetGameEventSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageInput = z.input<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RoomPlayer = z.infer<typeof RoomPlayerSchema>;

/** Parse a raw websocket frame. Returns null for anything invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const r = ClientMessageSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const r = ServerMessageSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 6-character room code without look-alike letters (no I, O, 0, 1). */
export function makeRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return code;
}
