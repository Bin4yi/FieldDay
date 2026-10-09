import type { DatabaseSync } from 'node:sqlite';

// The data layer, behind one interface so it can move to a hosted DB later.
// MemoryStore for tests/dev, SqliteStore (Node's built-in node:sqlite) for real use.

export interface Crew {
  code: string;
  name: string;
  members: { id: string; name: string }[];
  createdAt: number;
}

export interface CrewResult {
  crew: string;
  player: string;
  name: string;
  specId: string;
  total: number;
  /** Lower is better for this game (reaction, sprint time…). */
  lowerBetter: boolean;
  flagged: boolean;
  at: number;
}

export interface SharedQuest {
  id: string;
  title: string;
  measure: string;
  target: number;
  scope: 'crew' | 'room';
  owner: string;
  total: number;
  contributions: Record<string, number>;
  endsAt: number | null;
}

export interface TrendingEntry {
  code: string;
  spec: unknown;
  title: string;
  count: number;
  lastAt: number;
}

export interface Store {
  getCrew(code: string): Crew | null;
  saveCrew(crew: Crew): void;
  addCrewResult(r: CrewResult): void;
  crewResults(code: string): CrewResult[];
  getShared(id: string): SharedQuest | null;
  saveShared(q: SharedQuest): void;
  sharedFor(owner: string): SharedQuest[];
  bumpTrending(code: string, title: string, spec: unknown, at: number): void;
  trending(limit: number): TrendingEntry[];
  putGhost(id: string, code: string): void;
  getGhost(id: string): string | null;
}

export class MemoryStore implements Store {
  private crews = new Map<string, Crew>();
  private results: CrewResult[] = [];
  private shared = new Map<string, SharedQuest>();
  private trend = new Map<string, TrendingEntry>();
  private ghosts = new Map<string, string>();

  getCrew(code: string) {
    return structuredClone(this.crews.get(code) ?? null);
  }
  saveCrew(c: Crew) {
    this.crews.set(c.code, structuredClone(c));
  }
  addCrewResult(r: CrewResult) {
    this.results.push(r);
  }
  crewResults(code: string) {
    return this.results.filter((r) => r.crew === code);
  }
  getShared(id: string) {
    return structuredClone(this.shared.get(id) ?? null);
  }
  saveShared(q: SharedQuest) {
    this.shared.set(q.id, structuredClone(q));
  }
  sharedFor(owner: string) {
    return [...this.shared.values()].filter((q) => q.owner === owner);
  }
  bumpTrending(code: string, title: string, spec: unknown, at: number) {
    const e = this.trend.get(code) ?? { code, spec, title, count: 0, lastAt: at };
    this.trend.set(code, { ...e, spec, title, count: e.count + 1, lastAt: at });
  }
  trending(limit: number) {
    return [...this.trend.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, limit);
  }
  putGhost(id: string, code: string) {
    this.ghosts.set(id, code);
  }
  getGhost(id: string) {
    return this.ghosts.get(id) ?? null;
  }
}

/** Key/value tables in SQLite (JSON values). Simple and enough for a hackathon server. */
export class SqliteStore implements Store {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crews (code TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS crew_results (crew TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS crew_results_crew ON crew_results(crew);
      CREATE TABLE IF NOT EXISTS shared (id TEXT PRIMARY KEY, owner TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trending (code TEXT PRIMARY KEY, title TEXT, spec TEXT, count INTEGER, last_at INTEGER);
      CREATE TABLE IF NOT EXISTS ghosts (id TEXT PRIMARY KEY, code TEXT NOT NULL);
    `);
  }

  static async open(file: string): Promise<SqliteStore> {
    const { DatabaseSync } = await import('node:sqlite');
    return new SqliteStore(new DatabaseSync(file));
  }

  getCrew(code: string): Crew | null {
    const row = this.db.prepare('SELECT json FROM crews WHERE code = ?').get(code) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Crew) : null;
  }
  saveCrew(c: Crew) {
    this.db.prepare('INSERT OR REPLACE INTO crews (code, json) VALUES (?, ?)').run(c.code, JSON.stringify(c));
  }
  addCrewResult(r: CrewResult) {
    this.db.prepare('INSERT INTO crew_results (crew, json) VALUES (?, ?)').run(r.crew, JSON.stringify(r));
  }
  crewResults(code: string): CrewResult[] {
    return (this.db.prepare('SELECT json FROM crew_results WHERE crew = ?').all(code) as { json: string }[]).map((r) => JSON.parse(r.json) as CrewResult);
  }
  getShared(id: string): SharedQuest | null {
    const row = this.db.prepare('SELECT json FROM shared WHERE id = ?').get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as SharedQuest) : null;
  }
  saveShared(q: SharedQuest) {
    this.db.prepare('INSERT OR REPLACE INTO shared (id, owner, json) VALUES (?, ?, ?)').run(q.id, q.owner, JSON.stringify(q));
  }
  sharedFor(owner: string): SharedQuest[] {
    return (this.db.prepare('SELECT json FROM shared WHERE owner = ?').all(owner) as { json: string }[]).map((r) => JSON.parse(r.json) as SharedQuest);
  }
  bumpTrending(code: string, title: string, spec: unknown, at: number) {
    this.db
      .prepare(
        `INSERT INTO trending (code, title, spec, count, last_at) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(code) DO UPDATE SET count = count + 1, last_at = excluded.last_at, title = excluded.title, spec = excluded.spec`,
      )
      .run(code, title, JSON.stringify(spec), at);
  }
  trending(limit: number): TrendingEntry[] {
    return (
      this.db.prepare('SELECT code, title, spec, count, last_at FROM trending ORDER BY count DESC, last_at DESC LIMIT ?').all(limit) as {
        code: string;
        title: string;
        spec: string;
        count: number;
        last_at: number;
      }[]
    ).map((r) => ({ code: r.code, title: r.title, spec: JSON.parse(r.spec) as unknown, count: r.count, lastAt: r.last_at }));
  }
  putGhost(id: string, code: string) {
    this.db.prepare('INSERT OR REPLACE INTO ghosts (id, code) VALUES (?, ?)').run(id, code);
  }
  getGhost(id: string): string | null {
    const row = this.db.prepare('SELECT code FROM ghosts WHERE id = ?').get(id) as { code: string } | undefined;
    return row?.code ?? null;
  }
}

/** Best result per player per game, flagged ones left out. */
export function leaderboard(results: CrewResult[]): { specId: string; entries: { player: string; name: string; best: number }[] }[] {
  const bySpec = new Map<string, Map<string, { name: string; best: number; lower: boolean }>>();
  for (const r of results) {
    if (r.flagged) continue;
    const m = bySpec.get(r.specId) ?? new Map();
    const prev = m.get(r.player);
    const better = !prev || (r.lowerBetter ? r.total < prev.best : r.total > prev.best);
    if (better) m.set(r.player, { name: r.name, best: r.total, lower: r.lowerBetter });
    bySpec.set(r.specId, m);
  }
  return [...bySpec.entries()].map(([specId, m]) => {
    const entries = [...m.entries()].map(([player, v]) => ({ player, name: v.name, best: v.best, lower: v.lower }));
    entries.sort((a, b) => (a.lower ? a.best - b.best : b.best - a.best));
    return { specId, entries: entries.map(({ player, name, best }) => ({ player, name, best })) };
  });
}
