import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { GameSpecSchema, MeasureSchema, decodeGhost } from '@fieldday/engine';
import { RateLimiter, cheatReason, makeRoomCode } from '@fieldday/net';
import { RoomManager } from './rooms.js';
import { MemoryStore, leaderboard, type Store } from './store.js';

// FieldDay server: rooms (WebSocket), crews, shared quests, trending game
// codes, short ghost links, and (Boost Mode) the OpenAI proxy.

export interface ServerConfig {
  allowedOrigins: string[];
  openaiKey?: string;
  designModel?: string;
  visionModel?: string;
  realtimeModel?: string;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...(env.OPENAI_API_KEY ? { openaiKey: env.OPENAI_API_KEY } : {}),
    ...(env.OPENAI_DESIGN_MODEL ? { designModel: env.OPENAI_DESIGN_MODEL } : {}),
    ...(env.OPENAI_VISION_MODEL ? { visionModel: env.OPENAI_VISION_MODEL } : {}),
    ...(env.OPENAI_REALTIME_MODEL ? { realtimeModel: env.OPENAI_REALTIME_MODEL } : {}),
  };
}

export interface AppDeps {
  store?: Store;
  rooms?: RoomManager;
  now?: () => number;
  random?: () => number;
  /** Replaced in tests. */
  fetch?: typeof fetch;
}

const NameSchema = z.string().trim().min(1).max(24);
const IdSchema = z.string().min(1).max(40);

export function createApp(config: ServerConfig, deps: AppDeps = {}) {
  const store = deps.store ?? new MemoryStore();
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const rooms = deps.rooms ?? new RoomManager({ store, now, random });
  const limiter = new RateLimiter(5, 30, now);
  const app = new Hono();

  app.use('*', cors({ origin: config.allowedOrigins }));
  app.use('*', async (c, next) => {
    if (c.req.path === '/health' || c.req.path === '/ws') return next();
    if (!limiter.allow(ip(c))) return c.json({ error: 'rate_limited' }, 429);
    return next();
  });

  app.get('/health', (c) =>
    c.json({ ok: true, service: 'fieldday', version: '0.2.0', rooms: rooms.roomCount, boost: !!config.openaiKey }),
  );

  // ---------- crews ----------
  app.post('/crews', async (c) => {
    const body = z.object({ name: z.string().trim().min(1).max(30), playerId: IdSchema, playerName: NameSchema }).safeParse(await json(c));
    if (!body.success) return bad(c, body.error.issues[0]?.message);
    let code = makeRoomCode(random);
    while (store.getCrew(code)) code = makeRoomCode(random);
    store.saveCrew({ code, name: body.data.name, members: [{ id: body.data.playerId, name: body.data.playerName }], createdAt: now() });
    return c.json(crewView(store, code), 201);
  });

  app.post('/crews/:code/join', async (c) => {
    const crew = store.getCrew(c.req.param('code').toUpperCase());
    if (!crew) return c.json({ error: 'not_found' }, 404);
    const body = z.object({ playerId: IdSchema, playerName: NameSchema }).safeParse(await json(c));
    if (!body.success) return bad(c, body.error.issues[0]?.message);
    if (!crew.members.some((m) => m.id === body.data.playerId)) {
      if (crew.members.length >= 30) return c.json({ error: 'crew_full' }, 409);
      crew.members.push({ id: body.data.playerId, name: body.data.playerName });
      store.saveCrew(crew);
    }
    return c.json(crewView(store, crew.code));
  });

  app.get('/crews/:code', (c) => {
    const view = crewView(store, c.req.param('code').toUpperCase());
    return view ? c.json(view) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/crews/:code/results', async (c) => {
    const crew = store.getCrew(c.req.param('code').toUpperCase());
    if (!crew) return c.json({ error: 'not_found' }, 404);
    const body = z
      .object({
        playerId: IdSchema,
        specId: z.string().min(1).max(40),
        total: z.number().finite(),
        lowerBetter: z.boolean().default(false),
        best: z.object({ measure: MeasureSchema, value: z.number().finite() }).optional(),
        /** Optional shared quest to add this result to. */
        sharedQuest: z.string().max(60).optional(),
      })
      .safeParse(await json(c));
    if (!body.success) return bad(c, body.error.issues[0]?.message);
    const member = crew.members.find((m) => m.id === body.data.playerId);
    if (!member) return c.json({ error: 'not_a_member' }, 403);
    const b = body.data.best;
    const event = b?.measure === 'height_m' ? (body.data.specId === 'jump_battle' ? 'jump' : 'ball_apex') : 'hands_up';
    const reason = b ? cheatReason([], { event, t: 0, measures: { [b.measure]: b.value } }) : null;
    store.addCrewResult({
      crew: crew.code,
      player: member.id,
      name: member.name,
      specId: body.data.specId,
      total: body.data.total,
      lowerBetter: body.data.lowerBetter,
      flagged: !!reason,
      at: now(),
    });
    if (body.data.sharedQuest && !reason) {
      const q = store.getShared(body.data.sharedQuest);
      if (q && q.owner === crew.code) {
        const add = b && b.measure === q.measure ? b.value : q.measure === 'count' ? body.data.total : 0;
        if (add > 0) {
          q.contributions[member.id] = (q.contributions[member.id] ?? 0) + add;
          q.total = Object.values(q.contributions).reduce((x, y) => x + y, 0);
          store.saveShared(q);
          rooms.notifyShared(q.id, q.title, q.total, q.target);
        }
      }
    }
    return c.json({ ok: true, flagged: reason });
  });

  // ---------- shared quests ----------
  app.post('/shared', async (c) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(60),
        measure: MeasureSchema,
        target: z.number().positive().max(1_000_000),
        scope: z.enum(['crew', 'room']),
        owner: z.string().min(1).max(40),
        days: z.number().min(0.01).max(31).optional(),
      })
      .safeParse(await json(c));
    if (!body.success) return bad(c, body.error.issues[0]?.message);
    const id = `sq_${Math.floor(random() * 2 ** 40).toString(36)}`;
    const q = {
      id,
      title: body.data.title,
      measure: body.data.measure,
      target: body.data.target,
      scope: body.data.scope,
      owner: body.data.owner,
      total: 0,
      contributions: {},
      endsAt: body.data.days ? now() + body.data.days * 86400000 : null,
    };
    store.saveShared(q);
    return c.json(q, 201);
  });

  app.get('/shared/:id', (c) => {
    const q = store.getShared(c.req.param('id'));
    return q ? c.json(q) : c.json({ error: 'not_found' }, 404);
  });

  // ---------- trending game codes ----------
  app.get('/trending', (c) => c.json(store.trending(10)));
  app.post('/trending', async (c) => {
    const body = z.object({ code: z.string().min(3).max(30), spec: GameSpecSchema }).safeParse(await json(c));
    if (!body.success) return bad(c, body.error.issues[0]?.message);
    store.bumpTrending(body.data.code, body.data.spec.title, body.data.spec, now());
    return c.json({ ok: true });
  });

  // ---------- short ghost links ----------
  app.post('/ghosts', async (c) => {
    const body = z.object({ code: z.string().min(8).max(4000) }).safeParse(await json(c));
    if (!body.success) return bad(c, 'missing code');
    try {
      decodeGhost(body.data.code);
    } catch {
      return bad(c, 'not a ghost');
    }
    const id = Math.floor(random() * 2 ** 40).toString(36);
    store.putGhost(id, body.data.code);
    return c.json({ id }, 201);
  });
  app.get('/ghosts/:id', (c) => {
    const code = store.getGhost(c.req.param('id'));
    return code ? c.json({ code }) : c.json({ error: 'not_found' }, 404);
  });

  return { app, rooms, store };
}

function crewView(store: Store, code: string) {
  const crew = store.getCrew(code);
  if (!crew) return null;
  return {
    ...crew,
    leaderboard: leaderboard(store.crewResults(code)),
    shared: store.sharedFor(code),
  };
}

function ip(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
}

async function json(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function bad(c: Context, message = 'bad request') {
  return c.json({ error: 'bad_request', message }, 400);
}
