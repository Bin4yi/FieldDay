import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, contrast, playerColors } from '../src/tokens.js';

describe('design tokens', () => {
  it('text pairs are readable in sunlight (WCAG AAA, 7:1)', () => {
    expect(contrast(colors.navy, colors.yellow)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.navy, colors.green)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.navy, colors.white)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.white, colors.navyLight)).toBeGreaterThanOrEqual(7);
  });

  it('every player colour stands out on navy, and has a unique shape', () => {
    for (const p of playerColors) expect(contrast(p.color, colors.navy), p.name).toBeGreaterThanOrEqual(4.5);
    expect(new Set(playerColors.map((p) => p.shape)).size).toBe(playerColors.length);
  });

  it('CSS variables match the TS tokens', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/tokens.css'), 'utf8').toLowerCase();
    for (const [key, hex] of Object.entries(colors)) {
      if (key === 'ink') continue;
      const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css, key).toContain(`--fd-${name}: ${hex.toLowerCase()};`);
    }
  });
});
