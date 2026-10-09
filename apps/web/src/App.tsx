import { useEffect } from 'react';
import { useRoute } from './router.js';
import { useApp } from './store.js';
import { BracketScreen } from './screens/Bracket.js';
import { BrainStats } from './screens/BrainStats.js';
import { Me } from './screens/Me.js';
import { GhostScreen } from './screens/GhostScreen.js';
import { QuestBuilder } from './screens/QuestBuilder.js';
import { QuestRunScreen } from './screens/QuestRun.js';
import { QuestImport, Quests } from './screens/Quests.js';
import { Scan } from './screens/Scan.js';
import { FieldCheck } from './screens/FieldCheck.js';
import { Say } from './screens/Say.js';
import { GameSetup } from './screens/GameSetup.js';
import { History } from './screens/History.js';
import { Home } from './screens/Home.js';
import { Play } from './screens/Play.js';
import { QuickGames } from './screens/QuickGames.js';
import { Results } from './screens/Results.js';
import { SettingsScreen } from './screens/Settings.js';

export function App() {
  const route = useRoute();
  const loadSettings = useApp((s) => s.loadSettings);
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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
