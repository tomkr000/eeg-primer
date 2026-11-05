import { symmetricEigenvalues } from './linalg';

const cache = new Map<string, number[]>();
/** Eigenvalues of the finite-window covariance of a unit-power, proper complex
 * Gaussian envelope with a flat band B wide. Midpoint quadrature of sinc(B(t-s))/T.
 * This models envelope power |z|², not squared real-carrier voltage. */
export function bandPowerModes(B: number, T: number, points = Math.max(32, Math.ceil(8 * B * T))): number[] {
  const key = `${B}:${T}:${points}`, hit = cache.get(key);
  if (hit) return hit;
  const a = new Float64Array(points * points);
  for (let i = 0; i < points; i++) for (let j = 0; j < points; j++) {
    const x = Math.PI * B * T * (i - j) / points;
    a[i * points + j] = (x === 0 ? 1 : Math.sin(x) / x) / points;
  }
  const values = symmetricEigenvalues(a, points, 16).filter((v) => v > 1e-12);
  const sum = values.reduce((s, v) => s + v, 0);
  const modes = values.map((v) => v / sum);
  // Slider values are numerous; do not retain every dense temporal calculation.
  if (cache.size > 64) cache.clear();
  cache.set(key, modes);
  return modes;
}

/** CDF at zero of sum_i λ_i (a E_i + b F_i) - offset, E,F independent Exp(1).
 * Gil-Pelaez inversion on log frequency; scaling leaves the sign unchanged.
 * Fixed deterministic quadrature avoids Monte Carlo jitter in slider plots. */
function differenceCdf(modes: number[], a: number, b: number, offset: number, steps: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(offset));
  a /= scale; b /= scale; offset /= scale;
  const lo = -22, hi = 22, h = (hi - lo) / steps;
  let integral = 0;
  for (let j = 0; j <= steps; j++) {
    const t = Math.exp(lo + j * h);
    let phase = -t * offset, logAmplitude = 0;
    for (const v of modes) {
      const x = t * v * a, y = t * v * b;
      phase += Math.atan(x) + Math.atan(y);
      logAmplitude -= 0.5 * (Math.log1p(x * x) + Math.log1p(y * y));
    }
    integral += (j === 0 || j === steps ? 1 : j % 2 ? 4 : 2) * Math.exp(logAmplitude) * Math.sin(phase);
  }
  return Math.max(0, Math.min(1, 0.5 - integral * h / (3 * Math.PI)));
}

/** Accuracy of a specified finite-window power-comparison decoder, with equal
 * priors and the full covariance of its two demixed channels retained. Noise
 * variances are relative to each source's resting power. The decoder subtracts
 * the known noise baselines before comparing powers. This is a conditional
 * prediction for this statistic, not a bound on arbitrary EEG classifiers. */
export function finiteWindowPairCorrect(depth: number, B: number, T: number, noiseA = 0, noiseB = noiseA, correlation = 0, points?: number, steps = 768): number {
  if (depth <= 0 || !Number.isFinite(noiseA + noiseB)) return 0.5;
  const modes = bandPowerModes(B, T, points);
  const r = Math.max(-1, Math.min(1, correlation));
  const cdf = (sourceA: number, sourceB: number) => {
    const a = sourceA + noiseA, b = sourceB + noiseB, delta = a - b;
    // Expanded determinant avoids cancellation when the demixed noise is nearly perfectly correlated.
    const determinant = sourceA * sourceB + sourceA * noiseB + sourceB * noiseA + noiseA * noiseB * (1 - r * r);
    const root = Math.sqrt(delta * delta + 4 * determinant);
    const positive = delta >= 0 ? (root + delta) / 2 : 2 * determinant / (root - delta);
    const negative = delta <= 0 ? (delta - root) / 2 : -2 * determinant / (root + delta);
    return differenceCdf(modes, positive, negative, noiseA - noiseB, steps);
  };
  return 0.5 * (cdf(1 - depth, 1) + 1 - cdf(1, 1 - depth));
}
