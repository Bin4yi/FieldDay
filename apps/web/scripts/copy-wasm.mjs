// Copies the MediaPipe WASM runtime into public/ so the app does not need a CDN.
// The service worker caches it on first use (it is too big to pre-cache).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(new URL(import.meta.url).pathname);
const pub = join(here, '../public/mediapipe');
const copies = [
  ['@mediapipe/tasks-vision/package.json', 'vision', ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']],
  ['@mediapipe/tasks-genai/package.json', 'genai', null],
];
for (const [pkg, name, files] of copies) {
  let root;
  try {
    root = dirname(require.resolve(pkg));
  } catch {
    continue;
  }
  const src = join(root, 'wasm');
  const dest = join(pub, name);
  mkdirSync(dest, { recursive: true });
  if (files) for (const f of files) cpSync(join(src, f), join(dest, f));
  else if (existsSync(src)) cpSync(src, dest, { recursive: true });
  console.log(`copied ${name} wasm`);
}
