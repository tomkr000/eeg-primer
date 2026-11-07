import type { Band, ModelCfg, NamedState, Nuisance, Region } from '../physics/states';
import { BANDS, gaussianBandShare } from '../physics/states';
import { RAW_DEFAULTS } from '../sections/s07-noise';
import { P } from './params';

/**
 * Section 12's model inputs: the regions whose band power the named states change, the artifact sources, and the
 * named states as power factors relative to eyes-open rest. Every number is tied to a claim in claims.ts (section 12).
 */

// resting rms amplitudes at the scalp above each region, eyes open (claim rest-amplitudes): the alpha regions follow
// section 7's 20 µV eyes-closed alpha (claim alpha-source-chain) divided by the eyes-closed factor (claim eyes-closed-alpha)
const EC_ALPHA = 4;
const SLOW_UV = 5, THETA_UV = 4, BETA_UV = 3.5;
const ALPHA_EC_UV = RAW_DEFAULTS.signalUv / Math.SQRT2; // section 7's 20 µV sine as rms, the eyes-closed textbook rhythm
const ALPHA_EO_UV = ALPHA_EC_UV / Math.sqrt(EC_ALPHA);
export const REGIONS: Region[] = [
  { id: 'slow', band: 'slow', thetaDeg: 25, phiDeg: 0, radiusMm: 30, restUv: SLOW_UV },
  { id: 'theta', band: 'theta', thetaDeg: 36, phiDeg: 0, radiusMm: 20, restUv: THETA_UV },
  { id: 'alphaP', band: 'alpha', thetaDeg: 60, phiDeg: 180, radiusMm: 30, restUv: ALPHA_EO_UV },
  { id: 'muL', band: 'alpha', thetaDeg: 36, phiDeg: 90, radiusMm: 10, restUv: ALPHA_EC_UV },
  { id: 'muR', band: 'alpha', thetaDeg: 36, phiDeg: -90, radiusMm: 10, restUv: ALPHA_EC_UV },
  { id: 'alphaFL', band: 'alpha', thetaDeg: 50, phiDeg: 35, radiusMm: 15, restUv: ALPHA_EO_UV / 2 },
  { id: 'alphaFR', band: 'alpha', thetaDeg: 50, phiDeg: -35, radiusMm: 15, restUv: ALPHA_EO_UV / 2 },
  { id: 'beta', band: 'beta', thetaDeg: 10, phiDeg: 0, radiusMm: 25, restUv: BETA_UV },
];
export const REGION_NAMES: Record<string, string> = {
  slow: 'slow waves, frontal', theta: 'theta, frontal midline', alphaP: 'alpha, posterior', muL: 'mu, left hand area', muR: 'mu, right hand area',
  alphaFL: 'alpha, left frontal', alphaFR: 'alpha, right frontal', beta: 'beta, central',
};

// artifacts: the blink as section 7's Gaussian deflection from a broad source in front of the brain (claim blink-model),
// and muscle at the forehead and the temples (claim emg-beta-level)
const BLINK_SIGMA_S = 0.08, BLINK_ENERGY = RAW_DEFAULTS.blinkUv ** 2 * BLINK_SIGMA_S * Math.sqrt(Math.PI);
const blink = (band: 'slow' | 'theta' | 'alpha'): Nuisance => ({ id: `blink-${band}`, band, kind: 'blink', thetaDeg: 100, phiDeg: 0, radiusMm: 30, depthM: 0.06, event: 'blink', ratePerS: RAW_DEFAULTS.blinksPerMinute / 60, energyUv2s: BLINK_ENERGY * gaussianBandShare(BLINK_SIGMA_S, band) });
export const EMG = { uvRms: 5, logSd: 0.45 };
const emg = (id: string, phiDeg: number): Nuisance => ({ id, band: 'beta', kind: 'emg', thetaDeg: 90, phiDeg, radiusMm: 30, ...EMG });
export const NUISANCES: Nuisance[] = [blink('slow'), blink('theta'), blink('alpha'), emg('emg-front', 0), emg('emg-left', 90), emg('emg-right', -90)];

/** the brain's background in each band at one electrode, µV rms: a 15 µV rms resting EEG over 0.5 to 30 Hz apportioned by a
 * 1/f^1.35 spectrum (claim band-background) */
export const APERIODIC = { totalUv: 15, exponent: 1.35, range: [0.5, 30] as [number, number] };
const share = (a: number, b: number) => (a ** (1 - APERIODIC.exponent) - b ** (1 - APERIODIC.exponent));
export const BACKGROUND = Object.fromEntries((Object.keys(BANDS) as Band[]).map((b) => [b, APERIODIC.totalUv * Math.sqrt(share(...BANDS[b]) / share(...APERIODIC.range))])) as Record<Band, number>;
export const MODEL: ModelCfg = { regions: REGIONS, nuisances: NUISANCES, bgUv: BACKGROUND, noiseUvPer3Hz: 1 };

/** a standardized effect size as a power factor: exp(0.5 g), claim g-to-ratio */
export const G_SCALE = 0.5;
const g = (v: number) => Math.exp(G_SCALE * v);
const alphaAll = (f: number) => ({ alphaP: f, alphaFL: f, alphaFR: f });
const times = (a: Record<string, number>, b: Record<string, number>) => { const out = { ...a }; for (const k in b) out[k] = (out[k] ?? 1) * b[k]; return out; };
const EC = { ...alphaAll(EC_ALPHA), beta: 0.8 }; // claim eyes-closed-alpha
const WORKLOAD = { theta: g(0.68), ...alphaAll(g(-0.25)), beta: g(0.5) }; // claim workload-signature
const half = (f: Record<string, number>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.sqrt(v)]));
/** the N3 slow-wave factor: 75 µV peak to peak, as a sine 26.5 µV rms, over the waking slow level (claim sleep-stages) */
export const N3_SLOW = (75 / (2 * Math.SQRT2) / SLOW_UV) ** 2;
const hand = (col: number) => ({ muL: 1 + P.miResponse[0][col] / 100, muR: 1 + P.miResponse[1][col] / 100 }); // claim mi-matrix
/** power factors relative to eyes-open rest (claim state-table); factors not listed are 1 */
export const STATES: NamedState[] = [
  { id: 'rest-eo', name: 'Resting, eyes open', short: 'Eyes open', factors: {} },
  { id: 'rest-ec', name: 'Resting, eyes closed', short: 'Eyes closed', eyesClosed: true, factors: EC },
  { id: 'calm', name: 'Calm (slow breathing)', short: 'Calm', factors: { ...alphaAll(g(0.5)), theta: g(-0.5) } }, // claim relaxation-signature
  { id: 'meditation', name: 'Meditating, eyes closed', short: 'Meditating', eyesClosed: true, factors: times(EC, { theta: 1.4, ...alphaAll(1.1), beta: 1.2 }) }, // claim meditation-signature
  { id: 'drowsy', name: 'Drowsy', short: 'Drowsy', factors: { theta: g(1.03), ...alphaAll(g(0.85)), slow: g(0.3), beta: g(0.3) } }, // claim drowsiness-signature
  { id: 'focus', name: 'Focused on an easy task', short: 'Focused', factors: half(WORKLOAD) },
  { id: 'workload', name: 'High mental workload', short: 'Workload', factors: WORKLOAD },
  { id: 'stress', name: 'Stressed', short: 'Stressed', factors: { ...alphaAll(g(-0.6)), beta: g(0.31) } }, // claim stress-signature
  { id: 'excited', name: 'Excited (high arousal)', short: 'Excited', factors: { alphaP: 0.94, theta: 0.96 } }, // claim arousal-signature
  { id: 'positive', name: 'Positive mood', short: 'Positive mood', factors: { alphaFL: 0.96 } }, // claim valence-asymmetry
  { id: 'negative', name: 'Negative mood', short: 'Negative mood', factors: { alphaFR: 0.96 } },
  { id: 'memory', name: 'Holding items in memory', short: 'Memory load', factors: { alphaP: 1.2, theta: 1.2 } }, // claim memory-retention-signature
  { id: 'wandering', name: 'Mind wandering, eyes closed', short: 'Mind wandering', eyesClosed: true, factors: times(EC, { theta: 1.22, slow: 1.22, ...alphaAll(0.71), beta: 0.88 }) }, // claim mind-wandering-signature
  { id: 'mi-right', name: 'Imagined right-hand move', short: 'Right hand', factors: hand(0) },
  { id: 'mi-left', name: 'Imagined left-hand move', short: 'Left hand', factors: hand(1) },
  { id: 'n1', name: 'Light sleep (N1)', short: 'N1', eyesClosed: true, factors: { ...alphaAll(0.4), theta: 1.3, slow: 1.3, beta: 0.8 } }, // claim sleep-stages
  { id: 'n2', name: 'Light sleep (N2)', short: 'N2', eyesClosed: true, factors: { ...alphaAll(0.4), theta: 1.5, slow: 3, beta: 0.7 } },
  { id: 'n3', name: 'Deep sleep (N3)', short: 'N3', eyesClosed: true, factors: { slow: N3_SLOW, theta: 1.5, ...alphaAll(0.3), beta: 0.5, muL: 0.5, muR: 0.5 } }, // slow waves at the 75 µV peak-to-peak scoring criterion
  { id: 'rem', name: 'REM sleep', short: 'REM', eyesClosed: true, factors: { ...alphaAll(0.5), theta: 1.2, beta: 0.9 } },
  { id: 'anesthesia', name: 'Anesthetized (propofol)', short: 'Anesthesia', eyesClosed: true, factors: { slow: 10, alphaFL: 8, alphaFR: 8, alphaP: 0.5, beta: 0.5, theta: 2 } }, // claim anesthesia-signature
];

/** where a state's largest change sits and what it is: the region's area, its rhythm and the direction */
export type Area = 'posterior' | 'frontal' | 'hand areas';
export type Rhythm = 'slow waves' | 'theta' | 'alpha' | 'mu' | 'beta';
export interface Signature { area: Area; rhythm: Rhythm; up: boolean; region: string }
const AREA: Record<string, Area> = { slow: 'frontal', theta: 'frontal', alphaP: 'posterior', muL: 'hand areas', muR: 'hand areas', alphaFL: 'frontal', alphaFR: 'frontal', beta: 'frontal' };
const RHYTHM: Record<string, Rhythm> = { slow: 'slow waves', theta: 'theta', alphaP: 'alpha', muL: 'mu', muR: 'mu', alphaFL: 'alpha', alphaFR: 'alpha', beta: 'beta' };
/**
 * The largest change in a state's factors, in log terms, against the rest it is defined from (eyes-open rest, or
 * eyes-closed rest for the states recorded with the eyes closed); ties go to the region with the larger resting
 * amplitude. The reference states themselves are compared with eyes-open rest; it has no signature.
 */
export function signature(state: NamedState): Signature | null {
  const ref = state.eyesClosed && state.id !== 'rest-ec' ? STATES.find((s) => s.id === 'rest-ec')!.factors : {};
  let best: Signature | null = null, size = 0;
  for (const r of REGIONS) {
    const v = Math.log((state.factors[r.id] ?? 1) / (ref[r.id] ?? 1));
    if (Math.abs(v) < 1e-9) continue;
    const bigger = Math.abs(v) > size + 1e-9 || (Math.abs(Math.abs(v) - size) <= 1e-9 && r.restUv > REGIONS.find((q) => q.id === best!.region)!.restUv);
    if (bigger) { size = Math.abs(v); best = { area: AREA[r.id], rhythm: RHYTHM[r.id], up: v > 0, region: r.id }; }
  }
  return best;
}
