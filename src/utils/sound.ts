import { Howl, Howler } from 'howler';

const MUTE_STORAGE_KEY = 'hs_sound_muted';
const SAMPLE_RATE = 44100;

// Encode a normalized Float32Array into a 16-bit PCM WAV data URI
// so Howler plays with zero external network dependencies and studio-grade clarity.
function encodeWavDataUri(samples: Float32Array, sampleRate = SAMPLE_RATE): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// Deterministic pseudo-random generator so the paper grain is consistently smooth every session
function createSeededRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

// Luxury heavy-linen parchment page turn (~340ms) synced to the 0.34s BookMenu choreography:
// 1) Soft air lift (0-90ms) -> 2) Warm swept bandpass parchment glide (90-240ms) -> 3) Cushioned page settle (230-340ms)
function buildPaperTurnUri(): string {
  const durationSec = 0.34;
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(length);
  const nextWhite = createSeededRng(4207);

  // Paul Kellet pink-noise state
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  // Time-varying biquad bandpass state
  let bpX1 = 0;
  let bpX2 = 0;
  let bpY1 = 0;
  let bpY2 = 0;

  // Warm low-pass silk smoother state (removes harsh >2.8kHz fizz)
  let lpPrev = 0;

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const norm = i / length;

    // 1. Pink noise generation (much warmer, more organic than white noise)
    const white = nextWhite();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    // 2. Smooth sweeping bandpass frequency: rises gently during page arc, lowers on settle
    const arc = Math.sin(Math.PI * Math.pow(norm, 0.85));
    const centerFreq = 380 + 560 * arc; // 380 Hz -> 940 Hz -> 380 Hz
    const Q = 1.45;
    const omega = (2 * Math.PI * centerFreq) / SAMPLE_RATE;
    const alpha = Math.sin(omega) / (2 * Q);
    const cosW = Math.cos(omega);

    const a0 = 1 + alpha;
    const nb0 = alpha / a0;
    const nb1 = 0;
    const nb2 = -alpha / a0;
    const na1 = (-2 * cosW) / a0;
    const na2 = (1 - alpha) / a0;

    const bpOut = nb0 * pink + nb1 * bpX1 + nb2 * bpX2 - na1 * bpY1 - na2 * bpY2;
    bpX2 = bpX1;
    bpX1 = pink;
    bpY2 = bpY1;
    bpY1 = bpOut;

    // 3. Silk low-pass filter (~2400 Hz) to eliminate all metallic/harsh high-frequency edges
    const lpAlpha = 0.24;
    const silky = lpPrev + lpAlpha * (bpOut - lpPrev);
    lpPrev = silky;

    // 4. Tactile two-stage paper envelope: smooth lift + lush glide + gentle settle
    const fadeIn = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, norm / 0.16));
    const fadeOut = Math.pow(Math.max(0, 1 - norm), 1.45);
    const swooshContour = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, norm / 0.78));
    const paperBody = silky * fadeIn * fadeOut * swooshContour * 1.35;

    // 5. Whisper-soft linen settle cushion right around norm = 0.68 (~230ms) as page lands
    let settleThump = 0;
    if (norm >= 0.62) {
      const localT = t - 0.62 * durationSec;
      const thumpEnv =
        Math.sin(Math.min(1, localT / 0.012) * (Math.PI / 2)) *
        Math.exp(-localT * 34);
      settleThump = Math.sin(2 * Math.PI * 112 * localT) * thumpEnv * 0.095;
    }

    samples[i] = Math.max(-0.9, Math.min(0.9, paperBody + settleThump));
  }

  return encodeWavDataUri(samples, SAMPLE_RATE);
}

// Warm muted glassmorphic UI tap chime (~150ms)
function buildWhatsAppTapUri(): string {
  const durationSec = 0.15;
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const norm = i / length;
    const freq = norm < 0.45 ? 659.25 : 880; // E5 -> A5 warm bell
    const attack = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, norm / 0.12));
    const decay = Math.pow(Math.max(0, 1 - norm), 1.8);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * attack * decay * 0.22;
  }
  return encodeWavDataUri(samples, SAMPLE_RATE);
}

// Warm acoustic confirmation interval (~300ms)
function buildOrderConfirmedUri(): string {
  const durationSec = 0.3;
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const norm = i / length;
    const attack = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, norm / 0.1));
    const decay = Math.pow(Math.max(0, 1 - norm), 1.5);
    const f1 = norm < 0.42 ? 523.25 : 659.25; // C5 -> E5
    const f2 = norm < 0.42 ? 783.99 : 987.77; // G5 -> B5
    samples[i] =
      (Math.sin(2 * Math.PI * f1 * t) * 0.62 + Math.sin(2 * Math.PI * f2 * t) * 0.32) *
      attack *
      decay *
      0.22;
  }
  return encodeWavDataUri(samples, SAMPLE_RATE);
}

let paperTurnHowl: Howl | null = null;
let whatsappHowl: Howl | null = null;
let confirmHowl: Howl | null = null;
let activeTurnSoundId: number | null = null;

function getInitialMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let mutedState = getInitialMuted();
try {
  Howler.mute(mutedState);
} catch {}

function ensureHowls() {
  if (typeof window === 'undefined') return;
  if (!paperTurnHowl) {
    paperTurnHowl = new Howl({
      src: [buildPaperTurnUri()],
      volume: 0.38,
      preload: true,
    });
  }
  if (!whatsappHowl) {
    whatsappHowl = new Howl({
      src: [buildWhatsAppTapUri()],
      volume: 0.34,
      preload: true,
    });
  }
  if (!confirmHowl) {
    confirmHowl = new Howl({
      src: [buildOrderConfirmedUri()],
      volume: 0.38,
      preload: true,
    });
  }
}

// Pre-decode audio buffers during user hover/touch so playback starts with 0ms latency
export function warmUpAudio(): void {
  if (mutedState) return;
  try {
    ensureHowls();
  } catch {}
}

export function isSoundMuted(): boolean {
  return mutedState;
}

export function setSoundMuted(muted: boolean): boolean {
  mutedState = muted;
  Howler.mute(muted);
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch {}
  return mutedState;
}

export function toggleSoundMuted(): boolean {
  return setSoundMuted(!mutedState);
}

export function playPageTurn(direction: 1 | -1 = 1): void {
  if (mutedState) return;
  try {
    ensureHowls();
    if (!paperTurnHowl) return;

    // Fade out overlapping previous turn quickly when rapid-clicking chapters
    if (activeTurnSoundId !== null && paperTurnHowl.playing(activeTurnSoundId)) {
      paperTurnHowl.fade(0.38, 0, 45, activeTurnSoundId);
    }

    // Subtle pitch nuance between forward (slightly brighter) and backward (slightly deeper)
    const rate = direction > 0 ? 1.03 : 0.94;
    const id = paperTurnHowl.play();
    activeTurnSoundId = id;
    paperTurnHowl.rate(rate, id);
    paperTurnHowl.volume(0.38, id);
  } catch {}
}

export function playWhatsAppClick(): void {
  if (mutedState) return;
  try {
    ensureHowls();
    whatsappHowl?.play();
  } catch {}
}

export function playOrderConfirmed(): void {
  if (mutedState) return;
  try {
    ensureHowls();
    confirmHowl?.play();
  } catch {}
}
