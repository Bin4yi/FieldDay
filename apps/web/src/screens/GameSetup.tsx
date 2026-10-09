import { useState } from 'react';
import { getTemplate, withPlayers, type GameSpec } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { introMascot } from '../gameInfo.js';
import { go, href } from '../router.js';
import { speak } from '../speech.js';
import { newSession, useApp } from '../store.js';
import { Screen } from './Layout.js';

export function GameSetup({ id }: { id: string }) {
  const draft = useApp((s) => s.draft);
  const spec: GameSpec | undefined = id === 'draft' ? (draft ?? undefined) : getTemplate(id);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const startSession = useApp((s) => s.startSession);
  const min = spec?.min_players ?? spec?.players ?? 1;
  const max = spec?.max_players ?? spec?.players ?? 1;
  const [count, setCount] = useState(() =>
    Math.max(min, Math.min(max, spec?.players ?? settings.playerNames.length)),
  );
  const [names, setNames] = useState<string[]>(() => settings.playerNames);

  if (!spec) {
    return (
      <Screen title="Game not found">
        <p>
          That game does not exist. <a href={href({ name: 'games' })}>See all games</a>.
        </p>
      </Screen>
    );
  }

  const nameAt = (i: number) => names[i] ?? `Player ${i + 1}`;
  const begin = (camera: 'camera' | 'demo' | 'off') => {
    const players = Array.from({ length: count }, (_, i) => nameAt(i).trim() || `Player ${i + 1}`);
    setSetting('playerNames', players);
    startSession(newSession(withPlayers(spec, count), players, camera));
    go(camera === 'off' ? { name: 'play' } : { name: 'check' });
  };

  return (
    <Screen title={spec.title}>
      <div className="setup">
        <Art className="setup__icon" asset={introMascot(spec)} size={180} decorative />
        <p className="rules">{spec.one_line_rules}</p>
        <BigButton tone="ghost" icon="🔊" onClick={() => speak(spec.one_line_rules, { interrupt: true })}>
          Hear the rules
        </BigButton>

        {max > 1 ? (
          <fieldset className="field">
            <legend>Players</legend>
            <div className="stepper">
              <button type="button" aria-label="Fewer players" disabled={count <= min} onClick={() => setCount(count - 1)}>
                −
              </button>
              <output aria-live="polite">{count}</output>
              <button type="button" aria-label="More players" disabled={count >= max} onClick={() => setCount(count + 1)}>
                +
              </button>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="field">
          <legend>Names</legend>
          {Array.from({ length: count }, (_, i) => (
            <label key={i} className="name-input">
              <span className="sr-only">Player {i + 1} name</span>
              <input
                value={nameAt(i)}
                maxLength={24}
                onChange={(e) => {
                  const next = [...names];
                  next[i] = e.target.value;
                  setNames(next);
                }}
              />
            </label>
          ))}
        </fieldset>

        <BigButton tone="green" icon="📷" onClick={() => begin('camera')}>
          Camera referee
        </BigButton>
        <div className="grid2">
          <BigButton tone="ghost" icon="👆" onClick={() => begin('off')}>
            Tap mode
          </BigButton>
          <BigButton tone="ghost" icon="🤖" onClick={() => begin('demo')}>
            Demo camera
          </BigButton>
        </div>
        <p className="note">
          Camera referee: put the phone down 3–4 m away so your whole body fits. Tap mode: no camera, you tap what
          happens. Demo camera: a pretend player, to try things out.
        </p>
      </div>
    </Screen>
  );
}
