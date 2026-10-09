import { Art } from '../Art.js';
import { TEMPLATES } from '@fieldday/engine';
import { modeIcon } from '../gameInfo.js';
import { href } from '../router.js';
import { Screen } from './Layout.js';

export function QuickGames() {
  return (
    <Screen title="Quick Games">
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
