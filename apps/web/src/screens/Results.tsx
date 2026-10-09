import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { useEffect, useState } from 'react';
import { BigButton, PlayerTag } from '@fieldday/ui';
import { db, type ResultRecord } from '../db.js';
import { go } from '../router.js';
import { Screen } from './Layout.js';

export function Results({ id }: { id: number }) {
  const [r, setR] = useState<ResultRecord | null | undefined>(undefined);
  useEffect(() => {
    db()
      .results.get(id)
      .then((x) => setR(x ?? null))
      .catch(() => setR(null));
  }, [id]);

  if (r === undefined) return <Screen title="Results">Loading…</Screen>;
  if (r === null) return <Screen title="Results">That result was not found.</Screen>;

  const won = r.winners.length > 0;
  const order = r.players.map((_, i) => i);
  return (
    <Screen title={r.title}>
      <div className="results">
        <Art className="results__mascot" asset={won ? ASSETS.mascot.cheer : ASSETS.mascot.miss} size={220} />
        <h2 className="results__headline">
          {won ? `${r.winners.map((w) => r.players[w]).join(' & ')} ${r.winners.length > 1 ? 'win' : 'wins'}!` : 'No winner this time'}
        </h2>
        <ol className="scoreboard">
          {order.map((i) => (
            <li key={i} className={r.winners.includes(i) ? 'is-winner' : ''}>
              <PlayerTag index={i} name={r.players[i] ?? `Player ${i + 1}`} />
              <span className="scoreboard__score">
                {r.totals[i] === null || r.totals[i] === undefined ? '–' : `${round(r.totals[i]!)} ${r.unit}`}
              </span>
            </li>
          ))}
        </ol>
        <BigButton tone="green" icon="↻" onClick={() => go({ name: 'setup', id: r.specId })}>
          Play again
        </BigButton>
        <BigButton tone="ghost" onClick={() => go({ name: 'home' })}>
          Home
        </BigButton>
      </div>
    </Screen>
  );
}

function round(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
