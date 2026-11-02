import { synthesize, type NoiseParams } from '../physics/noise';
import { netDipole } from '../physics/population';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { P, claimCite as c, defaultHead } from '../data/params';
import { solveShells, surfacePotential } from '../physics/sphere';
import { section, figure, prose, readouts, assumptions } from '../ui/layout';

/** Shared defaults so section 5 can reuse the same raw scalp signal. */
export const RAW_DEFAULTS: NoiseParams = {
  fs: 500, seconds: 4, signalUv: 20, signalHz: 10, emgUvRms: 10, blinkUv: 150, blinksPerMinute: 15,
  mainsUvcm: 10e3, cmrrDb: 90, imbalanceRatio: 1e-4, ampUvRms: 1, skinUvRms: 3, seed: 11,
};

export function mountNoise(root: HTMLElement) {
  const sec = section(root, 'noise', '4', 'The signal that gets outside the skull is noisy');
  prose(sec.text, `
<p>What arrives at the scalp is tens of microvolts ${c('eeg-amplitude')}. The alpha rhythm in the figure
comes from the same chain as the earlier sections: its textbook 20 µV takes a source of about 40 nA·m in
the head of section 3, which by section 2 is about 740,000 cells with a tenth in step, where the sliders
start ${c('alpha-source-chain')}. Almost everything else in the recording is bigger. Scalp and neck muscles produce electromyographic (EMG) activity across roughly
20–300 Hz that can reach ~100 µV, against gamma-band brain signals under a microvolt
${c('emg-band')}${c('emg-topography')}. Eye blinks give frontal deflections of 100–200 µV
${c('blink-amplitude')}, a dozen or more times a minute ${c('blink-rate')}. The body also carries a
common-mode mains voltage of millivolts to hundreds of millivolts ${c('common-mode')}. Noise does not cancel
the neural signal so much as bury it: independent sources add in power.</p>
<p>Three defences, each with a cost. A differential amplifier rejects common-mode voltage, by 80–90 dB in
older designs ${c('cmrr-customary')} and 110–120 dB in a modern integrated front end ${c('ads1299')},
but only if the two electrodes have matched impedances: an imbalance converts common-mode into
differential voltage through the potential-divider effect, V = V<sub>cm</sub>·ΔZ/Z<sub>in</sub>
${c('potential-divider')}. The electrode–skin interface adds 1–20 µV rms of its own noise, from the
skin rather than the metal ${c('skin-noise')}; the thermal noise of a 10 kΩ contact over 100 Hz is only
~0.13 µV ${c('thermal-noise')}. Movement and cables add more ${c('motion-artifact')}. Averaging repeated
trials improves the signal-to-noise ratio (SNR) by √N ${c('averaging')}, which is why evoked-potential
paradigms work and why they are slow: for a brain–computer interface (BCI) every averaged trial is time the user
spends waiting.</p>`);

  // scalp potential per unit dipole moment for the default head of section 3 (radial source 2 mm below the cortex)
  const head = defaultHead();
  const scalpUvPerNam = surfacePotential(solveShells(head.shells, head.sourceRadius, 1, 'radial', 120), 0) * 1e6 * 1e-9;
  const momentNam = (N: number, f: number) => netDipole(Math.round(N), f, 1, P.singleCellMomentPAm * 1e-12).total * 1e9;
  // the patch that gives the textbook 20 µV alpha rhythm with a tenth of its cells in step
  const alphaN = RAW_DEFAULTS.signalUv / (scalpUvPerNam * P.patchDefaultSync * P.singleCellMomentPAm * 1e-3);
  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: alphaN, log: true, format: (v) => fmt(Math.round(v), 2), marks: [{ value: P.patchDefaultN, label: 'Typical source' }, { value: alphaN, label: 'Alpha rhythm' }], note: c('alpha-source-chain') });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Seizure' }] });
  const sEmg = slider({ label: 'Muscle (EMG), 20–300 Hz', unit: 'µV rms', min: 0, max: 100, value: RAW_DEFAULTS.emgUvRms, step: 1, note: c('emg-level'), marks: [{ value: RAW_DEFAULTS.emgUvRms, label: 'Relaxed' }, { value: 100, label: 'Clenched jaw' }] });
  const sSkin = slider({ label: 'Electrode–skin noise (1/f)', unit: 'µV rms', min: 0, max: 20, value: RAW_DEFAULTS.skinUvRms, step: 0.5, note: c('skin-noise'), marks: [{ value: 1.5, label: 'Abraded skin' }, { value: 8, label: 'Dry contact' }] });
  const rAlpha = readout('Alpha amplitude at the scalp (section 3 head)', c('alpha-source-chain'));
  const rSnr = readout('Signal-to-noise ratio (alpha vs the rest)');
  const rRms = readout('Total rms of the recording');

  const fig = figure(sec.fig, 'Four seconds of a synthetic scalp channel: the 10 Hz alpha rhythm alone (blue) and the same rhythm buried in muscle, blink, skin, mains and amplifier noise (orange). The alpha amplitude is not a free number: it comes from the patch of sections 2 and 3 through the same head, and the textbook 20 µV needs about 740,000 cells with a tenth in step, more than the typical evoked source. The large deflections are eye blinks at their reported size and rate. This is the raw signal at the scalp: whatever the electrode type, this is what it is trying to pick up.');
  const plot = linePlot(fig.viz, { x: { label: 'Time (s)', domain: [0, 4] }, y: { label: 'Potential (µV)' }, height: 360, legendInside: true });
  fig.panel.append(controls(sN.el, sF.el, sEmg.el, sSkin.el));
  fig.viz.append(readouts(rAlpha.el, rSnr.el, rRms.el));
  assumptions(fig.el, [
    { what: 'Alpha rhythm', value: `a pure 10 Hz sine whose amplitude is the scalp potential of the patch in the section 3 head (${fmt(scalpUvPerNam, 2)} µV per nA·m, source 2 mm below the cortex); 20 µV is the textbook scalp amplitude`, cite: c('alpha-source-chain') + c('eeg-amplitude') },
    { what: 'Blinks', value: `${RAW_DEFAULTS.blinkUv} µV, ${RAW_DEFAULTS.blinksPerMinute} per minute, 160 ms wide (reported values, not adjustable)`, cite: c('blink-amplitude') + c('blink-rate') },
    { what: 'Mains (50/60 Hz) interference', value: `${RAW_DEFAULTS.mainsUvcm / 1e3} mV of common-mode mains voltage on the body, rejected by ${RAW_DEFAULTS.cmrrDb} dB, with an electrode-impedance imbalance of 1 in ${fmt(1 / RAW_DEFAULTS.imbalanceRatio, 2)} letting a further fraction through (potential-divider effect): about 1.3 µV is left, so it is kept in the trace but not adjustable`, cite: c('common-mode') + c('cmrr-customary') + c('potential-divider') },
    { what: 'Amplifier noise', value: `${RAW_DEFAULTS.ampUvRms} µV rms, white`, cite: c('ads1299') },
    { what: 'Spectra', value: 'muscle noise band-limited to 20–300 Hz; skin noise with a 1/f spectrum', cite: c('emg-band') + c('skin-noise') },
  ]);

  function update() {
    const alphaUv = momentNam(sN.value, sF.value) * scalpUvPerNam;
    const s = synthesize({ ...RAW_DEFAULTS, signalUv: alphaUv, emgUvRms: sEmg.value, skinUvRms: sSkin.value });
    const toPts = (a: Float64Array) => Array.from(a, (v, i) => [s.t[i], v] as [number, number]);
    plot.update([
      { name: 'Raw scalp signal (alpha + everything else)', points: toPts(s.total), color: '#eb6834', width: 1 },
      { name: 'Alpha rhythm alone', points: toPts(s.signal), color: '#2a78d6', width: 1.8 },
    ], s.blinkTimes.map((t) => ({ axis: 'x' as const, value: t, label: 'eye blink' })));
    rAlpha.set(`${fmt(alphaUv, 3)} µV`);
    rSnr.set(`${fmt(s.snrDb, 3)} dB`);
    rRms.set(`${fmt(Math.sqrt(s.total.reduce((a, v) => a + v * v, 0) / s.total.length), 3)} µV`);
  }
  [sN, sF, sEmg, sSkin].forEach((s) => s.onChange(update));
  update();
}
