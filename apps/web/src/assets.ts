// The one place that knows where images live. Every image has a fallback
// (emoji + text) so the app never shows a broken image, even if a file is missing.

export interface Asset {
  src: string;
  /** Meaningful alt text. Use the `decorative` prop on <Art> for purely decorative use. */
  alt: string;
  /** Emoji shown if the image fails to load. */
  fallback: string;
}

const a = (path: string, alt: string, fallback: string): Asset => ({ src: `assets/${path}.webp`, alt, fallback });

export const ASSETS = {
  mascot: {
    master: a('mascot/volt_master', 'Volt, the FieldDay referee', '⚡'),
    whistle: a('mascot/volt_whistle', 'Volt blowing the whistle', '📣'),
    cheer: a('mascot/volt_cheer', 'Volt cheering', '🎉'),
    throw: a('mascot/volt_throw', 'Volt throwing a ball', '🏐'),
    jump: a('mascot/volt_jump', 'Volt jumping', '🦘'),
    think: a('mascot/volt_think', 'Volt thinking', '🤔'),
    miss: a('mascot/volt_miss', 'Volt groaning at a miss', '😩'),
    bossFight: a('mascot/volt_boss_fight', 'Volt ready to fight', '🥊'),
    hydrate: a('mascot/volt_hydrate', 'Volt drinking water', '💧'),
  },
  icon: { app: a('icon/app_icon', 'FieldDay', '⚡') },
  screens: {
    splash: a('screens/splash_portrait', 'Volt sprinting across a park', '🌳'),
    hero: a('screens/hero_banner', 'Friends playing ball in a park with Volt refereeing', '🌳'),
  },
  bosses: {
    thunderRock: a('bosses/boss_thunder_rock', 'Thunder Rock, a grumpy boulder boss', '🪨'),
    stormCloud: a('bosses/boss_storm_cloud', 'Storm Cloud, a lightning cloud boss', '🌩️'),
    megaBall: a('bosses/boss_mega_ball', 'Mega Ball, a giant ball boss', '🔴'),
  },
  modes: {
    solo: a('icons/mode_solo', 'Solo', '🏃'),
    turn_battle: a('icons/mode_turn_battle', 'Turn Battle', '🔁'),
    duel: a('icons/mode_duel', 'Side-by-Side Duel', '⚔️'),
    team: a('icons/mode_team', 'Team Battle', '👥'),
    boss_raid: a('icons/mode_boss_raid', 'Boss Raid', '👹'),
    rule_draft: a('icons/mode_rule_draft', 'Rule Draft', '📜'),
    chaos: a('icons/mode_chaos', 'Chaos Mode', '🌀'),
    king_of_the_hill: a('icons/mode_king_hill', 'King of the Hill', '👑'),
    tournament: a('icons/mode_tournament', 'Tournament', '🏆'),
    quest: a('icons/mode_quest', 'Quests', '🗺️'),
    shared_quest: a('icons/mode_shared_quest', 'Shared Quests', '🤝'),
    ghost: a('icons/mode_ghost', 'Ghost Challenge', '👻'),
  },
  badges: {
    touch_grass: a('badges/badge_touch_grass', 'Touch Grass badge', '🌱'),
    boss_slayer: a('badges/badge_boss_slayer', 'Boss Slayer badge', '🗡️'),
    sky_high: a('badges/badge_sky_high', 'Sky High badge', '☁️'),
    crew_power: a('badges/badge_crew_power', 'Crew Power badge', '💪'),
    streak_7: a('badges/badge_streak_7', '7-day streak badge', '🔥'),
    offline_hero: a('badges/badge_offline_hero', 'Offline Hero badge', '📴'),
  },
  backgrounds: {
    park: a('backgrounds/bg_park_day', '', '🌳'),
    arena: a('backgrounds/bg_battle_arena', '', '🏟️'),
  },
} as const;

export type ModeKey = keyof typeof ASSETS.modes;
export type BadgeKey = keyof typeof ASSETS.badges;
export type MascotKey = keyof typeof ASSETS.mascot;
export type BossKey = keyof typeof ASSETS.bosses;

/** Flat list of every asset (used by tests). */
export function allAssets(): Asset[] {
  return Object.values(ASSETS).flatMap((group) => Object.values(group) as Asset[]);
}
