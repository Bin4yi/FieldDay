import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Home } from './screens/Home.js';
import { Art } from './Art.js';
import { ASSETS } from './assets.js';
import { useRoute } from './router.js';
import { useApp } from './store.js';

const BracketScreen = lazy(() => import('./screens/Bracket.js').then((m) => ({ default: m.BracketScreen })));
const BrainStats = lazy(() => import('./screens/BrainStats.js').then((m) => ({ default: m.BrainStats })));
const Me = lazy(() => import('./screens/Me.js').then((m) => ({ default: m.Me })));
const GhostScreen = lazy(() => import('./screens/GhostScreen.js').then((m) => ({ default: m.GhostScreen })));
const QuestBuilder = lazy(() => import('./screens/QuestBuilder.js').then((m) => ({ default: m.QuestBuilder })));
const QuestRunScreen = lazy(() => import('./screens/QuestRun.js').then((m) => ({ default: m.QuestRunScreen })));
const QuestImport = lazy(() => import('./screens/Quests.js').then((m) => ({ default: m.QuestImport })));
const Quests = lazy(() => import('./screens/Quests.js').then((m) => ({ default: m.Quests })));
const Scan = lazy(() => import('./screens/Scan.js').then((m) => ({ default: m.Scan })));
const BattleRoom = lazy(() => import('./screens/BattleRoom.js').then((m) => ({ default: m.BattleRoom })));
const Watch = lazy(() => import('./screens/BattleRoom.js').then((m) => ({ default: m.Watch })));
const Crew = lazy(() => import('./screens/Crew.js').then((m) => ({ default: m.Crew })));
const FieldCheck = lazy(() => import('./screens/FieldCheck.js').then((m) => ({ default: m.FieldCheck })));
const Say = lazy(() => import('./screens/Say.js').then((m) => ({ default: m.Say })));
const GameSetup = lazy(() => import('./screens/GameSetup.js').then((m) => ({ default: m.GameSetup })));
const History = lazy(() => import('./screens/History.js').then((m) => ({ default: m.History })));
const Play = lazy(() => import('./screens/Play.js').then((m) => ({ default: m.Play })));
const QuickGames = lazy(() => import('./screens/QuickGames.js').then((m) => ({ default: m.QuickGames })));
const Results = lazy(() => import('./screens/Results.js').then((m) => ({ default: m.Results })));
const SettingsScreen = lazy(() => import('./screens/Settings.js').then((m) => ({ default: m.SettingsScreen })));

function Loading() {
  return (
    <div className="screen" style={{ display: 'grid', placeItems: 'center' }} role="status" aria-label="Loading">
      <Art asset={ASSETS.mascot.think} size={160} decorative />
    </div>
  );
}

export function App() {
  const route = useRoute();
  const loadSettings = useApp((s) => s.loadSettings);
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const page = screen(route);
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}

function screen(route: ReturnType<typeof useRoute>): ReactNode {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'games':
      return <QuickGames />;
    case 'setup':
      return <GameSetup id={route.id} />;
    case 'play':
      return <Play />;
    case 'check':
      return <FieldCheck />;
    case 'say':
      return <Say />;
    case 'bracket':
      return <BracketScreen />;
    case 'me':
      return <Me />;
    case 'quests':
      return <Quests />;
    case 'questNew':
      return <QuestBuilder />;
    case 'quest':
      return <QuestRunScreen />;
    case 'scan':
      return <Scan />;
    case 'room':
      return <BattleRoom {...(route.code ? { code: route.code } : {})} />;
    case 'watch':
      return <Watch code={route.code} />;
    case 'crew':
      return <Crew />;
    case 'ghost':
      return <GhostScreen code={route.code} />;
    case 'questImport':
      return <QuestImport code={route.code} />;
    case 'stats':
      return <BrainStats />;
    case 'results':
      return <Results id={route.id} />;
    case 'history':
      return <History />;
    case 'settings':
      return <SettingsScreen />;
  }
}
