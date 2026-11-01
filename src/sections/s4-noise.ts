import { synthesize, averageTrials } from '../physics/noise';
import { thermalNoise } from '../physics/electrode';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose } from '../ui/layout';

export function mountNoise(root: HTMLElement) {
  const sec = section(root, 'noise', '4', 'Noise from outside the skull');
  prose(sec.text, `
<p>What arrives at the scalp is tens of microvolts ${c('eeg-amplitude')}. Everything else in the recording is
bigger. Scalp and neck muscles produce electromyographic (EMG) activity that spans roughly 20–300 Hz and can
reach ~100 µV, against gamma-band brain signals of under a microvolt ${c('emg-band')}${c('emg-topography')};
eye blinks give frontal deflections of a hundred microvolts or more ${c('blink-amplitude')}, a dozen or more
times a minute ${c('blink-rate')}. The body also carries a common-mode mains voltage of millivolts to
hundreds of millivolts, coupled capacitively from the wiring around it ${c('common-mode')}. Noise does not
so much “cancel” the neural signal as bury it: independent noise sources add in power, and the
question is whether the signal power stands above the sum.</p>
<p>Three defences, each with a cost. A differential amplifier rejects common-mode voltage — customarily
80–90 dB ${c('cmrr-customary')}, 110–120 dB in a modern integrated front end ${c('ads1299')} — but
only if the two electrodes have matched impedances: an imbalance ΔZ turns common-mode into
differential voltage through the <em>potential-divider effect</em>, V = V<sub>cm</sub>·ΔZ/Z<sub>in</sub>
${c('potential-divider')}. The electrode–skin interface itself generates 1–20 µV rms of noise,
originating in the skin rather than the metal, which is the same order as the EEG ${c('skin-noise')}; the
thermal noise of a 10 kΩ contact over 100 Hz, by contrast, is only ~0.13 µV ${c('thermal-noise')}. Movement adds its own
noise: friction at the electrode–skin interface has no satisfying quantitative model, capacitive electrodes
can take 10–15 s to recover from a jolt, and mains current coupled into unshielded cables can add hundreds
of microvolts ${c('motion-artifact')}. And
averaging N repeated trials improves the signal-to-noise ratio (SNR) by √N ${c('averaging')} —
which is why evoked-potential paradigms work, and why they are slow: for a brain–machine interface,
each averaged trial is time the user spends waiting.</p>`);

  const sSig = slider({ label: 'Alpha rhythm amplitude', unit: 'µV', min: 1, max: 100, value: 20, log: true, note: c('eeg-amplitude') });
  const sEmg = slider({ label: 'Muscle (EMG) noise, 20–300 Hz', unit: 'µV rms', min: 0, max: 100, value: 10, step: 1, note: c('emg-band') });
  const sBlink = slider({ label: 'Blink amplitude', unit: 'µV', min: 0, max: 300, value: 150, step: 10, note: c('blink-amplitude') });
  const sBlinkRate = slider({ label: 'Blink rate', unit: '/min', min: 0, max: 30, value: 15, step: 1, note: c('blink-rate') });
  const sCm = slider({ label: 'Common-mode mains voltage on the body', unit: 'mV', min: 0.1, max: 200, value: 10, log: true, note: c('common-mode') });
  const sCmrr = slider({ label: 'Amplifier common-mode rejection', unit: 'dB', min: 60, max: 120, value: 90, step: 1, note: c('cmrr-customary') });
  const sImb = slider({ label: 'Electrode impedance imbalance ΔZ / Z<sub>in</sub>', min: 1e-6, max: 1e-2, value: 1e-4, log: true, note: c('potential-divider') });
  const sAmp = slider({ label: 'Amplifier input noise', unit: 'µV rms', min: 0.1, max: 5, value: 1, log: true, note: c('ads1299') });
  const sSkin = slider({ label: 'Electrode–skin noise (1/f)', unit: 'µV rms', min: 0, max: 20, value: 3, step: 0.5, note: c('skin-noise') });
  const sTrials = slider({ label: 'Trials averaged (evoked response)', min: 1, max: 1000, value: 16, log: true, format: (v) => String(Math.round(v)) });
  const rSnr = readout('Single-trial SNR (alpha vs everything else)');
  const rMains = readout('Mains residual after rejection + divider effect');
  const rErp = readout('Evoked-response SNR after averaging', c('averaging'));

  const fig = figure(sec.fig, 'Top: four seconds of a synthetic scalp channel — the 10 Hz alpha signal alone, and the same signal buried in muscle, blink, mains, skin and amplifier noise. Bottom: a 5 µV evoked response, one trial versus the average of N trials.');
  const plot = linePlot(fig.plotArea, { x: { label: 'Time (s)', domain: [0, 4] }, y: { label: 'Potential (µV)' }, height: 280 });
  const plot2 = linePlot(fig.plotArea, { x: { label: 'Time after stimulus (ms)', domain: [0, 800] }, y: { label: 'Potential (µV)', domain: [-40, 40] }, height: 240 });
  fig.controls.append(controls(sSig.el, sEmg.el, sBlink.el, sBlinkRate.el), controls(sCm.el, sCmrr.el, sImb.el, sAmp.el, sSkin.el), controls(sTrials.el), rSnr.el, rMains.el, rErp.el);

  // evoked template: 5 µV positive deflection peaking at 300 ms, 100 ms wide, with a small earlier negativity
  const fs = 500, nEp = Math.round(0.8 * fs);
  const template = new Float64Array(nEp);
  for (let i = 0; i < nEp; i++) {
    const t = (i / fs) * 1000;
    template[i] = 5 * Math.exp(-0.5 * Math.pow((t - 300) / 60, 2)) - 2 * Math.exp(-0.5 * Math.pow((t - 150) / 30, 2));
  }

  function update() {
    const s = synthesize({
      fs, seconds: 4, signalUv: sSig.value, signalHz: 10, emgUvRms: sEmg.value, blinkUv: sBlink.value, blinksPerMinute: sBlinkRate.value,
      mainsUvcm: sCm.value * 1e3, cmrrDb: sCmrr.value, imbalanceRatio: sImb.value, ampUvRms: sAmp.value, skinUvRms: sSkin.value, seed: 11,
    });
    const toPts = (a: Float64Array) => Array.from(a, (v, i) => [s.t[i], v] as [number, number]);
    plot.update([
      { name: 'Alpha signal alone', points: toPts(s.signal), color: '#2a78d6', width: 1.5 },
      { name: 'Signal + noise (what the amplifier records)', points: toPts(s.total), color: '#eb6834', width: 1 },
    ]);
    rSnr.set(`${fmt(s.snrDb, 3)} dB`);
    const mainsUv = sCm.value * 1e3 * (Math.pow(10, -sCmrr.value / 20) + sImb.value);
    rMains.set(`${fmt(mainsUv, 3)} µV`);
    const noiseRms = Math.sqrt(s.noise.reduce((a, v) => a + v * v, 0) / s.noise.length);
    const trials = Math.round(sTrials.value);
    const av = averageTrials(template, noiseRms, trials, 5);
    const tms = (i: number) => (i / fs) * 1000;
    plot2.update([
      { name: 'True evoked response', points: Array.from(template, (v, i) => [tms(i), v] as [number, number]), color: '#898781', dashed: true, width: 1.5 },
      { name: 'Single trial', points: Array.from(av.single, (v, i) => [tms(i), v] as [number, number]), color: '#eb6834', width: 1 },
      { name: `Average of ${trials}`, points: Array.from(av.averaged, (v, i) => [tms(i), v] as [number, number]), color: '#2a78d6', width: 2 },
    ]);
    rErp.set(`${fmt(av.snrSingleDb, 3)} dB → ${fmt(av.snrAvgDb, 3)} dB (√${trials} = ${fmt(Math.sqrt(trials), 3)}× in amplitude)`);
  }
  [sSig, sEmg, sBlink, sBlinkRate, sCm, sCmrr, sImb, sAmp, sSkin, sTrials].forEach((s) => s.onChange(update));
  update();
  // thermal-noise aside
  const th = document.createElement('p');
  th.className = 'aside';
  th.innerHTML = `Thermal noise of a 10 kΩ electrode over a 100 Hz bandwidth at body temperature: ${fmt(thermalNoise(1e4, 100) * 1e9, 2)} nV rms ${c('thermal-noise')} — negligible next to the skin’s own noise.`;
  sec.text.append(th);
}
