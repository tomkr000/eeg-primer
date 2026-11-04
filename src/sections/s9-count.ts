import { snrVersusElectrodes, ceilingPerNam, restVersusImagery } from '../physics/control';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot, type Note } from '../ui/plot';
import { P, claimCite as c, defaultHead } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { momentNam, ALPHA_N } from './s5-noise';

const RADIUS_MM = 10; // patch radius of sections 4 and 9
const SENSORY_NAM = momentNam(P.patchDefaultN, P.patchDefaultSync); // the typical evoked source of sections 2 to 4
const MU_NAM = momentNam(ALPHA_N, P.patchDefaultSync); // the mu rhythm at the textbook alpha amplitude (section 7)
const head = defaultHead();
const SCALP_R = head.shells[head.shells.length - 1].outerRadius;
const spacingMm = (N: number) => 1e3 * Math.sqrt((4 * Math.PI * SCALP_R * SCALP_R) / N);
/** electrode counts for the curves, log-spaced from 2 to 100,000 */
const NS = Array.from(new Set(Array.from({ length: 72 }, (_, i) => Math.round(2 * Math.pow(5e4, i / 71)))));
const fmtTime = (s: number) => (s < 90 ? `${fmt(s, 2)} s` : s < 5400 ? `${fmt(s / 60, 2)} min` : `${fmt(s / 3600, 2)} h`);
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
/** the electrode count at which a curve first reaches a level, interpolated in log N */
function crossing(pts: [number, number][], level: number): number {
  for (let i = 1; i < pts.length; i++) {
    const [n0, v0] = pts[i - 1], [n1, v1] = pts[i];
    if (v0 < level && v1 >= level) return Math.exp(Math.log(n0) + ((level - v0) / (v1 - v0)) * Math.log(n1 / n0));
  }
  return pts[0][1] >= level ? pts[0][0] : NaN;
}

export function mountCount(root: HTMLElement) {
  const sec = section(root, 'count', '11', 'Adding electrodes gives diminishing returns', 'More electrodes help less and less: the brain’s own activity, not the electrodes, sets the limit');
  prose(sec.text, `
<p>Would more electrodes recover what the head blurs? Only up to a point. The skull passes broad patterns and
little fine detail, so the scalp potential is smooth: estimates of how many electrodes capture nearly all of it
run from about 128 to a few hundred ${c('spatial-nyquist')}${c('iivanainen-components')}${c('grover-nyquist')}.
The figure computes, for N electrodes spread evenly over the head of section 3, the best linear estimate of one
patch's activity ${c('snr-electrodes')}. Against the electrodes' own noise alone, every electrode adds an
independent look and the signal-to-noise ratio (SNR) grows as √N without limit. But below about 100 Hz the noise
that matters is the rest of the brain, active in the same band and seen through the same head
${c('brain-noise')}. Once the electrodes have averaged their own noise below that background, extra electrodes
mostly measure the background again: the SNR flattens towards a ceiling set by the brain's activity under the
patch itself, which no array on the scalp can pass ${c('electrode-ceiling')}. Quiet electrodes reach the flat
part with a few hundred electrodes; noisy, dry ones keep gaining for longer but approach the same ceiling.
Measurements agree: source localization improves a lot up to 64 or 128 channels and modestly after, decoding a
fine spatial pattern over one region kept gaining up to several hundred electrodes, and a P300 speller gained
nothing beyond 6 to 8 ${c('evoked-channels')}.</p>
<p>For a volitional signal the limit comes sooner. An imagined movement is read as a drop in the power of the mu
rhythm (sections 6 and 9), and the power of a rhythm measured over one window fluctuates by itself, whatever the
electrodes ${c('erd-detect')}. More electrodes clean the channel up to that limit and no further; a decoder gains
beyond it only from longer windows, which cost time (section 10). A real decoder also has to learn its weights
from calibration data, and the covariance it needs is hard to estimate over many channels: to come within a
factor of two of the best SNR it needs about twice as many independent samples as it has electrodes
${c('calibration-cost')}, seconds for a 64-electrode cap and hours for 100,000 electrodes in a few-hertz band.
Measured motor-imagery decoders accordingly peak with 10 to 50 well-placed channels, and all 118 channels of a
dense cap scored lower than a selected 23 ${c('mi-channels')}.</p>`);

  const TRACK = 350; // one slider per row
  const sN = slider({ label: 'Number of electrodes', min: 2, max: 1e5, value: 64, log: true, format: fmtN, trackPx: TRACK, marks: [{ value: 21, label: '10–20 system', align: 'end' }, { value: 256, label: 'Densest cap', align: 'centre' }, { value: 1024, label: 'Ultra-dense grid', align: 'start' }], note: c('eeg-systems') });
  const sNoise = slider({ label: 'Noise of each electrode contact', unit: 'µV rms', min: 0.1, max: 20, value: 1, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: 1, label: 'Quietest wet contact', align: 'end' }, { value: 8, label: 'Dry contact' }], note: c('skin-noise') });
  const sBg = slider({ label: 'Brain’s own activity in the band, per electrode', unit: 'µV rms', min: 1, max: 30, value: 10, step: 0.5, trackPx: TRACK, marks: [{ value: 10, label: 'Default' }], note: c('brain-background') });
  const sWin = slider({ label: 'Window for one decision', unit: 's', min: 0.25, max: 4, value: 1, step: 0.05, trackPx: TRACK, marks: [{ value: 1, label: 'Typical' }], note: c('bci-windows') });

  const rSpacing = readout('Electrode spacing');
  const rSens = readout('Evoked SNR (share of the ceiling)', c('snr-electrodes'));
  const rVol = readout('Imagined movement: correct calls', c('erd-detect'));
  const rCal = readout('Calibration to learn the weights', c('calibration-cost'));

  const fig = figure(sec.fig, `Electrodes are spread evenly over the head of section 3 (a cap over the upper half of the head at the same spacing would hold about half as many). Top: the signal-to-noise ratio (SNR), per sample, of the best linear estimate of one patch's evoked activity (${fmt(SENSORY_NAM, 2)} nA·m over a ${RADIUS_MM} mm radius, the typical source of sections 2 to 4) against the electrodes' noise alone (${sw('#eb6834', 'dash')}) and against that noise plus the brain's own activity in the band (${sw('#2a78d6', 'line')}) ${c('snr-electrodes')}${c('brain-background')}; the dotted line is the ceiling, the SNR with the whole scalp potential known exactly ${c('electrode-ceiling')}. Bottom: the share of windows in which a decoder tells an imagined movement from rest by the drop in mu-rhythm power (a mu rhythm at the ${fmt(MU_NAM, 2)} nA·m of section 7's alpha, an upper bound ${c('mu-vs-alpha')}), with the same two kinds of noise; the dotted line is a perfect recording, limited only by the rhythm's own fluctuation over the window ${c('erd-detect')}; the shaded band (${sw('#1baf7a', 'patch')}) is where measured motor-imagery decoders do best, 10 to 50 channels ${c('mi-channels')}. The vertical line is the electrode count on the slider; the slider's marks are real systems, which cover only the upper part of the head ${c('eeg-systems')}.`);
  fig.viz.append(vizTitle('Evoked response of one patch: signal-to-noise ratio versus number of electrodes'));
  const Y_TOP: [number, number] = [0.01, 500], H_TOP = 196, margin = { right: 30 };
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Electrodes', scale: 'log', domain: [2, 1e5] }, y: { label: 'SNR per sample', scale: 'log', domain: Y_TOP }, height: H_TOP, margin });
  fig.viz.append(vizTitle('Imagined movement: correct calls from one window versus number of electrodes'));
  const bottom = linePlot(fig.viz, { x: { label: 'Number of electrodes over the head', tip: 'Electrodes', scale: 'log', domain: [2, 1e5] }, y: { label: 'Correct calls (%)', domain: [50, 100] }, height: 182, margin });
  fig.viz.append(readouts(rSpacing.el, rSens.el, rVol.el, rCal.el));
  // both plots draw the same two lines: one legend, between them
  requestAnimationFrame(() => { const legends = fig.viz.querySelectorAll<HTMLElement>('.legend'); if (legends[1]) legends[1].style.display = 'none'; });
  const ctl = controls(sN.el, sNoise.el, sBg.el, sWin.el);
  ctl.style.gridTemplateColumns = '1fr';
  fig.panel.append(ctl);
  assumptions(fig.el, [
    { what: 'Head and electrodes', value: `the four-shell sphere of section 3 (scalp radius ${fmt(SCALP_R * 100, 3)} cm); N electrodes spread evenly over the whole sphere (a Fibonacci lattice); the spacing shown is the side of the scalp area per electrode`, cite: c('snr-electrodes') },
    { what: 'Evoked source', value: `a ${RADIUS_MM} mm-radius disc of radial dipoles under the top of the head carrying ${fmt(SENSORY_NAM, 2)} nA·m (200,000 cells with a tenth in step, the typical source of sections 2 to 4)`, cite: c('variances-add') },
    { what: 'Volitional source', value: `the same disc carrying a mu rhythm at the ${fmt(MU_NAM, 2)} nA·m of section 7's alpha rhythm (an upper bound: mu is usually the weaker of the two), whose power drops by ${Math.round(P.erdPowerDrop * 100)}% during imagery, read in a ${P.decoderBandHz} Hz band`, cite: c('alpha-source-chain') + c('mu-vs-alpha') + c('erd-depth') },
    { what: 'Brain background', value: 'independent radial sources spread evenly over the cortex sphere, seen through the same head, scaled to the slider value at each electrode', cite: c('brain-background') },
    { what: 'Electrode noise', value: 'white and independent at each electrode (slider)', cite: c('skin-noise') },
    { what: 'Estimate', value: 'the matched filter √(tᵀC⁻¹t) with the exact scalp pattern t and noise covariance C, computed in electrode space up to 128 electrodes and per spherical-harmonic degree above that, where the degrees finer than the array can resolve (l > √N − 1) count as extra noise; the two agree within 1% at 128 to 256 electrodes. A decoder that has to learn its weights does worse, by a factor of two in power with 2N calibration samples', cite: c('snr-electrodes') + c('calibration-cost') },
    { what: 'Imagery detection', value: 'rest and imagery windows give band-power estimates that are gamma distributed over B·T degrees of freedom, scattering by 1/√(BT) of their means; the decoder calls imagery below the threshold where the two distributions cross (section 9)', cite: c('erd-detect') },
  ]);

  function update() {
    const N = sN.value, noise = sNoise.value, bg = sBg.value, T = sWin.value;
    const pts = snrVersusElectrodes(NS, noise, bg, RADIUS_MM);
    const [here] = snrVersusElectrodes([Math.round(N)], noise, bg, RADIUS_MM);
    const ceil = ceilingPerNam(bg, RADIUS_MM) * SENSORY_NAM;
    const brain = pts.map((p) => [p.N, p.withBrain * SENSORY_NAM] as [number, number]);
    const alone = pts.map((p) => [p.N, p.electrodesOnly * SENSORY_NAM] as [number, number]);
    const knee = crossing(brain, 0.8 * ceil);
    const acc = (snrPerNam: number) => 100 * restVersusImagery(P.erdPowerDrop, P.decoderBandHz, T, (snrPerNam * MU_NAM) ** 2).correct;
    const cap = 100 * restVersusImagery(P.erdPowerDrop, P.decoderBandHz, T, Infinity).correct;
    const volBrain = pts.map((p) => [p.N, acc(p.withBrain)] as [number, number]);
    const volAlone = pts.map((p) => [p.N, acc(p.electrodesOnly)] as [number, number]);

    // the knee note sits below the curve (above it when the curve runs near the axis), to the right of the point unless it is far right
    const a50 = alone.find((p) => p[0] >= 50)!;
    const topNotes: Note[] = [{ x: a50[0], y: a50[1], text: 'grows as √N, without limit', dx: -10, dy: -16 }];
    const fy = (v: number) => (Math.log(v / Y_TOP[0]) / Math.log(Y_TOP[1] / Y_TOP[0])) * (H_TOP - 58);
    if (isFinite(knee)) {
      const fx = Math.log(knee / 2) / Math.log(5e4);
      topNotes.push({ x: knee, y: 0.8 * ceil, text: `With the brain’s own activity: 80% of\nthe ceiling at ${fmtN(knee)} electrodes, then flat`, dx: fx > 0.7 ? -16 : 16, dy: fy(0.8 * ceil) > 50 ? 30 : -34 });
    } else {
      const end = brain[brain.length - 1];
      topNotes.push({ x: end[0], y: end[1], text: 'With contacts this noisy, even 100,000\nelectrodes stay below 80% of the ceiling', dx: -16, dy: fy(end[1]) > 50 ? 30 : -34 });
    }
    top.update([
      { name: 'Electrode noise alone', points: alone, color: '#eb6834', dashed: true },
      { name: 'Electrode noise plus the brain’s own activity', points: brain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: ceil, label: 'ceiling: the brain’s activity under the patch itself' },
      { axis: 'x', value: N, label: `${fmtN(N)} electrodes, ${fmt(spacingMm(N) / 10, 2)} cm apart`, callout: true },
    ], undefined, topNotes);
    const at100 = acc(snrVersusElectrodes([100], noise, bg, RADIUS_MM)[0].withBrain), atMax = volBrain[volBrain.length - 1][1];
    const botNotes: Note[] = [{ x: 100, y: at100, text: `100 → 100,000 electrodes: +${fmt(atMax - at100, 2)} percentage points`, dx: 16, dy: 24 }];
    bottom.update([
      { name: 'Electrode noise alone', points: volAlone, color: '#eb6834', dashed: true },
      { name: 'Electrode noise plus the brain’s own activity', points: volBrain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: cap, label: `perfect recording: ${fmt(cap, 2)}%, the rhythm’s own fluctuation over ${fmt(T, 2)} s` },
      { axis: 'x', value: N, label: '' },
    ], [{ from: 10, to: 50, label: 'real decoders peak here', color: '#1baf7a' }], botNotes);
    rSpacing.set(`${fmt(spacingMm(N) / 10, 2)} cm`);
    rSens.set(`${fmt(here.withBrain * SENSORY_NAM, 2)} (${Math.round((100 * here.withBrain * SENSORY_NAM) / ceil)}%)`);
    rVol.set(`${fmt(acc(here.withBrain), 3)}%`);
    rCal.set(fmtTime(N / P.decoderBandHz));
  }
  [sN, sNoise, sBg, sWin].forEach((s) => s.onChange(update));
  update();
}
