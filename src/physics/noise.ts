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
  /** the rhythm's waveform at unit power (a narrowband random process), instead of a steady sine */
  rhythm?: Float64Array;
  /** a movement artifact added to the noise, one value per sample (from movementArtifact) */
  motion?: Float64Array;
}

export type Movement = 'none' | 'walking' | 'chewing' | 'nodding' | 'rolling' | 'running';
export interface MovementSettings {
  runUvRms: number; stepHz: number; walkUvRms: number; walkStepHz: number;
  chewBurstUvRms: number; chewBurstS: number; chewPeriodS: number;
  nodHz: number; nodSwingUv: number; nodMuscleUvRms: number;
  roll: [number, number][];
}

/**
 * A movement artifact at one electrode (µV), with its own random generator so that choosing one leaves the
 * other noise sources unchanged. Shapes are modeling choices (claims running-artifact-size, movement-artifact-shapes).
 */
export function movementArtifact(kind: Movement, fs: number, seconds: number, m: MovementSettings, seed = 7): Float64Array {
  const n = Math.round(fs * seconds), out = new Float64Array(n);
  if (kind === 'none') return out;
  const rng = mulberry32(seed);
  // muscle bursts: 20–225 Hz noise at unit rms, gated by a window that is 1 inside a burst
  const muscle = (gate: (t: number) => number, uvRms: number) => {
    const hp = biquad('hp', 20, fs), lp = biquad('lp', Math.min(300, 0.45 * fs), fs);
    const raw = Float64Array.from({ length: n }, () => lp(hp(gaussian(rng))));
    const rms = Math.sqrt(raw.reduce((a, v) => a + v * v, 0) / n) || 1;
    for (let i = 0; i < n; i++) out[i] += (uvRms * raw[i] / rms) * gate(i / fs);
  };
  // a smooth on/off gate: sin² ramps of 50 ms at each end of a burst of length len starting every period
  const bursts = (period: number, len: number, start: number) => (t: number) => {
    const u = (((t - start) % period) + period) % period, r = 0.05;
    return u > len ? 0 : Math.sin((Math.PI / 2) * Math.min(1, u / r, (len - u) / r)) ** 2;
  };
  const harmonics = [[1, 0], [0.6, 0.9], [0.35, 2.1]]; // gait artifact shape, claim running-artifact-size
  const [gaitUv, gaitHz] = kind === 'walking' ? [m.walkUvRms, m.walkStepHz] : [m.runUvRms, m.stepHz];
  const gaitScale = gaitUv / Math.sqrt(harmonics.reduce((a, [h]) => a + h * h / 2, 0));
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    if (kind === 'running' || kind === 'walking') out[i] = gaitScale * harmonics.reduce((a, [h, ph], k) => a + h * Math.sin(2 * Math.PI * (k + 1) * gaitHz * t + ph), 0);
    if (kind === 'nodding') out[i] = m.nodSwingUv * Math.sin(2 * Math.PI * m.nodHz * t);
    if (kind === 'rolling') out[i] = m.roll.reduce((a, [uv, hz], k) => a + uv * Math.sin(2 * Math.PI * hz * t + Math.PI + 1.3 * k), 0);
  }
  if (kind === 'chewing') muscle(bursts(m.chewPeriodS, m.chewBurstS, 0.2), m.chewBurstUvRms);
  if (kind === 'nodding') muscle(bursts(1 / m.nodHz, 0.3 / m.nodHz, 0.15 / m.nodHz), m.nodMuscleUvRms);
  return out;
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
  /** the movement artifact alone (zeros when none was given) */
  motion: Float64Array;
}

export function synthesize(p: NoiseParams): Synth {
  const n = Math.round(p.fs * p.seconds);
  const rng = mulberry32(p.seed);
  const t = new Float64Array(n), signal = new Float64Array(n), noise = new Float64Array(n), total = new Float64Array(n), motion = new Float64Array(n);
  if (p.motion) motion.set(p.motion.subarray(0, n));
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
    signal[i] = p.signalUv * env * (p.rhythm ? p.rhythm[i] * Math.SQRT1_2 : Math.sin(2 * Math.PI * p.signalHz * ti)); // same mean power either way
    let v = emg[i] + pink[i] + p.ampUvRms * gaussian(rng) + mainsUv * Math.sin(2 * Math.PI * mainsHz * ti + 0.3);
    for (const tb of blinkTimes) v += p.blinkUv * Math.exp(-0.5 * Math.pow((ti - tb) / 0.08, 2));
    v += motion[i];
    noise[i] = v;
    total[i] = signal[i] + v;
  }
  const ps = signal.reduce((s, v) => s + v * v, 0) / n;
  const pn = noise.reduce((s, v) => s + v * v, 0) / n;
  return { t, signal, noise, total, snrDb: 10 * Math.log10(ps / Math.max(pn, 1e-30)), blinkTimes, motion };
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
