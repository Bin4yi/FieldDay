import { useState } from 'react';
import { decodeGhost, ghostSpec, withPlayers } from '@fieldday/engine';
import { BigButton } from '@fieldday/ui';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { formatValue, scoreMeasure, scoreUnit } from '../gameInfo.js';
import { go } from '../router.js';
import { newSession, useApp } from '../store.js';
import type { CameraMode } from '../vision/useVision.js';
import { Screen } from './Layout.js';

export function GhostScreen({ code }: { code: string }) {
  const settings = useApp((s) => s.settings);
  const startSession = useApp((s) => s.startSession);
  const setSeries = useApp((s) => s.setSeries);
  const [name, setName] = useState(settings.playerNames[0] ?? 'Player 1');
  let ghost;
  try {
    ghost = decodeGhost(code);
  } catch {
    return (
      <Screen title="Ghost Challenge">
        <p className="card card--coral">This ghost code is broken. Ask your friend to share it again.</p>
      </Screen>
    );
  }
  const spec = ghostSpec(ghost);
  if (!spec) {
    return (
      <Screen title="Ghost Challenge">
        <p className="card card--coral">This ghost is from a game this version does not know.</p>
      </Screen>
    );
  }
  const m = scoreMeasure(spec);
  const play = (camera: CameraMode) => {
    setSeries(null);
    startSession({ ...newSession(withPlayers(spec, 1), [name.trim() || 'Player 1'], camera), ghost });
    go(camera === 'off' ? { name: 'play' } : { name: 'check' });
  };
  return (
    <Screen title="Ghost Challenge">
      <div className="row">
        <Art asset={ASSETS.modes.ghost} size={110} decorative />
        <div className="stack" style={{ flex: 1 }}>
          <span className="sticker sticker--white">{spec.title}</span>
          <h2>{ghost.name}’s ghost</h2>
        </div>
      </div>
      <div className="grid2">
        <div className="stat">
          <strong>{formatValue(ghost.total, m)}</strong>
          <span>{scoreUnit(spec)} to beat</span>
        </div>
        <div className="stat">
          <strong>{ghost.best ? formatValue(ghost.best.value, ghost.best.measure) : '–'}</strong>
          <span>best moment</span>
        </div>
      </div>
      <p className="rules">{spec.one_line_rules}</p>
      <label className="stack">
        <span className="note">Your name</span>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
      </label>
      <BigButton tone="green" icon="📷" onClick={() => play('camera')}>
        Race the ghost (camera)
      </BigButton>
      <BigButton tone="ghost" icon="👆" onClick={() => play('off')}>
        Race the ghost (tap mode)
      </BigButton>
    </Screen>
  );
}
