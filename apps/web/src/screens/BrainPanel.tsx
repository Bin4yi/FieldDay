import { useEffect, useState } from 'react';
import { BigButton } from '@fieldday/ui';
import {
  deleteStoredModel,
  downloadModel,
  gemmaLoaded,
  hasWebGpu,
  loadGemma,
  storeModelFile,
  storedModelSize,
} from '../brain/gemma.js';
import { refreshGemma } from '../brain/service.js';
import { loadWhisper } from '../brain/whisper.js';
import { OBJECT_MODEL, POSE_MODEL, VISION_WASM } from '../vision/models.js';

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

/** Gemma model: bring it once, keep it on the phone. */
export function GemmaPanel() {
  const [size, setSize] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(gemmaLoaded());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');

  const refresh = () => storedModelSize().then(setSize);
  useEffect(() => {
    void refresh();
  }, []);

  const progress = (done: number, total: number) =>
    setMsg(total ? `Saving… ${Math.round((100 * done) / total)}% of ${mb(total)}` : `Saving… ${mb(done)}`);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const load = () =>
    run(async () => {
      setMsg('Loading Gemma into the GPU… this can take a minute.');
      await loadGemma();
      refreshGemma();
      setLoaded(true);
      setMsg('Gemma is ready. Games are now designed on your phone.');
    });

  return (
    <div className="stack">
      <p className="note">
        {hasWebGpu() ? '✓ This browser has WebGPU.' : '✗ No WebGPU here: Gemma cannot run, but the offline rules designer still works.'}
      </p>
      <p className="note">
        Status:{' '}
        <strong>{loaded ? 'Gemma loaded ✓' : size ? `Model saved on phone (${mb(size)}), not loaded` : 'No model yet (using offline rules)'}</strong>
      </p>
      {size && !loaded ? (
        <BigButton tone="green" disabled={busy || !hasWebGpu()} onClick={() => void load()}>
          Load Gemma
        </BigButton>
      ) : null}
      <label className="fd-btn fd-btn--yellow" style={{ cursor: 'pointer' }}>
        <span>Pick a Gemma .task file</span>
        <input
          type="file"
          accept=".task,.litertlm,.bin"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void run(() => storeModelFile(file, progress).then(() => setMsg('Saved. Now tap “Load Gemma”.')));
          }}
        />
      </label>
      <label className="stack">
        <span className="note">…or download from a link (must allow downloads without a login):</span>
        <input type="url" value={url} placeholder="https://…/gemma3-1b-it-int4-web.task" onChange={(e) => setUrl(e.target.value)} />
      </label>
      <BigButton tone="ghost" disabled={busy || !url} onClick={() => void run(() => downloadModel(url, progress).then(() => setMsg('Downloaded. Now tap “Load Gemma”.')))}>
        Download model
      </BigButton>
      {size ? (
        <BigButton
          tone="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await deleteStoredModel();
              setLoaded(false);
              setMsg('Model removed.');
            })
          }
        >
          Remove model
        </BigButton>
      ) : null}
      {msg ? (
        <p className="note" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

/** Download everything once so the app works in airplane mode. */
export function OfflinePack() {
  const [status, setStatus] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setStatus((s) => ({ ...s, [k]: v }));
  const fetchAll = async () => {
    const files = [
      ['Camera runtime', `${VISION_WASM}/vision_wasm_internal.wasm`],
      ['Camera runtime (old phones)', `${VISION_WASM}/vision_wasm_nosimd_internal.wasm`],
      ['Body model', POSE_MODEL],
      ['Ball model', OBJECT_MODEL],
    ] as const;
    for (const [name, url] of files) {
      set(name, '…');
      try {
        const r = await fetch(url);
        await r.arrayBuffer();
        set(name, r.ok ? '✓' : `✗ ${r.status}`);
      } catch {
        set(name, '✗ no internet');
      }
    }
    set('Speech model', '0%');
    try {
      await loadWhisper((p) => set('Speech model', `${Math.round(p)}%`));
      set('Speech model', '✓');
    } catch {
      set('Speech model', '✗');
    }
  };
  return (
    <div className="stack">
      <p className="note">Do this once on Wi-Fi. Then the camera referee and voice work in airplane mode.</p>
      <BigButton tone="green" icon="⬇" onClick={() => void fetchAll()}>
        Get ready for offline
      </BigButton>
      {Object.keys(status).length ? (
        <ul className="plain-list" style={{ gap: 4 }}>
          {Object.entries(status).map(([k, v]) => (
            <li key={k}>
              <strong>{v}</strong> {k}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
