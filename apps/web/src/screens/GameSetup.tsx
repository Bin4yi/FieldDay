import { useState } from 'react';
import { getTemplate, withPlayers } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { modeIcon } from '../gameInfo.js';
import { go, href } from '../router.js';
import { speak } from '../speech.js';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

export function GameSetup({ id }: { id: string }) {
  const template = getTemplate(id);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const startSession = useApp((s) => s.startSession);
  const min = template?.min_players ?? template?.players ?? 1;
  const max = template?.max_players ?? template?.players ?? 1;
  const [count, setCount] = useState(() => Math.max(min, Math.min(max, settings.playerNames.length)));
  const [names, setNames] = useState<string[]>(() => settings.playerNames);

  if (!template) {
    return (
      <Screen title="Game not found">
        <p>
          That game does not exist. <a href={href({ name: 'games' })}>See all games</a>.
        </p>
      </Screen>
    );
  }

  const nameAt = (i: number) => names[i] ?? `Player ${i + 1}`;
  const start = () => {
    const players = Array.from({ length: count }, (_, i) => nameAt(i).trim() || `Player ${i + 1}`);
    setSetting('playerNames', players);
    startSession({ spec: withPlayers(template, count), players });
    go({ name: 'play' });
  };

  return (
    <Screen title={template.title}>
      <div className="setup">
        <img className="setup__icon" src={modeIcon(template)} alt="" width={120} height={120} />
        <p className="rules">{template.one_line_rules}</p>
        <BigButton tone="ghost" icon="🔊" onClick={() => speak(template.one_line_rules, { interrupt: true })}>
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

        <p className="note">
          Test mode: there is no camera yet, so you tap what happens and the phone keeps score and calls the game.
        </p>
        <BigButton tone="green" icon="▶" onClick={start}>
          Start
        </BigButton>
      </div>
    </Screen>
  );
}
