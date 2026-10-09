import { describe, expect, it } from 'vitest';
import { getTemplate } from '@fieldday/engine';
import { createApp, readConfig } from '../src/app.js';
import { outputText } from '../src/openai.js';

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

function fakeOpenAI(reply: (url: string, body: Record<string, unknown>) => unknown) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), body, auth: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(reply(String(url), body)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const env = { OPENAI_API_KEY: 'sk-test', OPENAI_DESIGN_MODEL: 'design-model', OPENAI_VISION_MODEL: 'vision-model', OPENAI_REALTIME_MODEL: 'realtime-model' };

describe('Boost Mode proxy', () => {
  it('is off without a key (503) and the health check says so', async () => {
    const { app } = createApp(readConfig({}));
    expect((await app.request('/openai/json', post({ task: 'design', request: 'x', ctx: { players: 1, kidsMode: false, refereeStyle: 'pirate' } }))).status).toBe(503);
    expect(await (await app.request('/health')).json()).toMatchObject({ boost: false });
  });

  it('designs with structured outputs (json_schema) and the key stays on the server', async () => {
    const spec = getTemplate('jump_battle')!;
    const { f, calls } = fakeOpenAI(() => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(spec) }] }] }));
    const { app } = createApp(readConfig(env), { fetch: f });
    const res = await app.request('/openai/json', post({ task: 'design', request: 'jump battle', ctx: { players: 2, kidsMode: false, refereeStyle: 'pirate' } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { id: string } }).result.id).toBe('jump_battle');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/responses');
    expect(call.auth).toBe('Bearer sk-test');
    expect(call.body.model).toBe('design-model');
    const format = (call.body.text as { format: { type: string; name: string; schema: { properties: Record<string, unknown> } } }).format;
    expect(format.type).toBe('json_schema');
    expect(format.name).toBe('game_spec');
    expect(Object.keys(format.schema.properties)).toContain('scoring');
    expect(String(call.body.input)).toContain('jump battle');
  });

  it('checks quest photos with input_image', async () => {
    const { f, calls } = fakeOpenAI(() => ({ output_text: JSON.stringify({ passed: true, confidence: 0.9, labels: ['tree', 'grass'] }) }));
    const { app } = createApp(readConfig(env), { fetch: f });
    const res = await app.request('/openai/vision', post({ image: 'data:image/jpeg;base64,AAAA', task: 'a tree' }));
    expect(await res.json()).toEqual({ passed: true, confidence: 0.9, labels: ['tree', 'grass'] });
    const content = (calls[0]!.body.input as { content: { type: string; image_url?: string }[] }[])[0]!.content;
    expect(content.map((c) => c.type)).toEqual(['input_text', 'input_image']);
    expect(calls[0]!.body.model).toBe('vision-model');
  });

  it('mints a short-lived Realtime token (client_secrets)', async () => {
    const { f, calls } = fakeOpenAI(() => ({ value: 'ek_123', expires_at: 1760000600, session: {} }));
    const { app } = createApp(readConfig(env), { fetch: f });
    const res = await app.request('/openai/realtime-token', post({ style: 'pirate', kids: true }));
    expect(await res.json()).toEqual({ value: 'ek_123', expires_at: 1760000600, model: 'realtime-model' });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    const session = calls[0]!.body.session as { type: string; model: string; instructions: string };
    expect(session.type).toBe('realtime');
    expect(session.model).toBe('realtime-model');
    expect(session.instructions).toMatch(/pirate/);
    expect(session.instructions).toMatch(/gentle/);
    expect(calls[0]!.body.expires_after).toEqual({ anchor: 'created_at', seconds: 600 });
  });

  it('reports upstream failures as 502 and rejects bad input', async () => {
    const f = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const { app } = createApp(readConfig(env), { fetch: f });
    expect((await app.request('/openai/json', post({ task: 'remix', spec: getTemplate('sky_toss'), change: 'x' }))).status).toBe(502);
    expect((await app.request('/openai/vision', post({ image: 'http://evil', task: 'x' }))).status).toBe(400);
  });

  it('reads output text from raw responses', () => {
    expect(outputText({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"a":1}' }] }] })).toBe('{"a":1}');
  });
});
