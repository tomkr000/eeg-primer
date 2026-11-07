import { describe, it, expect } from 'vitest';
import { capLattice, evaluate, seen, separation, pairCorrect, trigamma, maxClique, dendrogram, gaussianBandShare, D_STAR_90, type ModelCfg, type NamedState, type Settings } from '../src/physics/states';
import { restVersusImagery } from '../src/physics/control';
import { MODEL, STATES, REGIONS, signature } from '../src/data/states';

const base: Settings = { N: 4, T: 2, calibration: 'session', artifacts: 'present', betweenSd: 0.65, retest: { slow: 0.66, theta: 0.77, alpha: 0.88, beta: 0.81 }, dStar: D_STAR_90 };
const M = STATES.length;

describe('the electrode sequence', () => {
  it('is nested, starts at the vertex, stays within 80° of it and is spread about evenly', () => {
    const all = capLattice(1000);
    expect(all.length).toBe(1000);
    expect(all[0]).toEqual([0, 0, 1]);
    for (const N of [1, 4, 21, 128]) expect(capLattice(N)).toEqual(all.slice(0, N));
    for (const [, , z] of all) expect(z).toBeGreaterThan(Math.cos((80 * Math.PI) / 180) - 1e-9);
    // the first five: the vertex and the front, back, left and right of the rim
    const ang = all.slice(1, 5).map(([x, y, z]) => [Math.acos(z) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI]);
    for (const [t] of ang) expect(t).toBeCloseTo(80, 5);
    expect(ang[0][1]).toBeCloseTo(0, 5);
    expect(Math.abs(ang[1][1])).toBeCloseTo(180, 5);
    expect(ang[2][1]).toBeGreaterThan(0);
    expect(ang[3][1]).toBeLessThan(0);
    for (const N of [21, 64, 256]) {
      const e = all.slice(0, N), target = Math.sqrt((2 * Math.PI * (1 - Math.cos((80 * Math.PI) / 180))) / N);
      const nn = e.map((a, i) => Math.min(...e.map((b, j) => (j === i ? Infinity : Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))))));
      const mean = nn.reduce((s, v) => s + v, 0) / N;
      expect(mean / target).toBeGreaterThan(0.7);
      expect(mean / target).toBeLessThan(1.2);
    }
  });
});

describe('one region read in one band', () => {
  const one: ModelCfg = { regions: [{ id: 'a', band: 'alpha', thetaDeg: 0, phiDeg: 0, radiusMm: 30, restUv: 20 }], nuisances: [], bgUv: { slow: 0.01, theta: 0.01, alpha: 0.01, beta: 0.01 }, noiseUvPer3Hz: 0.001 };
  const rest: NamedState = { id: 'r', name: 'r', factors: {} }, half: NamedState = { id: 'h', name: 'h', factors: { a: 0.5 } };
  it('with no noise, the linear classifier of the log power is close to the exact gamma threshold rule', () => {
    for (const T of [1, 2, 8]) {
      const set = { ...base, N: 1, T }, d = separation(seen(one, rest, set), seen(one, half, set));
      const exact = restVersusImagery(0.5, 5, T, 1e12).correct;
      expect(Math.abs(pairCorrect(d) - exact)).toBeLessThan(0.03);
    }
  });
  it('the scatter of the log power is the trigamma of B·T', () => {
    const v = seen(one, rest, { ...base, N: 1, T: 2 });
    expect(v.cov[0]).toBeCloseTo(trigamma(10), 6);
  });
});

describe('the named states', () => {
  const out = evaluate(MODEL, STATES, base);
  it('give a symmetric accuracy matrix with guessing on the diagonal', () => {
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      expect(out.acc[i * M + j]).toBeCloseTo(out.acc[j * M + i], 9);
      expect(out.acc[i * M + j]).toBeGreaterThanOrEqual(0.5);
    }
    for (let i = 0; i < M; i++) expect(out.acc[i * M + i]).toBe(0.5);
  });
  it('are told apart more often with a longer window, a same-session baseline and artifacts removed, never less', () => {
    const d = (set: Settings) => { const o = evaluate(MODEL, STATES, set); return o.d; };
    const ref = d(base), longer = d({ ...base, T: 8 }), day = d({ ...base, calibration: 'day' }), none = d({ ...base, calibration: 'none' }), art = d({ ...base, artifacts: 'present' });
    for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
      const k = i * M + j;
      expect(longer[k]).toBeGreaterThanOrEqual(ref[k] - 1e-9);
      expect(day[k]).toBeLessThanOrEqual(ref[k] + 1e-9);
      expect(none[k]).toBeLessThanOrEqual(day[k] + 1e-9);
      if (!STATES[i].eyesClosed && !STATES[j].eyesClosed) expect(art[k]).toBeLessThanOrEqual(ref[k] + 1e-6); // blinks themselves separate eyes-closed states
    }
  });
  it('resolve more signals and states with more electrodes, never fewer, and the per-degree formula continues the exact one', () => {
    let prev = 0, prevApart = 0;
    for (let N = 1; N <= 64; N++) {
      const o = evaluate(MODEL, STATES, { ...base, N });
      expect(o.levels.length).toBe(REGIONS.length);
      expect(o.axes).toBe(o.levels.filter((l) => l >= 2).length);
      expect(o.axes).toBeGreaterThanOrEqual(prev);
      expect(o.apart.length).toBeGreaterThanOrEqual(prevApart);
      prev = o.axes; prevApart = o.apart.length;
    }
    const a = evaluate(MODEL, STATES, { ...base, N: 256 }), b = evaluate(MODEL, STATES, { ...base, N: 262 });
    a.levels.forEach((l, k) => expect(Math.abs(b.levels[k] / l - 1)).toBeLessThan(0.05));
    for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) expect(Math.abs(b.d[i * M + j] - a.d[i * M + j])).toBeLessThan(0.2 + 0.1 * a.d[i * M + j]);
  });
  it('leave the artifacts in: canceling them changes no pair by more than two points (claim artifact-effect)', () => {
    for (const N of [1, 2, 4, 8, 21, 64, 256, 1000]) for (const T of [1, 2, 5, 30, 60]) for (const calibration of ['session', 'day', 'none'] as const) {
      const a = evaluate(MODEL, STATES, { ...base, N, T, calibration, artifacts: 'present' }), b = evaluate(MODEL, STATES, { ...base, N, T, calibration, artifacts: 'removed' });
      for (let i = 0; i < M * M; i++) expect(Math.abs(a.acc[i] - b.acc[i])).toBeLessThan(0.02);
      expect(Math.abs(a.apart.length - b.apart.length)).toBeLessThanOrEqual(1);
    }
  });
  it('give the figure’s numbers (claim states-count)', () => {
    const at = (N: number, T: number, calibration: Settings['calibration'] = 'session') => evaluate(MODEL, STATES, { ...base, N, T, calibration });
    const ids = (o: { apart: number[] }) => o.apart.map((i) => STATES[i].id);
    const d4 = at(4, 2);
    expect(ids(d4)).toEqual(['rest-ec', 'workload', 'n3']);
    expect(d4.axes).toBe(1); expect(d4.levels[0]).toBeGreaterThan(2.7); expect(d4.levels[0]).toBeLessThan(2.9);
    expect(at(16, 2).axes).toBe(5); expect(at(17, 2).axes).toBe(6);
    expect(at(21, 2).apart.length).toBe(6); expect(at(21, 2).axes).toBe(6);
    expect(at(128, 2).apart.length).toBe(7); expect(at(128, 2).axes).toBe(6);
    expect(at(128, 30).apart.length).toBe(14); expect(at(128, 30).axes).toBe(REGIONS.length);
    expect(at(128, 30).levels[0]).toBeGreaterThan(10.5); expect(at(128, 30).levels[0]).toBeLessThan(11.5);
    expect(at(128, 30, 'none').apart.length).toBe(6); expect(at(128, 30, 'none').axes).toBe(6);
    // the far end of the slider: a cap of 100,000 electrodes reads no better than 1,000
    expect(at(100000, 2).apart.length).toBe(at(1000, 2).apart.length); expect(at(100000, 2).axes).toBe(at(1000, 2).axes);
    expect(at(100000, 30).apart.length).toBeLessThanOrEqual(at(1000, 30).apart.length + 1);
    const i = (id: string) => STATES.findIndex((s) => s.id === id);
    expect(d4.acc[i('positive') * M + i('negative')]).toBeLessThan(0.52);
    expect(d4.acc[i('mi-right') * M + i('mi-left')]).toBeLessThan(0.55);
    // the fitted states: 32 electrodes and 30 s reproduce the measured single-trial accuracies (claims arousal-signature, valence-asymmetry)
    const deap = at(32, 30);
    expect(deap.acc[i('excited') * M + i('rest-eo')]).toBeGreaterThan(0.6); expect(deap.acc[i('excited') * M + i('rest-eo')]).toBeLessThan(0.64);
    expect(deap.acc[i('positive') * M + i('negative')]).toBeGreaterThan(0.56); expect(deap.acc[i('positive') * M + i('negative')]).toBeLessThan(0.6);
  });
  it('with one electrode, the regions that share a band move together: the frontal alpha asymmetry is invisible', () => {
    const o = evaluate(MODEL, STATES, { ...base, N: 1 }), i = STATES.findIndex((s) => s.id === 'positive'), j = STATES.findIndex((s) => s.id === 'negative');
    expect(o.acc[i * M + j]).toBeLessThan(0.501);
  });
});

describe('helpers', () => {
  it('trigamma, the band share of a blink and the largest clique', () => {
    expect(trigamma(1)).toBeCloseTo(Math.PI ** 2 / 6, 8);
    expect(trigamma(10)).toBeCloseTo(0.1051663, 6);
    const slow = gaussianBandShare(0.08, 'slow'), theta = gaussianBandShare(0.08, 'theta'), alpha = gaussianBandShare(0.08, 'alpha');
    expect(slow).toBeGreaterThan(theta);
    expect(theta).toBeGreaterThan(alpha);
    expect(slow + theta + alpha).toBeLessThan(1);
    // a 5-cycle plus one vertex joined to all: the largest clique is a triangle
    const joined = (i: number, j: number) => i === 5 || j === 5 || Math.abs(i - j) === 1 || Math.abs(i - j) === 4;
    expect(maxClique(6, joined).length).toBe(3);
  });
  it('cluster by average linkage with nondecreasing join heights', () => {
    // three states: a and b close, c far; a–c and b–c differ, so the mean decides where c joins
    const d = new Float64Array([0, 1, 4, 1, 0, 6, 4, 6, 0]);
    expect(dendrogram(3, d, 'average')).toEqual([{ a: 0, b: 1, h: 1 }, { a: 2, b: 3, h: 5 }]);
    expect(dendrogram(3, d, 'single')[1].h).toBe(4);
    expect(dendrogram(3, d, 'complete')[1].h).toBe(6);
    const o = evaluate(MODEL, STATES, base), joins = dendrogram(STATES.length, o.d);
    expect(joins.length).toBe(STATES.length - 1);
    for (let k = 1; k < joins.length; k++) expect(joins[k].h).toBeGreaterThanOrEqual(joins[k - 1].h);
    // at the defaults the cut at 2.56 leaves two brackets: the eyes-closed trio and the other seventeen, joined at about 3.1
    const top = joins[joins.length - 1];
    expect(top.h).toBeGreaterThan(2.56); expect(top.h).toBeLessThan(3.5);
    expect(joins[joins.length - 2].h).toBeLessThan(2.56);
  });
  it('read each state reading by reading (claim states-count)', () => {
    const F = REGIONS.length, kt = REGIONS.findIndex((r) => r.id === 'theta'), ka = REGIONS.findIndex((r) => r.id === 'alphaP');
    const strip = (N: number, T: number, k: number) => {
      const s = { ...base, N, T }, rest = seen(MODEL, STATES[0], s), views = STATES.map((st) => seen(MODEL, st, s));
      const half = D_STAR_90 * Math.sqrt(rest.cov[k * F + k]), change = views.map((v) => v.mean[k] - rest.mean[k]);
      return { bar: Math.exp(half), change, outside: STATES.filter((_, i) => Math.abs(change[i]) >= half).map((st) => st.id) };
    };
    const id = (x: string) => STATES.findIndex((st) => st.id === x);
    const a4 = strip(4, 2, ka), t4 = strip(4, 2, kt);
    expect(a4.outside).toEqual(['rest-ec', 'meditation']);
    expect(Math.exp(a4.change[id('rest-ec')])).toBeCloseTo(2.59, 1); expect(Math.exp(a4.change[id('meditation')])).toBeCloseTo(2.8, 1); expect(a4.bar).toBeCloseTo(2.3, 1);
    expect(Math.max(...t4.change.map(Math.abs))).toBeLessThan(Math.log(1.015)); expect(t4.outside).toEqual([]);
    for (const k of REGIONS.keys()) if (k !== ka) expect(strip(4, 2, k).outside).toEqual([]);
    const tBig = strip(100000, 2, kt);
    expect(Math.exp(tBig.change[id('workload')])).toBeCloseTo(1.19, 1); expect(tBig.bar).toBeCloseTo(2.55, 1); expect(tBig.outside).toEqual([]);
    expect(strip(128, 30, kt).outside.sort()).toEqual(['anesthesia', 'drowsy']);
  });
  it('mark each state by its largest change (claim state-table)', () => {
    const tag = (id: string) => { const g = signature(STATES.find((s) => s.id === id)!); return g ? `${g.rhythm} ${g.up ? 'up' : 'down'}, ${g.area}` : 'none'; };
    expect(tag('rest-eo')).toBe('none');
    for (const id of ['rest-ec', 'calm', 'memory']) expect(tag(id)).toBe('alpha up, posterior');
    for (const id of ['meditation', 'drowsy', 'focus', 'workload']) expect(tag(id)).toBe('theta up, frontal');
    for (const id of ['stress', 'excited', 'wandering', 'n1', 'n2', 'rem']) expect(tag(id)).toBe('alpha down, posterior');
    for (const id of ['positive', 'negative']) expect(tag(id)).toBe('alpha down, frontal');
    expect(signature(STATES.find((s) => s.id === 'mi-right')!)!.region).toBe('muL');
    expect(signature(STATES.find((s) => s.id === 'mi-left')!)!.region).toBe('muR');
    for (const id of ['mi-right', 'mi-left']) expect(tag(id)).toBe('mu down, hand areas');
    for (const id of ['n3', 'anesthesia']) expect(tag(id)).toBe('slow waves up, frontal');
  });
});
