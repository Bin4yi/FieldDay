import { describe, expect, it } from 'vitest';
import { createApp, readConfig } from '../src/app.js';

describe('server', () => {
  it('answers the health check', async () => {
    const app = createApp(readConfig({}));
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('only allows configured origins', async () => {
    const app = createApp(readConfig({ ALLOWED_ORIGINS: 'https://fieldday.example' }));
    const ok = await app.request('/health', { headers: { Origin: 'https://fieldday.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://fieldday.example');
    const bad = await app.request('/health', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});
