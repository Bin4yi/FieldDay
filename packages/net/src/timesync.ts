// Clock sync: phones agree on "server time" so countdowns start together
// in Colombo and Kandy.

export interface SyncSample {
  clientSent: number;
  serverT: number;
  clientGot: number;
}

/** Offset to add to the local clock to get server time (uses the fastest round trips). */
export function clockOffset(samples: SyncSample[]): number {
  if (!samples.length) return 0;
  const best = [...samples].sort((a, b) => a.clientGot - a.clientSent - (b.clientGot - b.clientSent)).slice(0, 3);
  const offs = best.map((s) => s.serverT - (s.clientSent + (s.clientGot - s.clientSent) / 2));
  return offs.reduce((a, b) => a + b, 0) / offs.length;
}
