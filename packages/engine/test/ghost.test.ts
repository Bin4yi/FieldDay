import { describe, expect, it } from 'vitest';
import { aheadOfGhost, createGame, decodeGhost, encodeGhost, getTemplate, ghostSpec, makeGhost, packJson, unpackJson, withPlayers } from '../src/index.js';

describe('ghosts', () => {
  const play = () => {
    const spec = withPlayers(getTemplate('sky_toss')!, 1);
    const g = createGame(spec, { autoAdvance: true });
    g.start(0);
    for (const h of [2.1, 2.4, 2.2]) {
      g.dispatch({ type: 'ball_apex', t: 1, measures: { height_m: h } });
      g.dispatch({ type: 'ball_catch', t: 2 });
    }
    return { spec, result: g.result() };
  };

  it('a template ghost fits easily in a QR code and round-trips', () => {
    const { spec, result } = play();
    const ghost = makeGhost(spec, result, 0, 'Binula', 1760000000000);
    expect(ghost.ref).toBe('sky_toss');
    const code = encodeGhost(ghost);
    expect(code.startsWith('FDG1.')).toBe(true);
    expect(code.length).toBeLessThan(200);
    const back = decodeGhost(`https://fieldday.app/#/ghost/${code}`);
    expect(back).toEqual(ghost);
    expect(ghostSpec(back)?.id).toBe('sky_toss');
    expect(back.best).toEqual({ measure: 'height_m', value: 2.4 });
  });

  it('a custom game carries its whole spec and still fits a QR code', () => {
    const { result } = play();
    const custom = { ...withPlayers(getTemplate('sky_toss')!, 1), title: 'Moon Toss', rounds: 3 };
    const code = encodeGhost(makeGhost(custom, result, 0, 'Ama', 1));
    expect(code.length).toBeLessThan(1200); // QR version ~25 at low error correction
    expect(ghostSpec(decodeGhost(code))?.title).toBe('Moon Toss');
  });

  it('rejects junk', () => {
    expect(() => decodeGhost('hello')).toThrow();
    expect(() => decodeGhost(packJson('FDG1', { v: 2 }))).toThrow();
  });

  it('compares like the game', () => {
    const sky = getTemplate('sky_toss')!;
    expect(aheadOfGhost(sky, 2.5, 2.4)).toBe(true);
    expect(aheadOfGhost(getTemplate('reaction_race')!, 300, 280)).toBe(false);
    expect(aheadOfGhost(sky, null, 2)).toBeNull();
    expect(unpackJson('X', packJson('X', { a: [1, 2] }))).toEqual({ a: [1, 2] });
  });
});
