import { describe, expect, it } from 'vitest';
import { createGame, encodeGhost, getTemplate, makeGhost, withPlayers } from '@fieldday/engine';
import { createApp, readConfig } from '../src/app.js';

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('server http', () => {
  it('answers the health check', async () => {
    const { app } = createApp(readConfig({}));
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, boost: false });
  });

  it('only allows configured origins', async () => {
    const { app } = createApp(readConfig({ ALLOWED_ORIGINS: 'https://fieldday.example' }));
    const ok = await app.request('/health', { headers: { Origin: 'https://fieldday.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://fieldday.example');
    const bad = await app.request('/health', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('crews: create, join, results, leaderboard without flagged results, shared quest', async () => {
    let t = 1000;
    const { app } = createApp(readConfig({}), { now: () => (t += 1000) });
    const crew = (await (await app.request('/crews', post({ name: 'Colombo Kids', playerId: 'p1', playerName: 'Ama' }))).json()) as { code: string };
    expect(crew.code).toMatch(/^[A-Z0-9]{6}$/);
    const joined = (await (await app.request(`/crews/${crew.code}/join`, post({ playerId: 'p2', playerName: 'Binula' }))).json()) as { members: unknown[] };
    expect(joined.members).toHaveLength(2);

    const sq = (await (await app.request('/shared', post({ title: 'Throw 10 metres together', measure: 'height_m', target: 10, scope: 'crew', owner: crew.code }))).json()) as { id: string };
    const r1 = await (await app.request(`/crews/${crew.code}/results`, post({ playerId: 'p1', specId: 'sky_toss', total: 2.4, best: { measure: 'height_m', value: 2.4 }, sharedQuests: [sq.id] }))).json();
    expect(r1).toEqual({ ok: true, flagged: null });
    const cheat = (await (await app.request(`/crews/${crew.code}/results`, post({ playerId: 'p2', specId: 'sky_toss', total: 15, best: { measure: 'height_m', value: 15 }, sharedQuests: [sq.id] }))).json()) as { flagged: string };
    expect(cheat.flagged).toMatch(/too high/);
    await app.request(`/crews/${crew.code}/results`, post({ playerId: 'p2', specId: 'sky_toss', total: 2.1, best: { measure: 'height_m', value: 2.1 }, sharedQuests: [sq.id] }));

    const view = (await (await app.request(`/crews/${crew.code}`)).json()) as {
      leaderboard: { specId: string; entries: { name: string; best: number }[] }[];
      shared: { total: number }[];
    };
    expect(view.leaderboard[0]!.entries).toEqual([
      { player: 'p1', name: 'Ama', best: 2.4 },
      { player: 'p2', name: 'Binula', best: 2.1 },
    ]);
    expect(view.shared[0]!.total).toBeCloseTo(4.5);
    expect((await app.request(`/crews/${crew.code}/results`, post({ playerId: 'stranger', specId: 'x', total: 1 }))).status).toBe(403);
  });

  it('trending codes and short ghost links', async () => {
    const { app } = createApp(readConfig({}));
    const spec = getTemplate('squat_storm')!;
    await app.request('/trending', post({ code: 'SQUAT-STORM-11', spec }));
    await app.request('/trending', post({ code: 'SQUAT-STORM-11', spec }));
    await app.request('/trending', post({ code: 'SKY-TOSS-42', spec: getTemplate('sky_toss') }));
    const top = (await (await app.request('/trending')).json()) as { code: string; count: number }[];
    expect(top.map((x) => [x.code, x.count])).toEqual([
      ['SQUAT-STORM-11', 2],
      ['SKY-TOSS-42', 1],
    ]);
    expect((await app.request('/trending', post({ code: 'X', spec: { title: 'bad' } }))).status).toBe(400);

    const g = createGame(withPlayers(getTemplate('sky_toss')!, 1), { autoAdvance: true });
    g.start(0);
    const code = encodeGhost(makeGhost(g.spec, g.result(), 0, 'Ama', 1));
    const { id } = (await (await app.request('/ghosts', post({ code }))).json()) as { id: string };
    expect(((await (await app.request(`/ghosts/${id}`)).json()) as { code: string }).code).toBe(code);
    expect((await app.request('/ghosts', post({ code: 'FDG1.nope' }))).status).toBe(400);
  });

  it('rate limits per IP', async () => {
    const { app } = createApp(readConfig({}), { now: () => 0 });
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) codes.push((await app.request('/trending', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect((await app.request('/trending', { headers: { 'x-forwarded-for': '5.6.7.8' } })).status).toBe(200);
  });
});
