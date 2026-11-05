import { synthesize } from '../physics/noise';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { RAW_DEFAULTS } from './s07-noise';

/** 2nd-order band-pass (a high-pass and a low-pass biquad) for the mu band. */
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
/** Two of them in cascade: a steeper band-pass, so that muscle and mains leak less into the mu band. */
const bandpass4 = (lo: number, hi: number, fs: number) => { const a = bandpass(lo, hi, fs), b = bandpass(lo, hi, fs); return (x: number) => b(a(x)); };

export interface Trial {
  /** time from the intention (s), the raw scalp signal, its 8 to 13 Hz band, and the expected amplitude of that band */
  t: Float64Array; raw: Float64Array; mu: Float64Array; env: Float64Array;
  /** the sliding-window power estimate relative to rest, the true power, and the threshold */
  rel: Float64Array; truth: Float64Array; threshold: number;
  /** when the true power reaches the threshold, and when the decoder's estimate first crosses it downwards after the intention */
  tTrue: number; det: number;
}
const FS = 250, SECONDS = 10, T0 = 4, SEED = 11, SKIN_UV = 1; // electrode noise at the 1 µV floor of sections 9 and 11 (claim skin-noise); // the intention is 4 s into the record, shown as t = 0, so the longest window is full 1 s before it

/** One imagined movement as the decoder sees it: a steady rhythm whose power falls by `drop` along a ramp, in the noise of section 7. */
export function simulateTrial(onset: number, ramp: number, T: number, drop: number): Trial {
  const n = FS * SECONDS, amp = Math.sqrt(1 - drop);
  const envelope = (t: number) => { const u = (t - T0 - onset) / ramp; return u <= 0 ? 1 : u >= 1 ? amp : 1 - (1 - amp) * u; };
  const s = synthesize({ ...RAW_DEFAULTS, fs: FS, seconds: SECONDS, blinksPerMinute: 0, skinUvRms: SKIN_UV, seed: SEED, envelope });
  // the decoder's chain: band-pass, square, trailing mean over the window, relative to the expected resting level
  const bp = bandpass4(8, 13, FS), bpr = bandpass4(8, 13, FS), bpn = bandpass4(8, 13, FS);
  const mu = new Float64Array(n), sq = new Float64Array(n);
  let restPow = 0, noiseBand = 0; // the resting rhythm and the noise through the same band-pass
  for (let i = 0; i < n; i++) {
    mu[i] = bp(s.total[i]); sq[i] = mu[i] * mu[i];
    const r = bpr(RAW_DEFAULTS.signalUv * Math.sin(2 * Math.PI * RAW_DEFAULTS.signalHz * s.t[i])), b = bpn(s.noise[i]);
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
    env[i] = Math.SQRT2 * Math.sqrt(restPow * pw + noiseBand); // the amplitude the band should have: the faded rhythm, with the in-band noise in quadrature
  }
  const threshold = (1 + (restPow * amp * amp + noiseBand) / base) / 2; // halfway between rest and the fully suppressed level
  let tTrue = NaN, det = NaN;
  for (let i = 1; i < n; i++) {
    if (t[i] < 0) continue;
    if (isNaN(tTrue) && truth[i] <= threshold) tTrue = t[i];
    if (isNaN(det) && !isNaN(rel[i - 1]) && rel[i] < threshold && !(rel[i - 1] < threshold)) det = t[i];
  }
  return { t, raw: s.total, mu, env, rel, truth, threshold, tTrue, det };
}

export function mountDelay(root: HTMLElement) {
  const sec = section(root, 'delay', '10', 'Reading an EEG signal takes time', 'The brain response and the decoder both contribute to the delay');
  prose(sec.text, `
<p>EEG interfaces can read rhythms or responses to events, as section 6 showed. This section uses a simulated robot arm reach to demonstrate how EEG has inherent delays between human intention and action. For imagined-movement
control, a decoder can look for a fall in the mu rhythm's power. In cued hand imagery, motor-cortex activation
starts about 0.3 s after the cue, and classification from one trial is most accurate about 1 s after the cue
${c('erd-timecourse')}.</p>
<p>The decoder also needs time to estimate power from a noisy signal. For example, one system that achieved
three-dimensional control updated its spectrum every 50 ms using the previous 400 ms of EEG
${c('bci-windows')}. Updating often still means reading a window of earlier data.</p>
<p>This figure isolates these delays for one imagined movement. The button press defines the model's
intention time. The chosen onset and fade duration are informed by cued-imagery timing
${c('erd-timecourse')}. In this figure the rhythm keeps the same strength except for that fade.
A real rhythm also grows and shrinks on its own from moment to moment ${c('rhythm-fluctuation')}. Section 9 includes those swings, however this
figure leaves them out so the delays are easier to interpret. The rhythm's strength matches section 7's alpha rhythm, a generous assumption
because mu is usually weaker ${c('mu-vs-alpha')}.</p>
<p>The decoder keeps the chosen frequency band, then averages its squared voltage over a trailing window
to estimate power. The threshold is halfway between resting power and the power after the fade is complete.
Filtering also delays the signal, and the window still contains earlier samples with higher power as the rhythm
fades. The arm starts when the estimate first crosses below the threshold after the modeled intention.
These are choices for this demonstration, not a universal delay for EEG ${c('delay-model')}.</p>
`);

  const sWin = slider({ label: 'Analysis window length', unit: 's', min: 0.4, max: 3, value: 1, step: 0.05, note: c('delay-model') + c('bci-windows'), marks: [{ value: 1, label: 'Default' }] });
  const sDrop = slider({ label: 'Power lost during imagery', unit: '%', min: 40, max: 90, value: P.erdPowerDrop * 100, step: 1, note: c('delay-model') + c('erd-depth'), marks: [{ value: P.erdPowerDrop * 100, label: 'Default' }, { value: 85, label: 'Study mean' }], trackPx: 300 });
  const sOnset = slider({ label: 'Rhythm starts to fade after the intention', unit: 's', min: 0, max: 1.5, value: P.erdOnsetS, step: 0.05, note: c('delay-model') + c('erd-timecourse'), marks: [{ value: P.erdOnsetS, label: 'Default' }] });
  const sRamp = slider({ label: 'Time for the rhythm to fade fully', unit: 's', min: 0.1, max: 2, value: P.erdRampS, step: 0.05, note: c('delay-model') + c('erd-timecourse'), marks: [{ value: P.erdRampS, label: 'Default' }] });
  const rOnset = readout('Intention → fade starts');
  const rTrue = readout('Intention → model power at threshold');
  const rDet = readout('Intention → arm starts');

  const fig = figure(sec.fig, `Top: the simulated scalp signal (${sw('#eb6834', 'line')}) combines the rhythm and noise around the modeled intention at t = 0. Middle: the filtered 8 to 13 Hz signal (${sw('#2a78d6', 'line')}) is shown with its expected amplitude including noise (${sw('#898781', 'dash')}). Bottom: the window's power estimate (${sw('#2a78d6', 'line')}) follows the model's expected band power including noise (${sw('#898781', 'dash')}), and its first downward threshold crossing after the intention starts the arm. Each readout measures time from the intention to its named endpoint ${c('delay-model')}.`);
  fig.viz.append(vizTitle('Scalp signal at one electrode around one imagined movement'));
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Time from the intention', domain: [-2, 5], hideTickLabels: true }, y: { label: 'µV', domain: [-50, 50], ticks: 3 }, height: 86, margin: { top: 18, bottom: 6 } });
  fig.viz.append(vizTitle('Filtered scalp signal and expected amplitude'));
  const mid = linePlot(fig.viz, { x: { label: '', tip: 'Time from the intention', domain: [-2, 5], hideTickLabels: true }, y: { label: 'µV', ticks: 3 }, height: 92, margin: { top: 8, bottom: 6 } });
  fig.viz.append(vizTitle('Estimated and modeled band power versus the threshold'));
  const bottom = linePlot(fig.viz, { x: { label: 'Time from the intention (s)', domain: [-2, 5] }, y: { label: 'Power (rest = 1)', domain: [0, 1.6], ticks: 3 }, height: 132, margin: { top: 10 } });
  const ctl = controls(sWin.el, sDrop.el, sOnset.el, sRamp.el);
  ctl.classList.add('aligned-controls', 'delay-controls');
  fig.panel.append(ctl);
  const arm = robotArm(fig.panel, () => trial);
  fig.viz.append(readouts(rOnset.el, rTrue.el, rDet.el));
  assumptions(fig.el, [
    { what: 'Rhythm and noise', value: 'A steady 10 Hz rhythm at section 7’s alpha strength, with the same noise sources except blinks; electrode–skin noise is fixed at 1 µV rms. The steady rhythm and generous mu strength simplify the demonstration.', cite: c('delay-model') + c('alpha-source-chain') + c('mu-vs-alpha') + c('skin-noise') },
    { what: 'Fade', value: `The amplitude falls along a linear ramp. By default, the fade starts ${P.erdOnsetS} s after the modeled intention, lasts ${P.erdRampS} s, and reduces rhythm power by ${Math.round(P.erdPowerDrop * 100)}%. Timing is chosen from cued-imagery evidence; it is not a measured delay from thought.`, cite: c('delay-model') + c('erd-timecourse') + c('erd-depth') },
    { what: 'Power estimate', value: 'The signal is filtered to 8–13 Hz. The trailing mean of squared voltage estimates its power. Both this estimate and its resting baseline include noise. The reference curves show expected band amplitude and power without filter delay or window averaging. The threshold lies halfway between expected resting and fully faded power.', cite: c('delay-model') },
    { what: 'Detection and replay', value: 'The first downward threshold crossing after the modeled intention starts the arm. Every replay uses the same noise realization; the readouts all start at the intention.', cite: c('delay-model') },
    { what: 'Chosen slider ranges', value: 'Window: 0.4 to 3 s; power loss: 40 to 90%; onset: 0 to 1.5 s; fade duration: 0.1 to 2 s. These are exploration settings, not measured population ranges.', cite: c('delay-model') },
    { what: 'Study comparisons', value: 'One three-dimensional EEG system used a 0.4 s window. Imagery studies reported mean peak power losses around 50% and 85% under different conditions; these trial averages do not establish a best result for an individual window.', cite: c('bci-windows') + c('erd-depth') },
  ]);

  let trial = simulateTrial(sOnset.value, sRamp.value, sWin.value, sDrop.value / 100);
  const pts = (a: ArrayLike<number>) => Array.from(a, (v, i) => [trial.t[i], v] as [number, number]).filter((p) => p[0] >= -2 && !isNaN(p[1]));
  function run() {
    trial = simulateTrial(sOnset.value, sRamp.value, sWin.value, sDrop.value / 100);
    const { det, tTrue, threshold } = trial;
    top.update([{ name: 'Scalp signal', points: pts(trial.raw), color: '#eb6834', width: 1 }], [{ axis: 'x', value: 0, label: 'intention', above: true }]);
    mid.update([
      { name: '8 to 13 Hz band of the signal', points: pts(trial.mu), color: '#2a78d6', width: 1.2 },
      { name: 'Expected band amplitude', points: pts(trial.env), color: '#898781', dashed: true, width: 1.5 },
      { name: '', points: pts(Float64Array.from(trial.env, (v) => -v)), color: '#898781', dashed: true, width: 1.5, noLegend: true },
    ], [{ axis: 'x', value: 0, label: '' }]);
    bottom.update([
      { name: 'Model band power', points: pts(trial.truth), color: '#898781', dashed: true, width: 1.5 },
      { name: `Estimate from a ${fmt(sWin.value, 2)} s window`, points: pts(trial.rel), color: '#2a78d6', width: 2 },
    ], [
      { axis: 'y', value: threshold, label: 'threshold' },
      { axis: 'x', value: 0, label: '' },
      ...(isNaN(det) ? [] : [{ axis: 'x' as const, value: det, label: `decoder fires ${fmt(det, 2)} s after the intention`, callout: true }]),
    ]);
    rOnset.set(`${fmt(sOnset.value, 2)} s`);
    rTrue.set(isNaN(tTrue) ? 'never' : `${fmt(tTrue, 2)} s`);
    rDet.set(isNaN(det) ? 'not within the record' : `${fmt(det, 2)} s`);
  }
  [sWin, sDrop, sOnset, sRamp].forEach((sl) => sl.onChange(() => { run(); arm.reset(); }));
  run();
  // end the arm's canvas level with the readouts under the plots, when the controls sit beside the plots
  const fit = () => {
    const v = fig.viz.getBoundingClientRect(), p = fig.panel.getBoundingClientRect();
    arm.fitBottom(p.top < v.top + 40 ? v.bottom : 0);
  };
  new ResizeObserver(fit).observe(fig.el);
  fit();

  const note = figure(sec.fig, `Each row describes a separate task. An early cued-imagery system returned its classification within 1.5 s ${c('erd-timecourse')}. The P300 peaks 250 to 500 ms after an attended, infrequent stimulus. That is the delay of one brain response, not the time to select a whole letter ${c('p300-response')}${c('p300-timing')}. One flicker-speller protocol used 0.5 s of stimulation and 0.5 s for a gaze shift per selection ${c('bci-windows')}. The rows are examples, not stages to add together or minimum delays for every interface.`, { panelWidth: '0px' });
  note.el.classList.add('figure-note');
  note.viz.append(vizTitle('Reported timings in three EEG interface examples'));
  note.viz.insertAdjacentHTML('beforeend', timelineSvg());
}

function timelineSvg(): string {
  const x = (t: number) => 210 + t * 360;
  const row = (y: number, label: string, segs: { from: number; to: number; text: string; color: string }[]) => `
    <text x="190" y="${y + 5}" font-size="14" font-weight="600" text-anchor="end" fill="#1a1a1a" font-family="system-ui, sans-serif">${label}</text>
    ${segs.map((sg) => `<rect x="${x(sg.from)}" y="${y - 11}" width="${x(sg.to) - x(sg.from)}" height="22" rx="4" fill="${sg.color}"/><text x="${(x(sg.from) + x(sg.to)) / 2}" y="${y + 5}" font-size="12.5" text-anchor="middle" fill="#1a1a1a" font-family="system-ui, sans-serif">${sg.text}</text>`).join('')}`;
  const ticks = [0, 0.5, 1, 1.5].map((t) => `<line x1="${x(t)}" y1="171" x2="${x(t)}" y2="179" stroke="#52514e"/><text x="${x(t)}" y="193" font-size="12" text-anchor="middle" fill="#52514e" font-family="system-ui, sans-serif">${t} s</text>`).join('');
  const axis = `<line x1="${x(0)}" y1="22" x2="${x(0)}" y2="175" stroke="#1a1a1a" stroke-width="1.5" stroke-dasharray="4 3"/><line x1="${x(0)}" y1="175" x2="${x(1.5)}" y2="175" stroke="#898781"/>${ticks}<text x="${(x(0) + x(1.5)) / 2}" y="216" font-size="12" text-anchor="middle" fill="#52514e" font-family="system-ui, sans-serif">Time from each task’s cue or stimulus</text>`;
  return `<svg class="sync-svg" viewBox="0 0 850 225" width="850" height="225" role="img" aria-label="Separate examples: cued imagery classification within 1.5 seconds, P300 peak at 250 to 500 milliseconds, and a one-second flicker selection">
    ${axis}
    ${row(45, 'Cued imagery system', [{ from: 0, to: 1.5, text: 'classification within 1.5 s', color: '#bcd3f0' }])}
    ${row(95, 'P300 response', [{ from: 0.25, to: 0.5, text: 'peak', color: '#f7c3bd' }])}
    ${row(145, 'Flicker selection', [{ from: 0, to: 0.5, text: 'stimulation', color: '#d8f0e6' }, { from: 0.5, to: 1.0, text: 'gaze shift', color: '#b3e3cf' }])}
  </svg>`;
}

/**
 * A two-link robot arm driven by the simulated decoder. Pressing the button is the intention (t = 0): the arm reaches for
 * the ball when the current trial's estimate crosses the threshold.
 */
function robotArm(parent: HTMLElement, current: () => Trial): { reset(): void; fitBottom(y: number): void } {
  const W = 380, H = 202, MOVE_S = 0.9;
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
  let det = NaN, phase: 'idle' | 'waiting' | 'moving' | 'done' = 'idle', t = 0, raf = 0;

  let lastPose: [number, number] = REST;
  function draw(pose: [number, number]) {
    lastPose = pose;
    ctx.clearRect(0, 0, W, cv.height);
    // a taller canvas (fitted to the plots beside it) keeps the scene at the bottom and the status line at the top
    ctx.save(); ctx.translate(0, cv.height - H);
    const status = phase === 'idle' ? ''
      : phase === 'waiting' ? `Intention at 0 s. Decoder still unsure: ${fmt(t, 2)} s`
      : phase === 'moving' ? `Detected at ${fmt(det, 2)} s: arm moving`
      : `The arm moved ${fmt(det, 2)} s after you pressed.`;
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
    // timeline from the intention: the detection and the time elapsed
    const tMax = Math.max(2, (isNaN(det) ? 2 : det) + MOVE_S + 0.3), x = (s: number) => 16 + (s / tMax) * (W - 32), y0 = 172;
    ctx.fillStyle = '#e8e7e1'; ctx.fillRect(x(0), y0, x(tMax) - x(0), 8);
    if (phase !== 'idle') { ctx.fillStyle = '#2a78d6'; ctx.fillRect(x(0), y0, x(Math.min(t, tMax)) - x(0), 8); }
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x(0) - 1, y0 - 3, 2, 14); ctx.textAlign = 'left'; ctx.fillText('intention', x(0) + 3, y0 + 23);
    if (!isNaN(det)) {
      // the detection label moves right of the intention label when the two would touch
      const wI = ctx.measureText('intention').width, label = `detected ${fmt(det, 2)} s`;
      ctx.fillRect(x(det) - 1, y0 - 3, 2, 14);
      const right = det / tMax > 0.6, lx = right ? x(det) - 3 : Math.max(x(det) + 3, x(0) + wI + 14);
      ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(label, lx, y0 + 23);
    }
    ctx.restore();
    // the status line, drawn last so the arm never covers it
    ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'left';
    if (status) {
      const w = ctx.measureText(status).width;
      ctx.fillStyle = 'rgba(252,252,251,0.9)'; ctx.fillRect(5, 6, w + 6, 17);
      ctx.fillStyle = '#1a1a1a'; ctx.fillText(status, 8, 18);
    }
  }
  const ease = (u: number) => u * u * (3 - 2 * u);
  const lerp = (u: number): [number, number] => [REST[0] + (REACH[0] - REST[0]) * u, REST[1] + (REACH[1] - REST[1]) * u];
  btn.addEventListener('click', () => {
    if (phase === 'waiting' || phase === 'moving') return;
    det = current().det;
    if (isNaN(det)) return;
    const start = performance.now();
    phase = 'waiting'; btn.disabled = true; btn.textContent = 'Move arm';
    const step = (now: number) => {
      t = (now - start) / 1000;
      if (t >= det + MOVE_S) { phase = 'done'; btn.disabled = false; btn.textContent = 'Move again'; draw(REACH); return; }
      if (t >= det) { phase = 'moving'; draw(lerp(ease((t - det) / MOVE_S))); } else draw(REST);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  draw(REST);
  return {
    /** stretch the canvas so it ends at page position y (the bottom of the plots beside it), never below its own height */
    fitBottom(y: number) {
      const h = Math.max(H, Math.round(y - cv.getBoundingClientRect().top));
      if (h !== cv.height) { cv.height = h; draw(lastPose); }
    },
    reset() { if (phase === 'waiting' || phase === 'moving') return; cancelAnimationFrame(raf); phase = 'idle'; det = NaN; t = 0; btn.textContent = 'Move arm'; draw(REST); },
  };
}
