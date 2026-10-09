// Voice out for Open Mode: the browser's built-in speech (works offline on
// most phones). Phase 3 adds referee line banks; Phase 7 adds OpenAI voice.

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: { interrupt?: boolean; rate?: number } = {}) {
  if (!canSpeak() || !text) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1.05;
  u.lang = 'en-US';
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
