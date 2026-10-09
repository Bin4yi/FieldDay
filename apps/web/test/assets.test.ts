import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allAssets } from '../src/assets.js';

const PUBLIC = join(import.meta.dirname, '../public');

describe('asset map', () => {
  it('every asset exists on disk or has a fallback', () => {
    for (const a of allAssets()) {
      const exists = existsSync(join(PUBLIC, a.src));
      expect(exists || a.fallback.length > 0, a.src).toBe(true);
    }
  });

  it('every asset has a fallback emoji anyway', () => {
    for (const a of allAssets()) expect(a.fallback.length, a.src).toBeGreaterThan(0);
  });

  it('all generated files are currently present', () => {
    const missing = allAssets().filter((a) => !existsSync(join(PUBLIC, a.src)));
    expect(missing.map((m) => m.src)).toEqual([]);
  });

  it('no hard-coded asset paths outside the map', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const src = join(import.meta.dirname, '../src');
    for (const file of walk(src)) {
      if (file.endsWith('assets.ts')) continue;
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/['"`]assets\/[a-z_]+\//);
    }
  });
});
