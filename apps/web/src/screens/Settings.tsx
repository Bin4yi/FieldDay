import { REFEREE_STYLES, type RefereeStyle } from '@fieldday/engine';
import type { BrainMode } from '@fieldday/brain';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

const MODES: { id: BrainMode; label: string; help: string }[] = [
  { id: 'open', label: 'Open Mode', help: 'Gemma on your phone. Works with no internet.' },
  { id: 'boost', label: 'Boost Mode', help: 'OpenAI online, falls back to Gemma. (Coming later)' },
  { id: 'auto', label: 'Auto', help: 'Boost when online, Open when not.' },
];

const STYLE_NAMES: Record<RefereeStyle, string> = {
  football_announcer: 'Football Announcer',
  wrestling_hype: 'Wrestling Hype',
  calm_coach: 'Calm Coach',
  robot_ref: 'Robot Ref',
  pirate: 'Pirate',
};

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const set = useApp((s) => s.setSetting);
  return (
    <Screen title="Settings">
      <fieldset className="field">
        <legend>Brain</legend>
        {MODES.map((m) => (
          <label key={m.id} className="choice">
            <input
              type="radio"
              name="brain"
              checked={settings.brainMode === m.id}
              onChange={() => set('brainMode', m.id)}
            />
            <span>
              <strong>{m.label}</strong>
              <small>{m.help}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="field">
        <legend>Referee style</legend>
        <select
          aria-label="Referee style"
          value={settings.refereeStyle}
          onChange={(e) => set('refereeStyle', e.target.value as RefereeStyle)}
        >
          {REFEREE_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_NAMES[s]}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="field">
        <legend>Play</legend>
        <Toggle label="Referee voice" checked={settings.voice} onChange={(v) => set('voice', v)} />
        <Toggle label="Kids Mode (softer rules, no trash talk)" checked={settings.kidsMode} onChange={(v) => set('kidsMode', v)} />
        <Toggle label="Battery saver" checked={settings.batterySaver} onChange={(v) => set('batterySaver', v)} />
      </fieldset>
    </Screen>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="choice">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
      </span>
    </label>
  );
}
