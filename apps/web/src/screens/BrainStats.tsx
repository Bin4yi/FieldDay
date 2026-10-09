import { useEffect, useState } from 'react';
import { summarizeLogs, type StatRow } from '@fieldday/brain';
import { BigButton } from '@fieldday/ui';
import { db, type BrainLogRecord } from '../db.js';
import { downloadJson } from '../vision/recorder.js';
import { Screen } from './Layout.js';

export function BrainStats() {
  const [logs, setLogs] = useState<BrainLogRecord[] | null>(null);
  const load = () =>
    db()
      .brainLogs.orderBy('startedAt')
      .reverse()
      .limit(2000)
      .toArray()
      .then(setLogs)
      .catch(() => setLogs([]));
  useEffect(() => {
    void load();
  }, []);
  const rows: StatRow[] = logs ? summarizeLogs(logs) : [];
  const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
  const p = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Screen title="Brain Stats">
      <p className="note">Every brain call on this phone: how fast, how often it worked, and how often it needed a fallback.</p>
      {rows.length === 0 ? <p className="card">No brain calls yet. Say a game first!</p> : null}
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Brain</th>
                <th>Call</th>
                <th>N</th>
                <th>OK</th>
                <th>Fixed</th>
                <th>Fallback</th>
                <th>p50</th>
                <th>p90</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.brain}${r.op}`}>
                  <td>{r.brain === 'gemma' ? 'Gemma (Open)' : 'OpenAI (Boost)'}</td>
                  <td>{r.op}</td>
                  <td>{r.calls}</td>
                  <td>{p(r.okRate)}</td>
                  <td>{p(r.repairedRate)}</td>
                  <td>{p(r.fallbackRate)}</td>
                  <td>{ms(r.p50)}</td>
                  <td>{ms(r.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <BigButton tone="ghost" icon="⬇" disabled={!logs?.length} onClick={() => downloadJson(`brain-stats-${Date.now()}.json`, { summary: rows, logs })}>
        Export for the write-up
      </BigButton>
      <BigButton
        tone="ghost"
        onClick={() =>
          void db()
            .brainLogs.clear()
            .then(load)
        }
      >
        Clear stats
      </BigButton>
    </Screen>
  );
}
