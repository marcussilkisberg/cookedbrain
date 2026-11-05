/** Procedural sound. No audio files, nothing to download. */

let ctx: AudioContext | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, cutoff: number) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = buf;
  f.type = 'highpass';
  f.frequency.value = cutoff;
  g.gain.value = gain;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not every browser */
  }
};

export const sound = {
  get on() {
    return enabled;
  },
  set on(v: boolean) {
    enabled = v;
  },
  /** Wakes audio inside a user gesture, as browsers require. */
  unlock() {
    ac();
  },
  tick() {
    tone(1400, 0.05, 0.05, 'triangle');
  },
  good() {
    tone(880, 0.09, 0.07, 'triangle');
  },
  bad() {
    tone(150, 0.16, 0.14, 'sawtooth');
    buzz(30);
  },
  /** The pass bell, for a new best. */
  bell() {
    buzz([20, 40, 60]);
    tone(1568, 0.9, 0.09);
    tone(2349, 0.7, 0.05, 'sine', 0.012);
    tone(3136, 0.4, 0.025, 'sine', 0.02);
  },
  sizzle() {
    noise(0.5, 0.035, 4200);
  },
};
