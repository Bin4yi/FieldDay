import { useEffect, useState } from 'react';
import { dailyQuest, decodeQuest, encodeQuest, type QuestSpec } from '@fieldday/quests';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { db, type QuestRecord } from '../db.js';
import { go, href } from '../router.js';
import { ShareSheet } from '../ShareSheet.js';
import { useApp } from '../store.js';
import { Screen } from './Layout.js';

export function useStartQuest() {
  const setQuestRun = useApp((s) => s.setQuestRun);
  const names = useApp((s) => s.settings.playerNames);
  return (quest: QuestSpec, savedId?: number, onlineRoom?: string) => {
    const players = quest.kind === 'relay' ? names.slice(0, Math.max(2, quest.players ?? names.length)) : names;
    setQuestRun({
      quest,
      state: { stepIndex: 0, status: 'active', outcomes: [], startedAt: Date.now(), finishedAt: null },
      players: players.length ? players : ['Player 1'],
      offlineAll: !navigator.onLine,
      ...(savedId !== undefined ? { savedId } : {}),
      ...(onlineRoom ? { online: onlineRoom } : {}),
    });
    go({ name: 'quest' });
  };
}

export function stepLabel(s: QuestSpec['steps'][number]): string {
  if (s.type === 'game' || s.type === 'boss') return `${s.type === 'boss' ? '👹 Boss' : '🎯 Game'}: ${s.spec?.title ?? s.spec_ref}${s.goal ? ` (${s.goal})` : ''}`;
  return `${s.type === 'find' ? '🔍' : '🏃'} ${s.instruction}`;
}

export function Quests() {
  const run = useApp((s) => s.questRun);
  const start = useStartQuest();
  const [saved, setSaved] = useState<QuestRecord[]>([]);
  const [sharing, setSharing] = useState<QuestSpec | null>(null);
  const kids = useApp((s) => s.settings.kidsMode);
  const today = dailyQuest(new Date(), { kids });
  useEffect(() => {
    void db().quests.orderBy('createdAt').reverse().toArray().then(setSaved).catch(() => undefined);
  }, []);

  return (
    <Screen title="Quests">
      {run && run.state.status === 'active' ? (
        <a className="card card--yellow stack" href={href({ name: 'quest' })} style={{ textDecoration: 'none' }}>
          <span className="sticker">In progress</span>
          <h2>{run.quest.title}</h2>
          <p>
            Step {run.state.stepIndex + 1} of {run.quest.steps.length} — tap to continue
          </p>
        </a>
      ) : null}

      <div className="card card--green stack">
        <div className="row">
          <Art asset={ASSETS.modes.quest} size={80} decorative />
          <div className="stack" style={{ flex: 1, gap: 4 }}>
            <span className="sticker sticker--white">Daily Quest</span>
            <h2>{today.title.replace('Daily Quest ', '')}</h2>
          </div>
        </div>
        <p className="note">Same quest for everyone today. Made on your phone, no internet needed.</p>
        <ol className="plain-list" style={{ gap: 4 }}>
          {today.steps.map((s, i) => (
            <li key={i}>{stepLabel(s)}</li>
          ))}
        </ol>
        <BigButton tone="yellow" icon="▶" onClick={() => start(today)}>
          Start the Daily Quest
        </BigButton>
      </div>

      <div className="grid2">
        <a className="tile" href={href({ name: 'questNew' })}>
          <Art asset={ASSETS.mascot.think} size={80} decorative />
          <span>Make a quest</span>
        </a>
        <a className="tile" href={href({ name: 'scan' })}>
          <Art asset={ASSETS.modes.ghost} size={80} decorative />
          <span>Scan a code</span>
        </a>
      </div>

      {saved.length ? <h2>Saved quests</h2> : null}
      <ul className="plain-list">
        {saved.map((q) => (
          <li key={q.id} className="card stack">
            <h3>{q.title}</h3>
            <p className="note">
              {q.quest.steps.length} steps · {q.quest.kind}
              {q.doneAt ? ' · ✓ done' : ''}
            </p>
            <div className="grid2">
              <BigButton tone="green" onClick={() => start(q.quest, q.id)}>
                Start
              </BigButton>
              <BigButton tone="ghost" onClick={() => setSharing(q.quest)}>
                Share
              </BigButton>
            </div>
          </li>
        ))}
      </ul>
      {sharing ? (
        <div className="card stack">
          <h3>Share “{sharing.title}”</h3>
          <ShareSheet url={`${location.origin}/#/q/${encodeQuest(sharing)}`} title={sharing.title} text="Try my FieldDay quest!" />
          <BigButton tone="ghost" onClick={() => setSharing(null)}>
            Close
          </BigButton>
        </div>
      ) : null}
    </Screen>
  );
}

export function QuestImport({ code }: { code: string }) {
  const start = useStartQuest();
  let quest: QuestSpec;
  try {
    quest = decodeQuest(code);
  } catch {
    return (
      <Screen title="Quest">
        <p className="card card--coral">This quest code is broken.</p>
      </Screen>
    );
  }
  const save = async () => {
    const id = (await db().quests.add({ title: quest.title, quest, createdAt: Date.now() })) as number;
    start(quest, id);
  };
  return (
    <Screen title="A friend’s quest">
      <div className="card stack">
        <h2>{quest.title}</h2>
        <ol className="plain-list" style={{ gap: 4 }}>
          {quest.steps.map((s, i) => (
            <li key={i}>{stepLabel(s)}</li>
          ))}
        </ol>
      </div>
      <BigButton tone="green" icon="▶" onClick={() => void save()}>
        Save & start
      </BigButton>
    </Screen>
  );
}
