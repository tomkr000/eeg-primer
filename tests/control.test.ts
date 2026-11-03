import { describe, it, expect } from 'vitest';
import { snrVersusElectrodes, ceilingPerNam, dPrime, phi, wolpawBits, gammaPdf, gammaP, restVersusImagery, bandNoise, headModes, gammaSample, classifyWindows } from '../src/physics/control';
import { mulberry32 } from '../src/physics/population';

describe('SNR versus electrode count', () => {
  it('the per-degree formula agrees with the exact electrode-space solution', () => {
    for (const N of [64, 128, 256]) {
      const [exact] = snrVersusElectrodes([N], 1, 10, 10, 1000), [modal] = snrVersusElectrodes([N], 1, 10, 10, 0);
      expect(Math.abs(modal.withBrain / exact.withBrain - 1)).toBeLessThan(0.02);
      expect(Math.abs(modal.electrodesOnly / exact.electrodesOnly - 1)).toBeLessThan(0.03);
    }
  });
  it('electrode noise alone falls as √N, the brain background flattens the gain', () => {
    const r = snrVersusElectrodes([256, 1024, 4096, 100000], 1, 10, 10);
    expect(r[1].electrodesOnly / r[0].electrodesOnly).toBeCloseTo(2, 1);
    expect(r[3].withBrain / r[0].withBrain).toBeLessThan(1.5);
    for (const p of r) expect(p.withBrain).toBeLessThan(p.electrodesOnly);
  });
  it('no array beats the ceiling, and a dense quiet one approaches it', () => {
    const top = ceilingPerNam(10, 10), [a, b] = snrVersusElectrodes([1024, 1e8], 0.01, 10, 10);
    expect(a.withBrain).toBeLessThan(top);
    expect(b.withBrain).toBeLessThan(top);
    expect(b.withBrain / top).toBeGreaterThan(0.95);
  });
  it('the head modes fall with degree', () => {
    const { c } = headModes();
    expect(c[1]).toBeGreaterThan(c[10]);
    expect(c[10]).toBeGreaterThan(c[40]);
  });
});

describe('detecting a drop in band power', () => {
  it('d′ grows with √(BT) and vanishes without a drop', () => {
    expect(dPrime(0, 3, 1, 1e9)).toBe(0);
    expect(dPrime(0.5, 3, 4, 1e9) / dPrime(0.5, 3, 1, 1e9)).toBeCloseTo(2, 5);
  });
  it('the normal distribution, Wolpaw bits and the gamma density are right', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6);
    expect(phi(1.959964)).toBeCloseTo(0.975, 4);
    expect(wolpawBits(1, 2)).toBe(1);
    expect(wolpawBits(0.5, 2)).toBe(0);
    expect(wolpawBits(0.57 * 0.75 + 0.25, 4)).toBeCloseTo(0.58, 2);
    let s = 0; for (let x = 0.0005; x < 10; x += 0.001) s += gammaPdf(x, 3, 1 / 3) * 0.001;
    expect(s).toBeCloseTo(1, 3);
  });
  it('the gamma distribution function is right', () => {
    expect(gammaP(1, 2)).toBeCloseTo(1 - Math.exp(-2), 10);
    expect(gammaP(3, 3)).toBeCloseTo(0.5768099, 6);
    expect(gammaP(30, 40)).toBeCloseTo(0.9567713, 6);
    expect(gammaP(0.75, 0.2)).toBeCloseTo(0.2992068, 6);
  });
  it('correct calls: chance without a drop, the d′ approximation for long windows', () => {
    expect(restVersusImagery(0, 3, 1, 10).correct).toBe(0.5);
    const r = restVersusImagery(0.3, 3, 20, 5), d = dPrime(0.3, 3, 20, 5);
    expect(Math.abs(r.correct - phi(d / 2))).toBeLessThan(0.01);
    expect(restVersusImagery(0.5, 3, 1, 1e9).correct).toBeLessThan(restVersusImagery(0.5, 3, 4, 1e9).correct);
  });
  it('the simulated band power scatters as the gamma model says', () => {
    const fs = 100, B = 3, T = 1, x = bandNoise(200000, fs, 10, B, 7), w = T * fs, est: number[] = [];
    for (let i = 1000; i + w < x.length - 1000; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += x[j] * x[j]; est.push(s / w); }
    const m = est.reduce((a, v) => a + v, 0) / est.length, sd = Math.sqrt(est.reduce((a, v) => a + (v - m) ** 2, 0) / est.length);
    expect(m).toBeCloseTo(1, 1);
    expect(Math.abs(sd / m - 1 / Math.sqrt(B * T))).toBeLessThan(0.08);
  });
});

describe('classifying windows', () => {
  it('gamma draws have the right mean and spread; identical classes are at chance', () => {
    let s = 0, s2 = 0; const rng = mulberry32(3), n = 20000;
    for (let i = 0; i < n; i++) { const g = gammaSample(3, 1 / 3, rng); s += g; s2 += g * g; }
    const m = s / n, sd = Math.sqrt(s2 / n - m * m);
    expect(m).toBeCloseTo(1, 1);
    expect(Math.abs(sd / m - 1 / Math.sqrt(3))).toBeLessThan(0.03);
    expect(Math.abs(classifyWindows([[1, 1, 1], [1, 1, 1]], 3, 4000).overall - 0.5)).toBeLessThan(0.03);
    const r = classifyWindows([[0.2, 1, 0.2], [2, 1, 2]], 3, 2000);
    expect(r.overall).toBeGreaterThan(0.95);
  });
});
