import { champion, hillCrown, hillMatch, nextMatch } from '@fieldday/engine';
import { BigButton, PlayerTag } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { seriesSession } from '../battle.js';
import { go, href } from '../router.js';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

export function BracketScreen() {
  const series = useApp((s) => s.series);
  const startSession = useApp((s) => s.startSession);
  if (!series) {
    return (
      <Screen title="Battles">
        <p>
          No series running. <a href={href({ name: 'games' })}>Pick a game</a> and choose King of the Hill or Tournament.
        </p>
      </Screen>
    );
  }
  const next = seriesSession(series);
  const playNext = () => {
    if (!next) return;
    startSession(next);
    go(series.camera === 'off' ? { name: 'play' } : { name: 'check' });
  };

  if (series.kind === 'koth') {
    const h = series.hill;
    const m = hillMatch(h);
    const crown = h.done ? hillCrown(h) : null;
    return (
      <Screen title="King of the Hill">
        <div className="row">
          <Art asset={ASSETS.modes.king_of_the_hill} size={96} decorative />
          <div className="stack" style={{ flex: 1 }}>
            <span className="sticker">Match {Math.min(h.matches + 1, h.maxMatches)} of {h.maxMatches}</span>
            <h2>👑 {h.players[h.king]}</h2>
            <p className="note">is on the hill</p>
          </div>
        </div>
        {crown !== null ? (
          <div className="card card--yellow stack" role="status">
            <Art asset={ASSETS.mascot.cheer} size={160} />
            <h2>The crown goes to {h.players[crown]}!</h2>
            <p>Longest streak: {h.best[crown]} wins in a row.</p>
          </div>
        ) : null}
        <ol className="scoreboard">
          {h.players.map((p, i) => (
            <li key={i} className={i === h.king ? 'is-active' : ''}>
              <PlayerTag index={i} name={p} />
              <span className="scoreboard__score">
                🔥 {h.streaks[i]} · best {h.best[i]}
              </span>
            </li>
          ))}
        </ol>
        {m ? (
          <BigButton tone="green" icon="▶" onClick={playNext}>
            {h.players[m[0]]} vs {h.players[m[1]]}
          </BigButton>
        ) : null}
      </Screen>
    );
  }

  const b = series.bracket;
  const champ = champion(b);
  const nm = nextMatch(b);
  const roundName = (r: number) => (r === b.rounds - 1 ? 'Final' : r === b.rounds - 2 ? 'Semi-finals' : `Round ${r + 1}`);
  return (
    <Screen title="Tournament">
      {champ !== null ? (
        <div className="card card--yellow stack" role="status">
          <Art asset={ASSETS.mascot.cheer} size={160} />
          <h2>🏆 Champion: {b.players[champ]}!</h2>
        </div>
      ) : null}
      {Array.from({ length: b.rounds }, (_, r) => (
        <section key={r} className="stack">
          <span className="sticker sticker--white">{roundName(r)}</span>
          {b.matches
            .filter((m) => m.round === r)
            .map((m) => (
              <div key={m.id} className={`card ${m.id === nm?.id ? 'card--yellow' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="display">{m.a === null ? '—' : `${m.winner === m.a ? '✓ ' : ''}${b.players[m.a]}`}</span>
                  <span>vs</span>
                  <span className="display">{m.b === null ? (r === 0 ? 'bye' : '—') : `${m.winner === m.b ? '✓ ' : ''}${b.players[m.b]}`}</span>
                </div>
              </div>
            ))}
        </section>
      ))}
      {next && nm ? (
        <BigButton tone="green" icon="▶" onClick={playNext}>
          Play: {b.players[nm.a!]} vs {b.players[nm.b!]}
        </BigButton>
      ) : null}
    </Screen>
  );
}
