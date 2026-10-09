import type { EventType, Measure } from '@fieldday/engine';

// Flags impossible results. A flagged result still plays out, but it does not
// count for leaderboards until the player does it again and it looks real.

export interface CheatEvent {
  event: EventType;
  measures?: Partial<Record<Measure, number>>;
  t: number;
}

export const LIMITS = {
  throwHeightM: 12,
  jumpHeightM: 1.5,
  distanceM: 80,
  speedMps: 40,
  minReactionMs: 80,
  /** Max repeats of one body move in any 10 seconds (50 squats in 10 s is impossible). */
  movesPer10s: 25,
};

const COUNTED: EventType[] = ['squat', 'jump', 'punch', 'ball_catch', 'ball_apex'];

/** Returns a reason if this event looks impossible, given the player's recent events. */
export function cheatReason(history: CheatEvent[], e: CheatEvent): string | null {
  const m = e.measures ?? {};
  if (e.event === 'ball_apex' && (m.height_m ?? 0) > LIMITS.throwHeightM) return `throw of ${m.height_m} m is too high`;
  if (e.event === 'jump' && (m.height_m ?? 0) > LIMITS.jumpHeightM) return `jump of ${m.height_m} m is too high`;
  if ((m.distance_m ?? 0) > LIMITS.distanceM) return `${m.distance_m} m is too far for the camera`;
  if ((m.speed_mps ?? 0) > LIMITS.speedMps) return `${m.speed_mps} m/s is too fast`;
  if (m.reaction_ms !== undefined && m.reaction_ms < LIMITS.minReactionMs && m.reaction_ms >= 0) return `reaction of ${m.reaction_ms} ms is faster than humanly possible`;
  if (COUNTED.includes(e.event)) {
    const recent = history.filter((h) => h.event === e.event && e.t - h.t < 10_000 && e.t >= h.t).length + 1;
    if (recent > LIMITS.movesPer10s) return `${recent} ${e.event}s in 10 seconds`;
  }
  return null;
}
