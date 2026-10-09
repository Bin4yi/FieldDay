import type { GameSpec } from '@fieldday/engine';
import type { DesignOutcome, QuestOutcome } from './design.js';
import type { SmartBrain } from './gemma.js';
import type { BrainCallLog, BrainId, BrainMode, DesignContext, PhotoCheck, QuestContext } from './types.js';

// Picks the brain for each call and falls back to Gemma (always offline)
// when OpenAI is off, offline, slow or failing. Every call is logged for the
// Brain Stats screen.

export interface RouterOptions {
  mode: () => BrainMode;
  online: () => boolean;
  gemma: SmartBrain;
  openai?: SmartBrain | null;
  log?: (entry: BrainCallLog) => void;
  /** Give up on OpenAI after this long and use Gemma. */
  timeoutMs?: number;
  now?: () => number;
}

type Op = BrainCallLog['op'];

export class BrainRouter {
  constructor(private o: RouterOptions) {}

  /** Brains to try, in order. */
  order(): SmartBrain[] {
    const mode = this.o.mode();
    const openai = this.o.openai && this.o.online() ? this.o.openai : null;
    if (mode === 'open' || !openai) return [this.o.gemma];
    return [openai, this.o.gemma];
  }

  current(): BrainId {
    return this.order()[0]!.id;
  }

  private async run<T>(op: Op, call: (b: SmartBrain) => Promise<T>, meta: (r: T) => Partial<BrainCallLog> = () => ({})): Promise<T & { brain: BrainId }> {
    const now = this.o.now ?? (() => Date.now());
    const brains = this.order();
    let lastErr: unknown = null;
    for (let i = 0; i < brains.length; i++) {
      const b = brains[i]!;
      const start = now();
      try {
        const r = await withTimeout(call(b), b.id === 'openai' ? (this.o.timeoutMs ?? 15000) : 120000);
        this.o.log?.({ brain: b.id, op, startedAt: start, latencyMs: now() - start, ok: true, fallback: i > 0 ? 'other_brain' : null, ...meta(r) });
        return { ...(r as object), brain: b.id } as T & { brain: BrainId };
      } catch (e) {
        lastErr = e;
        this.o.log?.({ brain: b.id, op, startedAt: start, latencyMs: now() - start, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('all brains failed');
  }

  design(request: string, ctx: DesignContext) {
    return this.run<DesignOutcome>('designGame', (b) => b.design(request, ctx), (r) =>
      r.kind === 'game' ? { repaired: r.source === 'repaired', ...(r.source === 'template' || r.source === 'rules' ? { fallback: 'template' as const } : {}) } : {},
    );
  }

  remix(spec: GameSpec, change: string) {
    return this.run<DesignOutcome>('remixGame', (b) => b.remix(spec, change));
  }

  quest(request: string, ctx: QuestContext) {
    return this.run<QuestOutcome>('designQuest', (b) => b.quest(request, ctx), (r) =>
      r.kind === 'quest' && (r.source === 'template' || r.source === 'rules') ? { fallback: 'template' as const } : {},
    );
  }

  async checkPhoto(image: Blob, task: string): Promise<PhotoCheck & { brain: BrainId }> {
    return this.run<PhotoCheck>('checkPhoto', async (b) => {
      if (!b.checkPhoto) throw new Error('no photo check');
      return b.checkPhoto(image, task);
    });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e)),
    );
  });
}
