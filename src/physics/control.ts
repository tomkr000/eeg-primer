/**
 * What a decoder can get from the scalp: the signal-to-noise ratio (SNR) of one cortical patch's activity against
 * the brain's own background and the electrodes' noise, for any number of electrodes (sections 9 and 11), and the
 * detectability of a change in a rhythm's band power (section 9).
 */
import { solveShells, modalTransfer } from './sphere';
import { applyTransfer } from './fft';
import { mulberry32 } from './population';
import { defaultHead } from '../data/params';

const LMAX = 300;
let modes: { c: Float64Array; b: number; R: number } | null = null;
/** per-degree coefficient c_l (V per A·m) of the scalp potential Σ c_l P_l(cos θ) of a radial point dipole at the pole */
export function headModes() {
  if (modes) return modes;
  const head = defaultHead();
  const sol = solveShells(head.shells, head.sourceRadius, 1, 'radial', LMAX);
  const T = modalTransfer(sol), b = head.sourceRadius;
  const c = new Float64Array(LMAX + 1);
  for (let l = 1; l <= LMAX; l++) c[l] = (T[l] * (2 * l + 1)) / (4 * Math.PI * b * b);
  modes = { c, b, R: head.shells[head.shells.length - 1].outerRadius };
  return modes;
}

/** Legendre polynomials P_0..P_L at x */
function legendre(x: number, L: number): Float64Array {
  const P = new Float64Array(L + 2);
  P[0] = 1; if (L + 1 >= 1) P[1] = x;
  for (let k = 2; k <= L + 1; k++) P[k] = ((2 * k - 1) * x * P[k - 1] - (k - 1) * P[k - 2]) / k;
  return P;
}
/** smoothing of a uniform disc (cap) of angular radius α on degree l, normalized to 1 at l = 0 */
function capFactor(alpha: number): Float64Array {
  const x = Math.cos(alpha), P = legendre(x, LMAX), g = new Float64Array(LMAX + 1);
  g[0] = 1;
  for (let l = 1; l <= LMAX; l++) g[l] = (P[l - 1] - P[l + 1]) / ((2 * l + 1) * (1 - x));
  return g;
}

/** N points spread evenly over a sphere (Fibonacci lattice): cos θ and φ */
function fibonacci(N: number): { z: Float64Array; x: Float64Array; y: Float64Array } {
  const z = new Float64Array(N), x = new Float64Array(N), y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const zi = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(Math.max(0, 1 - zi * zi)), ph = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
    z[i] = zi; x[i] = r * Math.cos(ph); y[i] = r * Math.sin(ph);
  }
  return { z, x, y };
}
/** Σ_l a_l P_l(x) by the three-term recurrence */
function legendreSeries(a: Float64Array, x: number): number {
  let p0 = 1, p1 = x, s = a[0] + a[1] * x;
  for (let l = 2; l < a.length; l++) { const p2 = ((2 * l - 1) * x * p1 - (l - 1) * p0) / l; s += a[l] * p2; p0 = p1; p1 = p2; }
  return s;
}

export interface SnrPoint { N: number; withBrain: number; electrodesOnly: number }

// electrode-space pieces that do not depend on the sliders, cached per electrode count (and patch radius)
const kernCache = new Map<number, Float64Array>();
const targetCache = new Map<string, Float64Array>();
let unitKern: Float64Array | null = null, unitNorm = 0;
function backgroundShape() {
  // covariance between two electrodes for unit β: Σ c_l²/(2l+1) P_l(cos γ); its value at γ = 0 is unitNorm
  if (unitKern) return { kern: unitKern, norm: unitNorm };
  const { c } = headModes();
  unitKern = new Float64Array(LMAX + 1);
  for (let l = 1; l <= LMAX; l++) { unitKern[l] = (c[l] * c[l]) / (2 * l + 1); unitNorm += unitKern[l]; }
  return { kern: unitKern, norm: unitNorm };
}
/** background correlation between every pair of N evenly spread electrodes (1 on the diagonal) */
function correlation(N: number): Float64Array {
  const hit = kernCache.get(N);
  if (hit) return hit;
  const { kern, norm } = backgroundShape(), { x, y, z } = fibonacci(N), K = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
    const cg = Math.max(-1, Math.min(1, x[i] * x[j] + y[i] * y[j] + z[i] * z[j]));
    K[i * N + j] = K[j * N + i] = legendreSeries(kern, cg) / norm;
  }
  kernCache.set(N, K);
  return K;
}
/** per-degree coefficients of the scalp potential of a 1 nA·m disc of radius r under the vertex */
function targetModes(radiusMm: number): Float64Array {
  const { c, b } = headModes(), g = capFactor((radiusMm * 1e-3) / b), a = new Float64Array(LMAX + 1);
  for (let l = 1; l <= LMAX; l++) a[l] = 1e-9 * c[l] * g[l];
  return a;
}
function targetAt(N: number, radiusMm: number): Float64Array {
  const key = `${N}:${radiusMm}`, hit = targetCache.get(key);
  if (hit) return hit;
  const a = targetModes(radiusMm), { z } = fibonacci(N), t = new Float64Array(N);
  for (let i = 0; i < N; i++) t[i] = legendreSeries(a, z[i]);
  targetCache.set(key, t);
  return t;
}

/**
 * Signal-to-noise ratio (SNR) of the best linear (matched-filter) estimate of one patch's activity, per nA·m of its
 * moment, for N electrodes spread evenly over the head sphere. The patch is a uniform disc of radial dipoles under the
 * vertex; the background is independent radial dipoles over the whole cortex sphere, scaled to `bgUv` rms at each
 * electrode; each electrode adds `noiseUv` of white noise. Up to `exactUpTo` electrodes the SNR is computed exactly in
 * electrode space, √(tᵀC⁻¹t); above it, per spherical-harmonic degree, with the degrees beyond the array's resolution
 * (l > √N − 1) folded into the noise. `electrodesOnly` is the same estimate with the background removed.
 */
export function snrVersusElectrodes(Ns: number[], noiseUv: number, bgUv: number, radiusMm: number, exactUpTo = 128): SnrPoint[] {
  const { norm } = backgroundShape();
  const a = targetModes(radiusMm), bg2 = (bgUv * 1e-6) ** 2, sn2 = (noiseUv * 1e-6) ** 2, beta = bg2 / norm;
  // per orthonormal coefficient: target v_l² and background variance C_l
  const v2 = new Float64Array(LMAX + 1), C = new Float64Array(LMAX + 1), { c } = headModes();
  let total2 = 0;
  for (let l = 1; l <= LMAX; l++) {
    v2[l] = (a[l] * a[l] * 4 * Math.PI) / (2 * l + 1); total2 += v2[l];
    C[l] = (beta * c[l] * c[l] * 4 * Math.PI) / ((2 * l + 1) * (2 * l + 1));
  }
  return Ns.map((N) => {
    if (N <= exactUpTo) {
      const K = correlation(N), t = targetAt(N, radiusMm), Lc = new Float64Array(N * N);
      // Cholesky of C = bg²·K + σ²·I, then SNR² = |L⁻¹t|²
      for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) {
        let s = bg2 * K[i * N + j] + (i === j ? sn2 : 0);
        for (let k = 0; k < j; k++) s -= Lc[i * N + k] * Lc[j * N + k];
        Lc[i * N + j] = i === j ? Math.sqrt(Math.max(s, 1e-40)) : s / Lc[j * N + j];
      }
      let s2 = 0, e2 = 0;
      const u = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let s = t[i];
        for (let k = 0; k < i; k++) s -= Lc[i * N + k] * u[k];
        u[i] = s / Lc[i * N + i]; s2 += u[i] * u[i]; e2 += t[i] * t[i];
      }
      return { N, withBrain: Math.sqrt(s2), electrodesOnly: Math.sqrt(e2 / sn2) };
    }
    const L = Math.min(Math.floor(Math.sqrt(N)) - 1, LMAX);
    let alias = 0;
    for (let l = L + 1; l <= LMAX; l++) alias += (C[l] * (2 * l + 1)) / (4 * Math.PI);
    const noise = ((sn2 + alias) * 4 * Math.PI) / N;
    let s2 = 0;
    for (let l = 1; l <= L; l++) s2 += v2[l] / (C[l] + noise);
    return { N, withBrain: Math.sqrt(s2), electrodesOnly: Math.sqrt((total2 * N) / (4 * Math.PI) / sn2) };
  });
}

/**
 * The ceiling, per nA·m: the SNR with the whole scalp potential known exactly (no electrode noise, every degree). The
 * head's transfer cancels, since the target and the background pass through the same head; what is left is the patch
 * against the background sources under its own footprint: SNR² = Σ (2l+1) g_l² / β per (A·m)².
 */
export function ceilingPerNam(bgUv: number, radiusMm: number): number {
  const { norm } = backgroundShape(), { b } = headModes(), g = capFactor((radiusMm * 1e-3) / b);
  const beta = (bgUv * 1e-6) ** 2 / norm;
  let s = 0;
  for (let l = 1; l <= LMAX; l++) s += (2 * l + 1) * g[l] * g[l];
  return 1e-9 * Math.sqrt(s / beta);
}

/**
 * Detectability d′ of a drop in a rhythm's band power by a fraction `depth`, read from one window of T seconds in a band of
 * B hertz: the estimate of a band-limited Gaussian process has about B·T degrees of freedom, so it scatters by ±1/√(BT) of
 * its mean, at rest and during imagery alike. `rho` is the rhythm's power over the noise power in the same channel.
 */
export function dPrime(depth: number, B: number, T: number, rho: number): number {
  const n = 1 / Math.max(rho, 1e-12), rest = 1 + n, task = 1 - depth + n;
  return ((rest - task) * Math.sqrt(B * T)) / Math.sqrt((rest * rest + task * task) / 2);
}
/** regularized lower incomplete gamma function P(k, x): the gamma cumulative distribution (series, or continued fraction above k + 1) */
export function gammaP(k: number, x: number): number {
  if (x <= 0) return 0;
  const lead = Math.exp(-x + k * Math.log(x) - lnGamma(k));
  if (x < k + 1) {
    let term = 1 / k, sum = term;
    for (let n = 1; n < 500 && Math.abs(term) > Math.abs(sum) * 1e-12; n++) { term *= x / (k + n); sum += term; }
    return Math.min(1, sum * lead);
  }
  // Lentz's continued fraction for the upper tail
  let b = x + 1 - k, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - k);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.max(0, 1 - lead * h);
}

/**
 * Rest and imagery windows as the decoder sees them: band-power estimates relative to the resting mean, each gamma
 * distributed with shape k = BT. Returns both means, the shape, the best threshold (where the two densities cross) and the
 * share of windows called correctly with it, rest and imagery equally likely.
 */
export function restVersusImagery(depth: number, B: number, T: number, rho: number) {
  const n = 1 / Math.max(rho, 1e-12), k = B * T;
  const mRest = 1, mTask = (1 - depth + n) / (1 + n);
  const tRest = mRest / k, tTask = mTask / k;
  const threshold = depth > 0 ? (k * Math.log(tRest / tTask)) / (1 / tTask - 1 / tRest) : 1;
  const correct = depth > 0 ? 0.5 * (1 - gammaP(k, threshold / tRest)) + 0.5 * gammaP(k, threshold / tTask) : 0.5;
  return { k, mRest, mTask, tRest, tTask, threshold, correct };
}

/**
 * An m-way choice: the person imagines one of m movements, each lowering the power of its own rhythm, read in its own
 * channel (independent, an upper bound: real scalp patterns overlap); the decoder picks the channel whose power fell
 * most. Returns the share of windows called correctly.
 */
export function mWayCorrect(m: number, depth: number, B: number, T: number, rho: number): number {
  const r = restVersusImagery(depth, B, T, rho), steps = 600, top = r.mRest * (1 + 12 / Math.sqrt(r.k)) + 1;
  let s = 0;
  for (let i = 1; i < steps; i++) {
    const x = (i / steps) * top, w = i % 2 ? 4 : 2;
    s += w * gammaPdf(x, r.k, r.tTask) * Math.pow(1 - gammaP(r.k, x / r.tRest), m - 1);
  }
  return Math.min(1, (s * top) / steps / 3);
}

/**
 * A band-limited Gaussian process: white noise through an ideal band-pass of width B centered on f0, scaled to unit
 * power. Used for the rhythm and for the in-band noise in the simulated recordings of section 9.
 */
export function bandNoise(n: number, fs: number, f0: number, B: number, seed: number): Float64Array {
  const rng = mulberry32(seed), x = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(rng(), 1e-12), v = rng(), r = Math.sqrt(-2 * Math.log(u));
    x[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) x[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  const y = applyTransfer(x, fs, (f) => ({ re: Math.abs(f - f0) <= B / 2 ? 1 : 0, im: 0 }));
  let p = 0; for (let i = 0; i < n; i++) p += y[i] * y[i];
  const s = 1 / Math.sqrt(p / n);
  for (let i = 0; i < n; i++) y[i] *= s;
  return y;
}

/** standard normal cumulative distribution */
export function phi(x: number): number {
  // Abramowitz & Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** Wolpaw's bits per decision for n equally likely classes at accuracy p */
export function wolpawBits(p: number, n = 2): number {
  if (p <= 1 / n) return 0;
  if (p >= 1) return Math.log2(n);
  return Math.log2(n) + p * Math.log2(p) + (1 - p) * Math.log2((1 - p) / (n - 1));
}
/** gamma probability density with shape k and scale θ (the spread of a band-power estimate with k = BT) */
export function gammaPdf(x: number, k: number, theta: number): number {
  if (x <= 0) return 0;
  return Math.exp((k - 1) * Math.log(x) - x / theta - lnGamma(k) - k * Math.log(theta));
}
function lnGamma(z: number): number {
  // Lanczos approximation (g = 7)
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export interface PairPoint { N: number; alone: number; separated: number; electrodesOnly: number; rho: number }
/**
 * Two patches of radius r whose centers lie `sepMm` apart on the cortex (patch A under the vertex, B along a meridian):
 * the SNR per nA·m of the best linear estimate of A alone (B silent), of A with B's activity canceled (the unmixed
 * estimate a decoder needs to tell them apart), and of the canceled estimate with electrode noise alone. rho is the
 * correlation of the two patches' whitened scalp patterns; canceling B keeps a share 1 − rho² of A's SNR².
 * Exact in electrode space up to `exactUpTo` electrodes, per spherical-harmonic degree above, as snrVersusElectrodes.
 */
export function pairVersusElectrodes(Ns: number[], noiseUv: number, bgUv: number, radiusMm: number, sepMm: number, exactUpTo = 128): PairPoint[] {
  const { norm } = backgroundShape(), { c, b } = headModes();
  const a = targetModes(radiusMm), bg2 = (bgUv * 1e-6) ** 2, sn2 = (noiseUv * 1e-6) ** 2, beta = bg2 / norm;
  const th = (sepMm * 1e-3) / b, Pl = legendre(Math.cos(th), LMAX);
  const v2 = new Float64Array(LMAX + 1), C = new Float64Array(LMAX + 1);
  let total2 = 0, cross2 = 0;
  for (let l = 1; l <= LMAX; l++) {
    v2[l] = (a[l] * a[l] * 4 * Math.PI) / (2 * l + 1); total2 += v2[l]; cross2 += v2[l] * Pl[l];
    C[l] = (beta * c[l] * c[l] * 4 * Math.PI) / ((2 * l + 1) * (2 * l + 1));
  }
  // A's SNR² once B is canceled: sA² − x²/sB², where x is the whitened cross product of the two patterns
  const pack = (N: number, sA2: number, sB2: number, x: number, eA2: number, eB2: number, ex: number): PairPoint => ({
    N, alone: Math.sqrt(sA2), separated: Math.sqrt(Math.max(0, sA2 - (x * x) / sB2)),
    electrodesOnly: Math.sqrt(Math.max(0, eA2 - (ex * ex) / eB2)), rho: x / Math.sqrt(sA2 * sB2),
  });
  return Ns.map((N) => {
    if (N <= exactUpTo) {
      const K = correlation(N), tA = targetAt(N, radiusMm), { x, z } = fibonacci(N), tB = new Float64Array(N), Lc = new Float64Array(N * N);
      for (let i = 0; i < N; i++) tB[i] = legendreSeries(a, Math.max(-1, Math.min(1, z[i] * Math.cos(th) + x[i] * Math.sin(th))));
      for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) {
        let s = bg2 * K[i * N + j] + (i === j ? sn2 : 0);
        for (let k = 0; k < j; k++) s -= Lc[i * N + k] * Lc[j * N + k];
        Lc[i * N + j] = i === j ? Math.sqrt(Math.max(s, 1e-40)) : s / Lc[j * N + j];
      }
      const whiten = (t: Float64Array) => { const u = new Float64Array(N); for (let i = 0; i < N; i++) { let s = t[i]; for (let k = 0; k < i; k++) s -= Lc[i * N + k] * u[k]; u[i] = s / Lc[i * N + i]; } return u; };
      const uA = whiten(tA), uB = whiten(tB);
      let sA2 = 0, sB2 = 0, xx = 0, eA2 = 0, eB2 = 0, ex = 0;
      for (let i = 0; i < N; i++) { sA2 += uA[i] * uA[i]; sB2 += uB[i] * uB[i]; xx += uA[i] * uB[i]; eA2 += tA[i] * tA[i]; eB2 += tB[i] * tB[i]; ex += tA[i] * tB[i]; }
      return pack(N, sA2, sB2, xx, eA2 / sn2, eB2 / sn2, ex / sn2);
    }
    const L = Math.min(Math.floor(Math.sqrt(N)) - 1, LMAX);
    let alias = 0;
    for (let l = L + 1; l <= LMAX; l++) alias += (C[l] * (2 * l + 1)) / (4 * Math.PI);
    const noise = ((sn2 + alias) * 4 * Math.PI) / N;
    let sA2 = 0, xx = 0;
    for (let l = 1; l <= L; l++) { sA2 += v2[l] / (C[l] + noise); xx += (v2[l] * Pl[l]) / (C[l] + noise); }
    const k = N / (4 * Math.PI) / sn2;
    return pack(N, sA2, sA2, xx, total2 * k, total2 * k, cross2 * k);
  });
}
/** the pair's ceiling per nA·m: A's estimate with B canceled, the whole scalp potential known exactly (as ceilingPerNam) */
export function pairCeilingPerNam(bgUv: number, radiusMm: number, sepMm: number): number {
  const { norm } = backgroundShape(), { b } = headModes(), g = capFactor((radiusMm * 1e-3) / b), Pl = legendre(Math.cos((sepMm * 1e-3) / b), LMAX);
  const beta = (bgUv * 1e-6) ** 2 / norm;
  let s = 0, x = 0;
  for (let l = 1; l <= LMAX; l++) { const w = (2 * l + 1) * g[l] * g[l]; s += w; x += w * Pl[l]; }
  return 1e-9 * Math.sqrt((s - (x * x) / s) / beta);
}

/** regularized incomplete beta function I_x(a, b) (continued fraction, Numerical Recipes §6.4) */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (a: number, b: number, x: number) => {
    let c = 1, d = 1 - ((a + b) * x) / (a + 1); if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d;
    let h = d;
    for (let m = 1; m < 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (front * cf(a, b, x)) / a : 1 - (front * cf(b, a, 1 - x)) / b;
}

/**
 * Two equally likely movements, each lowering the power of its own region's rhythm, read in two channels with the
 * same noise: the decoder picks the channel whose power fell more. With both estimates gamma distributed with shape
 * k = BT, the share called correctly is exact: P(X_task < X_rest) = I_x(k, k) with x = m_rest / (m_rest + m_task).
 */
export function twoWayCorrect(depth: number, B: number, T: number, rho: number): number {
  const r = restVersusImagery(depth, B, T, rho);
  return betaI(r.k, r.k, r.mRest / (r.mRest + r.mTask));
}
