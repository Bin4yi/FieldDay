import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createGame, type GameEngine, type RefereeMoment } from '@fieldday/engine';
import { BigButton, BigNumber, PlayerTag } from '@fieldday/ui';
import { aheadOfGhost, chaosFor } from '@fieldday/engine';
import { goalMeasuresFor } from '../questGoals.js';
import { ClipRecorder } from '../clips.js';
import { finishGame } from '../finish.js';
import { eventWord, formatValue, scoreMeasure, scoreUnit } from '../gameInfo.js';
import { ScreenTimeMeter } from '../screenTime.js';
import { watchShake } from '../vision/camera.js';
import { extraLine, refereeText, sayMeasure } from '@fieldday/brain';
import { go, href } from '../router.js';
import { setLiveVoice, speak, stopSpeaking } from '../speech.js';
import { RealtimeReferee } from '../brain/realtime.js';
import { boostAvailable, log as logBrain } from '../brain/service.js';
import { useApp } from '../store.js';
import { useVision } from '../vision/useVision.js';
import { online, useOnline } from '../net/online.js';
import type { GameEvent } from '@fieldday/engine';
import type { MascotKey } from '../assets.js';
import { DEFAULT_MEASURE, padButtons } from '../tapPad.js';

const COUNTDOWN = 3;

export function Play() {
  const session = useApp((s) => s.session);
  const voice = useApp((s) => s.settings.voice);
  const kids = useApp((s) => s.settings.kidsMode);
  const styleSetting = useApp((s) => s.settings.refereeStyle);
  const style = styleSetting === 'auto' ? (session?.spec.referee_style ?? 'football_announcer') : styleSetting;
  const lastHydrate = useRef(Date.now());
  const engineRef = useRef<GameEngine | null>(null);
  const t0 = useRef(performance.now());
  const startedAt = useRef(Date.now());
  const saved = useRef(false);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  // Online: count down to the shared start time, so every phone starts together.
  const [countdown, setCountdown] = useState<number | null>(() =>
    session?.online ? Math.max(1, Math.min(30, Math.ceil((session.online.startAt - online.serverNow()) / 1000))) : COUNTDOWN,
  );
  const live = useOnline((st) => (session?.online ? st : null));
  const [line, setLine] = useState('Get ready!');
  const [picked, setPicked] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});
  const [volt, setVolt] = useState<MascotKey>('whistle');
  const [hit, setHit] = useState(0);
  const meter = useRef(new ScreenTimeMeter());
  const clip = useRef<ClipRecorder | null>(null);
  const bestThrow = useRef(0);
  const brightSamples = useRef<number[]>([]);
  const chaosRound = useRef(-1);

  if (session && !engineRef.current) {
    engineRef.current = createGame(session.spec, {
      players: session.players.map((name) => ({ name })),
      seed: Date.now() & 0xffff,
    });
  }
  const game = engineRef.current;
  const now = () => performance.now() - t0.current;
  /** Send an event to the engine (and to the server in a live battle). */
  const send = (e: GameEvent) => {
    if (!game) return [];
    const wasPlaying = game.state.phase === 'playing';
    const m = game.dispatch(e);
    if (session?.online && wasPlaying) online.sendEvent(e);
    return m;
  };

  const handle = useCallback(
    (moments: RefereeMoment[]) => {
      if (!session || !game) return;
      const lines = moments
        .map((m) => refereeText(m, style, { names: session.players, spec: session.spec, kids }))
        .filter((x): x is string => !!x);
      if (moments.some((m) => m.kind === 'game_start')) lines.push('Check there is free space around you.');
      const ghost = session.ghost;
      if (ghost) {
        const gm = session.spec.scoring.find((r) => r.points === 'measure')?.measure ?? null;
        for (const m of moments) {
          if (m.kind === 'turn_start' && m.player !== null) {
            const gv = ghost.rounds[m.round];
            if (gv !== null && gv !== undefined) lines.push(extraLine('ghost_behind', style, { name: session.players[m.player] ?? '', value: sayMeasure(gv, gm) }, kids).replace('The ghost', `${ghost.name}’s ghost`));
          }
          if (m.kind === 'score') {
            const gv = ghost.rounds[game.state.round] ?? null;
            const ahead = aheadOfGhost(session.spec, m.roundScore, gv);
            if (ahead === true) lines.push(extraLine('ghost_ahead', style, { value: sayMeasure(m.roundScore, gm) }, kids));
          }
        }
      }
      if (lines.length) {
        setLine(lines.at(-1)!);
        if (voice) speak(lines.join(' '));
      }
      const pose = voltFor(moments, session.spec.mode === 'boss_raid');
      if (pose) setVolt(pose);
      if (moments.some((m) => m.kind === 'boss_hit')) setHit((h) => h + 1);
      for (const m of moments) {
        if (m.kind === 'score') {
          if (m.measure === 'height_m' && m.value !== undefined && m.event === 'ball_apex') bestThrow.current = Math.max(bestThrow.current, m.value);
          clip.current?.mark(m.value ?? m.points);
        }
        if (m.kind === 'new_best' || m.kind === 'boss_defeated') clip.current?.mark(1e6);
      }
      const over = moments.find((m) => m.kind === 'game_over');
      if (over && !saved.current) {
        saved.current = true;
        const t = now();
        meter.current.stop(t);
        const bright = brightSamples.current;
        const avgBright = bright.length ? bright.reduce((a, b) => a + b, 0) / bright.length : 0;
        const outside = useApp.getState().settings.outside || avgBright > 110;
        void (async () => {
          const blob = (await clip.current?.finish()) ?? null;
          const id = await finishGame({
            session,
            game,
            startedAt: startedAt.current,
            durationMs: meter.current.duration(t),
            screenFraction: meter.current.fraction(t),
            outside,
            clip: blob,
            bestThrowM: bestThrow.current,
          });
          if (session.format.kind === 'quest') {
            useApp.getState().setQuestReport({
              step: session.format.step,
              measures: goalMeasuresFor(game, useApp.getState().questRun),
              won: game.result().winners.length > 0,
              resultId: id,
            });
            setTimeout(() => go({ name: 'quest' }), 2000);
          } else setTimeout(() => go({ name: 'results', id }), 2000);
        })().catch(() => setLine('Game over! (Could not save the result on this phone.)'));
      }
      if (game.state.phase === 'between_turns') setCountdown(COUNTDOWN);
      rerender();
    },
    [game, session, voice, style, kids],
  );

  // Countdown before the game and between turns.
  useEffect(() => {
    if (countdown === null || !game) return;
    if (countdown === 0) {
      setCountdown(null);
      const fmt = session?.format;
      // Chaos Mode: a new rule at the start of every round.
      if (fmt?.kind === 'chaos' && game.state.round !== chaosRound.current) {
        chaosRound.current = game.state.round;
        const { spec: next, mutation } = chaosFor(fmt.base, game.state.round, fmt.seed);
        handle(game.setSpec(next, now(), mutation.text));
      }
      if (game.state.phase === 'ready') {
        meter.current.begin(now());
        handle(game.start(now()));
      } else handle(game.beginTurn(now()));
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
      // Heat & hydration: every 15 minutes of play, a water break.
      if (Date.now() - lastHydrate.current > 15 * 60 * 1000 && game.state.phase !== 'finished') {
        lastHydrate.current = Date.now();
        const text = extraLine('hydrate', style, {}, kids);
        setLine(text);
        setVolt('hydrate');
        if (voice) speak(text);
      }
      if (game.state.phase !== 'playing') return;
      const m = game.tick(now());
      if (m.length) handle(m);
      else rerender();
    }, 100);
    return () => clearInterval(id);
  }, [game, handle, style, kids, voice]);

  useEffect(() => () => stopSpeaking(), []);

  // Boost Mode: live OpenAI Realtime voice; falls back to the phone voice
  // automatically if the network goes.
  useEffect(() => {
    if (useApp.getState().settings.brainMode === 'open') return;
    let ref: RealtimeReferee | null = null;
    let cancelled = false;
    void (async () => {
      if (!(await boostAvailable())) return;
      const started = Date.now();
      try {
        ref = await RealtimeReferee.connect(style, kids);
        if (cancelled) return ref.close();
        setLiveVoice((t) => ref?.say(t) ?? false);
        logBrain({ brain: 'openai', op: 'refereeLine', startedAt: started, latencyMs: Date.now() - started, ok: true });
        ref.onLost(() => {
          setLiveVoice(null);
          const text = 'Signal lost. The phone voice takes over!';
          setLine(text);
          if (voice) speak(text);
          logBrain({ brain: 'gemma', op: 'refereeLine', startedAt: Date.now(), latencyMs: 0, ok: true, fallback: 'other_brain' });
        });
      } catch (e) {
        logBrain({ brain: 'openai', op: 'refereeLine', startedAt: started, latencyMs: Date.now() - started, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    const offline = () => setLiveVoice(null);
    window.addEventListener('offline', offline);
    return () => {
      cancelled = true;
      window.removeEventListener('offline', offline);
      setLiveVoice(null);
      ref?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live battle result from the server.
  const liveWinners = live?.winners ?? null;
  useEffect(() => {
    if (!liveWinners || !live) return;
    const names = liveWinners.map((w) => live.scores.find((x) => x.player === w)?.name ?? '?');
    const text = names.length ? `Live battle over! ${names.join(' and ')} wins!` : 'Live battle over!';
    setLine(text);
    if (voice) speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWinners]);

  // Screen-Time Meter: touches and picking the phone up.
  useEffect(() => {
    const onTouch = () => meter.current.touch(now());
    window.addEventListener('pointerdown', onTouch);
    const stop = watchShake((v) => meter.current.motion(now(), v));
    return () => {
      window.removeEventListener('pointerdown', onTouch);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vision = useVision({
    mode: session?.camera ?? 'off',
    spec: session?.spec ?? null,
    clock: now,
    batterySaver: useApp.getState().settings.batterySaver,
    calibrations: session?.calibrations ?? [],
    histograms: session?.histograms ?? [],
    zones: session?.zones ?? [],
    lineY: session?.lineY ?? null,
    mic: true,
    activePlayer: () => (game && game.isTurnMode ? game.state.turnPlayer : null),
    onFrame: (_f, st) => {
      if (st.brightness !== null && brightSamples.current.length < 2000) brightSamples.current.push(st.brightness);
    },
    onEvents: (events) => {
      if (!game || game.state.phase !== 'playing') return;
      const moments = events.flatMap((e) => send(e));
      if (moments.length) handle(moments);
    },
  });

  // Highlight clips once the camera runs.
  useEffect(() => {
    if (vision.status !== 'running' || clip.current || !ClipRecorder.supported()) return;
    const c = new ClipRecorder(
      () => vision.videoRef.current,
      () => vision.canvasRef.current,
    );
    c.start();
    clip.current = c;
    return undefined;
  }, [vision.status, vision.videoRef, vision.canvasRef]);
  useEffect(
    () => () => {
      void clip.current?.finish();
    },
    [],
  );

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
      send({
        type: b.event,
        t: now(),
        ...(turnMode ? {} : { player: picked }),
        ...(b.target ? { target: b.target } : {}),
        ...(b.measure && v !== undefined ? { measures: { [b.measure]: v } } : {}),
      }),
    );
  };

  const lowTime = left !== null && left <= 3;
  clip.current?.setLabel(`${spec.title} · ${players.map((p, i) => `${p} ${formatValue(game.total(i), measure)}`).join('  ')}`);
  const pad = (
    <section className="pad" aria-label="Tap what happened">
      <h2>Tap what happened{turnMode ? '' : ` (for ${players[picked]})`}</h2>
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
  );

  return (
    <div className={`screen play ${spec.mode === 'boss_raid' ? 'screen--arena' : ''}`}>
      <header className="play__bar">
        <a className="topbar__back" href={href({ name: 'home' })} aria-label="Quit game">
          ✕
        </a>
        <span className="play__title">{spec.title}</span>
        <span className="play__round">
          R{Math.min(s.round + 1, spec.rounds)}/{spec.rounds}
        </span>
      </header>

      {countdown !== null ? (
        <div className="countdown" role="timer" aria-live="assertive">
          <div>
            {countdown}
            <small>{turnMode && s.turnPlayer !== null ? `${players[s.turnPlayer]} get ready` : 'Get ready'}</small>
          </div>
        </div>
      ) : null}

      {s.activeCall ? (
        <div className="call-banner" role="alert">
          {eventWord(s.activeCall.event).toUpperCase()}!
        </div>
      ) : null}

      <main className="screen__body play__body">
        {session.camera !== 'off' ? (
          <div className="camera">
            <video ref={vision.videoRef} playsInline muted aria-hidden="true" />
            <canvas ref={vision.canvasRef} aria-hidden="true" />
            <div className="camera__hud">
              <span className="camera__fps">
                {vision.status === 'running' ? `${Math.round(vision.stats.fps)} FPS` : vision.status.toUpperCase()}
              </span>
              {session.camera === 'demo' ? <span className="sticker sticker--white">Demo camera</span> : null}
            </div>
          </div>
        ) : null}
        {vision.error ? (
          <p className="card card--coral" role="alert">
            Camera problem: {vision.error}. Use the tap buttons below.
          </p>
        ) : null}

        {spec.boss && s.bossHp !== null ? (
          <div className="boss">
            <Art
              key={hit}
              className={`boss__img ${s.bossHp === 0 ? 'is-down' : hit ? 'is-hit' : ''}`}
              asset={bossAsset(spec.boss.name)}
              size={130}
            />
            <div
              className="hp"
              role="meter"
              aria-label={`${spec.boss.name} health`}
              aria-valuemin={0}
              aria-valuemax={spec.boss.hp}
              aria-valuenow={s.bossHp}
            >
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
          {left !== null ? <span className={`play__timer ${lowTime ? 'is-low' : ''}`}>⏱ {left}s</span> : null}
        </div>

        <div className="ref">
          <Art key={volt + line} className="ref__volt is-pop" asset={ASSETS.mascot[volt]} size={84} decorative />
          <p className="ref-line" aria-live="polite">
            {line}
          </p>
        </div>

        {live && session.online ? (
          <div className="card card--navy stack" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="sticker sticker--coral">● LIVE {session.online.code}</span>
              {live.bossHp !== null ? <span className="display">Boss: {live.bossHp} HP</span> : null}
            </div>
            <ol className="plain-list" style={{ gap: 4 }}>
              {live.scores.map((x) => (
                <li key={x.player} className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>
                    {x.player === live.me ? '▶ ' : ''}
                    {x.name}
                    {x.flagged ? ' ⚠' : ''}
                  </strong>
                  <span className="display">
                    {x.total === null ? '–' : formatValue(x.total, measure)} {x.done ? '✓' : ''}
                  </span>
                </li>
              ))}
            </ol>
            {live.winners ? (
              <p className="display" role="status">
                🏆 {live.winners.map((w) => live.scores.find((x) => x.player === w)?.name ?? '?').join(' & ') || 'No winner'}
              </p>
            ) : null}
          </div>
        ) : null}

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
          {session.ghost ? (
            <li>
              <span className="fd-player" style={{ ['--fd-player' as string]: '#ffffff' }}>
                <span className="fd-player__shape" aria-hidden="true">
                  👻
                </span>
                {session.ghost.name}’s ghost
              </span>
              <span className="scoreboard__score">
                {formatValue(session.ghost.total, measure)} {unit}
              </span>
            </li>
          ) : null}
        </ol>

        {session.camera === 'off' ? (
          pad
        ) : (
          <details className="card card--navy">
            <summary className="display">Manual taps (if the camera misses)</summary>
            {pad}
          </details>
        )}

        <div className="play__actions">
          <BigButton tone="ghost" disabled={!playing} onClick={() => handle(game.forceEndTurn(now()))}>
            {turnMode ? 'Next player' : 'End round'}
          </BigButton>
        </div>
      </main>
    </div>
  );
}

function bossAsset(name: string) {
  if (/mega|ball/i.test(name)) return ASSETS.bosses.megaBall;
  if (/storm|cloud/i.test(name)) return ASSETS.bosses.stormCloud;
  return ASSETS.bosses.thunderRock;
}

/** Which Volt pose fits what just happened. */
export function voltFor(moments: RefereeMoment[], boss: boolean): MascotKey | null {
  let pose: MascotKey | null = null;
  for (const m of moments) {
    if (m.kind === 'turn_start' || m.kind === 'game_start' || m.kind === 'call') pose = boss ? 'bossFight' : 'whistle';
    if (m.kind === 'score' || m.kind === 'boss_hit') pose = boss ? 'bossFight' : 'jump';
    if (m.kind === 'new_best' || m.kind === 'boss_defeated' || m.kind === 'lead_change') pose = 'cheer';
    if (m.kind === 'foul' || m.kind === 'life_lost' || m.kind === 'out') pose = 'miss';
    if (m.kind === 'game_over') pose = m.winners.length ? 'cheer' : 'miss';
  }
  return pose;
}
