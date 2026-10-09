import { useEffect, useState } from 'react';
import { TEMPLATES, gameCode, getTemplate, withPlayers, type GameSpec } from '@fieldday/engine';
import { dailyQuest } from '@fieldday/quests';
import { useStartQuest } from './Quests.js';
import { BigButton, PlayerTag } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { online, serverUrl, useOnline } from '../net/online.js';
import { go, href } from '../router.js';
import { ShareSheet } from '../ShareSheet.js';
import { newSession, useApp } from '../store.js';
import type { CameraMode } from '../vision/useVision.js';
import { Screen } from './Layout.js';

export function BattleRoom({ code }: { code?: string }) {
  const name = useApp((s) => s.settings.playerNames[0] ?? 'Player 1');
  const draft = useApp((s) => s.draft);
  const startSession = useApp((s) => s.startSession);
  const st = useOnline();
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [pick, setPick] = useState<string>(draft ? 'draft' : 'sky_toss');
  const [camera, setCamera] = useState<CameraMode>('camera');
  const startQuest = useStartQuest();

  useEffect(() => {
    online.connect(name);
  }, [name]);
  useEffect(() => {
    if (code && st.status === 'online' && st.room?.code !== code) online.joinRoom(code);
  }, [code, st.status, st.room?.code]);

  const room = st.room;
  const host = room?.host === st.me;
  const me = room?.players.find((p) => p.id === st.me);
  const specFor = (id: string): GameSpec => withPlayers(id === 'draft' && draft ? draft : getTemplate(id)!, 1);

  // The match has started: go play.
  useEffect(() => {
    if (!room?.spec || st.startAt === null || me?.role !== 'player' || st.winners) return;
    const spec = withPlayers({ ...room.spec, min_players: 1 }, room.spec.win_condition === 'co_op' ? 1 : 1);
    startSession({ ...newSession(spec, [name], camera), online: { code: room.code, startAt: st.startAt } });
    go(camera === 'off' ? { name: 'play' } : { name: 'check' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.startAt]);

  return (
    <Screen title="Battle Room">
      <div className="row">
        <Art asset={ASSETS.modes.duel} size={90} decorative />
        <div className="stack" style={{ flex: 1 }}>
          <span className={`sticker ${st.status === 'online' ? 'sticker--green' : 'sticker--coral'}`}>
            {st.status === 'online' ? 'Online' : st.status === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
          <p className="note">Play live with friends anywhere. Each phone uses its own camera; only scores travel.</p>
        </div>
      </div>
      {st.error ? (
        <p className="card card--coral" role="alert">
          {st.error} (server: {serverUrl()})
        </p>
      ) : null}

      {!room ? (
        <>
          <fieldset className="field">
            <legend>Create a room</legend>
            <select aria-label="Game" value={pick} onChange={(e) => setPick(e.target.value)}>
              {draft ? <option value="draft">{draft.title} (your game)</option> : null}
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <BigButton tone="green" disabled={st.status !== 'online'} onClick={() => online.createRoom(specFor(pick))}>
              Create room
            </BigButton>
          </fieldset>
          <fieldset className="field">
            <legend>Join a room</legend>
            <input value={joinCode} maxLength={6} placeholder="ABC234" aria-label="Room code" onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
            <div className="grid2">
              <BigButton tone="yellow" disabled={st.status !== 'online' || joinCode.length !== 6} onClick={() => online.joinRoom(joinCode)}>
                Join
              </BigButton>
              <BigButton tone="ghost" disabled={joinCode.length !== 6} onClick={() => go({ name: 'watch', code: joinCode })}>
                Watch
              </BigButton>
            </div>
          </fieldset>
        </>
      ) : (
        <div className="stack">
          <div className="card card--yellow stack">
            <span className="sticker sticker--white">Room code</span>
            <p className="display" style={{ fontSize: '3rem', letterSpacing: '0.15em' }}>
              {room.code}
            </p>
            {room.spec ? (
              <p>
                <strong>{room.spec.title}</strong> · {gameCode(room.spec)}
              </p>
            ) : null}
          </div>
          <ol className="scoreboard">
            {room.players.map((p, i) => (
              <li key={p.id} className={p.id === st.me ? 'is-active' : ''}>
                <PlayerTag index={i} name={`${p.name}${p.id === room.host ? ' 👑' : ''}`} />
                <span className="scoreboard__score">{p.role === 'spectator' ? '👀' : p.connected ? '✓' : '…'}</span>
              </li>
            ))}
          </ol>
          {host ? (
            <>
              <select
                aria-label="Change game"
                value={room.spec?.id ?? ''}
                onChange={(e) => online.send({ type: 'set_spec', spec: specFor(e.target.value) })}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div className="seg" role="group" aria-label="Camera">
            {(['camera', 'off', 'demo'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={camera === c} onClick={() => setCamera(c)}>
                {c === 'camera' ? 'Camera referee' : c === 'off' ? 'Tap mode' : 'Demo camera'}
              </button>
            ))}
          </div>
          {room.quest ? (
            <div className="card card--green stack">
              <span className="sticker sticker--white">Quest battle</span>
              <h3>{room.quest.title}</h3>
              <BigButton tone="yellow" icon="▶" onClick={() => startQuest(room.quest!, undefined, room.code)}>
                Start the quest
              </BigButton>
            </div>
          ) : host ? (
            <BigButton tone="green" icon="▶" disabled={!room.spec} onClick={() => online.send({ type: 'start_match', countdown_s: 8 })}>
              Start for everyone
            </BigButton>
          ) : (
            <p className="note">Waiting for the host to start…</p>
          )}
          {host && !room.quest ? (
            <BigButton tone="ghost" icon="🗺" onClick={() => online.send({ type: 'set_quest', quest: dailyQuest(new Date()) })}>
              Make it a quest battle (Daily Quest)
            </BigButton>
          ) : null}
          <details className="card">
            <summary className="display">Invite (QR / link)</summary>
            <ShareSheet url={`${location.origin}/#/room/${room.code}`} title="FieldDay battle" text={`Join my FieldDay battle: ${room.code}`} />
          </details>
          <a className="fd-btn fd-btn--ghost" href={href({ name: 'watch', code: room.code })}>
            <span>Spectator view</span>
          </a>
          <BigButton tone="ghost" onClick={() => online.leaveRoom()}>
            Leave room
          </BigButton>
        </div>
      )}
    </Screen>
  );
}

export function Watch({ code }: { code: string }) {
  const name = useApp((s) => s.settings.playerNames[0] ?? 'Fan');
  const st = useOnline();
  useEffect(() => {
    online.connect(`${name} (fan)`);
  }, [name]);
  useEffect(() => {
    if (st.status === 'online' && st.room?.code !== code) online.joinRoom(code, 'spectator');
  }, [code, st.status, st.room?.code]);
  const players = st.room?.players.filter((p) => p.role === 'player') ?? [];
  const round = 0; // one vote per match
  const votes = st.votes[round] ?? {};
  const lowest = st.room?.spec?.win_condition === 'lowest';
  const sorted = [...st.scores].sort((a, b) => (a.total === null ? 1 : b.total === null ? -1 : lowest ? a.total - b.total : b.total - a.total));
  return (
    <Screen title={`Live: ${code}`}>
      <span className="sticker sticker--coral">● LIVE</span>
      <h2>{st.room?.spec?.title ?? 'Waiting for the game…'}</h2>
      {st.bossHp !== null && st.room?.spec?.boss ? (
        <div className="hp" role="meter" aria-label="Boss health" aria-valuenow={st.bossHp} aria-valuemin={0} aria-valuemax={st.room.spec.boss.hp}>
          <div className="hp__fill" style={{ width: `${(100 * st.bossHp) / st.room.spec.boss.hp}%` }} />
          <span>
            {st.room.spec.boss.name}: {st.bossHp} HP
          </span>
        </div>
      ) : null}
      <ol className="scoreboard">
        {sorted.map((s, i) => (
          <li key={s.player} className={st.winners?.includes(s.player) ? 'is-winner' : ''}>
            <PlayerTag index={i} name={`${s.name}${s.flagged ? ' ⚠' : ''}`} />
            <span className="scoreboard__score">
              {s.total === null ? '–' : Math.round(s.total * 100) / 100}
              {s.done ? ' ✓' : ''}
            </span>
          </li>
        ))}
      </ol>
      {st.winners ? (
        <p className="card card--yellow display" role="status">
          🏆 {st.winners.map((w) => st.scores.find((s) => s.player === w)?.name ?? '?').join(' & ') || 'No winner'}
        </p>
      ) : null}
      <h3>Crowd vote: who wins this match?</h3>
      <div className="seg">
        {players.map((p) => (
          <button key={p.id} type="button" onClick={() => online.send({ type: 'crowd_vote', round, player: p.id })}>
            {p.name} · {votes[p.id] ?? 0} 🙌
          </button>
        ))}
      </div>
      <ul className="plain-list" style={{ gap: 4 }}>
        {st.feed
          .slice(-8)
          .reverse()
          .map((f, i) => (
            <li key={i} className="note">
              {f.name}: {f.event.replace(/_/g, ' ')}
            </li>
          ))}
      </ul>
    </Screen>
  );
}
