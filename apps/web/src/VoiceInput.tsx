import { useEffect, useRef, useState } from 'react';
import { loadWhisper, recordMic, transcribe } from './brain/whisper.js';

type State = 'idle' | 'recording' | 'loading' | 'thinking' | 'error';

/** Big mic button + text box. Speech is turned into text on the phone (Whisper). */
export function VoiceInput({
  value,
  onChange,
  onDone,
  label,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onDone?: (text: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const rec = useRef<Awaited<ReturnType<typeof recordMic>> | null>(null);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setLevel(rec.current?.level() ?? 0), 80);
    return () => clearInterval(id);
  }, [state]);

  const toggle = async () => {
    if (state === 'recording') {
      const r = rec.current;
      rec.current = null;
      if (!r) return;
      setState('loading');
      setMsg('Getting the speech model ready… (first time downloads about 40 MB)');
      try {
        const audio = await r.stop();
        await loadWhisper((pct) => setMsg(`Downloading speech model… ${Math.round(pct)}%`));
        setState('thinking');
        setMsg('Listening back…');
        const text = await transcribe(audio);
        setState('idle');
        if (!text) {
          setMsg('Couldn’t hear that, try again.');
          return;
        }
        setMsg(null);
        const next = value ? `${value} ${text}` : text;
        onChange(next);
        onDone?.(next);
      } catch (e) {
        setState('error');
        setMsg(`Voice did not work here (${e instanceof Error ? e.message : 'unknown'}). You can type instead.`);
      }
      return;
    }
    try {
      rec.current = await recordMic();
      setState('recording');
      setMsg('Talk now… tap again when you are done.');
    } catch {
      setState('error');
      setMsg('No microphone allowed. You can type instead.');
    }
  };

  const busy = state === 'loading' || state === 'thinking';
  return (
    <div className="stack">
      <button
        type="button"
        className={`mic-button ${state === 'recording' ? 'is-live' : ''}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={state === 'recording'}
      >
        <span className="mic-button__icon" aria-hidden="true">
          {state === 'recording' ? '■' : '🎤'}
        </span>
        <span>{state === 'recording' ? 'Tap to stop' : busy ? 'Thinking…' : label}</span>
      </button>
      {state === 'recording' ? (
        <div className="meter" aria-hidden="true">
          <div className="meter__fill" style={{ width: `${Math.min(100, level * 600)}%` }} />
        </div>
      ) : null}
      {msg ? (
        <p className="note" role="status">
          {msg}
        </p>
      ) : null}
      <label className="stack">
        <span className="sr-only">{label} (type)</span>
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          aria-label={`${label} (type)`}
        />
      </label>
    </div>
  );
}
