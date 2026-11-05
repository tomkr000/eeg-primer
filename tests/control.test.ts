import { describe, it, expect } from 'vitest';
import { snrVersusElectrodes, ceilingPerNam, dPrime, phi, wolpawBits, gammaPdf, gammaP, restVersusImagery, bandNoise, headModes, pairVersusElectrodes, pairCeilingPerNam, twoWayCorrect, mWayCorrect, betaI } from '../src/physics/control';

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

describe('telling two neighboring regions apart (section 11, claim finger-count)', () => {
  it('the per-degree pair formula agrees with the exact one, and far-apart regions cost nothing to separate', () => {
    for (const N of [128, 256]) {
      const [exact] = pairVersusElectrodes([N], 1, 10, 10, 6, 1000), [modal] = pairVersusElectrodes([N], 1, 10, 10, 6, 0);
      expect(Math.abs(modal.separated / exact.separated - 1)).toBeLessThan(0.05);
      expect(Math.abs(modal.rho - exact.rho)).toBeLessThan(0.02);
    }
    const [far] = pairVersusElectrodes([1024], 1, 10, 10, 150), [one] = snrVersusElectrodes([1024], 1, 10, 10);
    expect(Math.abs(far.alone / one.withBrain - 1)).toBeLessThan(0.02);
    expect(far.separated / far.alone).toBeGreaterThan(0.99);
    expect(pairCeilingPerNam(10, 10, 300)).toBeCloseTo(ceilingPerNam(10, 10), 3);
  });
  it('closer regions are harder to separate, and no array beats the pair ceiling', () => {
    const at = (sep: number) => pairVersusElectrodes([1e5], 1, 10, 10, sep)[0].separated;
    expect(at(1.5)).toBeLessThan(at(4)); expect(at(4)).toBeLessThan(at(16));
    expect(at(1.5)).toBeLessThan(pairCeilingPerNam(10, 10, 1.5));
  });
  it('the exact two-way share matches the integral, and the incomplete beta is right', () => {
    expect(betaI(1, 1, 0.3)).toBeCloseTo(0.3, 10);
    expect(betaI(2, 2, 0.5)).toBeCloseTo(0.5, 10);
    expect(twoWayCorrect(0.5, 3, 1, 2)).toBeCloseTo(mWayCorrect(2, 0.5, 3, 1, 2), 3);
    expect(twoWayCorrect(0, 3, 1, 10)).toBeCloseTo(0.5, 10);
  });
  it('index versus middle finger at a keystroke stays near chance with any cap (the numbers quoted in the claim)', async () => {
    const { P } = await import('../src/data/params');
    const { momentNam, ALPHA_N } = await import('../src/sections/s07-noise');
    const MU = momentNam(ALPHA_N, P.patchDefaultSync);
    const acc = (sep: number, T: number, N: number) => 100 * twoWayCorrect(P.erdPowerDrop, P.decoderBandHz, T, (pairVersusElectrodes([N], 1, 10, 10, sep)[0].separated * MU) ** 2);
    expect(acc(1.5, 0.24, 128)).toBeCloseTo(50.4, 0);
    expect(acc(1.5, 0.24, 1e5)).toBeCloseTo(52.8, 0);
    expect(100 * twoWayCorrect(P.erdPowerDrop, P.decoderBandHz, 0.24, Infinity)).toBeCloseTo(63.7, 0);
    expect(acc(16, 3, 128)).toBeCloseTo(84.9, 0); // thumb against little finger over the sensory spacing and a 3 s trial
  });
});
