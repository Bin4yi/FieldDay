// Camera + mic. Video stays on the phone: frames go only to the on-device models.

export async function startCamera(
  video: HTMLVideoElement,
  opts: { facing: 'environment' | 'user'; batterySaver: boolean },
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: opts.facing,
      width: { ideal: opts.batterySaver ? 480 : 720 },
      height: { ideal: opts.batterySaver ? 640 : 960 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Listens to the mic and calls back with each chunk of samples and the
 * time (performance.now clock, ms) of its first sample.
 */
export async function startMic(
  onSamples: (samples: Float32Array, t0: number, sampleRate: number) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is old but works everywhere, and we only need ~10 ms timing.
  const node = ctx.createScriptProcessor(1024, 1, 1);
  node.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    const t0 = performance.now() - (data.length / ctx.sampleRate) * 1000 - (ctx.baseLatency ?? 0) * 1000;
    onSamples(new Float32Array(data), t0, ctx.sampleRate);
  };
  src.connect(node);
  node.connect(ctx.destination);
  return () => {
    node.disconnect();
    src.disconnect();
    void ctx.close();
    stream.getTracks().forEach((t) => t.stop());
  };
}

/** Phone steadiness from the motion sensor: std-dev of acceleration (m/s²). */
export function watchShake(onShake: (v: number) => void): () => void {
  if (typeof DeviceMotionEvent === 'undefined') return () => undefined;
  const buf: number[] = [];
  const on = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    buf.push(Math.hypot(a.x, a.y, a.z));
    if (buf.length > 30) buf.shift();
    const mean = buf.reduce((x, y) => x + y, 0) / buf.length;
    onShake(Math.sqrt(buf.reduce((x, y) => x + (y - mean) ** 2, 0) / buf.length));
  };
  window.addEventListener('devicemotion', on);
  return () => window.removeEventListener('devicemotion', on);
}
