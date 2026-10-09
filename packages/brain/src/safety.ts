import type { GameSpec } from '@fieldday/engine';
import type { QuestSpec } from '@fieldday/quests';
import type { SafetyResult } from './types.js';
import { normalise } from './rules.js';

// Rule-based safety check. Runs before every game and quest, in every mode
// (it is fast, offline and predictable). Kind refusals with a safe version.

interface Rule {
  re: RegExp;
  reason: string;
  safer: (text: string) => string;
}

const RULES: Rule[] = [
  {
    re: /\b(throw|toss|kick|chuck|hit|shoot|fire|aim)\w*\b[^.]{0,30}\b(at|into|towards?)\b[^.]{0,15}\b(people|person|someone|somebody|each other|player|friend|kid|child|brother|sister|head|face|him|her|them|me|dog|cat|bird|animal|car|window)s?\b/,
    reason: 'We never throw or kick things at people, animals, cars or windows.',
    safer: (t) => t.replace(/\b(at|into|towards?)\b[^.]{0,15}\b(people|person|someone|somebody|each other|player|friend|kid|child|brother|sister|head|face|him|her|them|me|dog|cat|bird|animal|car|window)s?\b/, 'into a bag goal'),
  },
  {
    re: /\b(road|street|traffic|highway|car park|parking lot|railway|train track|driveway)s?\b/,
    reason: 'Games near roads or traffic are not safe. Let us play on grass or open ground.',
    safer: (t) => t.replace(/\b(near|on|across|in) (the )?(road|street|traffic|highway|car park|parking lot|railway|train track|driveway)s?\b/g, 'on the grass'),
  },
  {
    re: /\b(swim\w*|pool|river|lake|sea|ocean|pond|canal|beach waves?|in the water|into the water|near the water|underwater|dive|diving)\b/,
    reason: 'We keep games away from water. Let us play on dry, open ground.',
    safer: (t) => t.replace(/\b(in|into|near|by|across) (the )?(pool|river|lake|sea|ocean|pond|canal|water)\b/g, 'on the grass'),
  },
  {
    re: /\b(climb\w*|roof|rooftop|cliff|ledge|balcony|wall top|jump(ing)? off (the|a|an|from|of|that|this) |from a height|up a tree|tree top|ladder|bridge)\b/,
    reason: 'No climbing or jumping from high places. Both feet start on flat ground.',
    safer: (t) =>
      t
        .replace(/\b(climb\w*|up a tree|tree top|ladder|roof|rooftop|cliff|ledge|balcony|bridge)\b/g, 'run to a tree')
        .replace(/\bjump(ing)? off (the|a|an|from|of|that|this) \w+/g, 'jump on the spot'),
  },
  {
    re: /\b(campfire|bonfire|flames?|lighter|matches|fireworks?|bbq coals?|petrol|gasoline|on fire|set fire|light a fire|near (the )?fire)\b/,
    reason: 'No fire or fireworks in FieldDay games.',
    safer: (t) => t.replace(/\b(fire|flames?|lighter|matches|fireworks?|bbq coals?|petrol|gasoline)\b/g, 'ball'),
  },
  {
    re: /\b(knife|knives|sword|axe|stick fight|bat at|glass|bottle smash|brick|rocks? at|stones? at|darts?)\b/,
    reason: 'No sharp, heavy or dangerous objects. A soft ball or a bag works great.',
    safer: (t) => t.replace(/\b(knife|knives|sword|axe|stick|glass|brick|rocks?|stones?|darts?)\b/g, 'soft ball'),
  },
  {
    re: /\b(tackle|wrestle|wrestling match|push(ing)? (each other|people|someone)|trip(ping)? (each other|people|someone)|punch(ing)? (each other|someone|people|him|her)|fight(ing)? (each other|someone)|choke|headlock|pile on|dogpile)\b/,
    reason: 'No contact between players. Every player gets their own space.',
    safer: (t) =>
      t.replace(/\b(tackle|wrestle|push(ing)?|trip(ping)?|punch(ing)?|fight(ing)?)( each other| people| someone| him| her)?\b/g, 'race'),
  },
  {
    re: /\b(blindfold\w*|eyes closed|spin(ning)? (until|till) dizzy|dizzy|hold (your|their) breath|until (you|they) (faint|pass out|drop|puke))\b/,
    reason: 'Players must always see where they are going and feel okay.',
    safer: (t) => t.replace(/\b(blindfold\w*|eyes closed|spin(ning)? (until|till) dizzy|dizzy)\b/g, 'eyes open'),
  },
  {
    re: /\b(alcohol|beer|drinking game|chug)\b/,
    reason: 'No drinking games. Water breaks are great though!',
    safer: (t) => t.replace(/\b(alcohol|beer|drinking game|chug)\b/g, 'squat'),
  },
  {
    re: /\b(strangers?|follow (someone|people)|chase (people|strangers|kids|someone)|photo of (people|strangers|someone|a person)|their (house|home|address))\b/,
    reason: 'Quests never involve strangers, people’s photos or homes.',
    safer: (t) => t.replace(/\b(strangers?|people|someone|a person)\b/g, 'a tree'),
  },
];

/** Check free text (a request, a remix, a quest step). */
export function checkText(text: string): SafetyResult {
  const t = normalise(text);
  for (const rule of RULES) {
    if (rule.re.test(t)) {
      const safer = rule.safer(t);
      return { safe: false, reason: rule.reason, ...(safer !== t ? { saferPrompt: safer } : {}) };
    }
  }
  return { safe: true };
}

/** Check a finished spec: its words, and a few rule limits. */
export function checkSpec(spec: GameSpec | QuestSpec): SafetyResult {
  if ('steps' in spec) {
    const words = [spec.title, ...spec.steps.map((s) => ('instruction' in s ? `${s.instruction} ${s.photo_task ?? ''}` : ''))];
    for (const w of words) {
      const r = checkText(w);
      if (!r.safe) return r;
    }
    for (const step of spec.steps) {
      if ((step.type === 'game' || step.type === 'boss') && step.spec) {
        const r = checkSpec(step.spec);
        if (!r.safe) return r;
      }
    }
    return { safe: true };
  }
  for (const w of [spec.title, spec.one_line_rules, ...(spec.hype_lines ?? [])]) {
    const r = checkText(w);
    if (!r.safe) return r;
  }
  if (spec.timer_s !== undefined && spec.timer_s > 300 && spec.trackers.includes('person')) {
    return { safe: false, reason: 'Rounds longer than 5 minutes are too long without a rest.', saferPrompt: spec.title };
  }
  return { safe: true };
}

// ---------- friendly-only referee lines ----------

const UNFRIENDLY =
  /\b(fat|fatty|ugly|stupid|dumb|idiot|loser|weak(ling)?|slow ?poke|useless|pathetic|retard\w*|cripple|lame|gay|girly|like a girl|old man|grandma|shorty|midget|skinny|chubby|noob|trash|garbage|suck|sucks|hate|kill|die|dead|shut up)\b/;

/** True if a line is friendly enough to say out loud. */
export function friendlyLine(line: string): boolean {
  return !UNFRIENDLY.test(line.toLowerCase());
}
