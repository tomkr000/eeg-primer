/**
 * A robot arm of 1 to 5 joints driven by imagined movements (section 9). Each joint is assigned one imagined
 * movement; imagining it changes the mu power of every cortical patch by the measured response of that movement;
 * a full cap reads each patch's power over a trailing window, and a nonlinear decoder matched to the combined movements
 * turns the patch powers back into one command per joint. Half imagery intensity is neutral; increasing or decreasing
 * it moves a joint in opposite directions. The controller knows the delays and can deliberately correct overshoot.
 * Windowing, bounded estimation and this feedback policy affect performance as well as the simulated signals.
 */
import { applyTransfer } from './fft';
import { mulberry32 } from './population';

/** Fixed parts of the arm and of the task (model choices, listed in the section's assumptions table). */
export const ARM = {
  dt: 0.05, // s, the decoder's update and the simulation step
  planEvery: 4, // steps between the person's revisions of the imagery (5 per second)
  speedDegS: 45, // joint speed at a full command
  deadZone: 0.5, // commands within ± half a full movement's change leave the joint still (section 8's halfway threshold)
  tolDeg: 15, // a joint counts as straight within this
  dwellS: 0.5, // all joints straight together for this long ends the attempt
  stageS: 3, // the intended arm straightens one joint in this time (one at a time)
  togetherS: 4, // or all joints together in this time
  graceS: 4, // time the decoded arm gets after the intended one has finished
  startDeg: [60, 90, 90, 90, 90], // the scrunched start (folded in alternate directions), joint 1 at the base
  limitDeg: 135, // each joint stops this far either side of straight
  minErrDeg: 3, // the person does not push a joint this close to where it should be
  gainS: 0.5, // the person closes a gap at the rate gap / gainS
};

export interface ArmOpts {
  joints: number; // 1 to 5
  together: boolean; // all joints at once, or one at a time
  rho: number; // rhythm power over the noise power in each patch's channel
  windowS: number; // decoder window T
  bandHz: number; // width B of the rhythm's band
  onsetS: number; rampS: number; // the rhythm starts to change this long after the imagery starts, and takes the ramp to change fully
  seed: number;
}
export interface ArmTrial {
  t: Float64Array; // time from Go (s)
  desired: Float64Array[]; actual: Float64Array[]; // joint angles (deg, 0 = straight), per joint
  imagery: Float64Array[]; // intensity of each imagined movement (0 to 1); half intensity is neutral
  power: Float64Array[]; // true mu power of each patch (rest = 1)
  estimate: Float64Array[]; // the decoder's windowed estimate of each patch's power, relative to its resting level
  command: Float64Array[]; // decoded command per joint (2 × imagery intensity − 1)
  doneAt: number; // time from Go at which all joints had been straight for the dwell (NaN: never)
  end: number; // last time of the record
}

/** ψ(x) and ψ′(x): the mean and variance of ln X for X ~ gamma(x, 1) */
export function digamma(x: number): number { let r = 0; while (x < 6) { r -= 1 / x; x += 1; } const f = 1 / (x * x); return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f / 252)); }
export function trigamma(x: number): number { let r = 0; while (x < 6) { r += 1 / (x * x); x += 1; } const f = 1 / (x * x); return r + 1 / x + f / 2 + (f / x) * (1 / 6 - f * (1 / 30 - f / 42)); }

/**
 * Degrees of freedom of the power estimate: the mean of |z|² over a trailing window of T seconds (sampled every dt)
 * of a complex Gaussian process band-limited to a band B hertz wide. B·T for long windows; slightly more for short
 * ones, the boxcar's exact value (claim erd-detect).
 */
export function powerDof(B: number, T: number): number {
  const fs = 1 / ARM.dt, Nw = Math.max(1, Math.round(T * fs));
  let s = 0;
  for (let m = 1 - Nw; m < Nw; m++) { const x = (B * m) / fs, sc = m === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); s += (Nw - Math.abs(m)) * sc * sc; }
  return (Nw * Nw) / s;
}

/** the log change of each patch's measured power for a full imagined movement, once the noise floor nF is added */
export function seenResponse(logResp: number[][], nF: number): number[][] {
  return logResp.map((row) => row.map((v) => Math.log((Math.exp(v) + nF) / (1 + nF))));
}

/**
 * Decoder rows (one per joint, one weight per patch): the least-squares unmixing of the calibrated responses of the
 * joints' movements, one movement per joint.
 */
export function decoder(seen: number[][], joints: number): number[][] {
  const P = seen.length, cols = Array.from({ length: joints }, (_, k) => seen.map((r) => r[k]));
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const Ginv = invert(cols.map((a) => cols.map((b) => dot(a, b))));
  return Ginv.map((g) => Array.from({ length: P }, (_, p) => cols.reduce((s, c, m) => s + g[m] * c[p], 0)));
}
function invert(A: number[][]): number[][] {
  const n = A.length, M = A.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r) => r.slice(n));
}

/** Minimize the Gauss–Newton quadratic with −u ≤ step ≤ 1−u, using a small active-set solve. */
function boundedStep(H: number[][], g: number[], u: number[]): number[] {
  const n = u.length, step = new Array(n).fill(0), active = new Array(n).fill(0);
  for (let iter = 0; iter < 4 * n * n; iter++) {
    const residual = g.map((v, j) => v - H[j].reduce((s, h, k) => s + h * step[k], 0));
    const free = active.flatMap((v, k) => v === 0 ? [k] : []), direction = new Array(n).fill(0);
    if (free.length) {
      const inv = invert(free.map((j) => free.map((k) => H[j][k])));
      free.forEach((j, a) => { direction[j] = inv[a].reduce((s, v, b) => s + v * residual[free[b]], 0); });
    }
    let scale = 1;
    for (const j of free) {
      if (direction[j] > 1e-14) scale = Math.min(scale, (1 - u[j] - step[j]) / direction[j]);
      if (direction[j] < -1e-14) scale = Math.min(scale, (-u[j] - step[j]) / direction[j]);
    }
    scale = Math.max(0, scale);
    for (const j of free) step[j] = Math.max(-u[j], Math.min(1 - u[j], step[j] + scale * direction[j]));
    if (scale < 1 - 1e-10) {
      for (const j of free) {
        if (direction[j] < 0 && step[j] <= -u[j] + 1e-10) active[j] = -1;
        if (direction[j] > 0 && step[j] >= 1 - u[j] - 1e-10) active[j] = 1;
      }
      continue;
    }
    // A bound is optimal only when its gradient points out of the feasible box. Release the worst violation.
    let release = -1, worst = 1e-10;
    for (let j = 0; j < n; j++) if (active[j]) {
      const r = g[j] - H[j].reduce((s, h, k) => s + h * step[k], 0), violation = -active[j] * r;
      if (violation > worst) { release = j; worst = violation; }
    }
    if (release < 0) return step;
    active[release] = 0;
  }
  return step;
}

/** Source powers under the assumed multiplicative response rule. */
export function imageryPower(logResp: number[][], intensity: readonly number[]): number[] {
  return logResp.map((r) => Math.exp(intensity.reduce((s, u, k) => s + r[k] * u, 0)));
}

/**
 * Fit log(noise floor + exp(Lu)), with 0 ≤ u ≤ 1. Unlike a pseudoinverse of isolated full-intensity
 * responses, this forward model also matches graded and compound mean powers. Windowed power during a
 * transition averages different states, so its fitted intensity need not equal the instantaneous imagery.
 */
export function powerDecoder(logResp: number[][], joints: number, nF: number) {
  const L = logResp.map((r) => r.slice(0, joints)), unmix = decoder(L, joints);
  return (observed: ArrayLike<number>, initial?: readonly number[]): number[] => {
    let u = initial ? Array.from(initial) : new Array(joints).fill(0.5);
    const target = Array.from(observed, (v) => Math.log(Math.max(1e-15, v)));
    const cost = (x: number[]) => imageryPower(L, x).reduce((s, p, j) => s + (Math.log(p + nF) - target[j]) ** 2, 0);
    let old = cost(u);
    // Mean powers often lie exactly on the source model. Invert those analytically first; only accept an
    // in-bounds fit with the same objective. This avoids repeatedly optimizing the controller's forecasts.
    if (Array.from(observed).every((v) => v > nF)) {
      const sourceLog = Array.from(observed, (v) => Math.log(v - nF));
      const direct = unmix.map((r) => r.reduce((s, w, p) => s + w * sourceLog[p], 0));
      const bounded = direct.map((v) => Math.max(0, Math.min(1, v))), value = cost(bounded);
      if (value < 1e-18) return bounded;
      if (value < old) { u = bounded; old = value; }
    }
    for (let iter = 0; iter < 24 && old > 1e-18; iter++) {
      const pw = imageryPower(L, u), J = L.map((r, p) => r.map((v) => v * pw[p] / (pw[p] + nF)));
      const H = Array.from({ length: joints }, (_, a) => Array.from({ length: joints }, (_, b) => J.reduce((s, r) => s + r[a] * r[b], 0) + (a === b ? 1e-8 : 0)));
      const g = Array.from({ length: joints }, (_, a) => J.reduce((s, r, p) => s + r[a] * (target[p] - Math.log(pw[p] + nF)), 0));
      const step = boundedStep(H, g, u);
      let accepted = false;
      for (let scale = 1; scale >= 1 / 64; scale /= 2) {
        const next = u.map((v, k) => Math.max(0, Math.min(1, v + scale * step[k]))), value = cost(next);
        if (value < old - 1e-14) { u = next; old = value; accepted = true; break; }
      }
      if (!accepted) break;
    }
    return u;
  };
}

/** Local command SD at rest (zero imagery), before bounds, from the gamma/log-power approximation. */
export function commandNoise(logResp: number[][], o: Pick<ArmOpts, 'joints' | 'rho' | 'windowS' | 'bandHz'>): number[] {
  const pw = imageryPower(logResp, new Array(o.joints).fill(0)), nF = 1 / o.rho;
  const J = logResp.map((r, p) => r.map((v) => v * pw[p] / (pw[p] + nF)));
  const D = decoder(J, o.joints), v = trigamma(powerDof(o.bandHz, o.windowS));
  return D.map((r) => 2 * Math.sqrt(r.reduce((s, w) => s + w * w * v, 0)));
}

/** Signed feedback command; overshoot calls for an intentional reverse command. */
export function correctionCommand(gapDeg: number): number {
  return Math.abs(gapDeg) <= ARM.minErrDeg ? 0 : Math.sign(gapDeg) * Math.min(1, ARM.deadZone + (1 - ARM.deadZone) * Math.abs(gapDeg) / (ARM.gainS * ARM.speedDegS));
}

/** the intended arm: joint k's angle at time t */
export function intended(k: number, t: number, together: boolean): number {
  const [a, b] = together ? [0, ARM.togetherS] : [k * ARM.stageS, (k + 1) * ARM.stageS], s = ARM.startDeg[k];
  return t <= a ? s : t >= b ? 0 : s * (1 - (t - a) / (b - a));
}

/** a complex Gaussian process of unit power, band-limited to |f| ≤ B/2, as its two real parts */
function bandProcess(n: number, B: number, rng: () => number): [Float64Array, Float64Array] {
  const part = () => {
    const x = new Float64Array(n);
    for (let i = 0; i < n; i += 2) { const u = Math.max(rng(), 1e-12), w = rng(), r = Math.sqrt(-2 * Math.log(u)); x[i] = r * Math.cos(2 * Math.PI * w); if (i + 1 < n) x[i + 1] = r * Math.sin(2 * Math.PI * w); }
    const y = applyTransfer(x, 1 / ARM.dt, (f) => ({ re: f <= B / 2 ? 1 : 0, im: 0 }));
    let p = 0; for (const v of y) p += v * v;
    const s = Math.sqrt(0.5 / (p / n)); for (let i = 0; i < n; i++) y[i] *= s;
    return y;
  };
  return [part(), part()];
}

export function simulateArm(logResp: number[][], o: ArmOpts): ArmTrial {
  const { dt } = ARM, P = logResp.length, K = o.joints, nTask = K, nF = 1 / o.rho;
  const fit = powerDecoder(logResp, K, nF), dof = powerDof(o.bandHz, o.windowS);
  const logBiasScale = Math.exp(Math.log(dof) - digamma(dof)); // stationary gamma approximation to center log power
  const Nw = Math.max(1, Math.round(o.windowS / dt)), nOn = Math.round(o.onsetS / dt), nRamp = Math.max(1, Math.round(o.rampS / dt));
  const pre = Nw + nOn + nRamp + 10, dur = (o.together ? ARM.togetherS : ARM.stageS * K) + ARM.graceS, n = pre + Math.ceil(dur / dt);
  const lag = o.onsetS + o.rampS / 2 + o.windowS / 2, H = nOn + nRamp + Nw + 1;
  const rng = mulberry32(o.seed), rhythm = Array.from({ length: P }, () => bandProcess(n, o.bandHz, rng)), noise = Array.from({ length: P }, () => bandProcess(n, o.bandHz, rng));
  const arr = (m: number) => Array.from({ length: m }, () => new Float64Array(n));
  const desired = arr(K), actual = arr(K), imagery = arr(nTask), power = arr(P), estimate = arr(P), command = arr(K), t = new Float64Array(n);
  const SU = Array.from({ length: nTask }, () => new Float64Array(n + 1)), SP = Array.from({ length: P }, () => new Float64Array(n + 1));
  const sq = arr(P), wsum = new Float64Array(P), meanPower = new Float64Array(P), CF = Array.from({ length: P }, () => new Float64Array(H + 1));
  const theta = ARM.startDeg.slice(0, K), want = new Array(nTask).fill(0.5), coast = new Array(K).fill(0);
  let decoded = new Array(K).fill(0.5);
  const dz = (c: number) => { const a = Math.abs(c); return a <= ARM.deadZone ? 0 : Math.sign(c) * Math.min(1, (a - ARM.deadZone) / (1 - ARM.deadZone)); };
  /** mean imagery of task j over the ramp that ends nOn steps before step m, counting steps up to `upto` only */
  const ramped = (j: number, m: number, upto: number) => {
    const hi = Math.min(m - nOn, upto), lo = Math.max(m - nOn - nRamp + 1, 0);
    const known = Math.max(0, hi - lo + 1), sum = known ? SU[j][hi + 1] - SU[j][lo] : 0;
    return (sum + (nRamp - known) * 0.5) / nRamp;
  };
  let current = -1, inside = 0, doneAt = NaN, last = n - 1;
  for (let i = 0; i < n; i++) {
    const ti = (i - pre) * dt; t[i] = ti;
    // the controller revises imagery: forecast, without noise, how far each joint would still travel if all commands returned to half-intensity neutrality now
    if (ti >= 0 && isNaN(doneAt) && (i - pre) % ARM.planEvery === 0) {
      coast.fill(0);
      let predicted = new Array(K).fill(0.5);
      for (let h = 0; h <= H; h++) {
        const m = i + h;
        for (let p = 0; p < P; p++) {
          let lp = 0; for (let j = 0; j < nTask; j++) lp += ramped(j, m, i - 1) * logResp[p][j];
          CF[p][h] = (h ? CF[p][h - 1] : 0) + Math.exp(lp);
        }
        for (let p = 0; p < P; p++) {
          const lo = m - Nw + 1;
          let s = lo <= i - 1 ? SP[p][i] - SP[p][Math.max(lo, 0)] : 0;
          const f0 = Math.max(0, lo - i); s += CF[p][h] - (f0 ? CF[p][f0 - 1] : 0);
          meanPower[p] = s / Nw + nF;
        }
        predicted = fit(meanPower, predicted);
        for (let k = 0; k < K; k++) coast[k] += ARM.speedDegS * dz(2 * predicted[k] - 1) * dt;
      }
      // push each joint that would stop short of where the intended arm will be once new imagery takes effect
      for (let j = 0; j < nTask; j++) {
        const gap = theta[j] - coast[j] - intended(j, ti + lag, o.together);
        want[j] = (1 + correctionCommand(gap)) / 2;
      }
      if (!o.together) { // one deviation from half intensity at a time: finish the current joint, then take the one that lags most
        if (current < 0 || want[current] === 0.5) { current = -1; let best = 0; want.forEach((w, j) => { const size = Math.abs(w - 0.5); if (size > best) { best = size; current = j; } }); }
        want.forEach((_, j) => { if (j !== current) want[j] = 0.5; });
      }
    }
    if (ti < 0 || !isNaN(doneAt)) want.fill(0.5);
    for (let j = 0; j < nTask; j++) { imagery[j][i] = want[j]; SU[j][i + 1] = SU[j][i] + want[j]; }
    // the rhythm of every patch follows the imagery, in the channel's noise; the decoder averages its power over the window
    for (let p = 0; p < P; p++) {
      let lp = 0; for (let j = 0; j < nTask; j++) lp += ramped(j, i, i) * logResp[p][j];
      const pw = Math.exp(lp), a = Math.sqrt(pw), b = Math.sqrt(nF);
      power[p][i] = pw; SP[p][i + 1] = SP[p][i] + pw;
      const re = a * rhythm[p][0][i] + b * noise[p][0][i], im = a * rhythm[p][1][i] + b * noise[p][1][i];
      sq[p][i] = re * re + im * im; wsum[p] += sq[p][i]; if (i >= Nw) wsum[p] -= sq[p][i - Nw];
      estimate[p][i] = wsum[p] / Math.min(i + 1, Nw) / (1 + nF);
    }
    for (let p = 0; p < P; p++) meanPower[p] = estimate[p][i] * (1 + nF) * logBiasScale;
    decoded = fit(meanPower, decoded);
    for (let k = 0; k < K; k++) {
      const c = 2 * decoded[k] - 1;
      command[k][i] = c;
      if (ti >= 0 && isNaN(doneAt)) theta[k] = Math.max(-ARM.limitDeg, Math.min(ARM.limitDeg, theta[k] - ARM.speedDegS * dz(c) * dt));
      actual[k][i] = theta[k]; desired[k][i] = intended(k, Math.max(ti, 0), o.together);
    }
    if (ti >= 0 && isNaN(doneAt)) {
      inside = theta.every((x) => Math.abs(x) <= ARM.tolDeg) ? inside + 1 : 0;
      if (inside * dt >= ARM.dwellS - 1e-9) { doneAt = ti; last = Math.min(n - 1, i + Math.round(1 / dt)); }
    }
    if (i >= last) { const cut = (a: Float64Array[]) => a.forEach((x, j) => (a[j] = x.slice(0, i + 1))); [desired, actual, imagery, power, estimate, command].forEach(cut); return { t: t.slice(0, i + 1), desired, actual, imagery, power, estimate, command, doneAt, end: ti }; }
  }
  return { t, desired, actual, imagery, power, estimate, command, doneAt, end: t[n - 1] };
}

/** share of attempts that end with every joint straight, and their mean time, over `trials` seeds */
export function successRate(logResp: number[][], o: Omit<ArmOpts, 'seed'>, trials: number, firstSeed = 1): { rate: number; meanTime: number } {
  let ok = 0, time = 0;
  for (let s = 0; s < trials; s++) { const r = simulateArm(logResp, { ...o, seed: firstSeed + s }); if (!isNaN(r.doneAt)) { ok++; time += r.doneAt; } }
  return { rate: ok / trials, meanTime: ok ? time / ok : NaN };
}

/**
 * A check against a measured task (claim cursor-check): the 3D cursor task of McFarland et al. 2010, read through the
 * same signal chain. The cursor starts at the center of a cube of half-width 1 with walls; each axis moves at
 * gain·(command − 0.5) per second, the command of its movement minus its average over the eight targets, and the
 * ideal person holds full imagery for the axes whose target side is positive and rests for the others, starting when
 * the target appears 1 s before the cursor. The trial succeeds when every coordinate reaches `edge` on the target's
 * side. Returns the time from the cursor's start (NaN: not reached within limitS).
 */
export function cursorTrial(logResp: number[][], target: number[], o: { rho: number; windowS: number; bandHz: number; onsetS: number; rampS: number; limitS: number; gain: number; edge: number; seed: number }): number {
  const { dt } = ARM, P = logResp.length, K = target.length, nF = 1 / o.rho;
  const fit = powerDecoder(logResp, K, nF), dof = powerDof(o.bandHz, o.windowS);
  const logBiasScale = Math.exp(Math.log(dof) - digamma(dof)), Nw = Math.max(1, Math.round(o.windowS / dt));
  let decoded = new Array(K).fill(0.5);
  const pre = Nw + Math.round(1 / dt) + 5, n = pre + Math.ceil(o.limitS / dt), rng = mulberry32(o.seed);
  const rhythm = Array.from({ length: P }, () => bandProcess(n, o.bandHz, rng)), noise = Array.from({ length: P }, () => bandProcess(n, o.bandHz, rng));
  const sq = Array.from({ length: P }, () => new Float64Array(n)), wsum = new Float64Array(P), est = new Float64Array(P), pos = new Array(K).fill(0);
  for (let i = 0; i < n; i++) {
    const t = (i - pre) * dt, ramp = Math.max(0, Math.min(1, (t + 1 - o.onsetS) / o.rampS));
    for (let p = 0; p < P; p++) {
      let lp = 0; for (let k = 0; k < K; k++) if (target[k] > 0) lp += ramp * logResp[p][k];
      const a = Math.sqrt(Math.exp(lp)), b = Math.sqrt(nF), re = a * rhythm[p][0][i] + b * noise[p][0][i], im = a * rhythm[p][1][i] + b * noise[p][1][i];
      sq[p][i] = re * re + im * im; wsum[p] += sq[p][i]; if (i >= Nw) wsum[p] -= sq[p][i - Nw];
      est[p] = wsum[p] / Math.min(i + 1, Nw) * logBiasScale;
    }
    if (t < 0) continue;
    decoded = fit(est, decoded);
    for (let k = 0; k < K; k++) {
      pos[k] = Math.max(-1, Math.min(1, pos[k] + o.gain * (decoded[k] - 0.5) * dt));
    }
    if (pos.every((x, k) => x * target[k] >= o.edge)) return t;
  }
  return NaN;
}
