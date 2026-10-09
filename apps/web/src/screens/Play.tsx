import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createGame, type GameEngine, type RefereeMoment } from '@fieldday/engine';
import { BigButton, BigNumber, PlayerTag } from '@fieldday/ui';
import { db, saveResult } from '../db.js';
import { describeMoment, eventWord, formatValue, scoreMeasure, scoreUnit } from '../gameInfo.js';
import { go, href } from '../router.js';
import { speak, stopSpeaking } from '../speech.js';
import { useApp } from '../store.js';
import { DEFAULT_MEASURE, padButtons } from '../tapPad.js';

const COUNTDOWN = 3;

export function Play() {
  const session = useApp((s) => s.session);
  const voice = useApp((s) => s.settings.voice);
  const engineRef = useRef<GameEngine | null>(null);
  const t0 = useRef(performance.now());
  const startedAt = useRef(Date.now());
  const saved = useRef(false);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN);
  const [line, setLine] = useState('Get ready!');
  const [picked, setPicked] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});

  if (session && !engineRef.current) {
    engineRef.current = createGame(session.spec, {
      players: session.players.map((name) => ({ name })),
      seed: Date.now() & 0xffff,
    });
  }
  const game = engineRef.current;
  const now = () => performance.now() - t0.current;

  const handle = useCallback(
    (moments: RefereeMoment[]) => {
      if (!session || !game) return;
      const lines = moments.map((m) => describeMoment(m, session.players, session.spec)).filter((x): x is string => !!x);
      if (lines.length) {
        setLine(lines.at(-1)!);
        if (voice) speak(lines.join(' '));
      }
      const over = moments.find((m) => m.kind === 'game_over');
      if (over && !saved.current) {
        saved.current = true;
        const r = game.result();
        void saveResult(db(), {
          specId: session.spec.id ?? 'custom',
          code: session.spec.id ?? 'custom',
          title: session.spec.title,
          players: session.players,
          totals: r.totals,
          winners: r.winners,
          unit: scoreUnit(session.spec),
          startedAt: startedAt.current,
          finishedAt: Date.now(),
        })
          .then((id) => setTimeout(() => go({ name: 'results', id }), 2500))
          .catch(() => setLine('Game over! (Could not save the result on this phone.)'));
      }
      if (game.state.phase === 'between_turns') setCountdown(COUNTDOWN);
      rerender();
    },
    [game, session, voice],
  );

  // Countdown before the game and between turns.
  useEffect(() => {
    if (countdown === null || !game) return;
    if (countdown === 0) {
      setCountdown(null);
      handle(game.state.phase === 'ready' ? game.start(now()) : game.beginTurn(now()));
      return;
    }
    if (voice) speak(String(countdown), { interrupt: countdown === COUNTDOWN && game.state.phase === 'ready' });
    const id = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, game, handle, voice]);

  // The clock: timers and referee calls.
  useEffect(() => {
    if (!game) return;
    const id = setInterval(() => {
      if (game.state.phase !== 'playing') return;
      const m = game.tick(now());
      if (m.length) handle(m);
      else rerender();
    }, 100);
    return () => clearInterval(id);
  }, [game, handle]);

  useEffect(() => () => stopSpeaking(), []);

  if (!session || !game) {
    return (
      <div className="screen">
        <main className="screen__body">
          <p>
            No game running. <a href={href({ name: 'games' })}>Pick a game</a>.
          </p>
        </main>
      </div>
    );
  }

  const { spec, players } = session;
  const s = game.state;
  const turnMode = game.isTurnMode;
  const active = turnMode ? (s.turnPlayer ?? 0) : picked;
  const measure = scoreMeasure(spec);
  const unit = scoreUnit(spec);
  const timer = spec.timer_s;
  const left = s.phase === 'playing' && timer ? Math.max(0, Math.ceil(timer - (now() - s.turnStartT) / 1000)) : null;
  const buttons = padButtons(spec);
  const playing = s.phase === 'playing';

  const tap = (b: (typeof buttons)[number]) => {
    const v = b.measure ? (values[b.key] ?? DEFAULT_MEASURE[b.measure] ?? 1) : undefined;
    handle(
      game.dispatch({
        type: b.event,
        t: now(),
        ...(turnMode ? {} : { player: picked }),
        ...(b.target ? { target: b.target } : {}),
        ...(b.measure && v !== undefined ? { measures: { [b.measure]: v } } : {}),
      }),
    );
  };

  return (
    <div className="screen play">
      <header className="play__bar">
        <a className="topbar__back" href={href({ name: 'home' })} aria-label="Quit game">
          ✕
        </a>
        <span className="play__title">{spec.title}</span>
        <span className="play__round">
          Round {Math.min(s.round + 1, spec.rounds)}/{spec.rounds}
        </span>
      </header>

      {countdown !== null ? (
        <div className="countdown" role="timer" aria-live="assertive">
          {countdown}
        </div>
      ) : null}

      {s.activeCall ? (
        <div className="call-banner" role="alert">
          {eventWord(s.activeCall.event).toUpperCase()}!
        </div>
      ) : null}

      <main className="screen__body play__body">
        {spec.boss && s.bossHp !== null ? (
          <div className="boss">
            <Art asset={ASSETS.bosses.thunderRock} size={140} />
            <div className="hp" role="meter" aria-label={`${spec.boss.name} health`} aria-valuemin={0} aria-valuemax={spec.boss.hp} aria-valuenow={s.bossHp}>
              <div className="hp__fill" style={{ width: `${(100 * s.bossHp) / spec.boss.hp}%` }} />
              <span>
                {spec.boss.name}: {s.bossHp} HP
              </span>
            </div>
          </div>
        ) : null}

        <div className="play__now">
          {turnMode || players.length === 1 ? <PlayerTag index={active} name={players[active] ?? ''} /> : null}
          <BigNumber
            value={formatValue(turnMode ? (s.players[active]?.rounds[s.round] ?? null) : game.total(active), measure)}
            label={turnMode ? 'This turn' : 'Score'}
            unit={unit}
          />
          {left !== null ? <span className="play__timer">⏱ {left}s</span> : null}
        </div>

        <p className="ref-line" aria-live="polite">
          {line}
        </p>

        <ol className="scoreboard scoreboard--compact">
          {players.map((name, i) => (
            <li key={i} className={`${i === active ? 'is-active' : ''} ${s.players[i]?.out ? 'is-out' : ''}`}>
              {turnMode ? (
                <PlayerTag index={i} name={name} />
              ) : (
                <button type="button" className="pick" aria-pressed={i === picked} onClick={() => setPicked(i)}>
                  <PlayerTag index={i} name={name} />
                </button>
              )}
              <span className="scoreboard__score">
                {formatValue(game.total(i), measure)} {unit}
                {s.players[i]?.lives !== null ? ` · ${'♥'.repeat(s.players[i]?.lives ?? 0)}` : ''}
              </span>
            </li>
          ))}
        </ol>

        <section className="pad" aria-label="Tap what happened">
          <h2 className="pad__title">Tap what happened{turnMode ? '' : ` (for ${players[picked]})`}</h2>
          <div className="pad__grid">
            {buttons.map((b) => (
              <div key={b.key} className="pad__item">
                <BigButton tone="yellow" disabled={!playing} onClick={() => tap(b)}>
                  {eventWord(b.event)}
                  {b.target ? `: ${b.target}` : ''}
                </BigButton>
                {b.measure ? (
                  <label className="pad__measure">
                    <span>{b.measure.replace('_', ' ')}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={values[b.key] ?? DEFAULT_MEASURE[b.measure] ?? 1}
                      onChange={(e) => setValues({ ...values, [b.key]: Number(e.target.value) })}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="play__actions">
          <BigButton tone="ghost" disabled={!playing} onClick={() => handle(game.forceEndTurn(now()))}>
            {turnMode ? 'Next player' : 'End round'}
          </BigButton>
        </div>
      </main>
    </div>
  );
}
