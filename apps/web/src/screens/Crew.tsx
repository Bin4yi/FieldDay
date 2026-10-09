import { useEffect, useState } from 'react';
import { getTemplate, MEASURES, type Measure } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { api, crewCode, online, setCrewCode, useOnline } from '../net/online.js';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

export interface CrewView {
  code: string;
  name: string;
  members: { id: string; name: string }[];
  leaderboard: { specId: string; entries: { player: string; name: string; best: number }[] }[];
  shared: { id: string; title: string; measure: string; target: number; total: number }[];
}

export function Crew() {
  const name = useApp((s) => s.settings.playerNames[0] ?? 'Player 1');
  const me = useOnline((s) => s.me);
  const live = useOnline((s) => s.shared);
  const [crew, setCrew] = useState<CrewView | null>(null);
  const [code, setCode] = useState(crewCode() ?? '');
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [goal, setGoal] = useState({ title: 'Throw 100 metres this week', measure: 'height_m' as Measure, target: 100 });

  const load = async (c: string) => {
    try {
      const v = await api<CrewView>(`/crews/${c}`);
      setCrew(v);
      setCrewCode(v.code);
      online.connect(name);
      for (const q of v.shared) online.watchShared(q.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load the crew.');
    }
  };
  useEffect(() => {
    const c = crewCode();
    if (c) void load(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!crew) {
    return (
      <Screen title="Crew">
        <Art asset={ASSETS.badges.crew_power} size={140} />
        <p className="note">A crew is your group of friends: a leaderboard, stats and shared goals. Needs internet.</p>
        {msg ? <p className="card card--coral">{msg}</p> : null}
        <fieldset className="field">
          <legend>Start a crew</legend>
          <input value={newName} maxLength={30} placeholder="Crew name" aria-label="Crew name" onChange={(e) => setNewName(e.target.value)} />
          <BigButton
            tone="green"
            disabled={!newName.trim()}
            onClick={() =>
              void api<CrewView>('/crews', { name: newName.trim(), playerId: me, playerName: name })
                .then((v) => load(v.code))
                .catch((e: Error) => setMsg(e.message))
            }
          >
            Create crew
          </BigButton>
        </fieldset>
        <fieldset className="field">
          <legend>Join a crew</legend>
          <input value={code} maxLength={6} placeholder="Crew code" aria-label="Crew code" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <BigButton
            tone="yellow"
            disabled={code.length !== 6}
            onClick={() =>
              void api<CrewView>(`/crews/${code}/join`, { playerId: me, playerName: name })
                .then((v) => load(v.code))
                .catch((e: Error) => setMsg(e.message))
            }
          >
            Join
          </BigButton>
        </fieldset>
      </Screen>
    );
  }

  return (
    <Screen title={crew.name}>
      <div className="card card--yellow stack">
        <span className="sticker sticker--white">Crew code</span>
        <p className="display" style={{ fontSize: '2.4rem', letterSpacing: '0.12em' }}>
          {crew.code}
        </p>
        <p className="note">{crew.members.map((m) => m.name).join(' · ')}</p>
      </div>

      <h2>Shared goals</h2>
      {crew.shared.map((q) => {
        const now = live[q.id] ?? q;
        const pct = Math.min(100, (100 * now.total) / now.target);
        return (
          <div key={q.id} className="card stack">
            <h3>{q.title}</h3>
            <div className="meter" role="progressbar" aria-valuenow={Math.round(now.total)} aria-valuemin={0} aria-valuemax={now.target}>
              <div className="meter__fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="note">
              {Math.round(now.total * 10) / 10} / {now.target} {q.measure.replace('_', ' ')} {pct >= 100 ? '— done! 💪' : ''}
            </p>
          </div>
        );
      })}
      <fieldset className="field">
        <legend>New shared goal</legend>
        <input value={goal.title} maxLength={60} aria-label="Goal title" onChange={(e) => setGoal({ ...goal, title: e.target.value })} />
        <div className="grid2">
          <select aria-label="Measure" value={goal.measure} onChange={(e) => setGoal({ ...goal, measure: e.target.value as Measure })}>
            {MEASURES.filter((m) => m !== 'reaction_ms' && m !== 'duration_s').map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input type="number" min={1} aria-label="Target" value={goal.target} onChange={(e) => setGoal({ ...goal, target: Number(e.target.value) })} />
        </div>
        <BigButton
          tone="green"
          onClick={() =>
            void api('/shared', { ...goal, scope: 'crew', owner: crew.code, days: 7 })
              .then(() => load(crew.code))
              .catch((e: Error) => setMsg(e.message))
          }
        >
          Add goal
        </BigButton>
      </fieldset>

      <h2>Leaderboard</h2>
      {crew.leaderboard.length === 0 ? <p className="note">Play a game while online and it shows up here.</p> : null}
      {crew.leaderboard.map((b) => (
        <div key={b.specId} className="card stack">
          <h3>{getTemplate(b.specId)?.title ?? b.specId}</h3>
          <ol className="plain-list" style={{ gap: 4 }}>
            {b.entries.map((e, i) => (
              <li key={e.player}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {e.name} — {Math.round(e.best * 100) / 100}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {msg ? <p className="note">{msg}</p> : null}
      <BigButton tone="ghost" onClick={() => (setCrewCode(null), setCrew(null))}>
        Leave crew (on this phone)
      </BigButton>
    </Screen>
  );
}
