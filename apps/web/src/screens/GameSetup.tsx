import { useState } from 'react';
import { bossRaid, draftMerge, getTemplate, withPlayers, type BossDifficulty, type GameSpec } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { startKoth, startTournament, withBalance, withPowerUps, withTeams } from '../battle.js';
import { brain } from '../brain/service.js';
import { introMascot } from '../gameInfo.js';
import { go, href } from '../router.js';
import { speak } from '../speech.js';
import { newSession, useApp, type Format } from '../store.js';
import { VoiceInput } from '../VoiceInput.js';
import type { CameraMode } from '../vision/useVision.js';
import { Screen } from './Layout.js';

type FormatChoice = 'normal' | 'chaos' | 'draft' | 'koth' | 'tournament';

const FORMATS: { id: FormatChoice; label: string; icon: keyof typeof ASSETS.modes; min: number; help: string }[] = [
  { id: 'normal', label: 'Normal', icon: 'turn_battle', min: 1, help: 'Just play the game.' },
  { id: 'chaos', label: 'Chaos', icon: 'chaos', min: 1, help: 'Every round the referee shouts a NEW RULE.' },
  { id: 'draft', label: 'Rule Draft', icon: 'rule_draft', min: 1, help: 'Each player adds one rule by voice first.' },
  { id: 'koth', label: 'King of the Hill', icon: 'king_of_the_hill', min: 2, help: 'Winner stays on. Longest streak gets the crown.' },
  { id: 'tournament', label: 'Tournament', icon: 'tournament', min: 3, help: 'Up to 8 players, knockout bracket.' },
];

export function GameSetup({ id }: { id: string }) {
  const draft = useApp((s) => s.draft);
  const base: GameSpec | undefined = id === 'draft' ? (draft ?? undefined) : getTemplate(id);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const startSession = useApp((s) => s.startSession);
  const setSeries = useApp((s) => s.setSeries);
  const [format, setFormat] = useState<FormatChoice>('normal');
  const seriesFormat = format === 'koth' || format === 'tournament';
  const min = seriesFormat ? 2 : (base?.min_players ?? base?.players ?? 1);
  const max = seriesFormat ? 8 : (base?.max_players ?? base?.players ?? 1);
  const [count, setCount] = useState(() => Math.max(min, Math.min(max, base?.players ?? settings.playerNames.length)));
  const [names, setNames] = useState<string[]>(() => settings.playerNames);
  const [powerUps, setPowerUps] = useState(false);
  const [teams, setTeams] = useState(false);
  const [fair, setFair] = useState(false);
  const [boss, setBoss] = useState<BossDifficulty>('easy');
  const [rules, setRules] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  if (!base) {
    return (
      <Screen title="Game not found">
        <p>
          That game does not exist. <a href={href({ name: 'games' })}>See all games</a>.
        </p>
      </Screen>
    );
  }

  const n = Math.max(min, Math.min(max, count));
  const isBoss = base.mode === 'boss_raid';
  const nameAt = (i: number) => names[i] ?? `Player ${i + 1}`;
  const formatInfo = FORMATS.find((f) => f.id === format)!;

  const begin = async (camera: CameraMode) => {
    const players = Array.from({ length: n }, (_, i) => nameAt(i).trim() || `Player ${i + 1}`);
    setSetting('playerNames', players);
    let spec: GameSpec = isBoss ? bossRaid(boss, Math.min(n, 6)) : base;
    if (powerUps) spec = withPowerUps(spec);

    if (format === 'koth' || format === 'tournament') {
      const { series, session } = format === 'koth' ? startKoth(spec, players, camera) : startTournament(spec, players, camera);
      setSeries(series);
      startSession(session);
      go({ name: 'bracket' });
      return;
    }
    setSeries(null);
    spec = withPlayers({ ...spec, max_players: Math.max(spec.max_players ?? spec.players, n) }, n);
    if (teams) spec = withTeams(spec);
    if (fair) spec = await withBalance(spec, players);
    let fmt: Format = { kind: 'single' };
    if (format === 'chaos') fmt = { kind: 'chaos', base: spec, seed: Date.now() & 0xffff };
    if (format === 'draft') {
      setBusy('Merging everyone’s rules…');
      const merged = await draftMerge(spec, rules, (s, change) =>
        brain.remix(s, change).then((r) => {
          if (r.kind !== 'game') throw new Error('not allowed');
          return r.spec;
        }),
      );
      setBusy(null);
      spec = merged.spec;
      if (settings.voice && merged.applied.length) speak(`Rules in: ${merged.applied.join('. ')}.`);
    }
    startSession(newSession(spec, players, camera, fmt));
    go(camera === 'off' ? { name: 'play' } : { name: 'check' });
  };

  return (
    <Screen title={base.title}>
      <div className="setup">
        <Art className="setup__icon" asset={introMascot(base)} size={170} decorative />
        <p className="rules">{base.one_line_rules}</p>
        <BigButton tone="ghost" icon="🔊" onClick={() => speak(base.one_line_rules, { interrupt: true })}>
          Hear the rules
        </BigButton>

        <fieldset className="field">
          <legend>Format</legend>
          <div className="seg" role="group" aria-label="Battle format">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => setFormat(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="row">
            <Art asset={ASSETS.modes[formatInfo.icon]} size={64} decorative />
            <p className="note" style={{ flex: 1 }}>
              {formatInfo.help}
            </p>
          </div>
        </fieldset>

        {max > 1 ? (
          <fieldset className="field">
            <legend>Players</legend>
            <div className="stepper">
              <button type="button" aria-label="Fewer players" disabled={n <= min} onClick={() => setCount(n - 1)}>
                −
              </button>
              <output aria-live="polite">{n}</output>
              <button type="button" aria-label="More players" disabled={n >= max} onClick={() => setCount(n + 1)}>
                +
              </button>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="field">
          <legend>Names</legend>
          {Array.from({ length: n }, (_, i) => (
            <label key={i} className="name-input">
              <span className="sr-only">Player {i + 1} name</span>
              <input
                value={nameAt(i)}
                maxLength={24}
                onChange={(e) => {
                  const next = [...names];
                  next[i] = e.target.value;
                  setNames(next);
                }}
              />
            </label>
          ))}
        </fieldset>

        {format === 'draft' ? (
          <fieldset className="field">
            <legend>Rule Draft</legend>
            <p className="note">Each player says one rule. The brain merges them into one safe game.</p>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="stack">
                <span className="sticker sticker--white">{nameAt(i)}’s rule</span>
                <VoiceInput
                  value={rules[i] ?? ''}
                  onChange={(v) => {
                    const next = [...rules];
                    next[i] = v;
                    setRules(next);
                  }}
                  label={`${nameAt(i)}: say a rule`}
                  placeholder="e.g. double points, 30 seconds, 5 rounds"
                />
              </div>
            ))}
          </fieldset>
        ) : null}

        {isBoss ? (
          <fieldset className="field">
            <legend>Boss</legend>
            <div className="seg" role="group" aria-label="Boss difficulty">
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={boss === d} onClick={() => setBoss(d)}>
                  {d === 'easy' ? 'Easy: Thunder Rock' : d === 'medium' ? 'Medium: Storm Cloud' : 'Hard: Mega Ball'}
                </button>
              ))}
            </div>
            <Art
              asset={boss === 'easy' ? ASSETS.bosses.thunderRock : boss === 'medium' ? ASSETS.bosses.stormCloud : ASSETS.bosses.megaBall}
              size={140}
            />
          </fieldset>
        ) : null}

        <fieldset className="field">
          <legend>Extras</legend>
          <label className="choice">
            <input type="checkbox" checked={powerUps} onChange={(e) => setPowerUps(e.target.checked)} />
            <span>
              <strong>Power-ups</strong>
              <small>Shield, Double, Steal, Freeze — earned by repeating the main move.</small>
            </span>
          </label>
          {!isBoss && !seriesFormat && n >= 2 ? (
            <label className="choice">
              <input type="checkbox" checked={teams} onChange={(e) => setTeams(e.target.checked)} />
              <span>
                <strong>Teams: Red vs Blue</strong>
                <small>Team totals win.</small>
              </span>
            </label>
          ) : null}
          {!seriesFormat && n >= 2 ? (
            <label className="choice">
              <input type="checkbox" checked={fair} onChange={(e) => setFair(e.target.checked)} />
              <span>
                <strong>Fair-play balancer</strong>
                <small>Uses past results on this phone to even things out.</small>
              </span>
            </label>
          ) : null}
        </fieldset>

        {busy ? (
          <div className="row" role="status">
            <Art asset={ASSETS.mascot.think} size={72} decorative />
            <p className="display">{busy}</p>
          </div>
        ) : null}

        <BigButton tone="green" icon="📷" disabled={!!busy} onClick={() => void begin('camera')}>
          Camera referee
        </BigButton>
        <div className="grid2">
          <BigButton tone="ghost" icon="👆" disabled={!!busy} onClick={() => void begin('off')}>
            Tap mode
          </BigButton>
          <BigButton tone="ghost" icon="🤖" disabled={!!busy} onClick={() => void begin('demo')}>
            Demo camera
          </BigButton>
        </div>
        <p className="note">
          Camera referee: put the phone down 3–4 m away so your whole body fits. Tap mode: no camera, you tap what
          happens. Demo camera: a pretend player, to try things out.
        </p>
      </div>
    </Screen>
  );
}
