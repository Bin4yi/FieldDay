import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Phase 1: health check only. Rooms, live battles, crews and the OpenAI
// proxy arrive in Phases 6 and 7.

export interface ServerConfig {
  allowedOrigins: string[];
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function createApp(config: ServerConfig) {
  const app = new Hono();
  app.use('*', cors({ origin: config.allowedOrigins }));
  app.get('/health', (c) => c.json({ ok: true, service: 'fieldday', version: '0.1.0' }));
  return app;
}
