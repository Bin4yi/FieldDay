import { serve, upgradeWebSocket, type ServerType } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import type { ServerMessage } from '@fieldday/net';
import { createApp, readConfig, type AppDeps, type ServerConfig } from './app.js';
import type { Conn } from './rooms.js';

// Wires the Hono app to a real HTTP + WebSocket server.

export function startServer(config: ServerConfig, port: number, deps: AppDeps = {}): Promise<{ server: ServerType; port: number; close(): Promise<void> }> {
  const { app, rooms } = createApp(config, deps);
  let nextId = 0;
  app.get(
    '/ws',
    upgradeWebSocket((c) => {
      const origin = c.req.header('origin');
      const allowed = !origin || config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*');
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
      let conn: Conn | null = null;
      return {
        onOpen(_evt, ws) {
          if (!allowed) {
            ws.close(1008, 'origin not allowed');
            return;
          }
          conn = {
            id: `c${++nextId}`,
            ip,
            send: (msg: ServerMessage) => {
              try {
                ws.send(JSON.stringify(msg));
              } catch {
                // closed
              }
            },
            close: () => ws.close(),
          };
          rooms.connect(conn);
        },
        onMessage(evt) {
          if (!conn) return;
          const data = typeof evt.data === 'string' ? evt.data : '';
          if (data.length > 64_000) return;
          rooms.message(conn, data);
        },
        onClose() {
          if (conn) rooms.disconnect(conn);
        },
      };
    }),
  );
  const ticker = setInterval(() => rooms.tick(), 200);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port, websocket: { server: new WebSocketServer({ noServer: true }) } }, (info) => {
      resolve({
        server,
        port: info.port,
        close: () =>
          new Promise<void>((r) => {
            clearInterval(ticker);
            server.close(() => r());
          }),
      });
    });
  });
}

export { readConfig };
