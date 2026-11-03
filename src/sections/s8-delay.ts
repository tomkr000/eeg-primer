import { synthesize } from '../physics/noise';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { RAW_DEFAULTS } from './s4-noise';

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
<p>The figure simulates the chain for one imagined movement. The mu rhythm of section 4 starts to fade
0.3 s after the intention and settles within about a second; a sliding window of adjustable length
estimates its power, and the decoder fires when the estimate crosses halfway to the suppressed level. The
window is the lever: a short window reacts quickly but its estimate jumps around (few cycles averaged, so
false alarms), a long window is steady but late. The brain adds its own lead time too: the readiness
potential that precedes a self-initiated movement begins about 2 s before it, and the moment people report
deciding to move comes only about 200 ms before the movement, hundreds of milliseconds after the potential
has started ${c('readiness-potential')}. Put together, typing with EEG carries a floor of roughly a second
per decision that no electrode can remove.</p>`);

  const sWin = slider({ label: 'Analysis window length', unit: 's', min: 0.2, max: 3, value: 1, step: 0.05, note: c('bci-windows'), marks: [{ value: 1, label: 'Typical' }] });
  const sOnset = slider({ label: 'Rhythm starts to fade after the intention', unit: 's', min: 0, max: 1.5, value: P.erdOnsetS, step: 0.05, note: c('erd-timecourse'), marks: [{ value: P.erdOnsetS, label: 'Typical' }] });
  const sRamp = slider({ label: 'Time for the rhythm to fade fully', unit: 's', min: 0.1, max: 2, value: P.erdRampS, step: 0.05, note: c('erd-timecourse'), marks: [{ value: P.erdRampS, label: 'Typical' }] });
  const rDelay = readout('Delay from intention to detection');
  const rRes = readout('Frequency resolution of the window (1/T)');
  const rCycles = readout('Cycles of the 10 Hz rhythm in the window');
  const rFalse = readout('False detections before the intention');

  const fig = figure(sec.fig, `One imagined movement. Top: the scalp signal of section 4 (${sw('#eb6834', 'line')}) with the mu rhythm alone (${sw('#2a78d6', 'line')}); the intention is at t = 0 and the rhythm fades after it (event-related desynchronisation, ERD). Bottom: the rhythm’s power as a decoder would estimate it from a sliding window of the chosen length (${sw('#2a78d6', 'line')}), the true envelope (${sw('#898781', 'dash')}) and the detection threshold (${sw('#52514e', 'dash')}); the decoder fires where the estimate first crosses the threshold after the intention. A shorter window gets jumpy and fires early by accident; a longer one detects later.`);
  fig.viz.append(vizTitle('Simulated scalp potential around one imagined movement'));
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Time from the intention', domain: [-2, 4] }, y: { label: 'Potential (µV)' }, height: 172, legendInside: true });
  fig.viz.append(vizTitle('Mu-band power: true envelope versus the sliding-window estimate'));
  const bottom = linePlot(fig.viz, { x: { label: 'Time from the intention (s)', domain: [-2, 4] }, y: { label: 'Mu power (relative)', domain: [0, 1.6] }, height: 172, legendInside: true });
  fig.panel.append(controls(sWin.el, sOnset.el, sRamp.el));
  fig.viz.append(readouts(rDelay.el, rRes.el, rCycles.el, rFalse.el));
  assumptions(fig.el, [
    { what: 'Rhythm', value: `the section 4 mu/alpha rhythm (10 Hz, 20 µV) over the same noise, without blinks; it fades to ${Math.round(P.erdDepth * 100)}% of its amplitude along a linear ramp that starts ${P.erdOnsetS} s after the intention and lasts ${P.erdRampS} s (adjustable)`, cite: c('erd-timecourse') + c('alpha-source-chain') },
    { what: 'Estimator', value: 'the signal is band-passed to 8–13 Hz and its mean square over the trailing window is taken as the power; the threshold is halfway between the resting and the fully suppressed level', cite: c('spectral-window') },
    { what: 'Detection', value: 'the first window after the intention whose estimate falls below the threshold; windows before the intention that fall below it count as false detections', cite: '<span class="assumption-tag">model definition</span>' },
  ]);

  const fs = 250, seconds = 6, t0 = 2; // intention at 2 s into the record, shown as t = 0
  const depth = P.erdDepth;
  function run() {
    const onset = sOnset.value, ramp = sRamp.value, T = sWin.value;
    const envelope = (t: number) => { const u = (t - t0 - onset) / ramp; return u <= 0 ? 1 : u >= 1 ? depth : 1 - (1 - depth) * u; };
    const s = synthesize({ ...RAW_DEFAULTS, fs, seconds, blinksPerMinute: 0, seed: 23, envelope });
    const n = s.total.length;
    // band power estimate: band-pass, square, trailing mean over the window
    const bp = bandpass(8, 13, fs);
    const sq = new Float64Array(n);
    for (let i = 0; i < n; i++) { const y = bp(s.total[i]); sq[i] = y * y; }
    const w = Math.max(1, Math.round(T * fs));
    const est = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += sq[i]; if (i >= w) acc -= sq[i - w]; est[i] = i >= w - 1 ? acc / w : NaN; }
    // normalise to the resting level (mean estimate over the second before the intention)
    let base = 0, nb = 0;
    for (let i = 0; i < n; i++) { const t = s.t[i]; if (t > t0 - 1 && t < t0 && !isNaN(est[i])) { base += est[i]; nb++; } }
    base /= Math.max(nb, 1);
    const rel = Array.from(est, (v) => v / base);
    const threshold = (1 + depth * depth) / 2; // power halfway between rest (1) and fully suppressed (depth²)
    let det = NaN, falses = 0;
    for (let i = 1; i < n; i++) {
      if (isNaN(rel[i])) continue;
      const t = s.t[i] - t0;
      if (t < 0 && t > -1.5 && rel[i] < threshold && !(rel[i - 1] < threshold)) falses++;
      if (t >= 0 && isNaN(det) && rel[i] < threshold) det = t;
    }
    const pts = (a: ArrayLike<number>) => Array.from(a, (v, i) => [s.t[i] - t0, v] as [number, number]).filter((p) => p[0] >= -2 && !isNaN(p[1]));
    top.update([
      { name: 'Scalp signal', points: pts(s.total), color: '#eb6834', width: 1 },
      { name: 'Mu rhythm alone', points: pts(s.signal), color: '#2a78d6', width: 1.8 },
    ], [{ axis: 'x', value: 0, label: 'intention' }]);
    const truth = Array.from(s.t, (t) => [t - t0, envelope(t) ** 2] as [number, number]).filter((p) => p[0] >= -2);
    bottom.update([
      { name: 'True rhythm power', points: truth, color: '#898781', dashed: true, width: 1.5 },
      { name: `Estimate from a ${fmt(T, 2)} s window`, points: pts(rel), color: '#2a78d6', width: 2 },
    ], [
      { axis: 'y', value: threshold, label: 'threshold' },
      { axis: 'x', value: 0, label: '' },
      ...(isNaN(det) ? [] : [{ axis: 'x' as const, value: det, label: `detected ${fmt(det, 2)} s after the intention` }]),
    ]);
    rDelay.set(isNaN(det) ? 'not detected' : `${fmt(det, 2)} s`);
    rRes.set(`${fmt(1 / T, 2)} Hz`);
    rCycles.set(fmt(10 * T, 2));
    rFalse.set(String(falses));
  }
  [sWin, sOnset, sRamp].forEach((sl) => sl.onChange(run));
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
