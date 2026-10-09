import { encodeFrame, type VisionFixture, type VisionFrame } from '@fieldday/vision';

/** Records frames (landmarks + ball boxes only, never video) as a test fixture. */
export class FixtureRecorder {
  private frames: VisionFixture['frames'] = [];
  private onsets: number[] = [];
  private t0: number | null = null;
  private size = { width: 0, height: 0 };

  push(f: VisionFrame) {
    this.t0 ??= f.t;
    this.size = { width: f.width, height: f.height };
    this.frames.push(encodeFrame({ ...f, t: f.t - this.t0 }));
  }

  pushOnset(t: number) {
    if (this.t0 !== null) this.onsets.push(Math.round(t - this.t0));
  }

  get count(): number {
    return this.frames.length;
  }

  build(extra: Partial<VisionFixture>): VisionFixture {
    return {
      version: 1,
      source: 'recorded',
      players: 1,
      ...this.size,
      ...extra,
      frames: this.frames,
      onsets: this.onsets,
    };
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
