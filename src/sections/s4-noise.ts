import { synthesize, type NoiseParams } from '../physics/noise';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose, readouts } from '../ui/layout';

/** Shared defaults so section 5 can reuse the same raw scalp signal. */
export const RAW_DEFAULTS: NoiseParams = {
  fs: 500, seconds: 4, signalUv: 20, signalHz: 10, emgUvRms: 10, blinkUv: 150, blinksPerMinute: 15,
  mainsUvcm: 10e3, cmrrDb: 90, imbalanceRatio: 1e-4, ampUvRms: 1, skinUvRms: 3, seed: 11,
};

export function mountNoise(root: HTMLElement) {
  const sec = section(root, 'noise', '4', 'Noise from outside the skull');
  prose(sec.text, `
<p>What arrives at the scalp is tens of microvolts ${c('eeg-amplitude')}. Almost everything else in the
recording is bigger. Scalp and neck muscles produce electromyographic (EMG) activity across roughly
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
paradigms work and why they are slow: for a brain–machine interface every averaged trial is time the user
spends waiting.</p>`);

  const sSig = slider({ label: 'Alpha rhythm amplitude', unit: 'µV', min: 1, max: 100, value: RAW_DEFAULTS.signalUv, log: true, note: c('eeg-amplitude') });
  const sEmg = slider({ label: 'Muscle (EMG), 20–300 Hz', unit: 'µV rms', min: 0, max: 100, value: RAW_DEFAULTS.emgUvRms, step: 1, note: c('emg-band') });
  const sBlink = slider({ label: 'Blink amplitude', unit: 'µV', min: 0, max: 300, value: RAW_DEFAULTS.blinkUv, step: 10, note: c('blink-amplitude') });
  const sBlinkRate = slider({ label: 'Blink rate', unit: '/min', min: 0, max: 30, value: RAW_DEFAULTS.blinksPerMinute, step: 1, note: c('blink-rate') });
  const sCm = slider({ label: 'Common-mode mains voltage', unit: 'mV', min: 0.1, max: 200, value: 10, log: true, note: c('common-mode') });
  const sCmrr = slider({ label: 'Amplifier common-mode rejection', unit: 'dB', min: 60, max: 120, value: RAW_DEFAULTS.cmrrDb, step: 1, note: c('cmrr-customary') });
  const sImb = slider({ label: 'Impedance imbalance ΔZ / Z<sub>in</sub>', min: 1e-6, max: 1e-2, value: RAW_DEFAULTS.imbalanceRatio, log: true, note: c('potential-divider') });
  const sAmp = slider({ label: 'Amplifier input noise', unit: 'µV rms', min: 0.1, max: 5, value: RAW_DEFAULTS.ampUvRms, log: true, note: c('ads1299') });
  const sSkin = slider({ label: 'Electrode–skin noise (1/f)', unit: 'µV rms', min: 0, max: 20, value: RAW_DEFAULTS.skinUvRms, step: 0.5, note: c('skin-noise') });
  const rSnr = readout('Signal-to-noise ratio (alpha vs the rest)');
  const rMains = readout('Mains residual after rejection and divider');
  const rRms = readout('Total rms of the recording');

  const fig = figure(sec.fig, 'Four seconds of a synthetic scalp channel: the 10 Hz alpha rhythm alone (blue) and the same rhythm buried in muscle, mains, skin and amplifier noise (orange). The large deflections marked are eye blinks. This is the raw signal at the scalp: whatever the electrode type, this is what it is trying to pick up.');
  const plot = linePlot(fig.viz, { x: { label: 'Time (s)', domain: [0, 4] }, y: { label: 'Potential (µV)' }, height: 360 });
  fig.panel.append(controls(sSig.el, sEmg.el, sBlink.el, sBlinkRate.el, sCm.el, sCmrr.el, sImb.el, sAmp.el, sSkin.el), readouts(rSnr.el, rMains.el, rRms.el));

  function update() {
    const s = synthesize({
      ...RAW_DEFAULTS, signalUv: sSig.value, emgUvRms: sEmg.value, blinkUv: sBlink.value, blinksPerMinute: sBlinkRate.value,
      mainsUvcm: sCm.value * 1e3, cmrrDb: sCmrr.value, imbalanceRatio: sImb.value, ampUvRms: sAmp.value, skinUvRms: sSkin.value,
    });
    const toPts = (a: Float64Array) => Array.from(a, (v, i) => [s.t[i], v] as [number, number]);
    plot.update([
      { name: 'Alpha rhythm alone', points: toPts(s.signal), color: '#2a78d6', width: 1.5 },
      { name: 'Raw scalp signal (alpha + everything else)', points: toPts(s.total), color: '#eb6834', width: 1 },
    ], s.blinkTimes.map((t) => ({ axis: 'x' as const, value: t, label: 'eye blink' })));
    rSnr.set(`${fmt(s.snrDb, 3)} dB`);
    rMains.set(`${fmt(sCm.value * 1e3 * (Math.pow(10, -sCmrr.value / 20) + sImb.value), 3)} µV`);
    rRms.set(`${fmt(Math.sqrt(s.total.reduce((a, v) => a + v * v, 0) / s.total.length), 3)} µV`);
  }
  [sSig, sEmg, sBlink, sBlinkRate, sCm, sCmrr, sImb, sAmp, sSkin].forEach((s) => s.onChange(update));
  update();
}
