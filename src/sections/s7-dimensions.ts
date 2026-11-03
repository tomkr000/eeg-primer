import { restVersusImagery, mWayCorrect, bandNoise, wolpawBits, gammaPdf, snrVersusElectrodes } from '../physics/control';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot, type Note } from '../ui/plot';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { sourceSliders, momentNam } from './s5-noise';

/** the decoder's channel: the best linear combination of a 64-electrode cap (the model of section 9) */
const CAP = { electrodes: 64, noiseUv: 1, bgUv: 10, radiusMm: 10 };
const [cap] = snrVersusElectrodes([CAP.electrodes], CAP.noiseUv, CAP.bgUv, CAP.radiusMm);
/** rhythm power over the in-band noise power in that channel */
const rhoOf = (N: number, f: number) => (momentNam(N, f) * cap.withBrain) ** 2;

// a simulated recording: rest and imagery alternate in blocks; the rhythm and the noise are fixed random draws
const FS = 50, SHOW = 24, LEAD = 4, BLOCK = 4;
const nS = (SHOW + LEAD) * FS;
const rhythm = bandNoise(nS, FS, 10, P.decoderBandHz, 31), noise = bandNoise(nS, FS, 10, P.decoderBandHz, 77);
const isImagery = (t: number) => t >= 0 && Math.floor(t / BLOCK) % 2 === 1;
/** rhythm power at time t (rest = 1): it fades after each imagery cue and recovers after each rest cue (section 8 timing) */
function powerAt(t: number, d: number): number {
  if (t < BLOCK) return 1;
  const k = Math.floor(t / BLOCK), u = Math.min(1, Math.max(0, (t - k * BLOCK - P.erdOnsetS) / P.erdRampS));
  return k % 2 === 1 ? 1 - d * u : 1 - d + d * u;
}
const REST = '#2a78d6', TASK = '#eb6834';
/** left- versus right-hand imagery, median of nine people, read from Miladinović et al. 2024 (claim window-accuracy); log-linear in between */
const MEASURED: [number, number][] = [[0.5, 60], [1, 65], [2, 71], [4, 74]];
function measuredLR(T: number): number {
  for (let i = 1; i < MEASURED.length; i++) {
    const [t0, a0] = MEASURED[i - 1], [t1, a1] = MEASURED[i];
    if (T <= t1) return a0 + ((a1 - a0) * Math.log(T / t0)) / Math.log(t1 / t0);
  }
  return MEASURED[MEASURED.length - 1][1];
}

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Few rhythms can be changed at will, and each change hides in the rhythm’s own fluctuation');
  prose(sec.text, `
<p>Seeing a rhythm is not the same as controlling one. To steer with EEG a person changes a rhythm at will,
most often by imagining a movement: the rhythms over the hand area lose part of their power while a movement
of that hand is imagined (event-related desynchronization, ERD), about half of it on average in one study and
about 85% in the most reactive mu band in another, both averaged over many trials ${c('erd-depth')}, and the
decoder has to notice the drop within a window of about a second ${c('bci-windows')}. There the rhythm itself gets in the way. A rhythm is not a steady
sine: its power waxes and wanes, and the power measured over a window of T seconds in a band B hertz wide
scatters by about 1/√(BT) of its mean from one window to the next, ±58% for a 3 Hz band over 1 s, however far
the rhythm stands above the noise ${c('erd-detect')}. Real alpha power fluctuates two to three times more than
that ${c('rhythm-fluctuation')}. A drop of half the power is smaller than the scatter of one window. The figure
simulates the decision with the alpha-sized rhythm of section 5, read through the best channel of a
64-electrode cap (section 9): the rhythm stands well above the noise, yet a single window is called right only
about two times in three, and a perfect recording would add only a few points. Longer windows help as √T but
cost time (section 8); measured accuracy for left- versus right-hand imagery climbs the same way, from about
65% with 1 s windows to 74% with 4 s ${c('window-accuracy')}.</p>
<p>A dimension of control needs its own rhythm that the person can move independently, and there are few. The
classic set is imagined movement of the left hand, the right hand, the feet and the tongue ${c('mi-classes')},
and they are not independent: imagining one hand lowers the mu rhythm over both hemispheres, and in some people
every task lowers every central rhythm, which makes the tasks hard to tell apart ${c('mi-overlap')}. Adding a fourth or fifth mental task did not add
information, which led one group to put the upper limit at three tasks ${c('task-limit')}. The model's
four-way choice, with each rhythm read on its own, gives about the 0.15 bits/s that the winning algorithm
reached on four-class competition data ${c('mi-bitrate')}; the best interfaces of 2002 managed 10 to 25 bits
per minute ${c('itr-2002')}. Continuous control from sensorimotor rhythms has reached three independent
dimensions ${c('dof-control')}, attempts to read limb trajectories from EEG did not beat chance
${c('kinematics-chance')}, and control fails altogether for an estimated 15 to 30% of users
${c('bci-inefficiency')}. The fastest EEG spellers reach about 5 bits/s only by decoding responses to
flickering targets chosen by gaze, a selection rather than a dimension of control ${c('itr-ssvep')}.
Intracortical arrays, for comparison, decode handwriting at 90 characters/min and speech at 62 words/min
${c('intracortical')}.</p>`);

  const { sN, sF } = sourceSliders();
  const sDepth = slider({ label: 'Power lost during imagery (ERD)', unit: '%', min: 10, max: 90, step: 1, value: P.erdPowerDrop * 100, marks: [{ value: P.erdPowerDrop * 100, label: 'Typical' }, { value: 85, label: 'Best case' }], note: c('erd-depth') });
  const sWin = slider({ label: 'Window for one decision', unit: 's', min: 0.5, max: 4, step: 0.05, value: 1, marks: [{ value: 1, label: 'Typical' }, { value: 4, label: 'Competition' }], note: c('bci-windows') });
  const rRho = readout('Rhythm power over noise, 64-electrode cap', c('snr-electrodes'));
  const rTwo = readout('Rest or imagery: correct calls', c('erd-detect'));
  const rLR = readout('Left or right hand: model (measured)', c('window-accuracy'));
  const rBits = readout('Four-way choice: bits/s (measured 0.15)', c('mi-bitrate'));

  const fig = figure(sec.fig, `Top: twenty-four seconds of a simulated recording in which rest and imagined movement alternate every ${BLOCK} s (imagery blocks shaded ${sw(TASK, 'patch')}). The line (${sw('#1a1a1a', 'line')}) is the mu-band power that a decoder estimates from a sliding window of the chosen length, relative to the resting level; the dashed line (${sw('#898781', 'dash')}) is the true level of rhythm plus noise; the decoder calls imagery when the estimate falls below the threshold. Bottom: how the estimates of single windows spread, at rest (${sw(REST, 'patch')}) and during imagery (${sw(TASK, 'patch')}); the overlap is the share of windows called wrong ${c('erd-detect')}. The rhythm is the patch of the N and synchrony sliders (sections 2 and 5), read through the best linear combination of a 64-electrode cap against the brain's background and the electrodes' noise (section 9) ${c('snr-electrodes')}.`);
  fig.viz.append(vizTitle('Mu-band power over a sliding window, rest and imagined movement alternating'));
  const TRACE_Y: [number, number] = [0, 3.2], TRACE_H = 180;
  const trace = linePlot(fig.viz, { x: { label: 'Time (s)', domain: [0, SHOW] }, y: { label: 'Power (rest = 1)', domain: TRACE_Y }, height: TRACE_H });
  fig.viz.append(vizTitle('Spread of single-window estimates: rest versus imagery'));
  const spread = linePlot(fig.viz, { x: { label: 'Mu-band power in one window (rest = 1)', domain: [0, 3] }, y: { label: 'Probability density' }, height: 164, legendInside: 'right' });
  fig.viz.append(readouts(rRho.el, rTwo.el, rLR.el, rBits.el));
  fig.panel.append(controls(sN.el, sF.el, sDepth.el, sWin.el));
  assumptions(fig.el, [
    { what: 'Rhythm', value: `a Gaussian process in a ${P.decoderBandHz} Hz band round 10 Hz, from the patch of the N and synchrony sliders; during imagery its power falls by the ERD fraction, starting ${P.erdOnsetS} s after the cue and settling ${P.erdRampS} s later (the timing of section 8)`, cite: c('erd-depth') + c('erd-timecourse') },
    { what: 'Channel', value: `the best linear combination of ${CAP.electrodes} electrodes for a ${CAP.radiusMm} mm patch, against the brain's background (${CAP.bgUv} µV per electrode) and ${CAP.noiseUv} µV of electrode noise: ${fmt(cap.withBrain, 2)} SNR per nA·m (section 9)`, cite: c('snr-electrodes') + c('brain-background') },
    { what: 'Estimate and decision', value: 'the mean square of the band-passed channel over the window, relative to the resting mean; an estimate over B·T degrees of freedom is gamma distributed with a spread of 1/√(BT) of its mean. The decoder calls imagery below the threshold where the two distributions cross, the best single threshold', cite: c('erd-detect') + c('window-samples') },
    { what: 'Two- and four-way choices', value: 'each imagined movement lowers its own rhythm, each read in its own channel, independent of the others (an upper bound: real classes overlap); the decoder picks the channel whose power fell most; bits per window by Wolpaw’s formula. The measured left-or-right figure in brackets is the median of nine people at this window length, read from a published figure and interpolated', cite: c('mi-overlap') + c('mi-bitrate') + c('window-accuracy') },
  ]);

  function update() {
    const rho = rhoOf(sN.value, sF.value), d = sDepth.value / 100, T = sWin.value, B = P.decoderBandHz;
    const r = restVersusImagery(d, B, T, rho), n = 1 / rho, w = Math.max(1, Math.round(T * FS));
    // the simulated recording, its sliding-window power and the true level
    const est: [number, number][] = [], truth: [number, number][] = [];
    let acc = 0;
    const sq = new Float64Array(nS);
    for (let i = 0; i < nS; i++) {
      const t = i / FS - LEAD, y = Math.sqrt(powerAt(t, d)) * rhythm[i] + Math.sqrt(n) * noise[i];
      sq[i] = y * y; acc += sq[i]; if (i >= w) acc -= sq[i - w];
      if (t >= 0) { est.push([t, acc / w / (1 + n)]); truth.push([t, (powerAt(t, d) + n) / (1 + n)]); }
    }
    // the worst single windows, the lowest at rest in the first half and the highest during imagery in the second, in the settled
    // second half of a block; their notes sit in the empty band at the top of the plot, at the two ends
    const worst = (imagery: boolean) => {
      let best: [number, number] | null = null;
      for (const p of est) {
        if (isImagery(p[0]) !== imagery || p[0] % BLOCK < BLOCK / 2 || (imagery ? p[0] < SHOW / 2 : p[0] >= SHOW / 2)) continue;
        if (!best || (imagery ? p[1] > best[1] : p[1] < best[1])) best = p;
      }
      return best;
    };
    const notes: Note[] = [];
    const lowRest = worst(false), highTask = worst(true);
    if (lowRest && lowRest[1] < r.threshold) notes.push({ x: lowRest[0], y: lowRest[1], text: 'at rest, called imagery', at: [0.3, 2.3], align: 'start' });
    if (highTask && highTask[1] > r.threshold) notes.push({ x: highTask[0], y: highTask[1], text: 'imagining, called rest', at: [SHOW - 0.3, 2.3], align: 'end' });
    const bands = [1, 3, 5].map((k) => ({ from: k * BLOCK, to: (k + 1) * BLOCK, label: 'imagery', color: TASK }));
    trace.update([
      { name: `Estimate from a ${fmt(T, 2)} s window`, points: est, color: '#1a1a1a', width: 1.4 },
      { name: 'True level', points: truth, color: '#898781', dashed: true, width: 1.5 },
    ], [{ axis: 'y', value: r.threshold, label: 'threshold' }], bands, notes);

    // the two distributions
    const xs = Array.from({ length: 301 }, (_, i) => 0.005 + (i / 300) * 2.995);
    const pdf = (theta: number) => xs.map((x) => [x, gammaPdf(x, r.k, theta)] as [number, number]);
    const rest = pdf(r.tRest), task = pdf(r.tTask);
    const at = (pts: [number, number][], x: number) => pts.reduce((a, p) => (Math.abs(p[0] - x) < Math.abs(a[0] - x) ? p : a));
    const sdX = 1 + 1 / Math.sqrt(r.k), sdP = at(rest, sdX), thr = at(rest, r.threshold);
    spread.update([
      { name: 'At rest', points: rest, color: REST, fill: true },
      { name: 'During imagery', points: task, color: TASK, fill: true },
    ], [{ axis: 'x', value: r.threshold, label: 'threshold' }], undefined, [
      { x: sdP[0], y: sdP[1], text: `one window: ±${Math.round(100 / Math.sqrt(r.k))}%`, dx: 16, dy: -14 },
      { x: thr[0], y: thr[1], text: `overlap: ${Math.round(100 * (1 - r.correct))}% of windows called wrong`, dx: 14, dy: -26 },
    ]);
    const four = mWayCorrect(4, d, B, T, rho), two = mWayCorrect(2, d, B, T, rho);
    rRho.set(`${fmt(rho, 2)}×`);
    rTwo.set(`${fmt(100 * r.correct, 2)}%`);
    rLR.set(`${Math.round(100 * two)}% <span class="readout-aside">(${Math.round(measuredLR(T))}%)</span>`);
    rBits.set(fmt(wolpawBits(four, 4) / T, 2));
  }
  [sN, sF, sDepth, sWin].forEach((s) => s.onChange(update));
  update();
}
