// Discord-style feedback blips for joining/leaving a call, the local mic,
// camera and deafen toggles, and screen shares starting.
// Synthesized with Web Audio so there are no files to load: "on" sounds rise,
// "off" sounds fall, and each control has its own timbre/register so they're
// distinguishable by ear.

type Tone = {
  /** Start frequency in Hz. */
  freq: number;
  /** Optional end frequency for a pitch glide. */
  toFreq?: number;
  /** Offset from the start of the sound, in seconds. */
  at: number;
  duration: number;
};

type SoundSpec = {
  wave: OscillatorType;
  volume: number;
  tones: Tone[];
  /**
   * Relative gains of the harmonic partials (1x, 2x, 3x... the frequency).
   * A few soft overtones give a rounded, bell/marimba-like body instead of a
   * bare beep. Defaults to the fundamental only.
   */
  partials?: number[];
  /**
   * Frequency multipliers for each partial. Defaults to harmonic (1, 2, 3...);
   * inharmonic ratios give a bell/glass ring.
   */
  ratios?: number[];
  /** Low-pass cutoff (Hz) to soften the top end. */
  lowpassHz?: number;
};

const SOUNDS = {
  // Mic: a Discord-style blip - two very short, clean notes (G5 / C6) with a
  // fast decay. Rising for unmute, falling for mute.
  micOn: {
    wave: "sine",
    volume: 0.28,
    partials: [1, 0.2],
    tones: [
      { freq: 784, at: 0, duration: 0.05 },
      { freq: 1046, at: 0.06, duration: 0.08 },
    ],
  },
  micOff: {
    wave: "sine",
    volume: 0.28,
    partials: [1, 0.2],
    tones: [
      { freq: 1046, at: 0, duration: 0.05 },
      { freq: 784, at: 0.06, duration: 0.08 },
    ],
  },
  // Camera: one smooth quick chirp sweep, up for on and down for off.
  cameraOn: {
    wave: "triangle",
    volume: 0.2,
    lowpassHz: 2500,
    tones: [{ freq: 450, toFreq: 900, at: 0, duration: 0.12 }],
  },
  cameraOff: {
    wave: "triangle",
    volume: 0.2,
    lowpassHz: 2500,
    tones: [{ freq: 900, toFreq: 450, at: 0, duration: 0.12 }],
  },
  // Deafen: three lower, rounder notes (E5 / B4 / E4).
  deafen: {
    wave: "sine",
    volume: 0.3,
    tones: [
      { freq: 659, at: 0, duration: 0.07 },
      { freq: 494, at: 0.07, duration: 0.07 },
      { freq: 330, at: 0.14, duration: 0.12 },
    ],
  },
  undeafen: {
    wave: "sine",
    volume: 0.3,
    tones: [
      { freq: 330, at: 0, duration: 0.07 },
      { freq: 494, at: 0.07, duration: 0.07 },
      { freq: 659, at: 0.14, duration: 0.12 },
    ],
  },
  // Joined the room (local user only): a warm rising major chord (C5 / E5 / G5).
  joined: {
    wave: "sine",
    volume: 0.26,
    tones: [
      { freq: 523, at: 0, duration: 0.12 },
      { freq: 659, at: 0.09, duration: 0.12 },
      { freq: 784, at: 0.18, duration: 0.22 },
    ],
  },
  // Left the room (local user only): the join chord in reverse (G5 / E5 / C5).
  left: {
    wave: "sine",
    volume: 0.26,
    tones: [
      { freq: 784, at: 0, duration: 0.12 },
      { freq: 659, at: 0.09, duration: 0.12 },
      { freq: 523, at: 0.18, duration: 0.22 },
    ],
  },
  // Someone started sharing their screen (everyone hears it): a glassy
  // "ting-ting" (G6 then C7) with bell-like overtones and a soft sub-octave
  // underneath for a little body.
  screenShare: {
    wave: "sine",
    volume: 0.24,
    partials: [0.45, 1, 0.35, 0.15],
    ratios: [0.5, 1, 2.4, 5.95],
    tones: [
      { freq: 1568, at: 0, duration: 0.3 },
      { freq: 2093, at: 0.13, duration: 0.4 },
    ],
  },
  // Recording started (everyone in the call hears it): a clear rising
  // "ding-dong-ding" (E5 / A5 / E6) with a soft bell shimmer, so it reads as a
  // status change rather than a control blip.
  recordingStart: {
    wave: "sine",
    volume: 0.26,
    partials: [1, 0.3, 0.12],
    ratios: [1, 2, 3.01],
    lowpassHz: 5000,
    tones: [
      { freq: 659, at: 0, duration: 0.14 },
      { freq: 880, at: 0.11, duration: 0.14 },
      { freq: 1319, at: 0.22, duration: 0.32 },
    ],
  },
} satisfies Record<string, SoundSpec>;

type CallSound = keyof typeof SOUNDS;

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextClass();
  }
  return audioContext;
};

const SOUNDS_STORAGE_KEY = "openside:callSounds";

const readSoundsEnabled = () => {
  try {
    return localStorage.getItem(SOUNDS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

let soundsEnabled = readSoundsEnabled();

export const areCallSoundsEnabled = () => soundsEnabled;

/** The in-call settings toggle; remembered per browser. */
export const setCallSoundsEnabled = (enabled: boolean) => {
  soundsEnabled = enabled;
  try {
    localStorage.setItem(SOUNDS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Still applies for this session.
  }
};

// Build a sound's oscillator graph into any context - the live one, or an
// OfflineAudioContext when pre-rendering - starting at `start` seconds.
const scheduleSound = (
  context: BaseAudioContext,
  spec: SoundSpec,
  start: number,
) => {
  const partials = spec.partials ?? [1];
  const ratios = spec.ratios ?? partials.map((_, index) => index + 1);
  const partialSum = partials.reduce((sum, gain) => sum + gain, 0);

  let output: AudioNode = context.destination;
  if (spec.lowpassHz) {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = spec.lowpassHz;
    filter.connect(context.destination);
    output = filter;
  }

  for (const tone of spec.tones) {
    const toneStart = start + tone.at;
    const toneEnd = toneStart + tone.duration;

    // One envelope per note, shared by its partials. Short attack and an
    // exponential decay so notes don't click and ring out naturally.
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, toneStart);
    envelope.gain.exponentialRampToValueAtTime(spec.volume, toneStart + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    envelope.connect(output);

    partials.forEach((partialGain, index) => {
      const harmonic = ratios[index] ?? index + 1;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = spec.wave;
      oscillator.frequency.setValueAtTime(tone.freq * harmonic, toneStart);
      if (tone.toFreq) {
        oscillator.frequency.exponentialRampToValueAtTime(
          tone.toFreq * harmonic,
          toneEnd,
        );
      }
      // Normalize so adding partials doesn't make the sound louder.
      gain.gain.value = partialGain / partialSum;

      oscillator.connect(gain).connect(envelope);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    });
  }
};

// ---- Pre-rendering --------------------------------------------------------
// Every sound is rendered once into an AudioBuffer (a few KB each, kept in
// memory for the session) and the AudioContext is resumed up front, on the
// user's first click or keypress. After that a sound is just "start this
// buffer now" - no context spin-up and no graph building on the click.

const renderedSounds = new Map<CallSound, AudioBuffer>();
let preparing: Promise<void> | null = null;

const soundLength = (spec: SoundSpec) =>
  Math.max(...spec.tones.map((tone) => tone.at + tone.duration)) + 0.05;

/** Wake the audio engine and pre-render every call sound. Idempotent. */
export const prepareCallSounds = () => {
  const context = getAudioContext();
  if (!context) return;
  // Called from user gestures, so this satisfies autoplay rules.
  if (context.state === "suspended") void context.resume().catch(() => {});
  if (preparing || typeof OfflineAudioContext === "undefined") return;

  preparing = Promise.all(
    (Object.keys(SOUNDS) as CallSound[]).map(async (name) => {
      const spec: SoundSpec = SOUNDS[name];
      const offline = new OfflineAudioContext(
        1,
        Math.ceil(soundLength(spec) * context.sampleRate),
        context.sampleRate,
      );
      scheduleSound(offline, spec, 0);
      renderedSounds.set(name, await offline.startRendering());
    }),
  )
    .then(() => undefined)
    .catch(() => {
      // Fall back to live synthesis; allow another attempt later.
      preparing = null;
    });
};

let warmupInstalled = false;

/**
 * Prepare the sounds on the first click/keypress anywhere on the page - the
 * earliest moment the browser allows audio - so even the first toggle sound
 * plays instantly.
 */
export const installCallSoundsWarmup = () => {
  if (warmupInstalled || typeof window === "undefined") return;
  warmupInstalled = true;
  const options = { once: true, capture: true } as const;
  window.addEventListener("pointerdown", prepareCallSounds, options);
  window.addEventListener("keydown", prepareCallSounds, options);
};

/** How long a sound plays (0 when sounds are switched off). */
export const callSoundDurationMs = (sound: CallSound) =>
  soundsEnabled ? Math.ceil(soundLength(SOUNDS[sound]) * 1000) : 0;

export const playCallSound = (sound: CallSound) => {
  if (!soundsEnabled) return;
  try {
    const context = getAudioContext();
    if (!context) return;
    // Toggles are user clicks, so resuming here satisfies autoplay rules.
    if (context.state === "suspended") void context.resume();

    const rendered = renderedSounds.get(sound);
    if (rendered) {
      const source = context.createBufferSource();
      source.buffer = rendered;
      source.connect(context.destination);
      source.start();
      return;
    }

    // Not pre-rendered yet (very first sound): synthesize live, and render
    // the rest for next time.
    scheduleSound(context, SOUNDS[sound], context.currentTime + 0.01);
    prepareCallSounds();
  } catch {
    // Feedback sounds are best-effort; never let them break a toggle.
  }
};
