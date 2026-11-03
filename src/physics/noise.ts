/**
 * Synthetic scalp recording: a neural signal plus the main contaminants recorded outside the skull.
 * All amplitudes in microvolts. The generator is deterministic for a given seed.
 */
import { mulberry32 } from './population';

export interface NoiseParams {
  fs: number; // Hz
  seconds: number;
  signalUv: number; // amplitude of the 10 Hz alpha burst
  signalHz: number;
  emgUvRms: number; // broadband muscle noise, 20–300 Hz
  blinkUv: number; // peak amplitude of eye-blink deflections
  blinksPerMinute: number;
  mainsUvcm: number; // common-mode mains voltage on the body, µV (e.g. 10 000 µV = 10 mV)
  cmrrDb: number; // amplifier common-mode rejection
  imbalanceRatio: number; // |ΔZ_e| / |Z_in| (potential-divider conversion of common mode)
  ampUvRms: number; // amplifier input-referred white noise
  skinUvRms: number; // 1/f-like electrode–skin noise
  seed: number;
  /** optional multiplier on the alpha amplitude as a function of time (default: a slow waxing and waning) */
  envelope?: (t: number) => number;
  /** fixed blink times in seconds, instead of random ones drawn from blinksPerMinute */
  blinkAtS?: number[];
}

/** Simple 2nd-order Butterworth band-pass via two cascaded biquads (bilinear transform). */
function biquad(type: 'lp' | 'hp', fc: number, fs: number) {
  const q = Math.SQRT1_2;
  const w = Math.tan((Math.PI * fc) / fs);
  const k = w * w, n = 1 / (1 + w / q + k);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') { b0 = k * n; b1 = 2 * b0; b2 = b0; }
  else { b0 = n; b1 = -2 * n; b2 = n; }
  const a1 = 2 * (k - 1) * n, a2 = (1 - w / q + k) * n;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Synth {
  t: Float64Array;
  signal: Float64Array;
  noise: Float64Array;
  total: Float64Array;
  snrDb: number;
  /** times (s) of the blink deflections */
  blinkTimes: number[];
}

export function synthesize(p: NoiseParams): Synth {
  const n = Math.round(p.fs * p.seconds);
  const rng = mulberry32(p.seed);
  const t = new Float64Array(n), signal = new Float64Array(n), noise = new Float64Array(n), total = new Float64Array(n);
  // EMG: white → band-pass 20–300 Hz, then scaled to the requested rms
  const hp = biquad('hp', 20, p.fs), lp = biquad('lp', Math.min(300, 0.45 * p.fs), p.fs);
  const emg = new Float64Array(n);
  for (let i = 0; i < n; i++) emg[i] = lp(hp(gaussian(rng)));
  let rms = Math.sqrt(emg.reduce((s, v) => s + v * v, 0) / n) || 1;
  for (let i = 0; i < n; i++) emg[i] *= p.emgUvRms / rms;
  // Skin/electrode noise: pink (1/f) via Paul Kellet's 3-pole approximation
  const pink = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = gaussian(rng);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = b0 + b1 + b2 + w * 0.1848;
  }
  rms = Math.sqrt(pink.reduce((s, v) => s + v * v, 0) / n) || 1;
  for (let i = 0; i < n; i++) pink[i] *= p.skinUvRms / rms;
  // Blinks: positive-going deflections ~0.3 s wide at random times
  const blinkTimes: number[] = p.blinkAtS ? [...p.blinkAtS] : [];
  const expected = p.blinkAtS ? 0 : (p.blinksPerMinute * p.seconds) / 60;
  // blinks are spread through the middle 80% of the window so a whole deflection is visible
  for (let k = 0; k < Math.ceil(expected); k++) if (rng() < expected - k) blinkTimes.push(p.seconds * (0.1 + 0.8 * rng()));
  // Mains: residual after CMRR, plus the common-mode→differential conversion from impedance imbalance
  const mainsUv = p.mainsUvcm * (Math.pow(10, -p.cmrrDb / 20) + p.imbalanceRatio);
  const mainsHz = 60;
  for (let i = 0; i < n; i++) {
    const ti = i / p.fs;
    t[i] = ti;
    // alpha burst: amplitude-modulated 10 Hz (waxing and waning), as in real alpha
    const env = p.envelope ? p.envelope(ti) : 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.4 * ti);
    signal[i] = p.signalUv * env * Math.sin(2 * Math.PI * p.signalHz * ti);
    let v = emg[i] + pink[i] + p.ampUvRms * gaussian(rng) + mainsUv * Math.sin(2 * Math.PI * mainsHz * ti + 0.3);
    for (const tb of blinkTimes) v += p.blinkUv * Math.exp(-0.5 * Math.pow((ti - tb) / 0.08, 2));
    noise[i] = v;
    total[i] = signal[i] + v;
  }
  const ps = signal.reduce((s, v) => s + v * v, 0) / n;
  const pn = noise.reduce((s, v) => s + v * v, 0) / n;
  return { t, signal, noise, total, snrDb: 10 * Math.log10(ps / Math.max(pn, 1e-30)), blinkTimes };
}

/**
 * Event-related average: the evoked response template repeated `trials` times with fresh noise.
 * Returns the single-trial and averaged waveforms over one epoch and the corresponding SNRs.
 */
export function averageTrials(template: Float64Array, noiseRmsUv: number, trials: number, seed: number): { single: Float64Array; averaged: Float64Array; snrSingleDb: number; snrAvgDb: number } {
  const rng = mulberry32(seed);
  const n = template.length;
  const sum = new Float64Array(n);
  let single = new Float64Array(n);
  for (let k = 0; k < trials; k++) {
    const trial = new Float64Array(n);
    for (let i = 0; i < n; i++) trial[i] = template[i] + noiseRmsUv * gaussian(rng);
    if (k === 0) single = trial;
    for (let i = 0; i < n; i++) sum[i] += trial[i];
  }
  const averaged = sum.map((v) => v / trials);
  const ps = template.reduce((s, v) => s + v * v, 0) / n;
  return {
    single,
    averaged,
    snrSingleDb: 10 * Math.log10(ps / (noiseRmsUv * noiseRmsUv)),
    snrAvgDb: 10 * Math.log10((ps * trials) / (noiseRmsUv * noiseRmsUv)),
  };
}
