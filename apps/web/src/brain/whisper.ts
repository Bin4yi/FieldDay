// Speech to text on the phone: Whisper tiny (English) through transformers.js.
// The model (~40 MB) downloads once, then works offline from the cache.

export const WHISPER_MODEL = 'Xenova/whisper-tiny.en';

type Asr = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;
let asr: Promise<Asr> | null = null;

export function loadWhisper(onProgress?: (pct: number) => void): Promise<Asr> {
  asr ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string } };
    if (onnx.wasm) onnx.wasm.wasmPaths = '/ort/';
    const p = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (e: { status?: string; progress?: number }) => {
        if (e.status === 'progress' && typeof e.progress === 'number') onProgress?.(e.progress);
      },
    });
    return p as unknown as Asr;
  })();
  asr.catch(() => (asr = null));
  return asr;
}

export async function transcribe(audio16k: Float32Array): Promise<string> {
  const p = await loadWhisper();
  const out = await p(audio16k);
  const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
  return text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
}

/** Record the mic as 16 kHz mono until stop() is called. */
export async function recordMic(): Promise<{ stop(): Promise<Float32Array>; level(): number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let lvl = 0;
  node.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let s = 0;
    for (let i = 0; i < d.length; i += 16) s += d[i]! * d[i]!;
    lvl = Math.sqrt(s / (d.length / 16));
  };
  src.connect(node);
  node.connect(ctx.destination);
  return {
    level: () => lvl,
    async stop() {
      node.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      await ctx.close();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      return rate === 16000 ? all : resample(all, rate, 16000);
    },
  };
}

function resample(x: Float32Array, from: number, to: number): Float32Array {
  const n = Math.round((x.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i * from) / to;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f;
  }
  return out;
}
