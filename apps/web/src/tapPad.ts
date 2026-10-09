import { parseCondition, type EventType, type GameSpec, type Measure } from '@fieldday/engine';

// Until the camera is wired up (Phase 2), the Play screen shows a button for
// every event the game cares about. Tapping one sends it to the engine.

export interface PadButton {
  key: string;
  event: EventType;
  target?: string;
  /** A value the player types in (e.g. throw height), when the score uses it. */
  measure?: Measure;
}

/** Measures the engine works out from the clock by itself. */
const DERIVED: Measure[] = ['duration_s', 'reaction_ms', 'count'];
const CLOCK_EVENTS: EventType[] = ['timer_end', 'round_start', 'round_end'];

export const DEFAULT_MEASURE: Partial<Record<Measure, number>> = {
  height_m: 2,
  distance_m: 15,
  speed_mps: 5,
  streak: 1,
};

export function padButtons(spec: GameSpec): PadButton[] {
  const out = new Map<string, PadButton>();
  const add = (event: EventType, target?: string, measure?: Measure) => {
    if (CLOCK_EVENTS.includes(event)) return;
    const key = target ? `${event}:${target}` : event;
    const prev = out.get(key);
    const m = measure && !DERIVED.includes(measure) ? measure : prev?.measure;
    out.set(key, { key, event, ...(target ? { target } : {}), ...(m ? { measure: m } : {}) });
  };
  const fromCondition = (text?: string) => {
    if (!text) return;
    const r = parseCondition(text);
    if (r.ok) for (const c of r.clauses) if (c.kind === 'seen') add(c.event, c.target);
  };
  for (const r of spec.scoring) {
    add(r.event, r.target, r.points === 'measure' ? r.measure : undefined);
    fromCondition(r.condition);
  }
  for (const f of spec.fouls) {
    add(f.event, f.target);
    fromCondition(f.condition);
  }
  for (const m of spec.turn_end ?? []) add(m.event, m.target);
  return [...out.values()];
}
