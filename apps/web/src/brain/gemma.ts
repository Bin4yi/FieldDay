import type { LlmRunner } from '@fieldday/brain';

// Gemma on the phone through MediaPipe LLM Inference (needs WebGPU).
// The model file is big and gated (you accept the Gemma licence on Hugging
// Face), so the player brings the file once: pick it from the phone, or
// download from a URL. It is kept in the browser's private storage (OPFS)
// and loaded from there with no internet.
//
// Supported web models are MediaPipe "-web.task" Gemma builds, for example
// litert-community Gemma 3 1B IT (int4, web). See README → Gemma model.

const FILE = 'gemma-model.task';

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function opfs(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

export async function storedModelSize(): Promise<number | null> {
  try {
    const dir = await opfs();
    const h = await dir.getFileHandle(FILE);
    return (await h.getFile()).size;
  } catch {
    return null;
  }
}

export async function deleteStoredModel(): Promise<void> {
  try {
    await (await opfs()).removeEntry(FILE);
  } catch {
    // nothing stored
  }
}

/** Save a model file the player picked from their phone. */
export async function storeModelFile(file: File, onProgress?: (done: number, total: number) => void): Promise<void> {
  await writeStream(file.stream(), file.size, onProgress);
}

/** Download a model from a URL into storage, with progress. */
export async function downloadModel(url: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}). Gated models need you to download the file yourself and pick it.`);
  await writeStream(res.body, Number(res.headers.get('content-length') ?? 0), onProgress);
}

async function writeStream(stream: ReadableStream<Uint8Array>, total: number, onProgress?: (done: number, total: number) => void) {
  await navigator.storage.persist?.();
  const dir = await opfs();
  const h = await dir.getFileHandle(FILE, { create: true });
  const w = await h.createWritable();
  const reader = stream.getReader();
  let done = 0;
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      await w.write(value as Uint8Array<ArrayBuffer>);
      done += value.byteLength;
      onProgress?.(done, total);
    }
    await w.close();
  } catch (e) {
    await w.abort();
    throw e;
  }
}

type Llm = { generateResponse(q: string): Promise<string>; close(): void };
let llm: Llm | null = null;
let loading: Promise<Llm> | null = null;

/** Load the stored model into the GPU. */
export function loadGemma(): Promise<Llm> {
  if (llm) return Promise.resolve(llm);
  loading ??= (async () => {
    if (!hasWebGpu()) throw new Error('This browser has no WebGPU, so Gemma cannot run here. Offline rules still work.');
    const dir = await opfs();
    const file = await (await dir.getFileHandle(FILE)).getFile();
    const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai');
    const fileset = await FilesetResolver.forGenAiTasks('/mediapipe/genai');
    const inst = await LlmInference.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: file.stream().getReader() },
      maxTokens: 1280,
      topK: 20,
      temperature: 0.3,
      randomSeed: 7,
    });
    llm = inst;
    return inst;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export function gemmaLoaded(): boolean {
  return llm !== null;
}

/** Gemma instruction-tuned chat format. */
export function gemmaChat(prompt: string): string {
  return `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;
}

export const gemmaRunner: LlmRunner = {
  async generate(prompt: string) {
    const m = await loadGemma();
    return m.generateResponse(gemmaChat(prompt));
  },
};
