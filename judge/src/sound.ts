// Sound effects, synthesized with Web Audio (no files to load). Starts on the first click or key,
// since browsers block audio until then.

let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (m: boolean) => { muted = m; };

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function noise(seconds: number) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function ready() {
  if (muted || !ctx || ctx.state !== 'running') return null;
  return ctx;
}

/** Rubber stamp hitting paper. */
export function thud(heavy = false) {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.setValueAtTime(heavy ? 120 : 160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(heavy ? 0.9 : 0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g).connect(c.destination);
  osc.start(t); osc.stop(t + 0.26);
  const n = noise(0.08); const f = c.createBiquadFilter(); const ng = c.createGain();
  f.type = 'lowpass'; f.frequency.value = 1200; ng.gain.setValueAtTime(0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  n.connect(f).connect(ng).connect(c.destination); n.start(t);
}

/** Tape ripping off (declassify) or the big paper tear (the split). */
export function rip(long = false) {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  const dur = long ? 1.1 : 0.35;
  const n = noise(dur); const f = c.createBiquadFilter(); const g = c.createGain();
  f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(long ? 600 : 1800, t);
  f.frequency.exponentialRampToValueAtTime(long ? 3200 : 5200, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(long ? 0.5 : 0.4, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f).connect(g).connect(c.destination); n.start(t);
}

/** Small tick for cards landing and money ticking. */
export function tick() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator(); const g = c.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(900, t);
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 0.07);
}

/** Buzzer for BLOCKED. */
export function buzz() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator(); const g = c.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(110, t);
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 0.36);
}
