import { EVENT_TYPES, MEASURES, PENALTIES, REFEREE_STYLES, TRACKERS, getTemplate, type GameSpec } from '@fieldday/engine';
import type { DesignContext, QuestContext } from './types.js';

// Short prompts for a small on-device model. The model only fills JSON from
// fixed building blocks; it never writes code.

function compact(spec: GameSpec): string {
  const { id: _id, min_players: _a, max_players: _b, mode: _m, ...rest } = spec;
  return JSON.stringify(rest);
}

const BLOCKS = `Allowed values:
trackers: ${TRACKERS.join(',')}
events: ${EVENT_TYPES.join(',')}
measures: ${MEASURES.join(',')}
turn_order: turns|simultaneous
win_condition: highest|lowest|first_to|last_standing|team_total|co_op
penalty: ${PENALTIES.join(',')}
referee_style: ${REFEREE_STYLES.join(',')}
Rules: one_line_rules max 20 words. points is a number or "measure" (then set measure).
condition examples: "height_m >= 2", "before ball_release", "after ball_bounce", "is call", "no score".
simultaneous needs timer_s. first_to needs target_score. last_standing needs lives. team_total needs teams. co_op needs boss.
Games must be safe: no throwing at people or animals, no roads, water, climbing or fire.`;

export function designPrompt(request: string, ctx: DesignContext): string {
  const ex1 = getTemplate('sky_toss')!;
  const ex2 = getTemplate('squat_storm')!;
  return `You design outdoor games for a phone referee. Reply with ONE JSON object only.
${BLOCKS}
Example request: "highest throw, 3 rounds, 2 players"
${compact(ex1)}
Example request: "most squats in 30 seconds"
${compact(ex2)}
Request: "${request.replace(/"/g, "'")}"
Players: ${ctx.players}.${ctx.kidsMode ? ' Kids are playing: gentle rules, calm_coach style.' : ''} Referee style: ${ctx.refereeStyle}.${ctx.objects?.length ? ` Objects in view: ${ctx.objects.join(', ')}.` : ''}
JSON:`;
}

export function repairPrompt(badJson: string, errors: string[]): string {
  return `This game JSON has errors:
${errors.slice(0, 8).map((e) => `- ${e}`).join('\n')}
${BLOCKS}
Fix the errors. Reply with the corrected JSON object only.
${badJson.slice(0, 2500)}
JSON:`;
}

export function remixPrompt(spec: GameSpec, change: string): string {
  return `Change this outdoor game as asked. Keep everything else. Reply with ONE JSON object only.
${BLOCKS}
Game: ${compact(spec)}
Change: "${change.replace(/"/g, "'")}"
JSON:`;
}

export function questPrompt(request: string, ctx: QuestContext): string {
  return `You design outdoor park quests. Reply with ONE JSON object only.
Step types:
{"type":"game","spec_ref":"<game id>","goal":"<measure> >= <number>"}
{"type":"move","instruction":"<short safe instruction>","check":"confirm"}
{"type":"find","instruction":"<short>","check":"photo","photo_task":"<one of: a bench, a bottle, a ball, a backpack, a bird, something red, something blue, something yellow, something green, a leaf, grass>"}
{"type":"boss","spec_ref":"boss_raid_basic"}
Game ids: sky_toss, bounce_catch, keepy_uppy, target_toss, long_throw, jump_battle, freeze_statue, reaction_race, squat_storm, mirror_me, sprint_tap.
Goals use measures: height_m, distance_m, count, duration_s, reaction_ms.
Quests work in any park. Never use addresses, strangers, roads, water or climbing.
Example: {"title":"Park Gauntlet","steps":[{"type":"game","spec_ref":"sky_toss","goal":"height_m >= 2"},{"type":"find","instruction":"Find something red","check":"photo","photo_task":"something red"},{"type":"boss","spec_ref":"boss_raid_basic"}],"reward":{"badge":"Gauntlet Runner","xp":300}}
Request: "${request.replace(/"/g, "'")}" Players: ${ctx.players}.${ctx.minutes ? ` About ${ctx.minutes} minutes.` : ''}${ctx.kidsMode ? ' For kids: easy goals.' : ''}
JSON:`;
}

export function hypePrompt(spec: GameSpec, style: string): string {
  return `Write 3 short, friendly hype lines (max 10 words each) for an outdoor game called "${spec.title}" in a ${style.replace('_', ' ')} voice. No insults. One per line, no numbering.`;
}
