import { useEffect, useState } from 'react';
import { Art } from '../Art.js';
import { ASSETS, type BadgeKey } from '../assets.js';
import { db, type BadgeRecord, type ResultRecord } from '../db.js';
import { levelFor, outsideMinutes, outsideStreak, xpFor } from '../progress.js';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

const BADGE_HELP: Record<BadgeKey, string> = {
  touch_grass: 'Play a game outside',
  boss_slayer: 'Defeat a boss in Boss Raid',
  sky_high: 'Throw 3 m or higher',
  crew_power: 'Finish a Shared Quest with your crew',
  streak_7: 'Play outside 7 days in a row',
  offline_hero: 'Finish a full quest in airplane mode',
};

export function Me() {
  const name = useApp((s) => s.settings.playerNames[0] ?? 'Player 1');
  const outside = useApp((s) => s.settings.outside);
  const setSetting = useApp((s) => s.setSetting);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [badges, setBadges] = useState<BadgeRecord[]>([]);
  useEffect(() => {
    void db().results.toArray().then(setResults).catch(() => undefined);
    void db().badges.toArray().then(setBadges).catch(() => undefined);
  }, []);
  const now = Date.now();
  const xp = results.reduce((s, r) => s + xpFor(r, name), 0);
  const lv = levelFor(xp);
  const weekStart = now - 7 * 86400000;
  const mins = outsideMinutes(results, weekStart);
  const streak = outsideStreak(results, now);
  const withScreen = results.filter((r) => r.screenTimePct !== undefined);
  const avgScreen = withScreen.length ? withScreen.reduce((s, r) => s + (r.screenTimePct ?? 0), 0) / withScreen.length : null;
  const have = new Set(badges.map((b) => b.id));

  return (
    <Screen title={name}>
      <div className="row">
        <Art asset={ASSETS.mascot.master} size={120} decorative />
        <div className="stack" style={{ flex: 1 }}>
          <span className="sticker">Level {lv.level}</span>
          <p className="display" style={{ fontSize: '1.4rem' }}>
            {xp} XP
          </p>
          <div className="meter" role="meter" aria-label="XP to next level" aria-valuemin={0} aria-valuemax={lv.need} aria-valuenow={lv.into}>
            <div className="meter__fill" style={{ width: `${(100 * lv.into) / lv.need}%` }} />
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="stat">
          <strong>{mins}</strong>
          <span>min outside this week</span>
        </div>
        <div className="stat">
          <strong>{streak}🔥</strong>
          <span>days in a row</span>
        </div>
        <div className="stat">
          <strong>{results.length}</strong>
          <span>games played</span>
        </div>
        <div className="stat">
          <strong>{avgScreen === null ? '–' : `${Math.round(avgScreen)}%`}</strong>
          <span>avg screen time</span>
        </div>
      </div>

      <label className="choice card card--green">
        <input type="checkbox" checked={outside} onChange={(e) => setSetting('outside', e.target.checked)} />
        <span>
          <strong>I’m outside</strong>
          <small>Counts your games for the Outside Score. (A bright daylight camera counts too.)</small>
        </span>
      </label>

      <h2>Badges</h2>
      <div className="badge-grid">
        {(Object.keys(ASSETS.badges) as BadgeKey[]).map((b) => (
          <div key={b} className={`badge ${have.has(b) ? '' : 'is-locked'}`}>
            <Art asset={ASSETS.badges[b]} size={88} />
            <span>{have.has(b) ? '✓ ' : '🔒 '}{BADGE_HELP[b]}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}
