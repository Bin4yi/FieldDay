import { useState } from 'react';
import type { DesignOutcome } from '@fieldday/brain';
import { gameCode, type GameSpec } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { brain } from '../brain/service.js';
import { modeIcon } from '../gameInfo.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { useApp } from '../store.js';
import { VoiceInput } from '../VoiceInput.js';
import { Screen } from './Layout.js';

const EXAMPLES = [
  'highest throw battle, 3 rounds, 2 players',
  'who can jump highest, 4 players',
  'squat race for 30 seconds, red vs blue',
  'throw the ball into my bag, first to 9',
  'fight a giant monster together',
];

const SOURCE_LABEL: Record<string, string> = {
  model: 'Designed by the brain',
  repaired: 'Designed by the brain (fixed once)',
  template: 'Closest ready-made game',
  rules: 'Made offline from your words',
};

export function Say() {
  const settings = useApp((s) => s.settings);
  const setDraft = useApp((s) => s.setDraft);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(DesignOutcome & { brain: string }) | null>(null);
  const [remix, setRemix] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ctx = {
    players: Math.max(1, settings.playerNames.length),
    kidsMode: settings.kidsMode,
    refereeStyle: settings.refereeStyle === 'auto' ? ('football_announcer' as const) : settings.refereeStyle,
  };

  const design = async (request: string) => {
    if (!request.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await brain.design(request, ctx);
      setResult(r);
      if (settings.voice) {
        if (r.kind === 'game') speak(`${r.spec.title}. ${r.spec.one_line_rules}`, { interrupt: true });
        else if (r.kind === 'unsafe') speak(r.reason, { interrupt: true });
        else speak(`${r.why} How about ${r.nearest.title}?`, { interrupt: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const doRemix = async (spec: GameSpec) => {
    if (!remix.trim()) return;
    setBusy(true);
    try {
      const r = await brain.remix(spec, remix);
      setResult(r);
      setRemix('');
      if (r.kind === 'game' && settings.voice) speak(r.spec.one_line_rules, { interrupt: true });
    } finally {
      setBusy(false);
    }
  };

  const play = (spec: GameSpec) => {
    setDraft(spec);
    go({ name: 'setup', id: 'draft' });
  };

  return (
    <Screen title="Say a game">
      {!result && !busy ? (
        <>
          <VoiceInput
            value={text}
            onChange={setText}
            onDone={(t) => void design(t)}
            label="Say a game"
            placeholder="e.g. highest throw battle, 3 rounds, 2 players"
          />
          <BigButton tone="green" icon="⚡" disabled={!text.trim()} onClick={() => void design(text)}>
            Make my game
          </BigButton>
          <div className="stack">
            <span className="sticker sticker--white">Try saying</span>
            <div className="seg">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => setText(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {busy ? (
        <div className="stack" style={{ alignItems: 'center' }} role="status">
          <Art asset={ASSETS.mascot.think} size={200} />
          <p className="display">Designing your game…</p>
        </div>
      ) : null}
      {error ? (
        <p className="card card--coral" role="alert">
          {error}
        </p>
      ) : null}

      {result?.kind === 'unsafe' ? (
        <div className="card card--coral stack" role="alert">
          <h2>Let’s keep it safe</h2>
          <p>{result.reason}</p>
          {result.saferPrompt ? (
            <BigButton tone="yellow" onClick={() => void design(result.saferPrompt!)}>
              Try: “{result.saferPrompt}”
            </BigButton>
          ) : null}
          <BigButton tone="ghost" onClick={() => setResult(null)}>
            Say something else
          </BigButton>
        </div>
      ) : null}

      {result?.kind === 'infeasible' ? (
        <div className="card card--yellow stack">
          <h2>The camera can’t do that one</h2>
          <p>{result.why}</p>
          <p>
            Nearest game: <strong>{result.nearest.title}</strong> — {result.nearest.one_line_rules}
          </p>
          <BigButton tone="green" onClick={() => play(result.nearest)}>
            Play {result.nearest.title}
          </BigButton>
          <BigButton tone="ghost" onClick={() => setResult(null)}>
            Say something else
          </BigButton>
        </div>
      ) : null}

      {result?.kind === 'game' ? (
        <div className="stack">
          <div className="card stack">
            <div className="row">
              <Art asset={modeIcon(result.spec)} size={72} decorative />
              <div className="stack" style={{ gap: 4, flex: 1 }}>
                <h2>{result.spec.title}</h2>
                <span className="sticker sticker--green">{gameCode(result.spec)}</span>
              </div>
            </div>
            <p className="rules" style={{ transform: 'none', boxShadow: 'none' }}>
              {result.spec.one_line_rules}
            </p>
            <div className="grid2">
              <div className="stat">
                <strong>{result.spec.players}</strong>
                <span>players</span>
              </div>
              <div className="stat">
                <strong>{result.spec.rounds}</strong>
                <span>rounds</span>
              </div>
            </div>
            <p className="note">
              {SOURCE_LABEL[result.source]} · {result.brain === 'gemma' ? 'Open Mode' : 'Boost Mode'}
            </p>
            {result.notes.map((n) => (
              <p key={n} className="note">
                ⚠ {n}
              </p>
            ))}
            {result.spec.hype_lines?.filter((h) => h.startsWith('House rule')).map((h) => (
              <p key={h} className="note">
                📜 {h}
              </p>
            ))}
          </div>
          <BigButton tone="green" icon="▶" onClick={() => play(result.spec)}>
            Play it
          </BigButton>
          <BigButton tone="ghost" icon="🔊" onClick={() => speak(result.spec.one_line_rules, { interrupt: true })}>
            Hear the rules
          </BigButton>
          <fieldset className="field">
            <legend>Change something</legend>
            <VoiceInput value={remix} onChange={setRemix} label="Say a change" placeholder="e.g. make it 5 rounds" />
            <BigButton tone="yellow" disabled={!remix.trim()} onClick={() => void doRemix(result.spec)}>
              Remix
            </BigButton>
          </fieldset>
          <BigButton tone="ghost" onClick={() => setResult(null)}>
            Start over
          </BigButton>
        </div>
      ) : null}
    </Screen>
  );
}
