// Audio feedback for hikes — TTS announcements + confirmation chime.
//
// iOS quirks worth knowing:
//   - speechSynthesis and AudioContext both need a user-gesture unlock before
//     they'll play. Call `unlockAudio()` from a tap handler (Start button).
//   - When the screen locks or the page is hidden, audio session is suspended.
//     Wake Lock keeps the screen on, which keeps audio working.
//   - iOS will briefly duck other audio (Spotify) to play a TTS utterance, then
//     restore. No extra config required.

const ENABLED_KEY = "audioEnabled";

export function getAudioEnabled(): boolean {
  const v = localStorage.getItem(ENABLED_KEY);
  return v === null ? true : v === "true";
}

export function setAudioEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, String(enabled));
  if (!enabled) {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/** Call from a user-gesture handler so iOS will allow later programmatic playback. */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => { /* ignore */ });
  }
  // Prime speechSynthesis with an empty utterance so subsequent calls are allowed.
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch { /* ignore */ }
}

export function speak(text: string): void {
  if (!getAudioEnabled()) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel(); // drop any queued utterance — fresher info wins
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 1.0;
    synth.speak(u);
  } catch { /* ignore */ }
}

/** Short confirmation chime. type "logged" = rising two-tone; "approach" = single soft beep. */
export function chime(type: "logged" | "approach" = "logged"): void {
  if (!getAudioEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => { /* ignore */ });

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);

  const playTone = (freq: number, start: number, dur: number, peak: number) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + start);
    osc.connect(gain);
    osc.start(now + start);
    osc.stop(now + start + dur);
    gain.gain.exponentialRampToValueAtTime(peak, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
  };

  if (type === "logged") {
    playTone(660, 0, 0.12, 0.25);
    playTone(880, 0.12, 0.16, 0.25);
  } else {
    playTone(520, 0, 0.18, 0.18);
  }
}
