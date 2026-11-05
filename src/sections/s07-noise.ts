import { synthesize, movementArtifact, type Movement, type NoiseParams } from '../physics/noise';
import { netDipole } from '../physics/population';
import { choice, controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { P, claimCite as c, defaultHead } from '../data/params';
import { solveShells, surfacePotential } from '../physics/sphere';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

/** Shared defaults so section 8 can reuse the same raw scalp signal. */
export const RAW_DEFAULTS: NoiseParams = {
  fs: 500, seconds: 4, signalUv: 20, signalHz: 10, emgUvRms: 10, blinkUv: 150, blinksPerMinute: 15,
  mainsUvcm: 10e3, cmrrDb: 90, imbalanceRatio: 1e-4, ampUvRms: 1, skinUvRms: 3, seed: 11,
};

// scalp potential per unit dipole moment for the default head of section 3 (radial source 2 mm below the cortex)
const head = defaultHead();
const scalpUvPerNam = surfacePotential(solveShells(head.shells, head.sourceRadius, 1, 'radial', 120), 0) * 1e6 * 1e-9;
/** Net moment (nA·m) of N cells with a fraction f in step: the chain of section 2. */
export const momentNam = (N: number, f: number) => netDipole(Math.round(N), f, 1, P.singleCellMomentPAm * 1e-12).total * 1e9;
/** Alpha amplitude at the scalp (µV) for N cells with a fraction f in step: the chain of sections 2 and 3. */
export const alphaUv = (N: number, f: number) => momentNam(N, f) * scalpUvPerNam;
/** The patch that gives the textbook 20 µV alpha rhythm with a tenth of its cells in step. */
export const ALPHA_N = RAW_DEFAULTS.signalUv / (scalpUvPerNam * P.patchDefaultSync * P.singleCellMomentPAm * 1e-3);
/** The two sliders of the shared source model, used by sections 4 to 9. */
export const sourceSliders = (defaultN = ALPHA_N, defaultF = P.patchDefaultSync) => ({
  sN: slider({ label: 'Neurons in the patch, N', min: 1e5, max: P.patchMaxN, value: defaultN, log: true, format: (v) => fmt(Math.round(v), 2), marks: [{ value: P.patchDefaultN, label: 'Typical' }, { value: ALPHA_N, label: 'Alpha' }], note: c('alpha-source-chain') }),
  sF: slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: defaultF, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Theoretical<br>max' }] }),
});

export function mountNoise(root: HTMLElement) {
  const sec = section(root, 'noise', '7', 'The signal that gets outside the skull is noisy', 'Follow one alpha rhythm over time, mixed with other signals and recording noise');
  prose(sec.text, `
<p>The blue trace below is an idealized alpha rhythm with a reference amplitude of 20 µV ${c('eeg-amplitude')}. Its amplitude comes
from the same cell-group and head models as sections 2 and 3. In this model, that requires about 740,000
cells with 10% synchronized ${c('alpha-source-chain')}.</p>
<p>Other sources can be much larger. Scalp and neck muscles produce electrical activity, called
electromyography (EMG), across roughly 20–300 Hz ${c('emg-band')}. Eye blinks can produce frontal voltage
changes of 100–200 µV ${c('blink-amplitude')}. These blink signals arise from the eye's electrical potential,
not simply from the contracting muscles ${c('blink-mechanism')}. Power-line electricity also places a
voltage on the body ${c('common-mode')}.</p>
<p>An amplifier measures the voltage difference between electrodes. It can reject interference that
reaches both electrodes equally ${c('cmrr-customary')}. Unequal contact impedances let some of that shared interference appear in the difference
${c('potential-divider')}.</p>
<p>The skin–electrode contact adds its own noise, typically 1–20 µV root mean square (rms), a measure of
noise size ${c('skin-noise')}. Movement and cables can add artifacts ${c('motion-artifact')}. Chewing,
nodding and rolling the head can add tens to hundreds of µV ${c('head-movement-artifacts')}; brisk walking adds
about 4 µV rms and running about 21 µV rms, mostly at the step rate and its multiples ${c('running-artifact')}${c('running-artifact-size')}.
</p>`);

  const { sN, sF } = sourceSliders();
  const sEmg = slider({ label: 'Muscle (EMG), 20–300 Hz', unit: 'µV rms', min: 0, max: 100, value: RAW_DEFAULTS.emgUvRms, step: 1, note: c('emg-level'), marks: [{ value: RAW_DEFAULTS.emgUvRms, label: 'Relaxed' }, { value: 100, label: 'Clenched jaw' }] });
  const sSkin = slider({ label: 'Electrode–skin noise (1/f)', unit: 'µV rms', min: 0, max: 20, value: RAW_DEFAULTS.skinUvRms, step: 0.5, note: c('skin-noise'), marks: [{ value: 1.5, label: 'Abraded skin' }, { value: 8, label: 'Dry contact' }] });
  const rAlpha = readout('Alpha amplitude at the scalp (section 3 head)', c('alpha-source-chain'));
  const rSnr = readout('Signal-to-noise ratio (alpha vs the rest)');
  const rRms = readout('Total rms of the recording');
  const MOVES: { value: Movement; label: string }[] = [{ value: 'none', label: 'None' }, { value: 'walking', label: 'Walking' }, { value: 'chewing', label: 'Chewing' }, { value: 'nodding', label: 'Nodding' }, { value: 'rolling', label: 'Rolling head' }, { value: 'running', label: 'Running' }];
  const move = choice('Movement artifact', MOVES, 'none', () => update());
  move.el.classList.add('artifact-choice');
  const moveSettings = { runUvRms: P.runArtifactUvRms, stepHz: P.runStepHz, walkUvRms: P.walkArtifactUvRms, walkStepHz: P.walkStepHz, chewBurstUvRms: P.chewBurstUvRms, chewBurstS: P.chewBurstS, chewPeriodS: P.chewPeriodS, nodHz: P.nodHz, nodSwingUv: P.nodSwingUv, nodMuscleUvRms: P.nodMuscleUvRms, roll: P.rollUv };

  const fig = figure(sec.fig, `Four seconds of a simulated recording at one electrode. The ${sw('#2a78d6', 'line')} line is an idealized 10 Hz alpha rhythm, with its amplitude calculated from the source and head models of sections 2 and 3 ${c('alpha-source-chain')}. The ${sw('#eb6834', 'line')} line adds muscle activity, blinks, and contact and amplifier noise, using the settings listed below ${c('noise-model-settings')}. The ${sw('#3d3a35', 'line')} line is the chosen movement artifact on its own. Chewing, nodding and rolling the head are sized to recordings from a consumer headset ${c('head-movement-artifacts')}, with modeled shapes and rates ${c('movement-artifact-shapes')}. Walking and running add power at the step rate and its multiples ${c('running-artifact')}.`);
  fig.viz.append(vizTitle('Simulated scalp potential at one electrode: alpha rhythm plus noise sources'));
  const plot = linePlot(fig.viz, { x: { label: 'Time (s)', domain: [0, 4] }, y: { label: 'Potential (µV)' }, height: 360, legendInside: true });
  fig.panel.append(controls(sN.el, sF.el, sEmg.el, sSkin.el, move.el));
  fig.viz.append(readouts(rAlpha.el, rSnr.el, rRms.el));
  assumptions(fig.el, [
    { what: 'Alpha rhythm', value: `A 10 Hz sine wave with a slowly varying amplitude. The head model converts source strength to scalp amplitude at ${fmt(scalpUvPerNam, 2)} µV per nA·m, for a source 2 mm below the cortical surface ${c('alpha-source-chain')}. The default amplitude is 20 µV.`, cite: c('eeg-amplitude') },
    { what: 'Blink settings', value: `Peak amplitude: ${RAW_DEFAULTS.blinkUv} µV ${c('blink-amplitude')}. Rate: ${RAW_DEFAULTS.blinksPerMinute} per minute ${c('blink-rate')}. Chosen Gaussian shape: about 190 ms wide at half the peak height.`, cite: c('noise-model-settings') },
    { what: 'Blink source', value: 'The moving eyelid carries the eye’s electrical potential toward the frontal electrodes. The model adds this as an eye artifact.', cite: c('blink-mechanism') },
    { what: 'Power-line interference', value: `The chosen body-voltage amplitude is ${RAW_DEFAULTS.mainsUvcm / 1e3} mV. The amplifier rejects shared interference by ${RAW_DEFAULTS.cmrrDb} dB ${c('cmrr-customary')}. A contact-impedance mismatch adds leakage. Together they leave about 1.3 µV in this example. These are fixed simulation settings, not adjustable measurements.`, cite: c('noise-model-settings') },
    { what: 'Amplifier noise', value: `${RAW_DEFAULTS.ampUvRms} µV rms ${c('ads1299')}. The model spreads this noise evenly across frequencies (white noise).`, cite: c('noise-model-settings') },
    { what: 'Chewing, nodding, rolling head', value: `Chewing: muscle bursts of ${P.chewBurstUvRms} µV rms lasting ${P.chewBurstS} s, one every ${P.chewPeriodS} s. Nodding: a ${P.nodHz} Hz swing of ${P.nodSwingUv} µV with neck-muscle bursts of ${P.nodMuscleUvRms} µV rms. Rolling head: slow swings of ${P.rollUv.map(([uv, hz]) => `${uv} µV at ${hz} Hz`).join(' plus ')}. Sizes follow recordings from a consumer headset ${c('head-movement-artifacts')}; shapes and rates are modeling choices.`, cite: c('movement-artifact-shapes') },
    { what: 'Walking, running', value: `${fmt(P.walkArtifactUvRms, 2)} µV rms walking at 1.25 m/s and ${fmt(P.runArtifactUvRms, 2)} µV rms running at 1.9 m/s: the extra 1.5–8.5 Hz power measured over standing ${c('running-artifact')}. Each repeats at its step rate (${P.walkStepHz} and ${P.runStepHz} Hz) with its 2nd and 3rd multiples; that shape is a modeling choice.`, cite: c('running-artifact-size') },
    { what: 'Noise frequencies', value: `Reported muscle activity spans roughly 20–300 Hz ${c('emg-band')}. The simulation filters muscle noise between 20 and 225 Hz ${c('noise-model-settings')}. Skin noise is stronger at low frequencies (1/f).`, cite: c('skin-noise') },
  ]);

  function update() {
    const alpha = alphaUv(sN.value, sF.value);
    const kind = move.value, moving = kind !== 'none';
    const motion = moving ? movementArtifact(kind, RAW_DEFAULTS.fs, RAW_DEFAULTS.seconds, moveSettings) : undefined;
    const s = synthesize({ ...RAW_DEFAULTS, signalUv: alpha, emgUvRms: sEmg.value, skinUvRms: sSkin.value, motion });
    const toPts = (a: Float64Array) => Array.from(a, (v, i) => [s.t[i], v] as [number, number]);
    plot.update([
      ...(moving ? [{ name: `Movement artifact (${MOVES.find((m) => m.value === kind)!.label.toLowerCase()})`, points: toPts(s.motion), color: '#3d3a35', width: 1.4 }] : []),
      { name: 'Raw scalp signal (alpha + noise sources)', points: toPts(s.total), color: '#eb6834', width: 1 },
      { name: 'Idealized alpha rhythm signal', points: toPts(s.signal), color: '#2a78d6', width: 1.8 },
    ], s.blinkTimes.map((t, i) => ({ axis: 'x' as const, value: t, label: i ? 'eye blink' : 'eye blink: an eye potential, not muscle', callout: true })));
    rAlpha.set(`${fmt(alpha, 3)} µV`);
    rSnr.set(`${fmt(s.snrDb, 3)} dB`);
    rRms.set(`${fmt(Math.sqrt(s.total.reduce((a, v) => a + v * v, 0) / s.total.length), 3)} µV`);
  }
  [sN, sF, sEmg, sSkin].forEach((s) => s.onChange(update));
  update();
}
