import { useState } from 'react';
import { LANDING } from '../edition.js';
import { href } from '../router.js';
import { OfflineBadge } from './OfflineBadge.js';

const TILES = [
  { to: href({ name: 'games' }), icon: 'img/icons/mode_turn_battle.webp', label: 'Quick Games', ready: true },
  { to: '#', icon: 'img/icons/mode_quest.webp', label: 'Quests', ready: false },
  { to: '#', icon: 'img/icons/mode_duel.webp', label: 'Battle Room', ready: false },
  { to: href({ name: 'history' }), icon: 'img/icons/mode_tournament.webp', label: 'Results', ready: true },
];

export function Home() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="screen home">
      <section className="hero">
        <img className="hero__img" src="img/screens/hero_banner.webp" alt="" />
        <div className="hero__text">
          <h1 className="logo">FieldDay</h1>
          <p className="hero__tagline">{LANDING.tagline}</p>
          <p className="hero__sub">{LANDING.sub}</p>
          <OfflineBadge />
        </div>
      </section>

      <main className="screen__body">
        <button
          type="button"
          className="mic-button"
          onClick={() => setNote('Voice games arrive in the next build. Pick a Quick Game for now!')}
          aria-describedby="mic-note"
        >
          <span className="mic-button__icon" aria-hidden="true">
            🎤
          </span>
          Say a game
        </button>
        <p id="mic-note" className="note" role="status">
          {note ?? 'Example: “highest throw battle, 3 rounds, 2 players”'}
        </p>

        <nav className="tiles" aria-label="Main menu">
          {TILES.map((t) =>
            t.ready ? (
              <a key={t.label} className="tile" href={t.to}>
                <img src={t.icon} alt="" width={96} height={96} />
                <span>{t.label}</span>
              </a>
            ) : (
              <span key={t.label} className="tile tile--soon" aria-disabled="true">
                <img src={t.icon} alt="" width={96} height={96} />
                <span>{t.label}</span>
                <small>Coming soon</small>
              </span>
            ),
          )}
        </nav>

        <a className="link-row" href={href({ name: 'settings' })}>
          ⚙ Settings
        </a>
      </main>
    </div>
  );
}
