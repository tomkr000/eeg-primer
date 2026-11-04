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
  const sec = section(root, 'count', '11', 'Adding electrodes gives diminishing returns', 'In this model, brain activity and rhythm fluctuations limit the benefit of more electrodes');
  prose(sec.text, `
<p>More electrodes sample the scalp voltage pattern more densely. One estimate calls for about 128 electrodes
to capture its spatial detail ${c('spatial-nyquist')}; other head models and sampling criteria give about 120
${c('iivanainen-components')} to a few hundred ${c('grover-nyquist')}. The figure asks a different question:
how well can N electrodes estimate one patch's activity? With independent electrode noise alone, the modeled
signal-to-noise ratio (SNR) grows as √N ${c('snr-electrodes')}. Brain activity creates a different kind of noise:
the same background sources contribute to several electrodes, so their noise is correlated ${c('brain-noise')}.
In this model, reducing electrode noise eventually leaves that background as the main obstacle. The SNR
approaches a ceiling set by background activity within the source patch, even if the voltage everywhere on the
scalp is known exactly ${c('electrode-ceiling')}.</p>
<p>The useful electrode count varies by task. In one source-localization simulation, improvement from 128 to
256 channels was modest ${c('evoked-channels')}. A visual-category decoder kept gaining up to 464 electrodes,
while a P300 speller gained little beyond 6 to 8 ${c('evoked-channels')}. These tasks measure different kinds
of performance.</p>
<p>For imagined movement, the model detects a drop in mu-rhythm power (sections 6 and 9). Power measured over
one time window fluctuates even with a perfect recording, which limits accuracy ${c('erd-detect')}.
More electrodes reduce added noise but cannot remove this fluctuation. Longer windows reduce it
${c('erd-detect')}, at the cost of waiting longer for each decision (section 10).</p>
<p>A real decoder must also learn how to combine its channels. Estimating how noise varies together across
many electrodes takes calibration data ${c('calibration-cost')}. In the cited adaptive-array result, about 2N
independent calibration samples containing noise alone give, on average, half the optimal signal-to-noise power ratio ${c('calibration-cost')}. Motor-imagery studies report useful sets of 10 to 50 channels; in one dataset, about 23 selected channels
outperformed all 118 ${c('mi-channels')}.</p>`);

  const TRACK = 350; // one slider per row
  const sN = slider({ label: 'Number of electrodes', min: 2, max: 1e5, value: 64, log: true, format: fmtN, trackPx: TRACK, marks: [{ value: 64, label: 'Default model count' }], note: c('count-model') });
  const sNoise = slider({ label: 'Noise of each electrode contact', unit: 'µV rms', min: 0.1, max: 20, value: 1, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: 1, label: 'Quietest wet contact', align: 'end' }, { value: 8, label: 'Dry contact' }], note: c('skin-noise') + c('electrode-noise-levels') + c('count-model') });
  const sBg = slider({ label: 'Brain’s own activity in the band, per electrode', unit: 'µV rms', min: 1, max: 30, value: 10, step: 0.5, trackPx: TRACK, marks: [{ value: 10, label: 'Default' }], note: c('brain-background') });
  const sWin = slider({ label: 'Window for one decision', unit: 's', min: 0.25, max: 4, value: 1, step: 0.05, trackPx: TRACK, marks: [{ value: 1, label: 'Default' }], note: c('bci-windows') + c('count-model') });

  const rSpacing = readout('Electrode spacing');
  const rSens = readout('Evoked SNR (share of the ceiling)', c('snr-electrodes'));
  const rVol = readout('Rest versus imagery: correct calls', c('erd-detect'));
  const rCal = readout('Calibration benchmark: minimum time', c('calibration-cost'));

  const fig = figure(sec.fig, `<p>Top: the signal-to-noise ratio (SNR) per sample of the best linear estimate of
the modeled patch's evoked activity. The curves include electrode noise alone (${sw('#eb6834', 'dash')}) or
electrode noise plus brain background (${sw('#2a78d6', 'line')}) ${c('snr-electrodes')}.
The dotted line is this model's ceiling: the SNR with the voltage everywhere on the scalp known exactly,
while brain background remains ${c('electrode-ceiling')}.</p>
<p>Bottom: the percentage of correct classifications of rest versus imagined movement, with the two states
equally likely ${c('count-model')}. The model detects a drop in mu-rhythm power using the same two noise conditions
${c('erd-detect')}. The dotted line removes both electrode noise and brain background; the rhythm's own power
still fluctuates within each window ${c('count-model')}${c('erd-detect')}. Mu is modeled at section 7's alpha strength, an
optimistic assumption ${c('mu-vs-alpha')}.</p>
<p>Both plots count electrodes over the whole head sphere. A cap covering its upper half would use about half
as many electrodes at the same spacing ${c('count-model')}. The vertical line follows the electrode-count slider.
Counts from real caps and the studies above are not overlaid because their layouts differ.</p>`);
  fig.viz.append(vizTitle('Evoked response of one patch: signal-to-noise ratio versus number of electrodes'));
  const Y_TOP: [number, number] = [0.01, 500], H_TOP = 196, margin = { right: 30 };
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Electrodes', scale: 'log', domain: [2, 1e5] }, y: { label: 'SNR per sample', scale: 'log', domain: Y_TOP }, height: H_TOP, margin });
  fig.viz.append(vizTitle('Rest versus imagined movement: accuracy versus number of electrodes'));
  const bottom = linePlot(fig.viz, { x: { label: 'Number of electrodes over the whole head', tip: 'Electrodes', scale: 'log', domain: [2, 1e5] }, y: { label: 'Correct calls (%)', domain: [50, 100] }, height: 182, margin });
  fig.viz.append(readouts(rSpacing.el, rSens.el, rVol.el, rCal.el));
  // both plots draw the same two lines: one legend, between them
  requestAnimationFrame(() => { const legends = fig.viz.querySelectorAll<HTMLElement>('.legend'); if (legends[1]) legends[1].style.display = 'none'; });
  const ctl = controls(sN.el, sNoise.el, sBg.el, sWin.el);
  ctl.style.gridTemplateColumns = '1fr';
  fig.panel.append(ctl);
  assumptions(fig.el, [
    { what: 'Head and electrodes', value: `The layered sphere from section 3, with modeled scalp radius R = ${fmt(SCALP_R * 100, 3)} cm. N electrodes cover the whole sphere approximately evenly, in a Fibonacci arrangement. The displayed spacing is √(4πR²/N), the square root of scalp area per electrode.`, cite: c('count-model') },
    { what: 'Evoked source', value: `A chosen disc under the top of the head, with radius ${RADIUS_MM} mm and total dipole moment ${fmt(SENSORY_NAM, 2)} nA·m. Its currents point perpendicular to the modeled cortex (radial dipoles).`, cite: c('snr-electrodes') },
    { what: 'Imagined-movement source', value: `The same disc carries a mu rhythm at section 7's alpha strength, ${fmt(MU_NAM, 2)} nA·m ${c('alpha-source-chain')}. This is optimistic because mu is usually weaker than alpha ${c('mu-vs-alpha')}. Power drops by ${Math.round(P.erdPowerDrop * 100)}% during imagery ${c('erd-depth')}, evaluated in a ${P.decoderBandHz} Hz band ${c('erd-detect')}.`, cite: '' },
    { what: 'Brain background', value: 'Independent radial sources cover the cortex sphere. The head spreads each source across electrodes, creating correlated electrode signals. Their root-mean-square voltage at each electrode is set by the background slider. This source distribution and scaling are modeling assumptions.', cite: c('brain-background') },
    { what: 'Electrode noise', value: `Chosen to be independent between electrodes, with equal power per unit bandwidth (white noise). The slider sets its root-mean-square voltage ${c('snr-electrodes')}; measured contact-noise levels provide reference values ${c('skin-noise')}.`, cite: '' },
    { what: 'Best linear estimate', value: 'The decoder is given the exact scalp pattern t and noise covariance C, which describes how noise varies together across electrodes. Its SNR is √(tᵀC⁻¹t).', cite: c('snr-electrodes') },
    { what: 'Numerical approximation', value: 'The calculation uses individual electrode signals up to 128 electrodes, then spatial patterns on a sphere (spherical harmonics). Unresolved patterns with degree l > √N − 1 count as extra noise. The methods agree within 1% at 128 to 256 electrodes.', cite: c('snr-electrodes') },
    { what: 'Calibration benchmark', value: 'For the cited adaptive array, about 2N independent samples containing noise alone give, on average, half the optimal squared SNR (the signal-to-noise power ratio). In a band B hertz wide, collecting these samples takes at least N/B seconds; the readout shows this lower bound.', cite: c('calibration-cost') },
    { what: 'Imagery detection', value: 'Rest and imagery are equally likely. Their band-power estimates follow gamma distributions with shape B·T, where B is bandwidth in hertz and T is window length in seconds. Each estimate has a standard deviation of 1/√(BT) times its mean. The decoder calls imagery below the threshold where the two probability densities cross.', cite: c('erd-detect') + c('count-model') },
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
      topNotes.push({ x: knee, y: 0.8 * ceil, text: `With the brain’s own activity: 80% of\nthe ceiling at ${fmtN(knee)} electrodes, then gains slow`, dx: fx > 0.7 ? -16 : 16, dy: fy(0.8 * ceil) > 50 ? 30 : -34 });
    } else {
      const end = brain[brain.length - 1];
      topNotes.push({ x: end[0], y: end[1], text: 'With contacts this noisy, even 100,000\nelectrodes stay below 80% of the ceiling', dx: -16, dy: fy(end[1]) > 50 ? 30 : -34 });
    }
    top.update([
      { name: 'Electrode noise alone', points: alone, color: '#eb6834', dashed: true },
      { name: 'Electrode noise plus the brain’s own activity', points: brain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: ceil, label: 'model ceiling: brain background within the source patch' },
      { axis: 'x', value: N, label: `${fmtN(N)} electrodes, ${fmt(spacingMm(N) / 10, 2)} cm apart`, callout: true },
    ], undefined, topNotes);
    const at100 = acc(snrVersusElectrodes([100], noise, bg, RADIUS_MM)[0].withBrain), atMax = volBrain[volBrain.length - 1][1];
    const botNotes: Note[] = [{ x: 100, y: at100, text: `100 → 100,000 electrodes: +${fmt(atMax - at100, 2)} percentage points`, dx: 16, dy: 24 }];
    bottom.update([
      { name: 'Electrode noise alone', points: volAlone, color: '#eb6834', dashed: true },
      { name: 'Electrode noise plus the brain’s own activity', points: volBrain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: cap, label: `no added noise: ${fmt(cap, 2)}%, the rhythm still fluctuates over ${fmt(T, 2)} s` },
      { axis: 'x', value: N, label: '' },
    ], undefined, botNotes);
    rSpacing.set(`${fmt(spacingMm(N) / 10, 2)} cm`);
    rSens.set(`${fmt(here.withBrain * SENSORY_NAM, 2)} (${Math.round((100 * here.withBrain * SENSORY_NAM) / ceil)}%)`);
    rVol.set(`${fmt(acc(here.withBrain), 3)}%`);
    rCal.set(fmtTime(N / P.decoderBandHz));
  }
  [sN, sNoise, sBg, sWin].forEach((s) => s.onChange(update));
  update();
}
