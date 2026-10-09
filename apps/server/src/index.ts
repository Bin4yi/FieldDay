import { SqliteStore } from './store.js';
import { readConfig, startServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const dbFile = process.env.DATABASE_FILE ?? 'fieldday.sqlite';
const store = await SqliteStore.open(dbFile).catch((e) => {
  console.warn('SQLite not available, using memory store:', e instanceof Error ? e.message : e);
  return undefined;
});
const { port: actual } = await startServer(readConfig(), port, store ? { store } : {});
console.log(`FieldDay server on http://localhost:${actual} (ws: /ws)`);
