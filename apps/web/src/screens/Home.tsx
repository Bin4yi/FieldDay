import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { useState } from 'react';
import { LANDING } from '../edition.js';
import { href } from '../router.js';
import { OfflineBadge } from './OfflineBadge.js';

const TILES = [
  { to: href({ name: 'games' }), icon: ASSETS.modes.turn_battle, label: 'Quick Games', ready: true },
  { to: '#', icon: ASSETS.modes.quest, label: 'Quests', ready: false },
  { to: '#', icon: ASSETS.modes.duel, label: 'Battle Room', ready: false },
  { to: href({ name: 'history' }), icon: ASSETS.modes.tournament, label: 'Results', ready: true },
];

export function Home() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="screen screen--park home">
      <section className="hero">
        <Art className="hero__img" asset={ASSETS.screens.hero} decorative />
        <div className="hero__text">
          <h1 className="logo">FieldDay</h1>
          <p className="hero__tagline">{LANDING.tagline}</p>
          <p className="hero__sub">{LANDING.sub}</p>
          <OfflineBadge />
        </div>
      </section>
      <div className="tape" aria-hidden="true">
        <span className="tape__inner">
          {'★ PUT THE PHONE DOWN ★ PLAY OUTSIDE ★ THE PHONE IS THE REFEREE '.repeat(6)}
        </span>
      </div>

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
                <Art asset={t.icon} size={96} decorative />
                <span>{t.label}</span>
              </a>
            ) : (
              <span key={t.label} className="tile tile--soon" aria-disabled="true">
                <Art asset={t.icon} size={96} decorative />
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
