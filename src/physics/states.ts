/**
 * Section 12: how many named brain states one reading of N electrodes can tell apart.
 *
 * Each state is a set of band-power factors at a few cortical regions of the section 3 sphere. A cap of N electrodes,
 * spread evenly over the upper half of the head, reads every region in a band with section 11's estimator: the best
 * linear estimate of its rhythm with the other sources in the band canceled, or the pseudo-inverse when the cap cannot
 * resolve them, in which case the estimates mix. The decoder's features are the log band powers of those estimates over
 * one window of T seconds. Their scatter follows the gamma model of claim erd-detect (shape B·T); the spread between
 * people, between days and the artifacts' own fluctuation enter as power factors with a lognormal spread. Two states
 * are told apart at the rate Φ(d′/2) of a linear classifier on the features, d′² = Δᵀ Σ⁻¹ Δ.
 */
import { headModes, backgroundShape, targetModes, legendre, legendreSeries, capFactor, phi } from './control';
import { solveShells, modalTransfer } from './sphere';
import { defaultHead } from '../data/params';
import { symmetricEigen } from './linalg';

export type Band = 'slow' | 'theta' | 'alpha' | 'beta';
/** band edges in hertz */
export const BANDS: Record<Band, [number, number]> = { slow: [0.5, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30] };
export const bandWidth = (b: Band) => BANDS[b][1] - BANDS[b][0];

/** a disc of radial dipoles on the cortex sphere: polar angle from the vertex and azimuth (0 = toward the face, 90 = left);
 * `depthM` places the disc on a deeper sphere than the cortex (the eyes), which broadens its scalp pattern */
export interface Source { id: string; band: Band; thetaDeg: number; phiDeg: number; radiusMm: number; depthM?: number }
/** a region the decoder reads: its rhythm's rms amplitude at the scalp straight above it at eyes-open rest */
export interface Region extends Source { restUv: number }
/** an artifact source: `blink` is a Poisson train of deflections (energy per event at the scalp above it, in µV²·s, with a
 * rate per second), `emg` a stationary rhythm (rms at the scalp above it) whose level changes between windows by a
 * lognormal factor of log standard deviation `logSd` */
export type Nuisance = Source & ({ kind: 'blink'; energyUv2s: number; ratePerS: number; event: string } | { kind: 'emg'; uvRms: number; logSd: number });
export interface NamedState { id: string; name: string; factors: Record<string, number>; eyesClosed?: boolean }
export interface ModelCfg {
  regions: Region[];
  nuisances: Nuisance[];
  /** brain background per electrode in each band, µV rms (claim band-background) */
  bgUv: Record<Band, number>;
  /** electrode noise, white, given as the rms in a 3 Hz band (claim skin-noise) */
  noiseUvPer3Hz: number;
}
export interface Settings {
  N: number;
  T: number;
  /** what the decoder's baseline is: this session's, the same person's from another day, or the population's */
  calibration: 'session' | 'day' | 'none';
  artifacts: 'removed' | 'present';
  /** spread of resting log power between people (natural log units) and its day-to-day reliability per band (intraclass correlation) */
  betweenSd: number;
  retest: Record<Band, number>;
  /** separation d′ that counts as told apart (2.563 for 9 readings in 10) */
  dStar: number;
}
export const D_STAR_90 = 2 * 1.2815515655; // Φ(d′/2) = 0.9

const EXACT_UP_TO = 256;
const unit = (thetaDeg: number, phiDeg: number): [number, number, number] => {
  const t = (thetaDeg * Math.PI) / 180, p = (phiDeg * Math.PI) / 180;
  return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
};
const dot = (a: number[], b: number[]) => Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
const RIM_DEG = 80, GRID_DEG = 2.5;
const mid = (ph: number) => (Math.abs(ph) < 1e-9 || Math.abs(Math.abs(ph) - 180) < 1e-9 ? 0 : 1);
let sequence: [number, number, number][] | null = null;
/**
 * The electrode positions as a nested sequence: the vertex first, then each new electrode at the grid position on the
 * cap (within 80° of the vertex, 2.5° grid in rings) farthest from every electrode placed so far, ties going to the
 * position nearest the vertex, then on the midline (face before back), then nearest the face, then on the left. So the
 * first N positions are always part of the first N + 1, and more electrodes never read worse. The first five sit at
 * the vertex and at the front, back, left and right of the rim, like Cz, Fpz, Oz, T7 and T8.
 */
export function capLattice(N: number): [number, number, number][] {
  if (!sequence) {
    const cand: [number, number, number][] = [[0, 0, 1]];
    for (let t = GRID_DEG; t <= RIM_DEG + 1e-9; t += GRID_DEG) {
      const th = (t * Math.PI) / 180, n = Math.max(1, Math.round((360 * Math.sin(th)) / GRID_DEG));
      const phis: number[] = [];
      for (let j = 0; j < n; j++) { let ph = (j * 360) / n; if (ph > 180) ph -= 360; phis.push(ph); }
      phis.sort((a, b) => (mid(a) - mid(b)) || Math.abs(a) - Math.abs(b) || b - a); // the midline first (face before back), then nearest the face, then the left (positive azimuth)
      for (const ph of phis) { const p = (ph * Math.PI) / 180; cand.push([Math.sin(th) * Math.cos(p), Math.sin(th) * Math.sin(p), Math.cos(th)]); }
    }
    const far = new Float64Array(cand.length).fill(Infinity), used = new Uint8Array(cand.length);
    sequence = [];
    let pick = 0;
    for (let k = 0; k < cand.length; k++) {
      used[pick] = 1; sequence.push(cand[pick]);
      const c = cand[pick];
      let best = -1, bestD = -1;
      for (let i = 0; i < cand.length; i++) {
        if (used[i]) continue;
        const d = Math.acos(Math.max(-1, Math.min(1, c[0] * cand[i][0] + c[1] * cand[i][1] + c[2] * cand[i][2])));
        if (d < far[i]) far[i] = d;
        if (far[i] > bestD + 1e-12) { bestD = far[i]; best = i; }
      }
      if (best < 0) break;
      pick = best;
    }
  }
  return sequence.slice(0, Math.min(N, sequence.length));
}
const modeCache = new Map<string, Float64Array>();
/** per-degree coefficients of the scalp potential of a 1 nA·m disc: on the cortex sphere, or on a sphere of radius `depthM` */
function modesOf(src: { radiusMm: number; depthM?: number }): Float64Array {
  const key = `${src.radiusMm}:${src.depthM ?? ''}`;
  let a = modeCache.get(key);
  if (a) return a;
  if (!src.depthM) a = targetModes(src.radiusMm);
  else {
    const head = defaultHead(), L = headModes().c.length - 1, b = src.depthM;
    const T = modalTransfer(solveShells(head.shells, b, 1, 'radial', L)), g = capFactor((src.radiusMm * 1e-3) / b);
    a = new Float64Array(L + 1);
    for (let l = 1; l <= L; l++) a[l] = (1e-9 * T[l] * (2 * l + 1) * g[l]) / (4 * Math.PI * b * b);
  }
  modeCache.set(key, a);
  return a;
}
/** a Legendre series tabulated on cos γ ∈ [−1, 1] for fast lookup (the kernels are smooth; linear interpolation) */
const TAB = 8192;
const tableCache = new Map<Float64Array, Float64Array>();
function tabulated(a: Float64Array): (x: number) => number {
  let t = tableCache.get(a);
  if (!t) { t = new Float64Array(TAB + 1); for (let i = 0; i <= TAB; i++) t[i] = legendreSeries(a, -1 + (2 * i) / TAB); tableCache.set(a, t); }
  const table = t;
  return (x: number) => { const u = ((x + 1) / 2) * TAB, i = Math.min(TAB - 1, Math.max(0, Math.floor(u))), f = u - i; return table[i] * (1 - f) + table[i + 1] * f; };
}
/** the scalp potential straight above a disc, µV per nA·m */
export const peakUvPerNam = (src: { radiusMm: number; depthM?: number }) => { const a = modesOf(src); let s = 0; for (let l = 1; l < a.length; l++) s += a[l]; return s * 1e6; };
const noiseUv = (cfg: ModelCfg, b: Band) => cfg.noiseUvPer3Hz * Math.sqrt(bandWidth(b) / 3);

/** Gram matrix G = Tᵀ C⁻¹ T of the sources' scalp patterns against the band's noise at N electrodes: exact in electrode
 * space up to 256 electrodes, per spherical-harmonic degree above (the cap's density counts as 2N over the sphere) */
function gram(N: number, cfg: ModelCfg, sources: Source[], band: Band): Float64Array {
  const S = sources.length, G = new Float64Array(S * S);
  const bg2 = (cfg.bgUv[band] * 1e-6) ** 2, sn2 = (noiseUv(cfg, band) * 1e-6) ** 2;
  const { kern, norm } = backgroundShape(), { c } = headModes(), LMAX = c.length - 1, beta = bg2 / norm;
  const dirs = sources.map((s) => unit(s.thetaDeg, s.phiDeg));
  if (N <= EXACT_UP_TO) {
    const e = capLattice(N), Lc = new Float64Array(N * N), K = tabulated(kern);
    for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) {
      let s = (bg2 * K(dot(e[i], e[j]))) / norm + (i === j ? sn2 : 0);
      for (let k = 0; k < j; k++) s -= Lc[i * N + k] * Lc[j * N + k];
      Lc[i * N + j] = i === j ? Math.sqrt(Math.max(s, 1e-40)) : s / Lc[j * N + j];
    }
    const w = sources.map((src, p) => {
      const pat = tabulated(modesOf(src)), u = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let s = pat(dot(e[i], dirs[p]));
        for (let k = 0; k < i; k++) s -= Lc[i * N + k] * u[k];
        u[i] = s / Lc[i * N + i];
      }
      return u;
    });
    for (let p = 0; p < S; p++) for (let q = p; q < S; q++) { let s = 0; for (let i = 0; i < N; i++) s += w[p][i] * w[q][i]; G[p * S + q] = G[q * S + p] = s; }
    return G;
  }
  const dens = 2 * N, L = Math.min(Math.floor(Math.sqrt(dens)) - 1, LMAX);
  const C = new Float64Array(LMAX + 1);
  let alias = 0;
  for (let l = 1; l <= LMAX; l++) { C[l] = (beta * c[l] * c[l] * 4 * Math.PI) / ((2 * l + 1) * (2 * l + 1)); if (l > L) alias += (C[l] * (2 * l + 1)) / (4 * Math.PI); }
  const noise = ((sn2 + alias) * 4 * Math.PI) / dens;
  for (let p = 0; p < S; p++) for (let q = p; q < S; q++) {
    const ap = modesOf(sources[p]), aq = modesOf(sources[q]), Pl = legendre(dot(dirs[p], dirs[q]), LMAX);
    let s = 0;
    for (let l = 1; l <= L; l++) s += ((ap[l] * aq[l] * 4 * Math.PI) / (2 * l + 1)) * Pl[l] / (C[l] + noise);
    G[p * S + q] = G[q * S + p] = s;
  }
  return G;
}

/** inverse of a small symmetric positive definite matrix (Gauss–Jordan) */
function invert(A: Float64Array, n: number): Float64Array {
  const a = Float64Array.from(A), inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) inv[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[piv * n + c])) piv = r;
    if (piv !== c) for (let k = 0; k < n; k++) { [a[c * n + k], a[piv * n + k]] = [a[piv * n + k], a[c * n + k]]; [inv[c * n + k], inv[piv * n + k]] = [inv[piv * n + k], inv[c * n + k]]; }
    const d = a[c * n + c];
    for (let k = 0; k < n; k++) { a[c * n + k] /= d; inv[c * n + k] /= d; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r * n + c];
      if (!f) continue;
      for (let k = 0; k < n; k++) { a[r * n + k] -= f * a[c * n + k]; inv[r * n + k] -= f * inv[c * n + k]; }
    }
  }
  return inv;
}
const mul = (A: Float64Array, B: Float64Array, n: number) => { const C = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * B[k * n + j]; C[i * n + j] = s; } return C; };

/** one band read by the cap: amplitude gains from every source of the band to every region's estimate, and the estimates' noise covariance */
interface BandRead {
  band: Band;
  regions: Region[];
  sources: Source[];
  /** gain[k * S + q]: amplitude of source q in the estimate of region k (1 for its own and 0 for the others when the cap resolves them) */
  gain: Float64Array;
  /** noise covariance of the region estimates, (nA·m)² */
  noise: Float64Array;
}
/** a source's typical power, (nA·m)²: the estimator's prior (eyes-open rest for a region, the awake mean for an artifact) */
function restPower(src: Source): number {
  const per = peakUvPerNam(src), n = src as Nuisance;
  if ('restUv' in src) return ((src as Region).restUv / per) ** 2;
  return n.kind === 'emg' ? (n.uvRms / per) ** 2 : (n.ratePerS * n.energyUv2s) / per ** 2;
}
const gramCaches = new WeakMap<ModelCfg, Map<string, Float64Array>>();
/**
 * The decoder's estimate of each region's rhythm is the minimum-mean-square (Wiener) estimate given the modeled
 * sources' typical powers: W = (M + Λ)⁻¹ Tᵀ C⁻¹ with Λ the inverse typical powers. Sources the cap resolves are
 * canceled from each other's estimates; sources it cannot resolve mix, instead of being canceled at any cost.
 */
export function readBand(cfg: ModelCfg, band: Band, N: number, removal: boolean): BandRead {
  const regions = cfg.regions.filter((r) => r.band === band), nuis = cfg.nuisances.filter((n) => n.band === band);
  const sources: Source[] = [...regions, ...nuis], S = sources.length, K = regions.length;
  let cache = gramCaches.get(cfg);
  if (!cache) { cache = new Map(); gramCaches.set(cfg, cache); }
  const key = `${N}:${band}`;
  let G = cache.get(key);
  if (!G) { G = gram(N, cfg, sources, band); if (cache.size > 800) cache.clear(); cache.set(key, G); }
  // the modeled set: the regions, plus the artifacts when the decoder removes them
  const D = removal ? S : K, M = new Float64Array(D * D), A = new Float64Array(D * D);
  for (let p = 0; p < D; p++) for (let q = 0; q < D; q++) { M[p * D + q] = G[p * S + q]; A[p * D + q] = G[p * S + q] + (p === q ? 1 / restPower(sources[p]) : 0); }
  const Ai = invert(A, D), R = mul(Ai, M, D), Sn = mul(mul(Ai, M, D), Ai, D);
  const gain = new Float64Array(K * S), noise = new Float64Array(K * K);
  for (let k = 0; k < K; k++) {
    for (let q = 0; q < D; q++) gain[k * S + q] = R[k * D + q];
    for (let q = D; q < S; q++) { let s = 0; for (let j = 0; j < D; j++) s += Ai[k * D + j] * G[j * S + q]; gain[k * S + q] = s; } // leakage of an unmodeled artifact
    for (let j = 0; j < K; j++) noise[k * K + j] = Sn[k * D + j];
  }
  return { band, regions, sources, gain, noise };
}

/** trigamma ψ′(x): the variance of the log of a gamma variate of shape x */
export function trigamma(x: number): number {
  let s = 0;
  while (x < 6) { s += 1 / (x * x); x += 1; }
  const x2 = x * x;
  return s + 1 / x + 1 / (2 * x2) + 1 / (6 * x2 * x) - 1 / (30 * x2 * x2 * x) + 1 / (42 * x2 * x2 * x2 * x);
}

/** a state as the decoder sees it: feature means (log power of each region's estimate) and their covariance */
export interface Seen { mean: Float64Array; cov: Float64Array }

/** the power of every source of a band in a state, (nA·m)²: regions from their factors, artifacts from their levels */
function sourcePowers(read: BandRead, state: NamedState, set: Settings): { P: Float64Array; logSd: Float64Array; blink: number[] } {
  const S = read.sources.length, P = new Float64Array(S), logSd = new Float64Array(S), blink: number[] = [];
  // a person's level against the decoder's baseline: nothing in the same session, the day-to-day part of the spread when the
  // baseline is another day's (two days differ by √2 of it), the whole spread between people when there is no baseline
  const spread = set.calibration === 'none' ? set.betweenSd : set.calibration === 'day' ? set.betweenSd * Math.sqrt(2 * (1 - set.retest[read.band])) : 0;
  read.sources.forEach((src, q) => {
    const per = peakUvPerNam(src);
    if ('restUv' in src) { P[q] = ((src as Region).restUv / per) ** 2 * (state.factors[src.id] ?? 1); logSd[q] = spread; return; }
    const n = src as Nuisance;
    if (n.kind === 'emg') { P[q] = (n.uvRms / per) ** 2; logSd[q] = n.logSd; }
    else { P[q] = state.eyesClosed ? 0 : (n.ratePerS * n.energyUv2s) / per ** 2; blink.push(q); }
  });
  return { P, logSd, blink };
}

/** feature means and covariance of one state at the settings */
export function seen(cfg: ModelCfg, state: NamedState, set: Settings): Seen {
  const reads = (Object.keys(BANDS) as Band[]).map((b) => readBand(cfg, b, set.N, set.artifacts === 'removed'));
  const ids = cfg.regions.map((r) => r.id), F = ids.length, mean = new Float64Array(F), cov = new Float64Array(F * F);
  // every blink event spans several bands: collect the feature sensitivities per event to correlate them across bands
  const events = new Map<string, { c: Float64Array; e: Float64Array; rate: number }>();
  for (const read of reads) {
    const K = read.regions.length, S = read.sources.length, idx = read.regions.map((r) => ids.indexOf(r.id));
    const { P, logSd, blink } = sourcePowers(read, state, set), X = new Float64Array(K * K);
    for (let k = 0; k < K; k++) for (let j = 0; j < K; j++) {
      let s = read.noise[k * K + j];
      for (let q = 0; q < S; q++) s += read.gain[k * S + q] * read.gain[j * S + q] * P[q];
      X[k * K + j] = s;
    }
    const kT = bandWidth(read.band) * set.T, tri = trigamma(kT);
    for (let k = 0; k < K; k++) {
      mean[idx[k]] = Math.log(X[k * K + k]);
      for (let j = 0; j < K; j++) {
        let c = (tri * X[k * K + j] * X[k * K + j]) / (X[k * K + k] * X[j * K + j]);
        for (let q = 0; q < S; q++) { // lognormal spread of a source's power between windows, people or days
          if (!logSd[q]) continue;
          const gk = (read.gain[k * S + q] ** 2 * P[q]) / X[k * K + k], gj = (read.gain[j * S + q] ** 2 * P[q]) / X[j * K + j];
          c += gk * gj * (Math.exp(logSd[q] * logSd[q]) - 1);
        }
        cov[idx[k] * F + idx[j]] = c;
      }
    }
    for (const q of blink) {
      const n = read.sources[q] as Extract<Nuisance, { kind: 'blink' }>;
      if (state.eyesClosed) continue;
      let ev = events.get(n.event);
      if (!ev) { ev = { c: new Float64Array(F), e: new Float64Array(F), rate: n.ratePerS }; events.set(n.event, ev); }
      // per-window power of the event train: mean rate·E, variance rate·E²/T (Poisson), E in (nA·m)²·s at the source
      const per = peakUvPerNam(n), E = n.energyUv2s / per ** 2;
      for (let k = 0; k < K; k++) { ev.c[idx[k]] = read.gain[k * S + q] ** 2 / X[k * K + k]; ev.e[idx[k]] = E; }
    }
  }
  for (const { c, e, rate } of events.values()) for (let k = 0; k < F; k++) for (let j = 0; j < F; j++) cov[k * F + j] += (c[k] * e[k] * c[j] * e[j] * rate) / set.T;
  return { mean, cov };
}

/** d′ between two states: the Mahalanobis distance of their feature means in their mean covariance (pseudo-inverse) */
export function separation(a: Seen, b: Seen): number {
  const F = a.mean.length, S = new Float64Array(F * F);
  for (let i = 0; i < F * F; i++) S[i] = 0.5 * (a.cov[i] + b.cov[i]);
  const { values, vectors } = symmetricEigen(S, F), cut = 1e-9 * Math.max(...values, 0);
  let d2 = 0;
  for (let i = 0; i < F; i++) {
    if (values[i] <= cut) continue;
    let proj = 0;
    for (let k = 0; k < F; k++) proj += vectors[k * F + i] * (a.mean[k] - b.mean[k]);
    d2 += (proj * proj) / values[i];
  }
  return Math.sqrt(d2);
}
/** share of single readings that a linear classifier calls correctly between two equally likely states */
export const pairCorrect = (d: number) => phi(d / 2);

export interface Outcome {
  /** pairwise d′ and accuracy between the named states */
  d: Float64Array;
  acc: Float64Array;
  /** the largest set of named states that are pairwise told apart at d′ ≥ dStar */
  apart: number[];
  /** estimate of how many states the feature space could hold at this resolution */
  cells: number;
  /** the pair with the lowest accuracy */
  worst: [number, number];
}
/** everything the figure shows at one setting */
export function evaluate(cfg: ModelCfg, states: NamedState[], set: Settings): Outcome {
  const M = states.length, views = states.map((s) => seen(cfg, s, set)), d = new Float64Array(M * M), acc = new Float64Array(M * M);
  let worst: [number, number] = [0, 1], low = Infinity;
  for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
    const v = separation(views[i], views[j]);
    d[i * M + j] = d[j * M + i] = v;
    acc[i * M + j] = acc[j * M + i] = pairCorrect(v);
    if (v < low) { low = v; worst = [i, j]; }
  }
  for (let i = 0; i < M; i++) acc[i * M + i] = 0.5;
  return { d, acc, apart: maxClique(M, (i, j) => d[i * M + j] >= set.dStar), cells: cellCount(cfg, states, set), worst };
}
/** inverse of the standard normal cumulative distribution (Acklam's rational approximation, refined by one Newton step) */
export function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const dd = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x: number;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const e = phi(x) - p;
  return x - (e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2));
}

/** the largest set of vertices that are pairwise joined (branch and bound, fine for a few dozen states) */
export function maxClique(n: number, joined: (i: number, j: number) => boolean): number[] {
  let best: number[] = [];
  const grow = (chosen: number[], candidates: number[]) => {
    if (chosen.length + candidates.length <= best.length) return;
    if (!candidates.length) { best = chosen; return; }
    for (let i = 0; i < candidates.length; i++) {
      const v = candidates[i];
      if (chosen.length + candidates.length - i <= best.length) return;
      grow([...chosen, v], candidates.slice(i + 1).filter((u) => joined(v, u)));
    }
  };
  grow([], Array.from({ length: n }, (_, i) => i));
  return best.sort((a, b) => a - b);
}

/**
 * How many states the features could hold: the box each region's log power spans across the named states, measured
 * through the cap at the box's center and whitened by the reading's covariance, counted in cells one d′ = dStar wide along
 * each principal direction (1 + extent/dStar per direction, the product over directions). An estimate, exact for
 * independent features.
 */
export function cellCount(cfg: ModelCfg, states: NamedState[], set: Settings): number {
  const K = cfg.regions.length, lo = new Float64Array(K).fill(Infinity), hi = new Float64Array(K).fill(-Infinity);
  cfg.regions.forEach((r, k) => { for (const s of states) { const v = Math.log(s.factors[r.id] ?? 1); lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); } });
  const center: NamedState = { id: 'center', name: 'center', factors: Object.fromEntries(cfg.regions.map((r, k) => [r.id, Math.exp((lo[k] + hi[k]) / 2)])) };
  const view = seen(cfg, center, set), reads = (Object.keys(BANDS) as Band[]).map((b) => readBand(cfg, b, set.N, set.artifacts === 'removed'));
  const ids = cfg.regions.map((r) => r.id), F = K;
  // Jacobian of the feature means with respect to the regions' log powers, times the box's extent per region
  const J = new Float64Array(F * K);
  for (const read of reads) {
    const Kb = read.regions.length, S = read.sources.length, idx = read.regions.map((r) => ids.indexOf(r.id)), { P } = sourcePowers(read, center, set);
    for (let k = 0; k < Kb; k++) {
      const x = Math.exp(view.mean[idx[k]]);
      for (let q = 0; q < Kb; q++) J[idx[k] * K + idx[q]] = ((read.gain[k * S + q] ** 2 * P[q]) / x) * (hi[idx[q]] - lo[idx[q]]);
    }
  }
  // Gram of the whitened box edges: Jᵀ Σ⁺ J, with Σ⁺ from the covariance's eigenvectors
  const { values, vectors } = symmetricEigen(view.cov, F), cut = 1e-9 * Math.max(...values, 0), W = new Float64Array(F * K);
  for (let i = 0; i < F; i++) {
    if (values[i] <= cut) continue;
    for (let q = 0; q < K; q++) { let p = 0; for (let k = 0; k < F; k++) p += vectors[k * F + i] * J[k * K + q]; for (let k = 0; k < F; k++) W[k * K + q] += (vectors[k * F + i] * p) / values[i]; }
  }
  const Gm = new Float64Array(K * K);
  for (let p = 0; p < K; p++) for (let q = 0; q < K; q++) { let s = 0; for (let k = 0; k < F; k++) s += J[k * K + p] * W[k * K + q]; Gm[p * K + q] = s; }
  let count = 1;
  for (const v of symmetricEigen(Gm, K).values) count *= 1 + Math.sqrt(Math.max(v, 0)) / set.dStar;
  return count;
}

/** the share of a Gaussian deflection's energy (standard deviation `sigmaS` in time) that falls in a band */
export function gaussianBandShare(sigmaS: number, band: Band): number {
  // one-sided energy density ∝ exp(−4π²σ²f²); the share is the difference of the error function at the band edges
  const s = 2 * Math.PI * sigmaS, erf = (x: number) => { const t = 1 / (1 + 0.3275911 * x); return 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); };
  const [f0, f1] = BANDS[band];
  return erf(s * f1) - erf(s * f0);
}

/** for tests: the band read at a setting */
export const readBandDebug = readBand;
