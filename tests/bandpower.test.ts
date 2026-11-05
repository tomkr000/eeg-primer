import { describe, it, expect } from 'vitest';
import { bandPowerModes, finiteWindowPairCorrect, bandNoise } from '../src/physics/control';

describe('finite-window envelope-power comparison', () => {
  it('converges when temporal quadrature and probability integration are refined', () => {
    for (const T of [0.1, 0.239, 1, 4]) for (const [a, b, r] of [[0, 0, 0], [3, 3, -0.984], [0.5, 0.6, -0.46]]) {
      const base = finiteWindowPairCorrect(0.5, 3, T, a, b, r);
      const fine = finiteWindowPairCorrect(0.5, 3, T, a, b, r, 128, 1536);
      expect(Math.abs(base - fine)).toBeLessThan(0.00015);
    }
  });

  it('has the one-complex-sample exponential limit and chance without a class difference', () => {
    expect(finiteWindowPairCorrect(0, 3, 1, 1, 1, -0.9)).toBe(0.5);
    expect(finiteWindowPairCorrect(0.5, 3, 0.0001)).toBeCloseTo(2 / 3, 6);
    expect(finiteWindowPairCorrect(0.5, 3, 0.239)).toBeGreaterThan(0.70);
    const modes = bandPowerModes(3, 0.239);
    expect(modes.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    expect(1 / modes.reduce((s, x) => s + x * x, 0)).toBeGreaterThan(1.27);
  });

  it('retains unequal demixed noise variances and is invariant under exchanging channels', () => {
    for (const T of [0.1, 0.239, 4]) {
      const p = finiteWindowPairCorrect(0.5, 3, T, 0.5, 3, -0.9);
      expect(finiteWindowPairCorrect(0.5, 3, T, 3, 0.5, -0.9)).toBeCloseTo(p, 12);
      expect(finiteWindowPairCorrect(0.5, 3, T, 0.5, 3, 0.9)).toBeCloseTo(p, 12);
      expect(Math.abs(p - finiteWindowPairCorrect(0.5, 3, T, 0.5, 3, -0.9, 192, 1536))).toBeLessThan(0.00015);
      const nearlyShared = finiteWindowPairCorrect(0.5, 3, T, 1e4, 1.01e4, -0.99999);
      expect(Number.isFinite(nearlyShared)).toBe(true);
      expect(Math.abs(nearlyShared - finiteWindowPairCorrect(0.5, 3, T, 1e4, 1.01e4, -0.99999, 192, 1536))).toBeLessThan(0.00015);
    }
  });

  it('agrees with independently synthesized complex Gaussian envelopes, including correlated channel noise', () => {
    const fs = 50, n = 1 << 19, B = 3;
    // Two real lowpass parts make each proper complex envelope; these Fourier
    // simulations do not use the covariance eigenvalues or CDF implementation.
    const z = Array.from({ length: 8 }, (_, k) => bandNoise(n, fs, 0, B, 120 + k));
    for (const [T, noiseA, noiseB, corr] of [[0.24, 0, 0, 0], [0.24, 3, 3, -0.984], [1, 3, 3, -0.984], [0.24, 0.5, 3, -0.5]]) {
      const w = Math.round(T * fs), q = Math.sqrt(1 - corr * corr);
      let correct = 0, count = 0;
      for (let i = 500; i + w < n - 500; i += 200) {
        const firstImagined = count % 2 === 0;
        let a = 0, b = 0;
        for (let j = i; j < i + w; j++) for (let component = 0; component < 2; component++) {
          const x = (firstImagined ? Math.SQRT1_2 : 1) * z[component][j] + Math.sqrt(noiseA) * z[4 + component][j];
          const y = (firstImagined ? 1 : Math.SQRT1_2) * z[2 + component][j] + Math.sqrt(noiseB) * (corr * z[4 + component][j] + q * z[6 + component][j]);
          a += x * x; b += y * y;
        }
        // Both real components have unit variance; subtract their known noise means.
        const choseFirst = a - 2 * w * noiseA < b - 2 * w * noiseB;
        correct += choseFirst === firstImagined ? 1 : 0; count++;
      }
      expect(Math.abs(correct / count - finiteWindowPairCorrect(0.5, B, T, noiseA, noiseB, corr))).toBeLessThan(0.025);
    }
    // Strong anticorrelation changes the power-difference distribution and must
    // not be silently replaced by independent gamma channels.
    expect(finiteWindowPairCorrect(0.5, 3, 3, 3, 3, -0.984) - finiteWindowPairCorrect(0.5, 3, 3, 3, 3, 0)).toBeGreaterThan(0.05);
  });
});
