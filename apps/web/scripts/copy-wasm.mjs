// Copies the MediaPipe WASM runtime into public/ so the app does not need a CDN.
// The service worker caches it on first use (it is too big to pre-cache).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(new URL(import.meta.url).pathname);
const pub = join(here, '../public/mediapipe');
const copies = [
  ['@mediapipe/tasks-vision', 'vision', ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']],
  ['@mediapipe/tasks-genai', 'genai', ['genai_wasm_internal.js', 'genai_wasm_internal.wasm', 'genai_wasm_nosimd_internal.js', 'genai_wasm_nosimd_internal.wasm']],
];
for (const [pkg, name, files] of copies) {
  let root;
  try {
    root = dirname(require.resolve(pkg));
  } catch (e) {
    console.warn(`${pkg} not found:`, e.message);
    continue;
  }
  const src = join(root, 'wasm');
  const dest = join(pub, name);
  mkdirSync(dest, { recursive: true });
  if (files) for (const f of files) cpSync(join(src, f), join(dest, f));
  else if (existsSync(src)) cpSync(src, dest, { recursive: true });
  console.log(`copied ${name} wasm`);
}

// onnxruntime-web (used by transformers.js for Whisper): serve its WASM ourselves.
try {
  const tf = dirname(require.resolve('@huggingface/transformers'));
  const ortReq = createRequire(join(tf, 'x.js'));
  const ortDist = dirname(ortReq.resolve('onnxruntime-web'));
  const dest = join(pub, '../ort');
  mkdirSync(dest, { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    if (existsSync(join(ortDist, f))) cpSync(join(ortDist, f), join(dest, f));
  }
  console.log('copied onnxruntime wasm');
} catch (e) {
  console.warn('onnxruntime wasm not copied:', e.message);
}
