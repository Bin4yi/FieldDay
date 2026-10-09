import { useState } from 'react';
import { TEMPLATES } from '@fieldday/engine';
import { PHOTO_TASKS, validateQuest, type QuestSpec } from '@fieldday/quests';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { brain } from '../brain/service.js';
import { db } from '../db.js';
import { speak } from '../speech.js';
import { useApp } from '../store.js';
import { VoiceInput } from '../VoiceInput.js';
import { Screen } from './Layout.js';
import { stepLabel, useStartQuest } from './Quests.js';

type Step = QuestSpec['steps'][number];

export function QuestBuilder() {
  const settings = useApp((s) => s.settings);
  const start = useStartQuest();
  const [text, setText] = useState('');
  const [quest, setQuest] = useState<QuestSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const make = async (request: string) => {
    if (!request.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await brain.quest(request, { players: settings.playerNames.length, kidsMode: settings.kidsMode });
      if (r.kind === 'unsafe') {
        setMsg(`${r.reason}${r.saferPrompt ? ` Try: “${r.saferPrompt}”` : ''}`);
        if (settings.voice) speak(r.reason);
      } else {
        setQuest(r.quest);
        setMsg(r.notes.join(' ') || null);
        if (settings.voice) speak(`${r.quest.title}. ${r.quest.steps.length} steps.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, step: Step | null) => {
    if (!quest) return;
    const steps = [...quest.steps];
    if (step) steps[i] = step;
    else steps.splice(i, 1);
    setQuest({ ...quest, steps });
  };
  const move = (i: number, d: -1 | 1) => {
    if (!quest) return;
    const steps = [...quest.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j]!, steps[i]!];
    setQuest({ ...quest, steps });
  };
  const add = (type: Step['type']) => {
    if (!quest) return;
    const step: Step =
      type === 'game'
        ? { type: 'game', spec_ref: 'sky_toss', goal: 'height_m >= 2' }
        : type === 'boss'
          ? { type: 'boss', spec_ref: 'boss_raid_basic' }
          : type === 'find'
            ? { type: 'find', instruction: 'Find something red', check: 'photo', photo_task: 'something red' }
            : { type: 'move', instruction: 'Jog to the far side and back', check: 'confirm' };
    setQuest({ ...quest, steps: [...quest.steps, step].slice(0, 12) });
  };
  const valid = quest ? validateQuest(quest) : null;

  const save = async () => {
    if (!quest || !valid?.ok) return null;
    return (await db().quests.add({ title: quest.title, quest: valid.quest, createdAt: Date.now() })) as number;
  };

  return (
    <Screen title="Quest Builder">
      {!quest ? (
        <>
          <VoiceInput value={text} onChange={setText} onDone={(t) => void make(t)} label="Say a quest" placeholder="e.g. a 20-minute park adventure for 4 kids" />
          <BigButton tone="green" icon="⚡" disabled={!text.trim() || busy} onClick={() => void make(text)}>
            Make my quest
          </BigButton>
        </>
      ) : null}
      {busy ? (
        <div className="row" role="status">
          <Art asset={ASSETS.mascot.think} size={90} decorative />
          <p className="display">Planning your quest…</p>
        </div>
      ) : null}
      {msg ? <p className="note">{msg}</p> : null}

      {quest ? (
        <div className="stack">
          <label className="stack">
            <span className="sticker">Title</span>
            <input value={quest.title} maxLength={50} onChange={(e) => setQuest({ ...quest, title: e.target.value })} aria-label="Quest title" />
          </label>
          <label className="choice">
            <input type="checkbox" checked={quest.kind === 'relay'} onChange={(e) => setQuest({ ...quest, kind: e.target.checked ? 'relay' : 'chain' })} />
            <span>
              <strong>Relay</strong>
              <small>Each player does one step, then passes the phone like a baton.</small>
            </span>
          </label>
          {quest.steps.map((s, i) => (
            <div key={i} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="sticker sticker--white">
                  {i + 1}. {s.type}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="topbar__back" aria-label="Move up" onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="topbar__back" aria-label="Move down" onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" className="topbar__back" aria-label="Delete step" onClick={() => update(i, null)}>
                    ✕
                  </button>
                </div>
              </div>
              {s.type === 'game' ? (
                <>
                  <select aria-label="Game" value={s.spec_ref ?? ''} onChange={(e) => update(i, { ...s, spec_ref: e.target.value, spec: undefined })}>
                    {TEMPLATES.filter((t) => t.id !== 'boss_raid_basic').map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Goal" value={s.goal ?? ''} placeholder="e.g. count >= 10" onChange={(e) => update(i, { ...s, goal: e.target.value || undefined })} />
                </>
              ) : s.type === 'boss' ? (
                <p>{stepLabel(s)}</p>
              ) : (
                <>
                  <input aria-label="Instruction" value={s.instruction} maxLength={140} onChange={(e) => update(i, { ...s, instruction: e.target.value })} />
                  {s.type === 'find' ? (
                    <select aria-label="Photo check" value={s.photo_task ?? ''} onChange={(e) => update(i, { ...s, check: 'photo', photo_task: e.target.value })}>
                      {PHOTO_TASKS.map((t) => (
                        <option key={t} value={t}>
                          Photo: {t}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </>
              )}
            </div>
          ))}
          <div className="seg">
            {(['game', 'move', 'find', 'boss'] as const).map((t) => (
              <button key={t} type="button" onClick={() => add(t)}>
                + {t}
              </button>
            ))}
          </div>
          {valid && !valid.ok ? (
            <p className="card card--coral" role="alert">
              Fix: {valid.errors.slice(0, 3).join('; ')}
            </p>
          ) : null}
          <BigButton
            tone="green"
            icon="▶"
            disabled={!valid?.ok}
            onClick={() =>
              void save().then((id) => {
                if (valid?.ok) start(valid.quest, id ?? undefined);
              })
            }
          >
            Save & start
          </BigButton>
          <BigButton tone="ghost" onClick={() => setQuest(null)}>
            Start over
          </BigButton>
        </div>
      ) : null}
    </Screen>
  );
}
