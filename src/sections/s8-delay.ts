import { synthesize } from '../physics/noise';
const MC = 120; // random trials behind the outcome rates
import { bandNoise } from '../physics/control';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { RAW_DEFAULTS } from './s5-noise';

/** 2nd-order Butterworth band-pass (two biquads) for the mu band. */
function bandpass(lo: number, hi: number, fs: number) {
  const q = Math.SQRT1_2;
  const stage = (type: 'lp' | 'hp', fc: number) => {
    const w = Math.tan((Math.PI * fc) / fs), k = w * w, n = 1 / (1 + w / q + k);
    const [b0, b1, b2] = type === 'lp' ? [k * n, 2 * k * n, k * n] : [n, -2 * n, n];
    const a1 = 2 * (k - 1) * n, a2 = (1 - w / q + k) * n;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x: number) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  };
  const hp = stage('hp', lo), lp = stage('lp', hi);
  return (x: number) => lp(hp(x));
}

export interface Trial {
  /** time from the intention (s), the raw scalp signal, its 8 to 13 Hz band, and the expected amplitude of that band */
  t: Float64Array; raw: Float64Array; mu: Float64Array; env: Float64Array;
  /** the sliding-window power estimate relative to rest, the true power, and the threshold */
  rel: Float64Array; truth: Float64Array; threshold: number;
  /** time of the first downward crossing after the intention (NaN if none within the deadline), and of one before it (NaN if none) */
  det: number; early: number;
}
const FS = 250, SECONDS = 8, T0 = 4, DEADLINE = 4, EARLY_S = 1.5; // the intention is 4 s into the record, shown as t = 0, so the longest window is full 1.5 s before it

/** One imagined movement as the decoder sees it: `seed` picks the rhythm's own waxing and waning and the noise. */
export function simulateTrial(seed: number, onset: number, ramp: number, T: number, drop: number): Trial {
  const n = FS * SECONDS, amp = Math.sqrt(1 - drop);
  const rhythm = bandNoise(n, FS, 10, P.decoderBandHz, seed);
  const envelope = (t: number) => { const u = (t - T0 - onset) / ramp; return u <= 0 ? 1 : u >= 1 ? amp : 1 - (1 - amp) * u; };
  const s = synthesize({ ...RAW_DEFAULTS, fs: FS, seconds: SECONDS, blinksPerMinute: 0, seed: seed + 1000, envelope, rhythm });
  // the decoder's chain: band-pass, square, trailing mean over the window, relative to the expected resting level
  const bp = bandpass(8, 13, FS), bpr = bandpass(8, 13, FS), bpn = bandpass(8, 13, FS);
  const mu = new Float64Array(n), sq = new Float64Array(n);
  let restPow = 0, noiseBand = 0; // the resting rhythm and the noise through the same band-pass
  for (let i = 0; i < n; i++) {
    mu[i] = bp(s.total[i]); sq[i] = mu[i] * mu[i];
    const r = bpr(RAW_DEFAULTS.signalUv * Math.SQRT1_2 * rhythm[i]), b = bpn(s.noise[i]);
    restPow += r * r; noiseBand += b * b;
  }
  restPow /= n; noiseBand /= n;
  const base = restPow + noiseBand;
  const w = Math.max(1, Math.round(T * FS)), rel = new Float64Array(n).fill(NaN), truth = new Float64Array(n), env = new Float64Array(n), t = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    t[i] = s.t[i] - T0;
    acc += sq[i]; if (i >= w) acc -= sq[i - w]; if (i >= w - 1) rel[i] = acc / w / base;
    const pw = envelope(s.t[i]) ** 2;
    truth[i] = (restPow * pw + noiseBand) / base;
    env[i] = Math.SQRT2 * Math.sqrt(restPow * pw + noiseBand); // expected amplitude of the band
  }
  const threshold = (1 + (restPow * amp * amp + noiseBand) / base) / 2; // halfway between rest and the fully suppressed level
  let det = NaN, early = NaN;
  for (let i = 1; i < n; i++) {
    if (isNaN(rel[i]) || isNaN(rel[i - 1])) continue;
    const crossing = rel[i] < threshold && !(rel[i - 1] < threshold);
    if (!crossing) continue;
    if (t[i] < 0 && t[i] > -EARLY_S && isNaN(early)) early = t[i];
    if (t[i] >= 0 && t[i] <= DEADLINE && isNaN(det)) det = t[i];
  }
  return { t, raw: s.total, mu, env, rel, truth, threshold, det, early };
}
/** Shares of attempts that fire early, move in time and miss, from `n` random trials at the given settings. */
export function outcomeRates(n: number, onset: number, ramp: number, T: number, drop: number): { early: number; moved: number; missed: number } {
  let early = 0, moved = 0;
  for (let k = 0; k < n; k++) { const tr = simulateTrial(5000 + k, onset, ramp, T, drop); if (!isNaN(tr.early)) early++; else if (!isNaN(tr.det)) moved++; }
  return { early: early / n, moved: moved / n, missed: 1 - (early + moved) / n };
}

export function mountDelay(root: HTMLElement) {
  const sec = section(root, 'delay', '8', 'EEG signals have inherent delays');
  prose(sec.text, `
<p>Even a perfect electrode cannot report a thought the moment it happens, because what EEG reads is a
rhythm, and a rhythm takes time both to change and to be measured. The sensorimotor mu rhythm over the hand
area fades (desynchronises) when a movement is prepared or imagined and rebounds afterwards. Before a
self-paced finger movement the fade begins about 1.75 s ahead of the movement; after a cue to imagine a
movement, the motor cortex responds within about 300 ms and the imagery is best told apart about 1 s after
the cue, which is why the first imagery BCI answered within 1.5 s ${c('erd-timecourse')}. A decoder then has
to estimate how strong the rhythm is, and an estimate from a record of length T resolves frequencies no finer
than 1/T and is noisy unless several segments are averaged, which costs resolution ${c('spectral-window')}.
The sensorimotor BCI that reached three-dimensional control re-estimated its spectrum every 50 ms from the
previous 400 ms, and competition imagery trials allotted 4 s each ${c('bci-windows')}. Evoked responses
are no faster: the P300 peaks about 300 ms after its stimulus and spellers repeat each flash many times,
up to 29 s per character ${c('p300-timing')}, and the quickest flicker spellers still need 0.3 to 0.5 s of
stimulus plus 0.5 s for the eyes to move per character ${c('bci-windows')}.</p>
<p>The figure follows the decoder's chain for one imagined movement. The mu rhythm of section 5 starts to
fade 0.3 s after the intention and settles within about a second, losing half its power ${c('erd-depth')};
like every rhythm it also waxes and wanes by itself (section 7), so the fade is invisible in the raw trace.
The decoder first filters out everything but the 8 to 13 Hz band, then averages the band's power over a
sliding window, and fires when the estimate crosses halfway to the suppressed level. The window is the
lever: a short window reacts quickly but its estimate jumps around (few cycles averaged), so it fires by
chance about as often as by intent; a long window is steady but late. Every press of the button draws a
fresh trial, so the arm sometimes starts early, sometimes late and sometimes not at all, at the rates the
readouts give: fast or reliable, not both. The brain adds its own lead time too: the readiness potential that precedes a self-initiated
movement begins about 2 s before it, and the moment people report deciding to move comes only about 200 ms
before the movement, hundreds of milliseconds after the potential has started ${c('readiness-potential')}.
Put together, typing with EEG carries a floor of roughly a second per decision that no electrode can
remove.</p>`);

  const sWin = slider({ label: 'Analysis window length', unit: 's', min: 0.2, max: 3, value: 1, step: 0.05, note: c('bci-windows'), marks: [{ value: 1, label: 'Typical' }] });
  const sDrop = slider({ label: 'Power lost during imagery (ERD)', unit: '%', min: 10, max: 90, value: P.erdPowerDrop * 100, step: 1, note: c('erd-depth'), marks: [{ value: P.erdPowerDrop * 100, label: 'Typical' }, { value: 85, label: 'Best case' }] });
  const sOnset = slider({ label: 'Rhythm starts to fade after the intention', unit: 's', min: 0, max: 1.5, value: P.erdOnsetS, step: 0.05, note: c('erd-timecourse'), marks: [{ value: P.erdOnsetS, label: 'Typical' }] });
  const sRamp = slider({ label: 'Time for the rhythm to fade fully', unit: 's', min: 0.1, max: 2, value: P.erdRampS, step: 0.05, note: c('erd-timecourse'), marks: [{ value: P.erdRampS, label: 'Typical' }] });
  const rDelay = readout('This attempt: detected after');
  const rMoved = readout(`Fires in time (0 to ${DEADLINE} s after the intention)`);
  const rEarly = readout(`Fires early (in the ${EARLY_S} s before it)`);
  const rMissed = readout(`Never fires (miss)`);

  const fig = figure(sec.fig, `One imagined movement, drawn afresh at every press of the button. Top: the scalp signal of section 5 (${sw('#eb6834', 'line')}), rhythm plus noise; the intention is at t = 0 and the rhythm fades after it (event-related desynchronisation, ERD), which the raw trace does not show. Middle: the decoder's first step, the 8 to 13 Hz band of that signal (${sw('#2a78d6', 'line')}), with the amplitude it should have on average (${sw('#898781', 'dash')}): the fade is there, but the band waxes and wanes by itself. Bottom: the band's power as the decoder estimates it from a sliding window of the chosen length (${sw('#2a78d6', 'line')}), the true power (${sw('#898781', 'dash')}) and the threshold (${sw('#52514e', 'dash')}); the decoder fires where the estimate first crosses the threshold downwards after the intention. A shorter window fires early by accident; a longer one detects later or, with a shallow fade, not at all. The readouts give the shares of attempts that fire early, move in time and miss, from ${MC} random trials at the current settings.`);
  fig.viz.append(vizTitle('Scalp signal at one electrode around one imagined movement'));
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Time from the intention', domain: [-2, 4] }, y: { label: 'µV', ticks: 3 }, height: 86, margin: { top: 8, bottom: 22 } });
  fig.viz.append(vizTitle('The decoder’s first step: the 8 to 13 Hz band of that signal'));
  const mid = linePlot(fig.viz, { x: { label: '', tip: 'Time from the intention', domain: [-2, 4] }, y: { label: 'µV', ticks: 3 }, height: 104, margin: { top: 8, bottom: 22 } });
  fig.viz.append(vizTitle('Mu-band power over the sliding window versus the threshold'));
  const bottom = linePlot(fig.viz, { x: { label: 'Time from the intention (s)', domain: [-2, 4] }, y: { label: 'Power (rest = 1)', domain: [0, 3], ticks: 3 }, height: 132, margin: { top: 10 } });
  fig.panel.append(controls(sWin.el, sDrop.el, sOnset.el, sRamp.el));
  const arm = robotArm(fig.panel, () => { seed++; run(); return trial; });
  fig.viz.append(readouts(rDelay.el, rMoved.el, rEarly.el, rMissed.el));
  assumptions(fig.el, [
    { what: 'Rhythm', value: `the 20 µV mu rhythm of section 5 made a narrowband random process (a ${P.decoderBandHz} Hz band round 10 Hz, waxing and waning by itself as in section 7) over the same noise, without blinks; its power falls by the ERD fraction (${Math.round(P.erdPowerDrop * 100)}% by default) along a linear ramp that starts ${P.erdOnsetS} s after the intention and lasts ${P.erdRampS} s (adjustable); every press of the button draws new rhythm and noise`, cite: c('erd-depth') + c('erd-timecourse') + c('alpha-source-chain') },
    { what: 'Estimator', value: 'the signal is band-passed to 8–13 Hz and its mean square over the trailing window is taken as the power, relative to the expected resting level; the threshold is halfway between the resting and the fully suppressed level', cite: c('spectral-window') },
    { what: 'Outcomes', value: `the first downward crossing of the threshold after the intention, within ${DEADLINE} s, moves the arm; a crossing in the ${EARLY_S} s before the intention is a false start; no crossing within ${DEADLINE} s is a miss. The rates are the shares of ${MC} random trials at the current settings`, cite: '<span class="assumption-tag">model definition</span>' },
  ]);

  let seed = 23, trial = simulateTrial(seed, sOnset.value, sRamp.value, sWin.value, sDrop.value / 100), ratesTimer = 0;
  const pts = (a: ArrayLike<number>) => Array.from(a, (v, i) => [trial.t[i], v] as [number, number]).filter((p) => p[0] >= -2 && !isNaN(p[1]));
  function run() {
    trial = simulateTrial(seed, sOnset.value, sRamp.value, sWin.value, sDrop.value / 100);
    const { det, early, threshold } = trial;
    top.update([{ name: 'Scalp signal', points: pts(trial.raw), color: '#eb6834', width: 1 }], [{ axis: 'x', value: 0, label: 'intention' }]);
    mid.update([
      { name: '8 to 13 Hz band of the signal', points: pts(trial.mu), color: '#2a78d6', width: 1.2 },
      { name: 'Expected amplitude', points: pts(trial.env), color: '#898781', dashed: true, width: 1.5 },
      { name: '', points: pts(Float64Array.from(trial.env, (v) => -v)), color: '#898781', dashed: true, width: 1.5, noLegend: true },
    ], [{ axis: 'x', value: 0, label: '' }]);
    bottom.update([
      { name: 'True rhythm power', points: pts(trial.truth), color: '#898781', dashed: true, width: 1.5 },
      { name: `Estimate from a ${fmt(sWin.value, 2)} s window`, points: pts(trial.rel), color: '#2a78d6', width: 2 },
    ], [
      { axis: 'y', value: threshold, label: 'threshold' },
      { axis: 'x', value: 0, label: '' },
      ...(isNaN(early) ? [] : [{ axis: 'x' as const, value: early, label: `fired ${fmt(-early, 2)} s early`, color: '#e34948', callout: true }]),
      ...(isNaN(det) ? [] : [{ axis: 'x' as const, value: det, label: `detected ${fmt(det, 2)} s after the intention`, callout: true }]),
    ]);
    rDelay.set(isNaN(det) ? 'missed' : `${fmt(det, 2)} s`);
    // the outcome rates take a moment: recompute once the slider settles
    clearTimeout(ratesTimer);
    ratesTimer = window.setTimeout(() => {
      const r = outcomeRates(MC, sOnset.value, sRamp.value, sWin.value, sDrop.value / 100);
      rMoved.set(`${Math.round(100 * r.moved)}%`); rEarly.set(`${Math.round(100 * r.early)}%`); rMissed.set(`${Math.round(100 * r.missed)}%`);
      arm.setRates(r);
    }, 120);
  }
  [sWin, sDrop, sOnset, sRamp].forEach((sl) => sl.onChange(() => { run(); arm.reset(); }));
  run();

  // timeline of the delay sources
  const note = figure(sec.fig, '', { panelWidth: '0px' });
  note.el.classList.add('figure-note');
  note.viz.append(vizTitle('Time from intention or stimulus to decision, four paradigms'));
  note.viz.insertAdjacentHTML('beforeend', timelineSvg());
  note.caption.innerHTML = `<strong>Where the time goes.</strong> After a cue to imagine a movement the motor cortex responds in about 0.3 s and the imagery is best told apart about 1 s later; a window of several cycles must then fill ${c('erd-timecourse')}${c('bci-windows')}. A P300 speller waits 0.3 s for each response and repeats the flashes, up to 29 s per character ${c('p300-timing')}. A flicker speller needs 0.5 s of stimulus and 0.5 s for the eyes to move ${c('bci-windows')}. And the brain starts before the person knows it: the readiness potential begins about 2 s before a self-initiated movement, while the reported decision comes only 0.2 s before it ${c('readiness-potential')}. None of these is an electrode problem.`;
}

function timelineSvg(): string {
  const x = (t: number) => 410 + t * 135; // 135 px per second, t = 0 at the intention or stimulus (the movement, for the last row)
  const row = (y: number, label: string, segs: { from: number; to: number; text: string; color: string; above?: boolean }[], decision?: number) => `
    <text x="${x(-2) - 10}" y="${y + 5}" font-size="14" font-weight="600" text-anchor="end" fill="#1a1a1a" font-family="system-ui, sans-serif">${label}</text>
    ${segs.map((sg) => `<rect x="${x(sg.from)}" y="${y - 11}" width="${x(sg.to) - x(sg.from)}" height="22" rx="4" fill="${sg.color}"/><text x="${(x(sg.from) + x(sg.to)) / 2}" y="${sg.above ? y - 15 : y + 5}" font-size="12.5" text-anchor="middle" fill="#1a1a1a" font-family="system-ui, sans-serif">${sg.text}</text>`).join('')}
    ${decision === undefined ? '' : `<path d="M${x(decision)},${y - 13} l6,13 l-6,13 z" fill="#1a1a1a"/><text x="${x(decision) + 10}" y="${y + 5}" font-size="12.5" fill="#1a1a1a" font-family="system-ui, sans-serif">decision</text>`}`;
  const ticks = [-2, -1, 0, 1, 2, 3].map((t) => `<line x1="${x(t)}" y1="196" x2="${x(t)}" y2="204" stroke="#52514e"/><text x="${x(t)}" y="218" font-size="12" text-anchor="middle" fill="#52514e" font-family="system-ui, sans-serif">${t} s</text>`).join('');
  const axis = `<line x1="${x(0)}" y1="22" x2="${x(0)}" y2="200" stroke="#1a1a1a" stroke-width="1.5" stroke-dasharray="4 3"/><line x1="${x(-2)}" y1="200" x2="${x(3.2)}" y2="200" stroke="#898781"/>${ticks}<text x="${x(0)}" y="14" font-size="12" text-anchor="middle" fill="#52514e" font-family="system-ui, sans-serif">intention or stimulus</text>`;
  return `<svg class="sync-svg" viewBox="0 0 850 225" width="850" height="225" role="img" aria-label="Timeline of EEG delays">
    ${axis}
    ${row(45, 'Motor imagery', [{ from: 0, to: 0.3, text: 'cortex responds', color: '#dbe8f7', above: true }, { from: 0.3, to: 1.0, text: 'rhythm fades', color: '#bcd3f0' }, { from: 1.0, to: 1.5, text: 'window', color: '#9fc0e8' }], 1.5)}
    ${row(90, 'P300 speller', [{ from: 0, to: 0.3, text: 'P300', color: '#fde1df', above: true }, { from: 0.3, to: 3.2, text: 'repeat the flashes and average: 3 to 29 s per character', color: '#f7c3bd' }])}
    ${row(135, 'Flicker speller', [{ from: 0, to: 0.5, text: 'flicker', color: '#d8f0e6' }, { from: 0.5, to: 1.0, text: 'eyes move', color: '#b3e3cf' }], 1.0)}
    ${row(180, 'The brain itself', [{ from: -2, to: -0.4, text: 'readiness potential builds for 2 s', color: '#efe7d7' }, { from: -0.4, to: 0, text: '', color: '#c3c2b7' }])}
    <text x="${x(-0.2)}" y="${180 - 15}" font-size="12.5" text-anchor="end" fill="#1a1a1a" font-family="system-ui, sans-serif">reported decision 0.2 s before the movement ▸</text>
  </svg>`;
}

/**
 * A two-link robot arm driven by the simulated decoder. Pressing the button is the intention (t = 0) and draws a fresh
 * trial (`attempt`): the arm reaches for the ball when that trial's estimate crosses the threshold, moves at once if the
 * decoder had already fired before the intention (a false start), and stays put if it never fires (a miss).
 */
function robotArm(parent: HTMLElement, attempt: () => Trial): { reset(): void; setRates(r: { early: number; moved: number; missed: number }): void } {
  const W = 380, H = 202, MOVE_S = 0.9, RED = '#e34948';
  const box = document.createElement('div');
  box.className = 'viz-box arm-box';
  const head = document.createElement('div');
  head.className = 'arm-head';
  const btn = document.createElement('button');
  btn.className = 'btn arm-btn'; btn.textContent = 'Move arm';
  head.append(vizTitle('Try it: move the arm by intent'), btn);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H; cv.className = 'glow'; cv.style.width = `${W}px`;
  box.append(head, cv);
  parent.append(box);
  const ctx = cv.getContext('2d')!;
  const base: [number, number] = [70, 140], L1 = 100, L2 = 95, ball: [number, number] = [265, 140], TABLE = 152;
  // inverse kinematics (elbow up) for the reach, in canvas coordinates with y down
  const ik = (tx: number, ty: number): [number, number] => {
    const dx = tx - base[0], dy = base[1] - ty, d2 = dx * dx + dy * dy;
    const c2 = Math.max(-1, Math.min(1, (d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2))), t2 = -Math.acos(c2);
    return [Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2)), t2];
  };
  const REST: [number, number] = [1.35, -2.55], REACH = ik(ball[0] - 16, ball[1]);
  type Outcome = 'moved' | 'early' | 'missed';
  let det = NaN, early = NaN, rates = { early: 0, moved: 0, missed: 0 }, phase: 'idle' | 'waiting' | 'moving' | 'done' = 'idle', t = 0, raf = 0;
  const outcome = (): Outcome => (!isNaN(early) ? 'early' : !isNaN(det) ? 'moved' : 'missed');
  const pct = (v: number) => `${Math.round(100 * v)}%`;

  function draw(pose: [number, number]) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
    const o = outcome();
    const status = phase === 'idle' ? 'Press Move arm: the press is your intention (t = 0).'
      : phase === 'waiting' ? `Intention at 0 s. Decoder still unsure: ${fmt(t, 2)} s`
      : phase === 'moving' ? (o === 'early' ? `False start: the decoder fired ${fmt(-early, 2)} s before you pressed` : `Detected at ${fmt(det, 2)} s: arm moving`)
      : o === 'moved' ? `The arm moved ${fmt(det, 2)} s after you pressed.`
      : o === 'early' ? `False start: the decoder fired ${fmt(-early, 2)} s before you pressed.`
      : `Missed: the decoder never saw the drop within ${DEADLINE} s.`;
    // table, ball, base
    ctx.strokeStyle = '#c3c2b7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, TABLE); ctx.lineTo(W - 10, TABLE); ctx.stroke();
    ctx.fillStyle = '#eb6834'; ctx.beginPath(); ctx.arc(ball[0], TABLE - 12, 12, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#52514e'; ctx.fillRect(base[0] - 22, base[1], 44, TABLE - base[1]);
    // arm
    const [a1, a2] = pose;
    const ex = base[0] + L1 * Math.cos(a1), ey = base[1] - L1 * Math.sin(a1);
    const hx = ex + L2 * Math.cos(a1 + a2), hy = ey - L2 * Math.sin(a1 + a2);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#898781'; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    for (const [x, y] of [[base[0], base[1]], [ex, ey]] as [number, number][]) { ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.fill(); }
    // gripper: two fingers along the forearm direction
    const ang = a1 + a2, ux = Math.cos(ang), uy = -Math.sin(ang), nx = -uy, ny = ux;
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3;
    for (const sgn of [1, -1]) { ctx.beginPath(); ctx.moveTo(hx + sgn * 7 * nx, hy + sgn * 7 * ny); ctx.lineTo(hx + sgn * 7 * nx + 14 * ux, hy + sgn * 7 * ny + 14 * uy); ctx.stroke(); }
    // a missed attempt: a cross beside the ball
    if (phase === 'done' && o === 'missed') {
      ctx.strokeStyle = RED; ctx.lineWidth = 3;
      const cx = ball[0] + 34, cy = TABLE - 14;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
    }
    // the status lines, drawn last so the arm never covers them
    ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'left';
    const lines: [string, string][] = [[status, phase !== 'idle' && o !== 'moved' ? RED : '#1a1a1a']];
    if (phase === 'done') lines.push([`At these settings: in time ${pct(rates.moved)}, early ${pct(rates.early)}, missed ${pct(rates.missed)}`, '#52514e']);
    lines.forEach(([text, color], i) => {
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(252,252,251,0.9)'; ctx.fillRect(5, 6 + i * 18, w + 6, 17);
      ctx.fillStyle = color; ctx.fillText(text, 8, 18 + i * 18);
    });
    // timeline from 1.5 s before the intention: the intention, a false start or the detection, and the time elapsed
    const tMax = Math.max(2, (isNaN(det) ? DEADLINE : det) + MOVE_S + 0.3), x = (s: number) => 16 + ((s + EARLY_S) / (tMax + EARLY_S)) * (W - 32), y0 = 172;
    ctx.fillStyle = '#e8e7e1'; ctx.fillRect(x(-EARLY_S), y0, x(tMax) - x(-EARLY_S), 8);
    if (phase !== 'idle') { ctx.fillStyle = '#2a78d6'; ctx.fillRect(x(0), y0, x(Math.min(t, tMax)) - x(0), 8); }
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a';
    const tick = (s: number, label: string, align: CanvasTextAlign, above: boolean, color = '#1a1a1a') => { ctx.fillStyle = color; ctx.fillRect(x(s) - 1, y0 - 3, 2, 14); ctx.textAlign = align; ctx.fillText(label, x(s) + (align === 'left' ? 3 : align === 'right' ? -3 : 0), above ? y0 - 5 : y0 + 23); };
    tick(0, 'intention', 'left', false);
    if (!isNaN(early)) tick(early, 'fired early', 'right', true, RED);
    else if (!isNaN(det)) {
      // the detection label moves right of the intention label when the two would touch
      const wI = ctx.measureText('intention').width, label = `detected ${fmt(det, 2)} s`;
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x(det) - 1, y0 - 3, 2, 14);
      const right = det / tMax > 0.6, lx = right ? x(det) - 3 : Math.max(x(det) + 3, x(0) + wI + 14);
      ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(label, lx, y0 + 23);
    } else if (phase === 'done') { ctx.fillStyle = RED; ctx.textAlign = 'right'; ctx.fillText(`no detection in ${DEADLINE} s`, x(tMax), y0 + 23); }
  }
  const ease = (u: number) => u * u * (3 - 2 * u);
  const lerp = (u: number): [number, number] => [REST[0] + (REACH[0] - REST[0]) * u, REST[1] + (REACH[1] - REST[1]) * u];
  btn.addEventListener('click', () => {
    if (phase === 'waiting' || phase === 'moving') return;
    const tr = attempt();
    det = tr.det; early = tr.early;
    const o = outcome(), start = performance.now(), moveAt = o === 'early' ? 0 : det;
    phase = o === 'early' ? 'moving' : 'waiting'; btn.disabled = true; btn.textContent = 'Move arm';
    const step = (now: number) => {
      t = (now - start) / 1000;
      if (o === 'missed' ? t >= DEADLINE : t >= moveAt + MOVE_S) { phase = 'done'; btn.disabled = false; btn.textContent = 'Try again'; draw(o === 'missed' ? REST : REACH); return; }
      if (o !== 'missed' && t >= moveAt) { phase = 'moving'; draw(lerp(ease((t - moveAt) / MOVE_S))); } else draw(REST);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  draw(REST);
  return {
    reset() { if (phase === 'waiting' || phase === 'moving') return; cancelAnimationFrame(raf); phase = 'idle'; det = NaN; early = NaN; t = 0; btn.textContent = 'Move arm'; draw(REST); },
    setRates(r) { rates = r; if (phase === 'done') draw(outcome() === 'missed' ? REST : REACH); },
  };
}
