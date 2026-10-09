import { serve } from '@hono/node-server';
import { createApp, readConfig } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const app = createApp(readConfig());
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`FieldDay server on http://localhost:${info.port}`);
});
