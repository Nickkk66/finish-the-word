// WebAudio-synthesized sound effects — no audio files.
// The context is created/resumed on user gestures (browser autoplay policy).

const VOLUME = 0.6;

let ctx = null;
let master = null;
let noiseBuffer = null;
let enabled = true;

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = enabled ? VOLUME : 0;
  master.connect(compressor).connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Installs gesture listeners that create/resume the AudioContext (also after iOS interruptions). */
export function initAudio() {
  const unlock = () => {
    const c = ensureContext();
    if (c && c.state !== 'running') c.resume().catch(() => {});
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, true);
}

export function setSoundEnabled(on) {
  enabled = !!on;
  if (master) master.gain.setTargetAtTime(enabled ? VOLUME : 0, ctx.currentTime, 0.02);
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function envelope(gain, t0, vol, attack, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(freq, { type = 'sine', at = 0, dur = 0.15, vol = 0.2, attack = 0.005, slide = 0 } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  envelope(gain, t0, vol, attack, dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ at = 0, dur = 0.2, vol = 0.2, type = 'bandpass', freq = 1000, slide = 0, q = 1, attack = 0.005 } = {}) {
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t0);
  if (slide) filter.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  const gain = ctx.createGain();
  envelope(gain, t0, vol, attack, dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.02);
}

/** Springy "boing" (sine with a decaying vibrato). */
function boing(at) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t0);
  osc.frequency.exponentialRampToValueAtTime(430, t0 + 0.12);
  osc.frequency.exponentialRampToValueAtTime(240, t0 + 0.65);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 17;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(90, t0);
  depth.gain.exponentialRampToValueAtTime(1, t0 + 0.65);
  lfo.connect(depth).connect(osc.frequency);
  const gain = ctx.createGain();
  envelope(gain, t0, 0.3, 0.01, 0.7);
  osc.connect(gain).connect(master);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + 0.75);
  lfo.stop(t0 + 0.75);
}

const sounds = {
  heartbeat() { tone(55,{dur:.16,vol:.22,slide:35});tone(48,{at:.2,dur:.2,vol:.17,slide:28}); },
  omen() { tone(75,{dur:5,vol:.14,slide:30}); noise({type:'lowpass',freq:220,dur:5,vol:.22,attack:.5}); },
  impact() { noise({type:'lowpass',freq:450,slide:60,dur:1.8,vol:.5});tone(70,{dur:1.5,vol:.35,slide:22}); },
  soul() { tone(500,{type:'sine',dur:1.6,vol:.09,slide:1400}); },
  click() {
    tone(760, { type: 'triangle', dur: 0.05, vol: 0.16 });
    tone(1520, { dur: 0.03, vol: 0.05 });
  },
  /** soft = someone else typing (quieter). */
  key(soft = false) {
    const v = soft ? 0.35 : 1;
    tone(1500 + Math.random() * 500, { type: 'square', dur: 0.025, vol: 0.035 * v });
    noise({ type: 'highpass', freq: 3500, dur: 0.03, vol: 0.08 * v });
  },
  submit() {
    tone(420, { type: 'triangle', slide: 900, dur: 0.1, vol: 0.2 });
  },
  pick() {
    tone(midi(79), { type: 'triangle', dur: 0.12, vol: 0.18 });
    tone(midi(86), { type: 'triangle', at: 0.08, dur: 0.28, vol: 0.18 });
  },
  /** "It's your turn" chime. */
  turn() {
    tone(midi(88), { type: 'triangle', dur: 0.1, vol: 0.18 });
    tone(midi(93), { type: 'triangle', at: 0.09, dur: 0.1, vol: 0.18 });
    tone(midi(100), { at: 0.18, dur: 0.35, vol: 0.12 });
  },
  correct() {
    [72, 76, 79, 84].forEach((n, i) => tone(midi(n), { type: 'triangle', at: i * 0.06, dur: 0.34, vol: 0.2 }));
    tone(midi(96), { at: 0.18, dur: 0.45, vol: 0.06 });
  },
  /** soft = someone else's wrong word. */
  wrong(soft = false) {
    const v = soft ? 0.5 : 1;
    tone(150, { type: 'sawtooth', slide: 115, dur: 0.14, vol: 0.12 * v });
    tone(150, { type: 'sawtooth', at: 0.17, slide: 100, dur: 0.2, vol: 0.12 * v });
    tone(75, { type: 'square', dur: 0.36, vol: 0.06 * v });
  },
  tick(final = false) {
    tone(final ? 1760 : 1320, { dur: 0.06, vol: 0.22 });
    tone(final ? 880 : 660, { type: 'square', dur: 0.03, vol: 0.05 });
  },
  heart() {
    tone(midi(76), { type: 'square', slide: midi(64), dur: 0.22, vol: 0.1 });
    tone(midi(69), { type: 'triangle', at: 0.14, slide: midi(52), dur: 0.45, vol: 0.2 });
    noise({ type: 'lowpass', freq: 600, dur: 0.25, vol: 0.18 });
  },
  eliminated() {
    noise({ type: 'bandpass', freq: 300, slide: 3200, q: 2, dur: 0.45, vol: 0.28, attack: 0.08 });
    boing(0.3);
  },
  win() {
    const seq = [[67, 0, 0.13], [72, 0.13, 0.13], [76, 0.26, 0.13], [79, 0.39, 0.3], [76, 0.72, 0.12], [79, 0.86, 0.75]];
    for (const [n, at, dur] of seq) {
      tone(midi(n), { type: 'square', at, dur: dur + 0.05, vol: 0.07 });
      tone(midi(n), { type: 'triangle', at, dur: dur + 0.1, vol: 0.16 });
    }
    for (const n of [64, 72, 84]) tone(midi(n), { type: 'triangle', at: 0.86, dur: 0.85, vol: 0.09 });
    noise({ type: 'highpass', freq: 6000, at: 0.86, dur: 0.8, vol: 0.08, attack: 0.01 });
  },
  /** go = the final "GO!" beep. */
  countdown(go = false) {
    if (go) {
      tone(midi(84), { type: 'square', dur: 0.5, vol: 0.11 });
      tone(midi(72), { type: 'triangle', dur: 0.5, vol: 0.16 });
    } else {
      tone(midi(76), { type: 'square', dur: 0.14, vol: 0.1 });
    }
  },
  coin(combo = 0) {
    tone(midi(83 + Math.min(12, combo)), { type: 'square', dur: 0.08, vol: 0.09 });
    tone(midi(88 + Math.min(12, combo)), { type: 'square', at: 0.08, dur: 0.34, vol: 0.09 });
  },
  heartbeat() {
    tone(75, { dur: 0.13, vol: 0.24 });
    tone(65, { at: 0.18, dur: 0.14, vol: 0.19 });
  },
  levelUp() {
    [72, 76, 79, 84, 91].forEach((n, i) => tone(midi(n), { type: 'triangle', at: i * 0.1, dur: 0.4, vol: 0.18 }));
  },
  chat() {
    tone(880, { slide: 1320, dur: 0.07, vol: 0.1 });
  },
  thud() {
    tone(140, { slide: 70, dur: 0.18, vol: 0.35 });
    noise({ type: 'lowpass', freq: 400, dur: 0.1, vol: 0.2 });
  },
  hatch() {
    noise({ type: 'bandpass', freq: 800, slide: 6000, q: 1.5, dur: 0.35, vol: 0.22, attack: 0.02 });
    [72, 76, 79, 84, 88, 91].forEach((n, i) => tone(midi(n), { type: 'triangle', at: 0.05 + i * 0.05, dur: 0.3, vol: 0.14 }));
    for (const n of [72, 76, 79, 84]) tone(midi(n), { at: 0.38, dur: 1, vol: 0.07 });
    noise({ type: 'highpass', freq: 7000, at: 0.38, dur: 0.9, vol: 0.05 });
  },
};

/** sfx.correct(), sfx.key(true), ... — silently no-ops until audio is unlocked or when muted. */
export const sfx = Object.fromEntries(
  Object.entries(sounds).map(([name, play]) => [name, (...args) => {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    play(...args);
  }]),
);
