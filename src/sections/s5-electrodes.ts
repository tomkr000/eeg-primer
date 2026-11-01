import { cabs, cmToDm, contactImpedance, gapCapacitance, gapElectrodeImpedance, inputImpedance, thermalNoise, transferFraction, type InterfaceParams, type Complex } from '../physics/electrode';
import { controls, readout, slider, fmt, fmtSI, choice } from '../ui/slider';
import { linePlot, type Series } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose, assumptions } from '../ui/layout';

/** Reference interface values per cm² (see claims 'chi-table' and 'abrasion'). */
const IFACE: Record<string, InterfaceParams> = {
  abraded: { RpA: 7.5e3, CpA: 25e-9, RsA: 200 }, // skin abraded to 5–10 kΩ
  wet: { RpA: 350e3, CpA: 25e-9, RsA: 200 }, // gel on unprepared skin (Chi 2010 Table I)
  dry: { RpA: 1.3e6, CpA: 12e-9, RsA: 200 }, // bare metal plate (Chi 2010 Table I)
};

type Kind = 'abraded' | 'wet' | 'dry' | 'gap';

export function mountElectrodes(root: HTMLElement) {
  const sec = section(root, 'electrodes', '5', 'What the electrode actually touches');
  prose(sec.text, `
<p>An electrode does not measure the scalp potential; it measures what is left of it after a voltage
divider. The electrode–skin contact has an impedance Z<sub>e</sub>, the amplifier input has an impedance
Z<sub>in</sub>, and the amplifier sees Z<sub>in</sub> / (Z<sub>in</sub> + Z<sub>e</sub>) of the signal. The dry outer
layer of skin, the stratum corneum, is the bottleneck: for gel-coated but otherwise unprepared skin the
impedance of a square centimetre at 1 Hz ranges from 10 kΩ to 1 MΩ across people and sites
${c('rosell')}. Abrading it brings the contact down to 5–10 kΩ ${c('abrasion')}. Measured on the same
(forearm) skin without preparation, a wet gel electrode behaves roughly as 350 kΩ in parallel with 25 nF, a
bare dry metal plate as 1.3 MΩ ∥ 12 nF, and an electrode separated from the skin by cloth as
305 MΩ ∥ 34 pF ${c('chi-table')}. Impedance scales inversely with the area that actually touches skin: in a model of a
1 cm² plate, contact over a quarter of the area raises the 20 Hz impedance from 18 kΩ to about 60 kΩ,
and skin pores and hair are why a plate never touches over its whole face ${c('area-scaling')}. The skin’s
own noise falls only as 1/√area ${c('skin-noise')}.</p>
<p>Hair makes the gap explicit. Scalp hair grows at 124–200 shafts per cm², each 57–68 µm thick
${c('hair')}; a flat electrode resting on it is held off the skin by a layer of hair and air, and couples
through the capacitance of that gap, C = ε₀ε<sub>r</sub>A/d ${c('hair-permittivity')}. At one centimetre
squared and half a millimetre of gap that is about 2 pF, which at 10 Hz is an impedance of several
gigaohms — larger than the input impedance of most amplifiers, so most of the signal is lost in the
divider, and the amplifier’s own ~5–20 pF input capacitance becomes a second divider
${c('noncontact-cap')}${c('ads1299')}. This is why non-contact sensing needs extreme input impedances
(a research amplifier reached 50 TΩ ∥ 60 fF) and active shielding, and why a methodological review
concluded that research-grade EEG over haired scalp still requires wet electrodes
${c('noncontact-cap')}${c('haired-scalp-wet')}. Fingered dry electrodes get through the hair to the skin,
at 14–55 kΩ per finger in the best reports, at the cost of much larger motion artefacts ${c('fingered')}.</p>
<p>With a modern high-impedance amplifier (hundreds of megaohms to a gigaohm) the divider itself is
forgiving: raising electrode impedance from under 10 kΩ to 40 kΩ produced no measurable amplitude loss, and
mains pickup was nearly independent of the mismatch ${c('ferree')}. What suffers is noise. Sites left at their natural 10–190 kΩ needed about three times as
many trials (35 versus 12) to reach the same statistical power, the extra noise sitting below 5 Hz and
worsening in a warm, humid room ${c('kappenman')}. Dry electrodes improve over minutes as sweat accumulates,
while gel dries out over hours ${c('dry-vs-wet-time')}; shielded dry and insulating electrodes pick up
34–40 dB less interference from external fields but are more motion-sensitive at first ${c('searle')}.</p>`);

  let kind: Kind = 'wet';
  const kindCtl = choice('Electrode', [
    { value: 'abraded', label: 'Wet gel, abraded skin' },
    { value: 'wet', label: 'Wet gel, unprepared skin' },
    { value: 'dry', label: 'Dry metal plate' },
    { value: 'gap', label: 'Dry, over hair / gap' },
  ], 'wet', (v) => { kind = v; update(); });
  const sArea = slider({ label: 'Electrode area', unit: 'cm²', min: 0.05, max: 5, value: 1, log: true, note: c('area-scaling') });
  const sGap = slider({ label: 'Hair / air gap thickness', unit: 'mm', min: 0.05, max: 3, value: 0.5, log: true, note: c('hair') });
  const sEps = slider({ label: 'Relative permittivity of the gap ε<sub>r</sub>', min: 1, max: 4, step: 0.1, value: 1, note: c('hair-permittivity') });
  const sContact = slider({ label: 'Fraction of area touching skin through the hair', unit: '%', min: 0, max: 100, step: 1, value: 0 });
  const sRin = slider({ label: 'Amplifier input resistance', unit: 'Ω', min: 1e6, max: 1e13, value: 1e9, log: true, note: c('ads1299') });
  const sCin = slider({ label: 'Amplifier input capacitance', unit: 'pF', min: 0.1, max: 50, value: 20, log: true, note: c('ads1299') });
  const sF = slider({ label: 'Signal frequency for the readouts', unit: 'Hz', min: 0.5, max: 200, value: 10, log: true });
  const rZe = readout('Electrode impedance |Z<sub>e</sub>|');
  const rH = readout('Fraction of the scalp signal reaching the amplifier');
  const rCm = readout('Mains interference from a 50% impedance mismatch at 10 mV common-mode', c('potential-divider'));
  const rTh = readout('Thermal noise of the contact (100 Hz bandwidth)', c('thermal-noise'));

  const fig = figure(sec.fig, 'Electrode impedance versus frequency for the four contact types at the chosen area (left axis, log). Dashed: amplifier input impedance. Where the electrode curve rises above the amplifier’s, most of the signal is lost in the divider.');
  const plot = linePlot(fig.plotArea, {
    x: { label: 'Frequency (Hz)', scale: 'log', domain: [0.1, 1000] },
    y: { label: 'Impedance magnitude (Ω)', scale: 'log', domain: [1e2, 1e12] },
    height: 320,
  });
  const plot2 = linePlot(fig.plotArea, {
    x: { label: 'Frequency (Hz)', scale: 'log', domain: [0.1, 1000] },
    y: { label: 'Signal reaching the amplifier (fraction)', domain: [0, 1.05] },
    height: 220,
  });
  fig.controls.append(controls(kindCtl.el, sArea.el, sGap.el, sEps.el, sContact.el), controls(sRin.el, sCin.el, sF.el), rZe.el, rH.el, rCm.el, rTh.el);
  assumptions(fig.el, [
    { what: 'Wet gel on abraded skin', value: '7.5 kΩ·cm² ∥ 25 nF/cm² + 200 Ω·cm² series', cite: c('abrasion') },
    { what: 'Wet gel on unprepared skin', value: '350 kΩ·cm² ∥ 25 nF/cm²', cite: c('chi-table') },
    { what: 'Dry metal plate', value: '1.3 MΩ·cm² ∥ 12 nF/cm²', cite: c('chi-table') },
    { what: 'Gap coupling', value: 'C = ε₀ε<sub>r</sub>A/d in series with dry skin; contacting fraction in parallel', cite: c('hair-permittivity') },
    { what: 'Area scaling', value: 'R ∝ 1/A, C ∝ A relative to 1 cm² (the measured values above are taken as per-cm²)', cite: c('area-scaling') },
    { what: 'Amplifier input', value: 'R<sub>in</sub> ∥ C<sub>in</sub>, default 1 GΩ ∥ 20 pF', cite: c('ads1299') },
  ]);

  function Ze(k: Kind, f: number): Complex {
    if (k === 'gap') return gapElectrodeImpedance(IFACE.dry, sArea.value, { contactFraction: sContact.value / 100, gapM: sGap.value * 1e-3, epsr: sEps.value }, f);
    return contactImpedance(IFACE[k], sArea.value, f);
  }

  function update() {
    const fs: number[] = [];
    for (let k = 0; k <= 120; k++) fs.push(0.1 * Math.pow(1e4, k / 120));
    const colours: Record<Kind, string> = { abraded: '#1baf7a', wet: '#2a78d6', dry: '#eb6834', gap: '#6250d6' };
    const names: Record<Kind, string> = { abraded: 'Wet, abraded', wet: 'Wet, unprepared', dry: 'Dry plate', gap: 'Dry over hair / gap' };
    const kinds: Kind[] = ['abraded', 'wet', 'dry', 'gap'];
    const series: Series[] = kinds.map((k) => ({ name: names[k], points: fs.map((f) => [f, cabs(Ze(k, f))] as [number, number]), color: colours[k], width: k === kind ? 3 : 1.5 }));
    series.push({ name: 'Amplifier input', points: fs.map((f) => [f, cabs(inputImpedance(sRin.value, sCin.value * 1e-12, f))] as [number, number]), color: '#898781', dashed: true, width: 2 });
    plot.update(series);
    plot2.update(kinds.map((k) => ({ name: names[k], points: fs.map((f) => [f, transferFraction(Ze(k, f), inputImpedance(sRin.value, sCin.value * 1e-12, f))] as [number, number]), color: colours[k], width: k === kind ? 3 : 1.5 })));
    const f = sF.value;
    const ze = Ze(kind, f), zin = inputImpedance(sRin.value, sCin.value * 1e-12, f);
    rZe.set(`${fmtSI(cabs(ze), 'Ω')} at ${fmt(f, 2)} Hz`);
    rH.set(`${fmt(100 * transferFraction(ze, zin), 4)} %`);
    const ze60 = Ze(kind, 60);
    const dz = { re: 0.5 * ze60.re, im: 0.5 * ze60.im };
    rCm.set(`${fmt(cmToDm(10e-3, dz, inputImpedance(sRin.value, sCin.value * 1e-12, 60)) * 1e6, 3)} µV at 60 Hz`);
    rTh.set(`${fmt(thermalNoise(Math.max(ze.re, 0), 100) * 1e9, 3)} nV rms`);
    const cap = gapCapacitance(sArea.value * (1 - sContact.value / 100), sGap.value * 1e-3, sEps.value);
    sGap.el.title = `gap capacitance ${fmt(cap * 1e12, 3)} pF`;
  }
  [sArea, sGap, sEps, sContact, sRin, sCin, sF].forEach((s) => s.onChange(update));
  update();
}
