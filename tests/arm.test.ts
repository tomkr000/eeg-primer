import { describe, it, expect } from 'vitest';
import { simulateArm, successRate, commandNoise, powerDecoder, imageryPower, correctionCommand, powerDof, trigamma, cursorTrial, intended, ARM } from '../src/physics/arm';
import { P } from '../src/data/params';

const LOG = P.miResponse.map((r) => r.map((v) => Math.log(1 + v / 100)));
const base = { bandHz: P.decoderBandHz, onsetS: P.erdOnsetS, rampS: P.erdRampS, windowS: 1 };

describe('reading the patches', () => {
  it('uses the finite-window power variance rather than treating overlapping updates as independent', () => {
    expect(powerDof(3, 10) / 30).toBeCloseTo(1, 1);
    expect(powerDof(3, 1)).toBeGreaterThan(3);
    expect(powerDof(3, 1)).toBeLessThan(4);
    expect(trigamma(1)).toBeCloseTo(Math.PI ** 2 / 6, 6);
  });
  it('recovers isolated, graded and compound intensities from their deterministic mean powers', () => {
    for (const nF of [0, 0.4, 2]) for (let K = 1; K <= 5; K++) {
      const fit = powerDecoder(LOG, K, nF);
      const cases = [new Array(K).fill(0), new Array(K).fill(0.5), new Array(K).fill(1),
        Array.from({ length: K }, (_, k) => k === 0 ? 0.5 : 0),
        Array.from({ length: K }, (_, k) => k % 2), Array.from({ length: K }, (_, k) => (k + 1) / (K + 1))];
      for (const input of cases) {
        const recovered = fit(imageryPower(LOG, input).map((v) => v + nF));
        recovered.forEach((v, k) => expect(v).toBeCloseTo(input[k], 5));
      }
    }
  });
  it('finds the bounded least-squares optimum when noisy inputs put several coordinates on bounds', () => {
    // Independent SciPy bounded least-squares reference. With no additive floor the log fit is linear/convex.
    const observed = [0.1896427106, 0.0311349791, 0.1345834795, 0.6532334292, 3.0782264274, 0.7089212924];
    const got = powerDecoder(LOG, 5, 0)(observed);
    const expected = [0.777813, 1, 0.283310, 0, 0.1813332];
    got.forEach((v, k) => expect(v).toBeCloseTo(expected[k], 5));
  });
  it('the rest-noise readout matches numerical derivatives near zero imagery before bounds', () => {
    const K = 3, rho = 2, nF = 1 / rho, neutral = new Array(K).fill(1e-4);
    const mean = imageryPower(LOG, neutral).map((v) => v + nF), fit = powerDecoder(LOG, K, nF), eps = 1e-7;
    const variance = new Array(K).fill(0);
    for (let p = 0; p < LOG.length; p++) {
      const plus = mean.slice(), minus = mean.slice(); plus[p] *= Math.exp(eps); minus[p] *= Math.exp(-eps);
      const hi = fit(plus), lo = fit(minus);
      for (let k = 0; k < K; k++) variance[k] += ((hi[k] - lo[k]) / eps) ** 2;
    }
    const predicted = commandNoise(LOG, { joints: K, rho, windowS: 1, bandHz: 3 });
    predicted.forEach((v, k) => expect(Math.sqrt(variance[k] * trigamma(powerDof(3, 1))) / v).toBeCloseTo(1, 3));
  });
  it('estimates finite local noise at rest and exposes noise amplification from overlap', () => {
    const one = commandNoise(LOG, { joints: 1, rho: 1, windowS: 1, bandHz: 3 });
    const two = commandNoise(LOG, { joints: 2, rho: 1, windowS: 1, bandHz: 3 });
    expect(two[0]).toBeGreaterThan(one[0]);
    const long = commandNoise(LOG, { joints: 2, rho: 1, windowS: 4, bandHz: 3 });
    two.forEach((v, k) => { expect(Number.isFinite(v)).toBe(true); expect(long[k]).toBeLessThan(v); });
  });
});

describe('the bidirectional arm interface', () => {
  it('deliberately reverses for overshoot and has a neutral dead band', () => {
    expect(correctionCommand(-30)).toBeLessThan(-ARM.deadZone);
    expect(correctionCommand(30)).toBeGreaterThan(ARM.deadZone);
    expect(correctionCommand(2)).toBe(0);
    expect(correctionCommand(-30)).toBe(-correctionCommand(30));
  });
  it('starts with a half-intensity neutral setting and produces bounded finite commands under noise', () => {
    for (const together of [false, true]) for (const K of [1, 3, 5]) {
      const r = simulateArm(LOG, { ...base, joints: K, rho: 1, together, seed: 7 });
      r.imagery.forEach((a) => expect(a[0]).toBe(0.5));
      r.desired.forEach((a, k) => { expect(a[0]).toBe(ARM.startDeg[k]); expect(intended(k, 30, together)).toBe(0); });
      for (const a of r.command) for (const v of a) { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v)).toBeLessThanOrEqual(1); }
      for (const a of r.actual) for (const v of a) expect(Math.abs(v)).toBeLessThanOrEqual(ARM.limitDeg);
      if (!together) for (let i = 0; i < r.t.length; i++) expect(r.imagery.filter((a) => Math.abs(a[i] - 0.5) > 1e-9).length).toBeLessThanOrEqual(1);
    }
  }, 20000);
  it('requests a reverse correction during a noisy overshoot, rather than waiting for noise to return it', () => {
    let reversed = false;
    for (let seed = 1; seed <= 8 && !reversed; seed++) {
      const r = simulateArm(LOG, { ...base, joints: 2, rho: 1, together: true, seed });
      reversed = r.actual.some((a, k) => a.some((angle, i) => angle < -ARM.minErrDeg && r.imagery[k][i] < 0.5));
    }
    expect(reversed).toBe(true);
  }, 20000);
  it('repeats fixed noise sequences without imposing a human-performance ceiling', () => {
    const opts = { ...base, joints: 2, rho: 1, together: true };
    const a = successRate(LOG, opts, 3), b = successRate(LOG, opts, 3);
    expect(a.rate).toBe(b.rate); expect(a.rate).toBeGreaterThanOrEqual(0); expect(a.rate).toBeLessThanOrEqual(1);
    if (a.rate > 0) { expect(a.meanTime).toBe(b.meanTime); expect(Number.isFinite(a.meanTime)).toBe(true); }
  }, 20000);
});

describe('the cursor uses the same matched power decoder', () => {
  it('supports both target signs and finite-noise trials without claiming measured validation', () => {
    const independent = [[Math.log(0.15), 0, 0], [0, Math.log(0.15), 0], [0, 0, Math.log(0.15)]];
    for (const target of [[1, 1, 1], [-1, -1, -1], [1, -1, 1]]) {
      const t = cursorTrial(independent, target, { ...base, rho: 10, windowS: 1, limitS: 15, gain: 0.93, edge: 0.7, seed: 1000 });
      expect(Number.isFinite(t)).toBe(true); expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(15);
    }
  });
});

describe('the cap is not the limit (claim cap-separates)', () => {
  it('128 electrodes separate the six motor patches of section 4, the neighboring shoulder and hand patches least well', async () => {
    const { L, nCh, nSrc, MOTOR, coherentPattern } = await import('../src/sections/dim-model');
    // the brain's background: independent sources of equal strength everywhere on the cortex, 10 µV rms per electrode; 1 µV of electrode noise; average reference
    const C = new Float64Array(nCh * nCh);
    for (let i = 0; i < nCh; i++) for (let j = 0; j <= i; j++) { let s = 0; for (let k = 0; k < nSrc; k++) s += L[i * nSrc + k] * L[j * nSrc + k]; C[i * nCh + j] = C[j * nCh + i] = s; }
    let tr = 0; for (let i = 0; i < nCh; i++) tr += C[i * nCh + i];
    const scale = 100 / (tr / nCh);
    for (let i = 0; i < nCh; i++) for (let j = 0; j < nCh; j++) C[i * nCh + j] = C[i * nCh + j] * scale + (i === j ? 1 : 0) - 1 / nCh + (i === j ? 1e-6 : 0);
    // Cholesky, then the Fisher matrix of the six patch amplitudes
    for (let j = 0; j < nCh; j++) {
      let d = C[j * nCh + j]; for (let k = 0; k < j; k++) d -= C[j * nCh + k] ** 2;
      C[j * nCh + j] = Math.sqrt(d);
      for (let i = j + 1; i < nCh; i++) { let s = C[i * nCh + j]; for (let k = 0; k < j; k++) s -= C[i * nCh + k] * C[j * nCh + k]; C[i * nCh + j] = s / C[j * nCh + j]; }
    }
    const white = MOTOR().map((p) => { const a = coherentPattern(p.center, p.radiusMm, 1).a, u = new Float64Array(nCh); for (let i = 0; i < nCh; i++) { let s = a[i]; for (let k = 0; k < i; k++) s -= C[i * nCh + k] * u[k]; u[i] = s / C[i * nCh + i]; } return u; });
    const F = white.map((a) => white.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    // invert the 6 × 6 Fisher matrix: the share of each patch's SNR² left after the decoder cancels the other five
    const n = F.length, M = F.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) { const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; } }
    const kept = F.map((_, k) => 1 / (M[k][n + k] * F[k][k]));
    // the numbers quoted in the claim: 58% for the shoulder, 61% for the hand area next to it, 97% for the best
    expect(kept[5]).toBeCloseTo(0.58, 2);
    expect(kept[0]).toBeCloseTo(0.61, 2);
    expect(Math.min(...kept.slice(1, 5))).toBeGreaterThan(0.86);
    expect(Math.max(...kept)).toBeCloseTo(0.97, 2);
  });
});
