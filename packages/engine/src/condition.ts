import { EVENT_TYPES, MEASURES, type EventType, type Measure } from './blocks.js';

// A tiny condition language, so the brain can write rules as short text
// and the engine can still check them safely (no code is ever run).
//
//   height_m >= 2            compare a measure with a number
//   before ball_release      that event has NOT happened yet this turn
//   without freeze           same as "before" (reads better at timer_end)
//   after ball_bounce        that event HAS happened this turn
//   after touch_object:far   ...with a named target ("far")
//   during call              the referee has an active call ("FREEZE!")
//   is call                  this event is the move the referee called
//   not call                 this event is NOT the move the referee called
//   no score                 this player has not scored yet this turn
//   has score                this player has scored this turn
//
// Clauses can be joined with "and".

export type Comparator = '>=' | '>' | '<=' | '<' | '==' | '!=';

export type Clause =
  | { kind: 'compare'; measure: Measure; op: Comparator; value: number }
  | { kind: 'seen'; event: EventType; target?: string; seen: boolean }
  | { kind: 'during_call' }
  | { kind: 'is_call'; is: boolean }
  | { kind: 'scored'; scored: boolean };

export type ParseResult = { ok: true; clauses: Clause[] } | { ok: false; error: string };

const COMPARATORS: Comparator[] = ['>=', '<=', '==', '!=', '>', '<'];

function isEventType(s: string): s is EventType {
  return (EVENT_TYPES as readonly string[]).includes(s);
}

function isMeasure(s: string): s is Measure {
  return (MEASURES as readonly string[]).includes(s);
}

function parseClause(raw: string): Clause | string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text === 'during call') return { kind: 'during_call' };
  if (text === 'is call') return { kind: 'is_call', is: true };
  if (text === 'not call') return { kind: 'is_call', is: false };
  if (text === 'no score') return { kind: 'scored', scored: false };
  if (text === 'has score') return { kind: 'scored', scored: true };

  const word = /^(before|without|after) ([a-z_]+)(?::([a-z0-9_]+))?$/.exec(text);
  if (word) {
    const [, rel, ev, target] = word as unknown as [string, string, string, string | undefined];
    if (!isEventType(ev)) return `unknown event "${ev}"`;
    return { kind: 'seen', event: ev, seen: rel === 'after', ...(target ? { target } : {}) };
  }

  for (const op of COMPARATORS) {
    const i = text.indexOf(op);
    if (i <= 0) continue;
    const left = text.slice(0, i).trim();
    const right = text.slice(i + op.length).trim();
    if (!isMeasure(left)) return `unknown measure "${left}"`;
    const value = Number(right);
    if (right === '' || !Number.isFinite(value)) return `"${right}" is not a number`;
    return { kind: 'compare', measure: left, op, value };
  }

  return `cannot read condition "${text}"`;
}

export function parseCondition(text: string): ParseResult {
  const parts = text.split(/\band\b/);
  const clauses: Clause[] = [];
  for (const part of parts) {
    const c = parseClause(part);
    if (typeof c === 'string') return { ok: false, error: c };
    clauses.push(c);
  }
  return { ok: true, clauses };
}

export interface ConditionContext {
  measures: Partial<Record<Measure, number>>;
  eventType: EventType;
  /** Has this event (optionally with this target) already happened in the current turn, for this player? */
  seen(event: EventType, target?: string): boolean;
  /** The move the referee is calling right now, if any. */
  call: EventType | null;
  /** Has this player scored in the current turn? */
  scored: boolean;
}

function compare(a: number, op: Comparator, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '<':
      return a < b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}

export function evalClauses(clauses: Clause[], ctx: ConditionContext): boolean {
  return clauses.every((c) => {
    switch (c.kind) {
      case 'compare': {
        const v = ctx.measures[c.measure];
        return v !== undefined && compare(v, c.op, c.value);
      }
      case 'seen':
        return ctx.seen(c.event, c.target) === c.seen;
      case 'during_call':
        return ctx.call !== null;
      case 'is_call':
        return (ctx.call === ctx.eventType) === c.is;
      case 'scored':
        return ctx.scored === c.scored;
    }
  });
}

/** Parse and evaluate. Unparseable conditions are false (specs are validated before play). */
export function evalCondition(text: string | undefined, ctx: ConditionContext): boolean {
  if (!text) return true;
  const parsed = parseCondition(text);
  return parsed.ok && evalClauses(parsed.clauses, ctx);
}

/** Check a measure-only goal (used by quests), e.g. "height_m >= 2". */
export function evalGoal(text: string, measures: Partial<Record<Measure, number>>): boolean {
  const parsed = parseCondition(text);
  if (!parsed.ok) return false;
  return parsed.clauses.every((c) => {
    if (c.kind !== 'compare') return false;
    const v = measures[c.measure];
    return v !== undefined && compare(v, c.op, c.value);
  });
}
