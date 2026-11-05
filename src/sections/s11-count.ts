import { pairVersusElectrodes, pairCeilingPerNam, finiteWindowPairCorrect, type PairPoint } from '../physics/control';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot, type Note } from '../ui/plot';
import { P, claimCite as c, defaultHead } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { momentNam, ALPHA_N } from './s07-noise';

const RADIUS_MM = 10; // each finger's region: as broad as the hand patch of sections 4 and 9 (claim finger-model)
const MU_NAM = momentNam(ALPHA_N, P.patchDefaultSync) / Math.SQRT2; // section 7's sine peak converted to RMS
const accuracy = (p: PairPoint, T: number) => 100 * finiteWindowPairCorrect(P.erdPowerDrop, P.decoderBandHz, T, 1 / (p.separated * MU_NAM) ** 2, 1 / (p.separatedB * MU_NAM) ** 2, -p.rho);
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
  const sec = section(root, 'count', '11', 'In this model, more electrodes cannot tell two typing fingers apart', 'Neighboring fingers make nearly the same scalp pattern, and a keystroke is too short to read a rhythm');
  const G = P.fingerGapMm;
  prose(sec.text, `
<p>This section asks whether more electrodes would let someone type by imagining finger movements. A decoder
would have to tell neighboring fingers, such as the index and middle finger, apart once per keystroke. In this
model the answer is no. With the two fingers' regions ${G.indexMiddleMotor} mm apart and one keystroke to decide, it
names the right finger 52% of the time with 128 electrodes and 55% with 100,000, only slightly better than guessing
${c('finger-count')}. These percentages are calculations on this page, not measured results. The model reads only
the power of one rhythm in each region with a linear decoder, so it does not cover every EEG feature or decoder, and
it does not show that decoding fingers from EEG is impossible. Studies have decoded imagined fingers under slower
conditions, as the last paragraphs describe.</p>
<p>The first reason is space. In primary motor cortex the thumb and the little finger lie about 6 mm apart, and in
sensory cortex about 16 mm ${c('finger-spacing')}. Neighbors such as the index and middle finger lie about a
quarter of that apart ${c('finger-neighbors')}. Each region's voltage spreads over centimeters of scalp (section 4),
so the two fingers make nearly the same scalp pattern. To tell them apart, a decoder must cancel one pattern from
the other, which removes most of the signal they share ${c('finger-model')}. More electrodes help when the only
noise is the electrodes' own ${c('snr-electrodes')}. The brain's own activity reaches many electrodes at once
${c('brain-noise')} and, in this model, sets a ceiling even with the whole scalp known exactly ${c('electrode-ceiling')}.</p>
<p>The second reason is time. Typists average about 52 words per minute, about 240 ms between keystrokes
${c('typing-speed')}. Rhythm power measured over so short a window fluctuates so much that even a recording with no
added noise would name the right finger only 70% of the time ${c('erd-detect')}${c('finger-count')}. The rhythm
also takes most of a second to fade after an intention ${c('erd-timecourse')}. Longer windows help, but they are
slower than typing (section 10).</p>
<p>Fingers farther apart can be told apart, slowly. With a 128-channel cap, 21 experienced users told thumb from
little-finger imagery 81% of the time, and three fingers 61% of the time, deciding over 3 s trials. A decoder given
only the channels over the hand area did worse than one given all 128 ${c('finger-eeg')}. The model gives each
finger's imagery a region as broad as the hand area, ${RADIUS_MM} mm in radius, at the strength of section 7's alpha
rhythm, which is generous ${c('finger-model')}${c('mu-vs-alpha')}. With the regions ${G.thumbLittleSensory} mm
apart and a 3 s window, it gives 81% with 128 electrodes, near the measured result ${c('finger-count')}.</p>
<p>More electrodes also cost calibration. A decoder must learn how noise varies together across its channels. In
the cited adaptive-array result, about 2N samples of noise alone give, on average, half the best possible
signal-to-noise power ratio ${c('calibration-cost')}. Motor-imagery decoders do best with 10 to 50 well-placed channels, and in one dataset
about 23 selected channels outperformed all 118 ${c('mi-channels')}.</p>`);

  const TRACK = 350; // one slider per row
  const sN = slider({ label: 'Number of electrodes', min: 2, max: 1e5, value: 128, log: true, format: fmtN, trackPx: TRACK, marks: [{ value: 128, label: 'Default' }], note: c('count-model') });
  const sSep = slider({ label: 'Distance between the two fingers’ regions', unit: 'mm', min: 1, max: 20, value: G.indexMiddleMotor, step: 0.1, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: G.indexMiddleMotor, label: 'Index–middle<br>motor', align: 'center' }, { value: G.indexMiddleSensory, label: 'Index–middle<br>sensory', align: 'center' }, { value: G.thumbLittleSensory, label: 'Thumb–little<br>sensory', align: 'end' }], note: c('finger-spacing') });
  const sWin = slider({ label: 'Window for one decision', unit: 's', min: 0.1, max: 4, value: P.typingKeystrokeS, step: 0.01, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: P.typingKeystrokeS, label: 'One keystroke' }], note: c('typing-speed') });
  const sNoise = slider({ label: 'Noise of each electrode contact', unit: 'µV rms', min: 0.1, max: 20, value: 1, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: 1, label: 'Quietest wet contact', align: 'end' }, { value: 8, label: 'Dry contact' }], note: c('skin-noise') + c('electrode-noise-levels') + c('count-model') });
  const sBg = slider({ label: 'Brain’s own activity in the band, per electrode', unit: 'µV rms', min: 1, max: 30, value: 10, step: 0.5, trackPx: TRACK, marks: [{ value: 10, label: 'Default' }], note: c('brain-background') });

  const rSpacing = readout('Electrode spacing');
  const rSnr = readout('SNR with the other finger canceled (share of ceiling)', c('finger-count'));
  const rAcc = readout('Which finger: correct calls', c('finger-count'));
  const rCal = readout('Minimum calibration time', c('calibration-cost'));

  const fig = figure(sec.fig, `Top: the signal-to-noise ratio (SNR) of the best linear estimate of one finger's region once the other finger's region is canceled, for the finger signal with electrode noise and the brain's own activity (${sw('#2a78d6', 'line')}) ${c('snr-electrodes')}${c('finger-model')}. The dotted line is this model's ceiling, the same estimate with the voltage everywhere on the scalp known exactly while brain background remains ${c('electrode-ceiling')}. Bottom: the percentage of correct calls of which of the two fingers was imagined, both equally likely, under the same noise. The dotted line removes both electrode noise and brain background, and the rhythm's own power still fluctuates within each window ${c('erd-detect')}${c('finger-count')}. Both plots count electrodes over the whole head sphere, and a cap covering its upper half would use about half as many at the same spacing ${c('count-model')}. The vertical line follows the electrode-count slider. The study results are in the text, not the plots, because their caps differ from this sphere.`);
  fig.viz.append(vizTitle('Telling two fingers apart: signal-to-noise ratio versus number of electrodes'));
  const Y_TOP: [number, number] = [0.01, 50], H_TOP = 196, margin = { right: 30 };
  const top = linePlot(fig.viz, { x: { label: '', tip: 'Electrodes', scale: 'log', domain: [2, 1e5], hideTickLabels: true }, y: { label: 'SNR per sample', scale: 'log', domain: Y_TOP }, height: H_TOP, margin: { ...margin, bottom: 8 } });
  fig.viz.append(vizTitle('Which finger was imagined: accuracy versus number of electrodes'));
  const bottom = linePlot(fig.viz, { x: { label: 'Number of electrodes over the whole head', tip: 'Electrodes', scale: 'log', domain: [2, 1e5] }, y: { label: 'Correct calls (%)', domain: [50, 100] }, height: 182, margin });
  fig.viz.append(readouts(rSpacing.el, rSnr.el, rAcc.el, rCal.el));
  // both plots draw the same two lines: one legend, under the bottom plot
  requestAnimationFrame(() => { const legends = fig.viz.querySelectorAll<HTMLElement>('.legend'); if (legends[0]) legends[0].style.display = 'none'; });
  const ctl = controls(sN.el, sSep.el, sWin.el, sNoise.el, sBg.el);
  ctl.style.gridTemplateColumns = '1fr';
  ctl.classList.add('spread-controls');
  fig.panel.append(ctl);
  // spread the sliders down to the bottom plot's axis label, when the controls sit beside the plots
  const spread = () => {
    const v = fig.viz.getBoundingClientRect(), p = fig.panel.getBoundingClientRect(), plots = fig.viz.querySelectorAll('svg');
    const end = plots.length ? plots[plots.length - 1].getBoundingClientRect().bottom : 0;
    ctl.style.minHeight = p.top < v.top + 40 && end ? `${Math.round(end - ctl.getBoundingClientRect().top)}px` : '';
  };
  new ResizeObserver(spread).observe(fig.el);
  assumptions(fig.el, [
    { what: 'Head and electrodes', value: `The layered sphere from section 3, with modeled scalp radius R = ${fmt(SCALP_R * 100, 3)} cm. N electrodes cover the whole sphere approximately evenly, in a Fibonacci arrangement. The displayed spacing is √(4πR²/N), the square root of scalp area per electrode.`, cite: c('count-model') },
    { what: 'Finger regions', value: `Two discs of radial dipoles, each ${RADIUS_MM} mm in radius, their centers the slider's distance apart. Each carries a mu rhythm at section 7's alpha root-mean-square strength, ${fmt(MU_NAM, 2)} nA·m RMS (the sine peak divided by √2) ${c('alpha-source-chain')}, which is optimistic ${c('mu-vs-alpha')}. Imagining a finger lowers its own region's power by ${Math.round(P.erdPowerDrop * 100)}% ${c('erd-depth')} and leaves the other unchanged. The two rhythms vary independently.`, cite: c('finger-model') },
    { what: 'Finger spacing marks', value: `Thumb to little finger: 6 mm in motor cortex and ${G.thumbLittleSensory} mm in sensory cortex ${c('finger-spacing')}. Neighbors at a quarter of that, ${G.indexMiddleMotor} and ${G.indexMiddleSensory} mm, assuming even spacing.`, cite: c('finger-neighbors') },
    { what: 'Brain background', value: 'Independent radial sources cover the cortex sphere. The head spreads each source across electrodes, creating correlated electrode signals. Their root-mean-square voltage at each electrode is set by the background slider. This source distribution and scaling are modeling assumptions.', cite: c('brain-background') },
    { what: 'Electrode noise', value: `Chosen to be independent between electrodes, with equal power per unit bandwidth (white noise). The slider sets its root-mean-square voltage ${c('snr-electrodes')}; measured contact-noise levels provide reference values ${c('skin-noise')}.`, cite: '' },
    { what: 'Best linear estimate', value: 'The decoder is given both regions’ exact scalp patterns and the noise covariance, which describes how noise varies together across electrodes. It estimates one region with the other canceled. Canceling keeps a share 1 − ρ² of the region’s squared SNR, where ρ is how alike the two patterns look against the noise.', cite: c('snr-electrodes') + c('finger-model') },
    { what: 'Numerical approximation', value: 'The calculation uses individual electrode signals up to 128 electrodes, then spatial patterns on a sphere (spherical harmonics). Unresolved patterns with degree l > √N − 1 count as extra noise.', cite: c('snr-electrodes') },
    { what: 'Which finger', value: `Both fingers are equally likely. Each region has a proper complex Gaussian envelope with a flat ${P.decoderBandHz} Hz band. The decoder compares mean squared envelope magnitude over T, subtracting each channel's known noise baseline. Finite-window covariance quadrature computes its share of correct calls, retaining correlated demixed noise.`, cite: c('erd-detect') + c('finger-model') },
    { what: 'Calibration benchmark', value: 'For the cited adaptive array, about 2N independent samples containing noise alone give, on average, half the optimal squared SNR (the signal-to-noise power ratio). In a band B hertz wide, collecting these samples takes at least N/B seconds; the readout shows this lower bound.', cite: c('calibration-cost') },
  ]);

  function update() {
    const N = sN.value, sep = sSep.value, T = sWin.value, noise = sNoise.value, bg = sBg.value;
    const pts = pairVersusElectrodes(NS, noise, bg, RADIUS_MM, sep);
    const [here] = pairVersusElectrodes([Math.round(N)], noise, bg, RADIUS_MM, sep);
    const ceil = pairCeilingPerNam(bg, RADIUS_MM, sep) * MU_NAM;
    const brain = pts.map((p) => [p.N, p.separated * MU_NAM] as [number, number]);
    const knee = crossing(brain, 0.8 * ceil);
    const cap = 100 * finiteWindowPairCorrect(P.erdPowerDrop, P.decoderBandHz, T);
    const accBrain = pts.map((p) => [p.N, accuracy(p, T)] as [number, number]);

    // the knee note sits below the curve (above it when the curve runs near the axis), left of its point past mid-plot
    const topNotes: Note[] = [];
    const fy = (v: number) => (Math.log(v / Y_TOP[0]) / Math.log(Y_TOP[1] / Y_TOP[0])) * (H_TOP - 58);
    if (isFinite(knee)) {
      const fx = Math.log(knee / 2) / Math.log(5e4);
      topNotes.push({ x: knee, y: 0.8 * ceil, text: `With the brain’s own activity: 80% of\nthe ceiling at ${fmtN(knee)} electrodes, then gains slow`, dx: fx > 0.5 ? -16 : 16, dy: fy(0.8 * ceil) > 50 ? 30 : -34 });
    } else {
      const end = brain[brain.length - 1];
      topNotes.push({ x: end[0], y: end[1], text: 'Even 100,000 electrodes stay\nbelow 80% of the ceiling', dx: -16, dy: fy(end[1]) > 50 ? 30 : -34 });
    }
    top.update([
      { name: 'Finger signal + electrode noise + brain’s own activity', points: brain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: ceil, label: 'model ceiling' },
      { axis: 'x', value: N, label: `${fmtN(N)} electrodes, ${fmt(spacingMm(N) / 10, 2)} cm apart`, callout: true },
    ], undefined, topNotes);
    const at128 = accuracy(pairVersusElectrodes([128], noise, bg, RADIUS_MM, sep)[0], T), atMax = accBrain[accBrain.length - 1][1];
    const botNotes: Note[] = [{ x: 128, y: at128, text: `128 → 100,000 electrodes: +${fmt(atMax - at128, 2)} percentage points`, dx: 16, dy: -70 }]; // above the no-noise line, in the empty upper plot
    bottom.update([
      { name: 'Finger signal + electrode noise + brain’s own activity', points: accBrain, color: '#2a78d6', width: 2.5 },
    ], [
      { axis: 'y', value: cap, label: `no added noise: ${fmt(cap, 2)}%, the rhythm still fluctuates over ${fmt(T, 2)} s` },
      { axis: 'x', value: N, label: '' },
    ], undefined, botNotes);
    rSpacing.set(`${fmt(spacingMm(N) / 10, 2)} cm`);
    rSnr.set(`${fmt(here.separated * MU_NAM, 2)} (${Math.round((100 * here.separated * MU_NAM) / ceil)}%)`);
    rAcc.set(`${fmt(accuracy(here, T), 3)}%`);
    rCal.set(fmtTime(N / P.decoderBandHz));
  }
  [sN, sSep, sWin, sNoise, sBg].forEach((s) => s.onChange(update));
  update();
}
