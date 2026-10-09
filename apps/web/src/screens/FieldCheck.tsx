import { useEffect, useMemo, useRef, useState } from 'react';
import { BigButton, PlayerTag } from '@fieldday/ui';
import {
  PoseEventDetector,
  allGood,
  calibrate,
  fieldCheck,
  hueHistogram,
  torsoBox,
  type CheckItem,
  type VisionFrame,
  type Zone,
} from '@fieldday/vision';
import { Art } from '../Art.js';
import { ASSETS } from '../assets.js';
import { go, href } from '../router.js';
import { speak } from '../speech.js';
import { useApp } from '../store.js';
import { watchShake } from '../vision/camera.js';
import { FixtureRecorder, downloadJson } from '../vision/recorder.js';
import { useVision } from '../vision/useVision.js';
import { Screen } from './Layout.js';

type Placing = { kind: 'zone'; name: string } | { kind: 'line' } | null;

export function FieldCheck() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const update = useApp((s) => s.updateSession);
  const t0 = useRef(performance.now());
  const clock = () => performance.now() - t0.current;
  const [shake, setShake] = useState<number | null>(null);
  const [space, setSpace] = useState(false);
  const [placing, setPlacing] = useState<Placing>(null);
  const [calibrating, setCalibrating] = useState<number | null>(null);
  const [calMsg, setCalMsg] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [, setTick] = useState(0);
  const latest = useRef<VisionFrame | null>(null);
  const calDet = useRef<PoseEventDetector | null>(null);
  const recorder = useRef<FixtureRecorder | null>(null);
  const spoken = useRef(new Set<string>());

  const spec = session?.spec ?? null;
  const zones = session?.zones ?? [];
  const lineY = session?.lineY ?? null;
  const calibrations = useMemo(() => session?.calibrations ?? [], [session?.calibrations]);

  const vision = useVision({
    mode: session?.camera ?? 'off',
    spec,
    clock,
    batterySaver: settings.batterySaver,
    calibrations,
    zones,
    lineY,
    onFrame: (f) => {
      latest.current = f;
      calDet.current?.update(f.t, f.poses[0] ?? null, f.height);
      if (recorder.current) recorder.current.push(f);
    },
  });

  useEffect(() => watchShake(setShake), []);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (!session || !spec) {
    return (
      <Screen title="Field Check">
        <p>
          Pick a game first. <a href={href({ name: 'games' })}>Quick Games</a>
        </p>
      </Screen>
    );
  }

  const f = latest.current;
  const items: CheckItem[] = fieldCheck({
    shake: session.camera === 'demo' ? 0 : shake,
    brightness: vision.stats.brightness,
    pose: f?.poses[0] ?? null,
    width: f?.width ?? 1,
    height: f?.height ?? 1,
    needsBall: spec.trackers.includes('ball'),
    ballSeen: vision.stats.ballSeen,
    spaceConfirmed: space,
  });
  const ready = allGood(items);

  // Say each problem once, out loud.
  for (const c of items) {
    if (c.state === 'bad' && !spoken.current.has(c.id) && vision.status === 'running' && settings.voice) {
      spoken.current.add(c.id);
      speak(c.fix);
    }
  }

  const needsZones = spec.targets ?? [];
  const needsLine = [...spec.fouls, ...spec.scoring].some((r) => r.event === 'cross_line');

  const onTapCamera = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placing || !f) return;
    const r = e.currentTarget.getBoundingClientRect();
    // object-fit: cover — map the tap back to video pixels.
    const scale = Math.max(r.width / f.width, r.height / f.height);
    const ox = (r.width - f.width * scale) / 2;
    const oy = (r.height - f.height * scale) / 2;
    const x = (e.clientX - r.left - ox) / scale;
    const y = (e.clientY - r.top - oy) / scale;
    if (placing.kind === 'line') {
      update({ lineY: y });
    } else {
      const size = f.height * 0.12;
      const zone: Zone = { name: placing.name, box: { x: x - size / 2, y: y - size / 2, w: size, h: size } };
      update({ zones: [...zones.filter((z) => z.name !== placing.name), zone] });
    }
    setPlacing(null);
  };

  const startCalibration = (player: number) => {
    const name = session.players[player]!;
    const heightM = settings.heights[name] ?? 1.6;
    calDet.current = new PoseEventDetector();
    setCalibrating(player);
    setCalMsg(`${name}: stand still in view…`);
    if (settings.voice) speak(`${name}, stand still for two seconds.`);
    setTimeout(() => {
      const spans = calDet.current?.standingSpans() ?? [];
      const frame = latest.current;
      const cal = frame ? calibrate(heightM, spans, frame.height) : null;
      calDet.current = null;
      setCalibrating(null);
      if (!cal || !frame) {
        setCalMsg(`Could not see ${name} clearly. Step back so your whole body is on screen, and try again.`);
        return;
      }
      const tb = frame.poses[0] ? torsoBox(frame.poses[0]) : null;
      const hist = tb && session.camera === 'camera' ? shirtHistogram(vision.videoRef.current, tb) : null;
      const cals = [...session.calibrations];
      cals[player] = cal;
      const hists = [...session.histograms];
      hists[player] = hist;
      update({ calibrations: cals, histograms: hists });
      setCalMsg(`${name} calibrated ✓ (about ±10% accurate)`);
      if (settings.voice) speak(`Got it, ${name}.`);
    }, 2200);
  };

  const toggleRecord = () => {
    if (!recording) {
      recorder.current = new FixtureRecorder();
      setRecording(true);
      return;
    }
    const rec = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (rec && rec.count > 0) {
      downloadJson(
        `fieldday-${spec.id ?? 'game'}-${Date.now()}.json`,
        rec.build({
          template: spec.id,
          players: spec.players,
          heightsM: session.players.map((n) => settings.heights[n] ?? 1.6),
          zones: zones.map((z) => ({ name: z.name, box: [z.box.x, z.box.y, z.box.w, z.box.h] })),
        }),
      );
    }
  };

  return (
    <Screen title="Field Check">
      <div
        className="camera"
        onPointerUp={onTapCamera}
        role={placing ? 'button' : undefined}
        aria-label={placing ? 'Tap where to place it' : 'Camera view'}
      >
        <video ref={vision.videoRef} playsInline muted aria-hidden="true" />
        <canvas ref={vision.canvasRef} aria-hidden="true" />
        <div className="camera__hud">
          <span className="camera__fps">{vision.status === 'running' ? `${Math.round(vision.stats.fps)} FPS` : vision.status.toUpperCase()}</span>
          {placing ? <span className="sticker">Tap to place {placing.kind === 'line' ? 'the line' : placing.name}</span> : null}
          {recording ? <span className="sticker sticker--coral">● REC</span> : null}
        </div>
      </div>
      {vision.status === 'loading' ? (
        <div className="row">
          <Art asset={ASSETS.mascot.think} size={72} decorative />
          <p className="note">Loading the camera referee… (first time needs internet, then it works offline)</p>
        </div>
      ) : null}
      {vision.error ? (
        <p className="card card--coral" role="alert">
          Camera problem: {vision.error}. You can still play in tap mode.
        </p>
      ) : null}

      <ul className="checklist" aria-label="Field check">
        {items.map((c) => (
          <li key={c.id} className={c.state === 'ok' ? 'is-ok' : c.state === 'wait' ? 'is-wait' : ''}>
            <span className="checklist__icon" aria-hidden="true">
              {c.state === 'ok' ? '✓' : c.state === 'wait' ? '…' : '✗'}
            </span>
            <span>
              <strong>{c.label}</strong>
              {c.state === 'bad' ? <small style={{ display: 'block' }}>{c.fix}</small> : null}
            </span>
          </li>
        ))}
      </ul>
      {!space ? (
        <BigButton tone="yellow" icon="✓" onClick={() => setSpace(true)}>
          Space is clear
        </BigButton>
      ) : null}

      <fieldset className="field">
        <legend>Calibrate</legend>
        <p className="note">Type each height once, then stand in view and tap. This turns pixels into metres.</p>
        {session.players.map((name, i) => (
          <div key={i} className="row">
            <PlayerTag index={i} name={name} />
            <label style={{ flex: 1, minWidth: 110 }}>
              <span className="sr-only">{name} height in cm</span>
              <input
                type="number"
                inputMode="numeric"
                min={80}
                max={230}
                value={Math.round((settings.heights[name] ?? 1.6) * 100)}
                onChange={(e) => setSetting('heights', { ...settings.heights, [name]: Number(e.target.value) / 100 })}
                aria-label={`${name} height in centimetres`}
              />
            </label>
            <span aria-hidden="true">cm</span>
            <BigButton
              tone={session.calibrations[i] ? 'green' : 'yellow'}
              disabled={calibrating !== null || vision.status !== 'running'}
              onClick={() => startCalibration(i)}
            >
              {session.calibrations[i] ? 'Again' : 'Calibrate'}
            </BigButton>
          </div>
        ))}
        {calMsg ? (
          <p className="note" role="status">
            {calMsg}
          </p>
        ) : null}
      </fieldset>

      {needsZones.length || needsLine ? (
        <fieldset className="field">
          <legend>Set up the field</legend>
          {needsZones.map((name) => (
            <BigButton key={name} tone={zones.some((z) => z.name === name) ? 'green' : 'yellow'} onClick={() => setPlacing({ kind: 'zone', name })}>
              Place “{name}”
            </BigButton>
          ))}
          {needsLine ? (
            <BigButton tone={lineY !== null ? 'green' : 'yellow'} onClick={() => setPlacing({ kind: 'line' })}>
              Place the line
            </BigButton>
          ) : null}
          <p className="note">Tap the button, then tap the camera picture where it is.</p>
        </fieldset>
      ) : null}

      <BigButton tone={ready ? 'green' : 'ghost'} icon="▶" onClick={() => go({ name: 'play' })}>
        {ready ? 'All good — start!' : 'Start anyway'}
      </BigButton>
      <BigButton tone="ghost" icon={recording ? '■' : '●'} onClick={toggleRecord}>
        {recording ? 'Stop & save test data' : 'Record test data'}
      </BigButton>
      <p className="note">Recording saves only body points and ball boxes (no video) as a JSON file for tests.</p>
    </Screen>
  );
}

function shirtHistogram(video: HTMLVideoElement | null, box: { x: number; y: number; w: number; h: number }): number[] | null {
  if (!video || !video.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return hueHistogram(img, box);
}
