import { Art } from '../Art.js';
import { useEffect, useState } from 'react';
import { GameSpecSchema, TEMPLATES, type GameSpec } from '@fieldday/engine';
import { api } from '../net/online.js';
import { go } from '../router.js';
import { useApp } from '../store.js';
import { modeIcon } from '../gameInfo.js';
import { href } from '../router.js';
import { Screen } from './Layout.js';

export function QuickGames() {
  const setDraft = useApp((s) => s.setDraft);
  const [trending, setTrending] = useState<{ code: string; title: string; count: number; spec: GameSpec }[]>([]);
  useEffect(() => {
    if (!navigator.onLine) return;
    api<{ code: string; title: string; count: number; spec: unknown }[]>('/trending')
      .then((rows) =>
        setTrending(
          rows.flatMap((r) => {
            const v = GameSpecSchema.safeParse(r.spec);
            return v.success ? [{ ...r, spec: v.data }] : [];
          }),
        ),
      )
      .catch(() => undefined);
  }, []);
  return (
    <Screen title="Quick Games">
      {trending.length ? (
        <section className="stack">
          <span className="sticker sticker--coral">🔥 Trending now</span>
          <div className="seg">
            {trending.slice(0, 6).map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => {
                  setDraft(t.spec);
                  go({ name: 'setup', id: 'draft' });
                }}
              >
                {t.title} · {t.code} ×{t.count}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <ul className="game-list">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <a className="game-card" href={href({ name: 'setup', id: t.id! })}>
              <Art asset={modeIcon(t)} size={72} decorative />
              <span className="game-card__text">
                <strong>{t.title}</strong>
                <span>{t.one_line_rules}</span>
                <small>
                  {t.min_players ?? t.players}–{t.max_players ?? t.players} players ·{' '}
                  {t.turn_order === 'turns' ? 'take turns' : 'all at once'}
                </small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
