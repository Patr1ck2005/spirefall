// Procedural sound engine — all effects are synthesized, no audio assets.
// Clean-room note: every sound is an original WebAudio synthesis; nothing is
// sampled, extracted, or traced from the reference game.

type PlayOptions = {
  x?: number;
  y?: number;
  mx?: number;
  my?: number;
  strength?: number;
  priority?: "low" | "high";
};

type Prefs = { muted: boolean; volume: number };

const PREFS_KEY = "spirefall-audio";
const VOICE_CAP = 24;
const THROTTLE_MS = 30;

const loadPrefs = (): Prefs => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null") as Prefs | null;
    if (saved && typeof saved.muted === "boolean" && typeof saved.volume === "number") {
      return { muted: saved.muted, volume: Math.min(1, Math.max(0, saved.volume)) };
    }
  } catch { /* corrupted prefs fall through to defaults */ }
  return { muted: false, volume: 0.8 };
};

const prefs = loadPrefs();

let context: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let activeVoices = 0;
let lastPlayed = new Map<string, number>();
let ambientNodes: { stop: () => void } | undefined;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage unavailable; session-only prefs */ }
}

function ensureContext(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  if (!context) {
    try {
      context = new AudioContext();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 6;
      compressor.connect(context.destination);
      master = context.createGain();
      master.gain.value = prefs.muted ? 0 : prefs.volume;
      master.connect(compressor);
    } catch {
      context = undefined;
      return undefined;
    }
  }
  if (context.state === "suspended") {
    try { void context.resume(); } catch { /* stays suspended until a gesture */ }
  }
  return context;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Exponential-ish envelope: instant attack, decay to silence. */
function applyEnv(gain: GainNode, peak: number, duration: number) {
  const ctx = context!;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(Math.max(0.0001, peak), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
}

/** Pitch-swept oscillator voice. */
function tone(type: OscillatorType, f0: number, f1: number, duration: number, peak: number, dest: AudioNode, delay = 0) {
  const ctx = context!;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f0), t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, peak), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.02);
  osc.onended = () => { activeVoices--; };
  activeVoices++;
}

/** Filtered noise burst with optional filter sweep. */
function noise(duration: number, filterType: BiquadFilterType, f0: number, f1: number, q: number, peak: number, dest: AudioNode, delay = 0) {
  const ctx = context!;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(Math.max(20, f0), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, peak), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + duration + 0.02);
  src.onended = () => { activeVoices--; };
  activeVoices++;
}

/** Inharmonic partial stack for metallic hits. */
function clang(base: number, duration: number, peak: number, dest: AudioNode) {
  const partials = [1, 1.52, 2.34, 3.11, 4.62];
  partials.forEach((ratio, index) => {
    tone("triangle", base * ratio, base * ratio * 0.98, duration * (1 - index * 0.12), peak / (index + 1.4), dest);
  });
}

/** One spatialized output channel with distance attenuation and stereo pan. */
function outputChannel(opts: PlayOptions): { node: AudioNode; gainScale: number } | undefined {
  const ctx = ensureContext();
  if (!ctx || !master) return undefined;
  let gainScale = 1;
  let pan = 0;
  if (opts.x !== undefined && opts.mx !== undefined) {
    const dx = opts.x - opts.mx;
    const dy = (opts.y ?? 0) - (opts.my ?? 0);
    const dist = Math.hypot(dx, dy);
    gainScale = clamp(1 - dist / 900, 0.15, 1);
    pan = clamp(dx / 600, -0.8, 0.8);
  }
  const gain = ctx.createGain();
  gain.gain.value = gainScale;
  let tail: AudioNode = gain;
  if (typeof ctx.createStereoPanner === "function" && pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    tail = panner;
  }
  tail.connect(master);
  return { node: gain, gainScale };
}

function spatialGain(base: number, opts: PlayOptions): number {
  return opts.strength !== undefined ? base * clamp(0.4 + opts.strength * 0.45, 0.4, 1.3) : base;
}

const weapons: Record<string, (out: AudioNode, g: number) => void> = {
  "attack:sidearm:pri": (out, g) => noise(0.045, "highpass", 2400, 1800, 1, g * 0.5, out),
  "attack:sidearm:sec": (out, g) => {
    for (let i = 0; i < 6; i++) noise(0.05, "highpass", 2200, 1500, 1, g * 0.42, out, i * 0.045);
  },
  "attack:scatter:pri": (out, g) => {
    noise(0.24, "lowpass", 1100, 220, 0.8, g * 0.9, out);
    tone("sine", 130, 50, 0.2, g * 0.7, out);
    // M24 weapon signature: the pump-action clack lands after the boom.
    noise(0.045, "bandpass", 2100, 1500, 2.2, g * 0.3, out, 0.17);
    noise(0.03, "bandpass", 1500, 1100, 2.2, g * 0.22, out, 0.24);
  },
  "attack:scatter:sec": (out, g) => noise(0.09, "bandpass", 1400, 800, 0.9, g * 0.34, out),
  "attack:rifle:pri": (out, g) => {
    noise(0.11, "bandpass", 1900, 2600, 2.2, g * 0.3, out);
    tone("sine", 1240, 1180, 0.1, g * 0.12, out);
  },
  "attack:rifle:sec": (out, g) => {
    noise(0.2, "highpass", 2800, 700, 1.6, g * 0.6, out);
    tone("square", 320, 90, 0.18, g * 0.3, out);
  },
  "attack:sniper:pri": (out, g) => {
    noise(0.3, "highpass", 3600, 500, 1.4, g * 0.7, out);
    tone("sawtooth", 1400, 90, 0.26, g * 0.34, out);
  },
  "attack:sniper:sec": (out, g) => {
    tone("sine", 190, 60, 0.2, g * 0.6, out);
    noise(0.12, "lowpass", 900, 300, 0.8, g * 0.4, out);
  },
  "attack:rocket:pri": (out, g) => noise(0.4, "bandpass", 420, 1600, 1.1, g * 0.6, out),
  "attack:rocket:sec": (out, g) => {
    for (let i = 0; i < 3; i++) noise(0.3, "bandpass", 460, 1500, 1.1, g * 0.42, out, i * 0.05);
  },
  "attack:blade:pri": (out, g) => noise(0.11, "bandpass", 1800, 4200, 2.2, g * 0.5, out),
  "attack:blade:sec": (out, g) => {
    noise(0.2, "bandpass", 900, 3800, 1.8, g * 0.6, out);
    tone("sine", 2400, 3300, 0.1, g * 0.16, out, 0.09);
  },
  // Echo Shard: resonant glass ping (primary volley) and a heavy harmonic
  // thud with a crystalline tail (secondary slug).
  "attack:echo:pri": (out, g) => {
    tone("triangle", 1980, 1240, 0.14, g * 0.24, out);
    tone("sine", 2640, 2100, 0.1, g * 0.12, out, 0.02);
  },
  "attack:echo:sec": (out, g) => {
    tone("sine", 220, 90, 0.24, g * 0.5, out);
    tone("triangle", 1560, 780, 0.2, g * 0.2, out, 0.03);
  },
};

const ui: Record<string, (out: AudioNode, g: number) => void> = {
  "ui:click": (out, g) => noise(0.03, "highpass", 2200, 1800, 1, g * 0.3, out),
  "ui:join": (out, g) => tone("triangle", 520, 840, 0.12, g * 0.32, out),
  "ui:leave": (out, g) => tone("triangle", 760, 420, 0.12, g * 0.3, out),
  "ui:start": (out, g) => {
    tone("square", 660, 660, 0.09, g * 0.24, out);
    tone("square", 880, 880, 0.12, g * 0.24, out, 0.12);
  },
  "ui:victory": (out, g) => {
    const notes: Array<[number, number]> = [[440, 0], [554, 0.12], [659, 0.24], [880, 0.38]];
    for (const [freq, delay] of notes) tone("triangle", freq, freq, 0.22, g * 0.3, out, delay);
  },
  "ui:defeat": (out, g) => {
    const notes: Array<[number, number]> = [[330, 0], [277, 0.16], [220, 0.34]];
    for (const [freq, delay] of notes) tone("sawtooth", freq, freq * 0.97, 0.24, g * 0.2, out, delay);
  },
};

const world: Record<string, (out: AudioNode, g: number) => void> = {
  hit: (out, g) => {
    // M24 hit-feel layering: low thud (body) + high crack (impact snap).
    tone("sine", 95, 46, 0.09, g * 0.8, out);
    noise(0.06, "lowpass", 700, 260, 0.7, g * 0.4, out);
    noise(0.035, "highpass", 3400, 1600, 1.1, g * 0.45, out);
  },
  explosion: (out, g) => {
    noise(0.45, "lowpass", 320, 60, 0.6, g, out);
    tone("sine", 68, 27, 0.4, g * 0.9, out);
    // Rumbling tail layered on the same burst (no delayed scheduling needed).
    noise(0.55, "lowpass", 180, 40, 0.5, g * 0.5, out, 0.12);
  },
  dismember: (out, g) => {
    noise(0.1, "bandpass", 1600, 900, 1, g * 0.7, out);
    noise(0.05, "highpass", 3200, 2600, 1, g * 0.4, out, 0.01);
  },
  death: (out, g) => {
    tone("sawtooth", 220, 55, 0.5, g * 0.4, out);
    noise(0.42, "lowpass", 900, 120, 0.7, g * 0.6, out);
  },
  // M20 kill confirm: a bright two-note rising sting distinct from the victim
  // death thud — plays only on the killer's client.
  kill: (out, g) => {
    tone("triangle", 620, 620, 0.08, g * 0.3, out);
    tone("triangle", 930, 930, 0.12, g * 0.3, out, 0.07);
  },
  respawn: (out, g) => {
    tone("sine", 480, 920, 0.22, g * 0.3, out);
    tone("sine", 700, 1280, 0.24, g * 0.24, out, 0.06);
  },
  hazard: (out, g) => clang(210, 0.34, g * 0.75, out),
  impact: (out, g) => {
    noise(0.06, "lowpass", 900, 260, 0.8, g * 0.5, out);
    tone("sine", 170, 70, 0.07, g * 0.4, out);
  },
  // M24 movement audio: soft jump whoosh and a grounded landing thud.
  jump: (out, g) => {
    noise(0.08, "bandpass", 420, 900, 1.2, g * 0.14, out);
    tone("sine", 190, 320, 0.07, g * 0.07, out);
  },
  land: (out, g) => {
    noise(0.07, "lowpass", 520, 160, 0.8, g * 0.26, out);
    tone("sine", 95, 45, 0.08, g * 0.3, out);
  },
  crateSpawn: (out, g) => tone("triangle", 420, 860, 0.14, g * 0.34, out),
  cratePickup: (out, g) => {
    tone("triangle", 640, 1000, 0.09, g * 0.34, out);
    tone("triangle", 960, 1420, 0.1, g * 0.26, out, 0.05);
  },
  repair: (out, g) => {
    tone("sine", 520, 780, 0.14, g * 0.3, out);
    tone("sine", 780, 1170, 0.16, g * 0.28, out, 0.08);
    tone("sine", 1170, 1560, 0.18, g * 0.24, out, 0.16);
  },
  // M25 Canopy storm: a rolling thunder clap — low rumble with a delayed echo.
  thunder: (out, g) => {
    noise(0.7, "lowpass", 240, 50, 0.6, g * 0.5, out);
    noise(1.1, "lowpass", 140, 36, 0.5, g * 0.4, out, 0.18);
    tone("sine", 52, 24, 0.8, g * 0.35, out, 0.05);
  },
};

export const sfx = {
  /** Create/resume the context from a user gesture so later event sounds can play. */
  unlock() {
    ensureContext();
  },

  /** Rising charge tone; call repeatedly while holding so pitch tracks charge. */
  charge(fraction: number, weaponId: string) {
    const out = outputChannel({});
    if (!out) return;
    const base = weaponId === "sniper" ? 180 : 240;
    const f = Math.max(0.05, Math.min(1, fraction));
    tone("sawtooth", base + f * 260, base + f * 420, 0.11, 0.05 + f * 0.05, out.node);
  },

  /** Full-charge rail release: layered boom on top of the normal shot. */
  railBoom() {
    const out = outputChannel({});
    if (!out) return;
    noise(0.5, "lowpass", 900, 90, 0.8, 0.8, out.node);
    tone("sine", 90, 34, 0.45, 0.7, out.node);
    tone("square", 520, 70, 0.3, 0.22, out.node);
  },

  setEnabled(enabled: boolean) {
    prefs.muted = !enabled;
    savePrefs();
    if (master && context) master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, context.currentTime, 0.02);
  },

  setVolume(volume: number) {
    prefs.volume = clamp(volume, 0, 1);
    savePrefs();
    if (master && context && !prefs.muted) master.gain.setTargetAtTime(prefs.volume, context.currentTime, 0.02);
  },

  getPrefs(): Prefs {
    return { ...prefs };
  },

  /** Non-spatial UI sound. */
  ui(name: string) {
    const out = outputChannel({});
    if (!out || activeVoices > VOICE_CAP) return;
    ui[name]?.(out.node, 1);
  },

  /** World sound, spatialized relative to the local pilot when mx/my given. */
  play(name: string, opts: PlayOptions = {}) {
    const def = world[name] ?? weapons[name];
    if (!def) return;
    const highPriority = opts.priority === "high" || name === "explosion" || name === "death" || name === "dismember";
    if (!highPriority && activeVoices > VOICE_CAP) return;
    const now = Date.now();
    const last = lastPlayed.get(name) ?? 0;
    if (now - last < THROTTLE_MS) return;
    lastPlayed.set(name, now);
    if (lastPlayed.size > 64) lastPlayed = new Map([...lastPlayed].slice(-32));
    const out = outputChannel(opts);
    if (!out) return;
    def(out.node, spatialGain(1, opts));
  },

  /** Low industrial hum while a match is live. */
  ambient(on: boolean) {
    const ctx = ensureContext();
    if (!ctx || !master) return;
    if (on && !ambientNodes) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.018, ctx.currentTime, 1.2);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 130;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 45;
      lfo.connect(lfoGain).connect(filter.frequency);
      const voices = [55, 55.8, 110.5].map((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = index === 2 ? "triangle" : "sawtooth";
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
        return osc;
      });
      filter.connect(gain).connect(master);
      lfo.start();
      ambientNodes = {
        stop: () => {
          const t = ctx.currentTime;
          gain.gain.setTargetAtTime(0.0001, t, 0.4);
          for (const osc of [...voices, lfo]) {
            try { osc.stop(t + 1.4); } catch { /* already stopped */ }
          }
        },
      };
    } else if (!on && ambientNodes) {
      ambientNodes.stop();
      ambientNodes = undefined;
    }
  },
};
