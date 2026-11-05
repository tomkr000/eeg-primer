import { describe, it, expect } from 'vitest';
import { simulateArm, successRate, commandNoise, decoder, seenResponse, powerDof, trigamma, cursorTrial, ARM } from '../src/physics/arm';
import { P } from '../src/data/params';

const LOG = P.miResponse.map((r) => r.map((v) => Math.log(1 + v / 100)));
const base = { bandHz: P.decoderBandHz, onsetS: P.erdOnsetS, rampS: P.erdRampS, windowS: 1 };

describe('reading the patches', () => {
  it('a long window has B·T degrees of freedom, a short one slightly more', () => {
    expect(powerDof(3, 10) / 30).toBeCloseTo(1, 1);
    expect(powerDof(3, 1)).toBeGreaterThan(3);
    expect(powerDof(3, 1)).toBeLessThan(4);
  });
  it('the decoder undoes the overlap of the movements exactly', () => {
    const seen = seenResponse(LOG, 0.4);
    for (let K = 1; K <= 5; K++) {
      const D = decoder(seen, K);
      for (let k = 0; k < K; k++) for (let m = 0; m < K; m++) {
        const v = D[k].reduce((s, w, p) => s + w * seen[p][m], 0);
        expect(v).toBeCloseTo(k === m ? 1 : 0, 9);
      }
    }
  });
  it('the commands at rest scatter as the gamma model says', () => {
    const o = { ...base, joints: 2, rho: 1e6, together: false };
    const expected = commandNoise(LOG, o), values: number[][] = [[], []];
    for (let s = 1; s <= 300; s++) {
      const r = simulateArm(LOG, { ...o, seed: s }), i = r.t.findIndex((t) => t >= 0) - 1;
      values.forEach((v, k) => v.push(r.command[k][i]));
    }
    values.forEach((v, k) => {
      const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
      expect(Math.abs(m)).toBeLessThan(0.1);
      expect(sd / expected[k]).toBeGreaterThan(0.85);
      expect(sd / expected[k]).toBeLessThan(1.15);
    });
    expect(trigamma(1)).toBeCloseTo(Math.PI ** 2 / 6, 6);
  });
  it('overlapping movements amplify the noise: two hands are noisier than one', () => {
    const one = commandNoise(LOG, { joints: 1, rho: 1e6, windowS: 1, bandHz: 3 }), two = commandNoise(LOG, { joints: 2, rho: 1e6, windowS: 1, bandHz: 3 });
    expect(two[0] / one[0]).toBeGreaterThan(1.8);
  });
});

describe('the arm', () => {
  it('starts scrunched and the intended arm ends straight', () => {
    const r = simulateArm(LOG, { ...base, joints: 3, rho: 1e6, together: true, seed: 1 });
    r.desired.forEach((d, k) => { expect(d[0]).toBe(ARM.startDeg[k]); expect(d[d.length - 1]).toBe(0); });
  });
  it('one joint read from a perfect recording ends straight in nearly every attempt', () => {
    expect(successRate(LOG, { ...base, joints: 1, rho: 1e6, together: false }, 40).rate).toBeGreaterThanOrEqual(0.95);
  });
  it('fewer attempts succeed as joints are added (claim arm-success)', async () => {
    const { snrVersusElectrodes } = await import('../src/physics/control');
    const { momentNam, ALPHA_N } = await import('../src/sections/s07-noise');
    const [cap] = snrVersusElectrodes([64], 1, 10, 10), rho = (momentNam(ALPHA_N, P.patchDefaultSync) * cap.withBrain) ** 2;
    const rate = (K: number, together: boolean, r = rho) => Math.round(100 * successRate(LOG, { ...base, joints: K, rho: r, together }, 100).rate);
    // the shares quoted in the claim, one joint at a time and all together, within 3 points (an attempt near the line can
    // flip with the last digit of a math library); five joints do worse than four
    const near = (got: number[], want: number[]) => got.forEach((g, i) => expect(Math.abs(g - want[i])).toBeLessThanOrEqual(3));
    const rows = [[rate(1, false), rate(2, false), rate(3, false), rate(4, false), rate(5, false)], [rate(1, true), rate(2, true), rate(3, true), rate(4, true), rate(5, true)],
      [2, 3, 4, 5].map((K) => rate(K, false, 1e6)), [2, 3, 4, 5].map((K) => rate(K, true, 1e6))];
    near(rows[0], [100, 27, 9, 1, 0]);
    near(rows[1], [100, 21, 12, 11, 6]);
    near(rows[2], [50, 18, 4, 0]);
    near(rows[3], [68, 33, 25, 20]);
    rows.forEach((r) => expect(r[r.length - 1]).toBeLessThanOrEqual(r[r.length - 2]));
    const noise = (K: number) => commandNoise(LOG, { joints: K, rho, windowS: 1, bandHz: 3 });
    expect(noise(1)[0]).toBeCloseTo(0.44, 2);
    noise(2).forEach((v) => { expect(v).toBeGreaterThan(1.4); expect(v).toBeLessThan(1.5); });
  });
});

describe('the same signals on a measured task (claim cursor-check)', () => {
  it('reach the right corner of the 3D cursor task about as often as trained users did', async () => {
    const { snrVersusElectrodes } = await import('../src/physics/control');
    const { momentNam, ALPHA_N } = await import('../src/sections/s07-noise');
    const [cap] = snrVersusElectrodes([64], 1, 10, 10), rho = (momentNam(ALPHA_N, P.patchDefaultSync) * cap.withBrain) ** 2;
    const corners = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c])));
    const three = (M: number[][]) => M.map((r) => r.slice(0, 3));
    const clean = LOG.map((_, p) => [0, 1, 2].map((k) => (p === k ? Math.log(0.15) : 0)));
    const run = (L: number[][], r: number) => {
      const times: number[] = [];
      for (let s = 0; s < 200; s++) { const t = cursorTrial(L, corners[s % 8], { ...base, windowS: 0.4, rho: r, limitS: 15, gain: 0.93, edge: 0.7, seed: 1000 + s }); if (!isNaN(t)) times.push(t); }
      times.sort((a, b) => a - b);
      return { rate: Math.round((100 * times.length) / 200), median: times[Math.floor(times.length / 2)] };
    };
    const model = run(three(LOG), rho);
    expect(Math.abs(model.rate - 72)).toBeLessThanOrEqual(3); // inside the 56 to 93% of McFarland et al.'s four users
    expect(model.median).toBeGreaterThan(3); expect(model.median).toBeLessThan(5);
    expect(run(clean, rho).rate).toBeGreaterThanOrEqual(98); // without the overlap of the movements
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
