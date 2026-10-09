import { useEffect, useState } from 'react';
import { BigButton, PlayerTag } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS, type BadgeKey } from '../assets.js';
import { db, type ResultRecord } from '../db.js';
import { go } from '../router.js';
import { useApp } from '../store.js';
import { ghostFromRecord, ghostUrl } from '../ghosts.js';
import { ShareSheet } from '../ShareSheet.js';
import { Screen } from './Layout.js';

export function Results({ id }: { id: number }) {
  const [r, setR] = useState<ResultRecord | null | undefined>(undefined);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);
  const series = useApp((s) => s.series);
  const [ghostFor, setGhostFor] = useState<number | null>(null);

  useEffect(() => {
    let url: string | null = null;
    db()
      .results.get(id)
      .then(async (x) => {
        setR(x ?? null);
        if (x?.clipId) {
          const c = await db().clips.get(x.clipId);
          if (c) {
            url = URL.createObjectURL(c.blob);
            setClipUrl(url);
            setClipBlob(c.blob);
          }
        }
      })
      .catch(() => setR(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (r === undefined) return <Screen title="Results">Loading…</Screen>;
  if (r === null) return <Screen title="Results">That result was not found.</Screen>;

  const won = r.winners.length > 0;
  const minutes = Math.max(1, Math.round((r.durationMs ?? 0) / 60000));
  const order = r.players.map((_, i) => i);
  const shareClip = async () => {
    if (!clipBlob) return;
    const file = new File([clipBlob], `fieldday-${r.specId}.${clipBlob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: clipBlob.type });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: r.title });
    else {
      const a = document.createElement('a');
      a.href = clipUrl!;
      a.download = file.name;
      a.click();
    }
  };

  return (
    <Screen title={r.title}>
      <div className="results">
        <Art className="results__mascot" asset={won ? ASSETS.mascot.cheer : ASSETS.mascot.miss} size={200} />
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

        {r.screenTimePct !== undefined ? (
          <div className="card card--green stack">
            <span className="sticker sticker--white">Screen-Time Meter</span>
            <p className="display" style={{ fontSize: '1.3rem' }}>
              You played {minutes} min. Screen time: {Math.round(r.screenTimePct)}%.
            </p>
            {r.outside ? <p className="note">🌳 Counted as outside play.</p> : null}
          </div>
        ) : null}

        {r.badges?.length ? (
          <div className="card card--yellow stack" role="status">
            <h3>New badge{r.badges.length > 1 ? 's' : ''}!</h3>
            <div className="badge-grid">
              {r.badges.map((b) => (
                <div key={b} className="badge">
                  <Art asset={ASSETS.badges[b as BadgeKey]} size={96} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {clipUrl ? (
          <div className="stack">
            <span className="sticker">Highlight</span>
            <video className="card" style={{ padding: 0, width: '100%' }} src={clipUrl} controls playsInline loop />
            <BigButton tone="yellow" icon="↗" onClick={() => void shareClip()}>
              Share clip
            </BigButton>
            <p className="note">The clip is only on this phone until you share it.</p>
          </div>
        ) : null}

        {r.ghost ? (
          <div className="card card--navy stack">
            <span className="sticker sticker--white">👻 Ghost race</span>
            <p className="display">
              {r.ghost.total === null || r.totals[0] == null
                ? 'Ghost race done.'
                : (r.spec?.win_condition === 'lowest' ? r.totals[0]! < r.ghost.total : r.totals[0]! > r.ghost.total)
                  ? `You beat ${r.ghost.name}’s ghost!`
                  : `${r.ghost.name}’s ghost wins this time.`}
            </p>
          </div>
        ) : null}

        {r.rounds && r.format !== 'quest' ? (
          <div className="card stack">
            <div className="row">
              <Art asset={ASSETS.modes.ghost} size={64} decorative />
              <h3 style={{ flex: 1 }}>Challenge a friend</h3>
            </div>
            <p className="note">Make a ghost: your scores in a QR code. Friends race it, even with no internet.</p>
            <div className="seg">
              {r.players.map((p, i) => (
                <button key={i} type="button" aria-pressed={ghostFor === i} onClick={() => setGhostFor(i)}>
                  {p}’s ghost
                </button>
              ))}
            </div>
            {ghostFor !== null
              ? (() => {
                  const g = ghostFromRecord(r, ghostFor);
                  return g ? <ShareSheet url={ghostUrl(g)} title={`${g.name}’s ghost`} text={`Beat my ghost in ${r.title}!`} /> : <p className="note">This game cannot make a ghost.</p>;
                })()
              : null}
          </div>
        ) : null}

        {series && (r.format === 'koth' || r.format === 'tournament') ? (
          <BigButton tone="green" icon="▶" onClick={() => go({ name: 'bracket' })}>
            {r.format === 'koth' ? 'King of the Hill: next' : 'Tournament: next'}
          </BigButton>
        ) : (
          <BigButton tone="green" icon="↻" onClick={() => go({ name: 'setup', id: r.specId === 'custom' ? 'draft' : r.specId })}>
            Play again
          </BigButton>
        )}
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
