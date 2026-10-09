import { useEffect, useState } from 'react';
import { db, type ResultRecord } from '../db.js';
import { href } from '../router.js';
import { Screen } from './Layout.js';

export function History() {
  const [rows, setRows] = useState<ResultRecord[] | null>(null);
  useEffect(() => {
    db()
      .results.orderBy('finishedAt')
      .reverse()
      .limit(50)
      .toArray()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  return (
    <Screen title="Results">
      {rows === null ? <p>Loading…</p> : null}
      {rows?.length === 0 ? (
        <p className="note">
          No games yet. <a href={href({ name: 'games' })}>Play one!</a>
        </p>
      ) : null}
      <ul className="history">
        {rows?.map((r) => (
          <li key={r.id}>
            <a href={href({ name: 'results', id: r.id! })}>
              <strong>{r.title}</strong>
              <span>
                {r.winners.length ? `🏆 ${r.winners.map((w) => r.players[w]).join(', ')}` : 'No winner'} ·{' '}
                {new Date(r.finishedAt).toLocaleDateString()}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
