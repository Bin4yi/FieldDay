import { useEffect, useMemo, useRef, useState } from 'react';
import { getTemplate, withPlayers } from '@fieldday/engine';
import { QuestRun, stepGame } from '@fieldday/quests';
import { BigButton, PlayerTag } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { brain } from '../brain/service.js';
import { db } from '../db.js';
import { go, href } from '../router.js';
import { speak } from '../speech.js';
import { newSession, useApp } from '../store.js';
import type { CameraMode } from '../vision/useVision.js';
import { Screen } from './Layout.js';
import { stepLabel } from './Quests.js';

export function QuestRunScreen() {
  const save = useApp((s) => s.questRun);
  const setQuestRun = useApp((s) => s.setQuestRun);
  const report = useApp((s) => s.questReport);
  const setReport = useApp((s) => s.setQuestReport);
  const startSession = useApp((s) => s.startSession);
  const setSeries = useApp((s) => s.setSeries);
  const settings = useApp((s) => s.settings);
  const [msg, setMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const [, bump] = useState(0);
  const said = useRef<number>(-1);

  const run = useMemo(
    () => (save ? new QuestRun(save.quest, save.state.startedAt, save.players.length, save.state) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save?.quest, save?.state],
  );

  const persist = (r: QuestRun, extra: Partial<NonNullable<typeof save>> = {}) => {
    if (!save) return;
    setQuestRun({ ...save, state: r.snapshot(), offlineAll: save.offlineAll && !navigator.onLine, ...extra });
    bump((x) => x + 1);
  };

  // A game step just finished: check its goal.
  useEffect(() => {
    if (!run || !report || !save || report.step !== run.state.stepIndex) return;
    setReport(null);
    const step = run.current;
    const ok = run.reportGame(report.measures, report.won, Date.now());
    const goal = step && 'goal' in step ? step.goal : undefined;
    const text = ok ? `Step done! ${goal ? `Goal ${goal} reached.` : ''}` : `Not yet: the goal is ${goal ?? 'to win'}. Try again!`;
    setMsg(text);
    if (settings.voice) speak(text, { interrupt: true });
    persist(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, run]);

  // Read each new step out loud.
  useEffect(() => {
    if (!run?.current || said.current === run.state.stepIndex) return;
    said.current = run.state.stepIndex;
    const s = run.current;
    const who = run.activePlayer !== null ? `${save?.players[run.activePlayer]}, your turn. ` : '';
    if (settings.voice) speak(`${who}${s.type === 'move' || s.type === 'find' ? s.instruction : stepLabel(s).replace(/^[^ ]+ /, '')}`);
  });

  // Quest finished: reward + badge.
  useEffect(() => {
    if (!run || !save || run.state.status !== 'done' || run.state.finishedAt === null) return;
    const key = `quest-done-${run.state.startedAt}`;
    if (sessionStorageGet(key)) return;
    sessionStorageSet(key);
    const offline = save.offlineAll && !navigator.onLine;
    void (async () => {
      const d = db();
      const now = Date.now();
      await d.results.add({
        specId: 'quest',
        code: 'quest',
        title: save.quest.title,
        players: save.players,
        totals: save.players.map(() => null),
        winners: save.players.map((_, i) => i),
        unit: '',
        startedAt: run.state.startedAt,
        finishedAt: now,
        durationMs: now - run.state.startedAt,
        outside: settings.outside,
        format: 'quest',
        questXp: save.quest.reward.xp,
        badges: offline ? ['offline_hero'] : [],
      });
      if (offline) await d.badges.put({ id: 'offline_hero', earnedAt: now });
      if (save.savedId !== undefined) await d.quests.update(save.savedId, { doneAt: now });
    })().catch(() => undefined);
    if (settings.voice) speak(`Quest complete! ${save.quest.reward.badge ? `You earned ${save.quest.reward.badge}.` : ''}`, { interrupt: true });
  }, [run, save, settings.outside, settings.voice]);

  if (!save || !run) {
    return (
      <Screen title="Quest">
        <p>
          No quest running. <a href={href({ name: 'quests' })}>Pick a quest</a>.
        </p>
      </Screen>
    );
  }

  const q = save.quest;
  const step = run.current;
  const runner = run.activePlayer;

  const playStep = (camera: CameraMode) => {
    if (!step) return;
    const spec = stepGame(step) ?? getTemplate('sky_toss')!;
    const players = runner !== null ? [save.players[runner]!] : save.players;
    const sized = withPlayers({ ...spec, min_players: 1, max_players: Math.max(spec.max_players ?? spec.players, players.length) }, players.length);
    setSeries(null);
    startSession(newSession(sized, players, camera, { kind: 'quest', step: run.state.stepIndex }));
    go(camera === 'off' ? { name: 'play' } : { name: 'check' });
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || !step || step.type === 'game' || step.type === 'boss') return;
    setChecking(true);
    setPhoto({ url: URL.createObjectURL(file), blob: file });
    try {
      const r = await brain.checkPhoto(file, step.photo_task ?? step.instruction);
      const ok = run.reportCheck(r.passed, Date.now());
      const text = ok ? 'Photo check passed!' : `I could not see ${step.photo_task}. Try again, closer and in good light.`;
      setMsg(`${text}${r.labels.length ? ` (I saw: ${[...new Set(r.labels)].slice(0, 4).join(', ')})` : ''}`);
      if (settings.voice) speak(text, { interrupt: true });
      persist(run);
    } finally {
      setChecking(false);
    }
  };

  const dropPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  return (
    <Screen title={q.title}>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={q.steps.length} aria-valuenow={run.state.stepIndex}>
        <div className="meter__fill" style={{ width: `${run.progress * 100}%` }} />
      </div>
      <ol className="plain-list" style={{ gap: 6 }}>
        {q.steps.map((s, i) => (
          <li key={i} className={i === run.state.stepIndex ? 'sticker' : 'note'} style={i === run.state.stepIndex ? { transform: 'none' } : undefined}>
            {i < run.state.stepIndex ? '✓ ' : i === run.state.stepIndex ? '▶ ' : '○ '}
            {stepLabel(s)}
          </li>
        ))}
      </ol>

      {run.state.status === 'done' ? (
        <div className="card card--yellow stack" role="status">
          <Art asset={ASSETS.mascot.cheer} size={180} />
          <h2>Quest complete!</h2>
          <p>
            +{q.reward.xp} XP{q.reward.badge ? ` · ${q.reward.badge}` : ''}
          </p>
          {save.offlineAll && !navigator.onLine ? (
            <div className="row">
              <Art asset={ASSETS.badges.offline_hero} size={80} />
              <strong>Offline Hero: the whole quest with no signal!</strong>
            </div>
          ) : null}
          <BigButton tone="green" onClick={() => (setQuestRun(null), go({ name: 'quests' }))}>
            Done
          </BigButton>
        </div>
      ) : null}

      {step ? (
        <div className="card stack">
          {runner !== null ? (
            <div className="row">
              <span className="sticker sticker--coral">Relay</span>
              <span>Pass the phone to</span>
              <PlayerTag index={runner} name={save.players[runner] ?? ''} />
            </div>
          ) : null}
          {step.type === 'game' || step.type === 'boss' ? (
            <>
              <Art asset={step.type === 'boss' ? ASSETS.mascot.bossFight : ASSETS.mascot.whistle} size={140} />
              <h2>{stepGame(step)?.title ?? 'Game'}</h2>
              {step.goal ? <p className="sticker">Goal: {step.goal}</p> : step.type === 'boss' ? <p className="sticker">Goal: beat the boss</p> : null}
              <BigButton tone="green" icon="📷" onClick={() => playStep('camera')}>
                Play (camera)
              </BigButton>
              <BigButton tone="ghost" icon="👆" onClick={() => playStep('off')}>
                Play (tap mode)
              </BigButton>
            </>
          ) : (
            <>
              <Art asset={step.type === 'find' ? ASSETS.mascot.think : ASSETS.mascot.jump} size={140} />
              <h2>{step.instruction}</h2>
              {step.check === 'photo' ? (
                <>
                  <label className="fd-btn fd-btn--yellow" style={{ cursor: 'pointer' }}>
                    <span>📸 Take photo of {step.photo_task}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      disabled={checking}
                      onChange={(e) => void onPhoto(e.target.files?.[0])}
                    />
                  </label>
                  <p className="note">The photo is checked on your phone and then deleted, unless you save it.</p>
                </>
              ) : (
                <BigButton
                  tone="green"
                  icon="✓"
                  onClick={() => {
                    run.reportCheck(true, Date.now());
                    persist(run);
                    setMsg('Nice! Next step.');
                  }}
                >
                  Done!
                </BigButton>
              )}
            </>
          )}
        </div>
      ) : null}

      {checking ? <p className="note">Checking the photo…</p> : null}
      {photo ? (
        <div className="stack">
          <img src={photo.url} alt="Your quest photo" className="card" style={{ padding: 0 }} />
          <div className="grid2">
            <BigButton
              tone="ghost"
              onClick={() => {
                const a = document.createElement('a');
                a.href = photo.url;
                a.download = `fieldday-quest-${Date.now()}.jpg`;
                a.click();
              }}
            >
              Save photo
            </BigButton>
            <BigButton tone="ghost" onClick={dropPhoto}>
              Delete
            </BigButton>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p className="ref-line" aria-live="polite">
          {msg}
        </p>
      ) : null}
      {run.state.status === 'active' ? (
        <BigButton tone="ghost" onClick={() => (setQuestRun(null), go({ name: 'quests' }))}>
          Stop quest
        </BigButton>
      ) : null}
    </Screen>
  );
}

function sessionStorageGet(k: string): boolean {
  try {
    return sessionStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}
function sessionStorageSet(k: string) {
  try {
    sessionStorage.setItem(k, '1');
  } catch {
    // ignore
  }
}
