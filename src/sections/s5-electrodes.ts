import { cabs, contactImpedance, gapCapacitance, gapElectrodeImpedance, inputImpedance, type InterfaceParams, type Complex } from '../physics/electrode';
import { applyTransfer } from '../physics/fft';
import { synthesize } from '../physics/noise';
import { mulberry32 } from '../physics/population';
import { controls, slider, fmt, fmtSI } from '../ui/slider';
import { stripPlot, type Strip } from '../ui/strips';
import { claimCite as c } from '../data/params';
import { section, figure, prose, assumptions } from '../ui/layout';
import { RAW_DEFAULTS } from './s4-noise';

/** Reference interface values per cm² (claims 'chi-table' and 'abrasion'). */
const IFACE: Record<string, InterfaceParams> = {
  abraded: { RpA: 7.5e3, CpA: 25e-9, RsA: 200 },
  wet: { RpA: 350e3, CpA: 25e-9, RsA: 200 },
  dry: { RpA: 1.3e6, CpA: 12e-9, RsA: 200 },
};
type Kind = 'abraded' | 'wet' | 'dry' | 'gap';
const KINDS: Kind[] = ['abraded', 'wet', 'dry', 'gap'];
const NAMES: Record<Kind, string> = { abraded: 'Wet gel, abraded skin', wet: 'Wet gel, unprepared skin', dry: 'Dry metal plate', gap: 'Dry plate over hair (gap)' };
const COLOURS: Record<Kind, string> = { abraded: '#1baf7a', wet: '#2a78d6', dry: '#eb6834', gap: '#6250d6' };
/** electrode–skin noise, µV rms, by contact type (claim 'electrode-noise-levels') */
const SKIN_NOISE: Record<Kind, number> = { abraded: 1.5, wet: 4, dry: 8, gap: 8 };

function pink(n: number, rms: number, seed: number): Float64Array {
  const rng = mulberry32(seed);
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const u = Math.max(rng(), 1e-12), v = rng();
    const w = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
    acc += out[i] * out[i];
  }
  const s = rms / (Math.sqrt(acc / n) || 1);
  for (let i = 0; i < n; i++) out[i] *= s;
  return out;
}

export function mountElectrodes(root: HTMLElement) {
  const sec = section(root, 'electrodes', '5', 'What the electrode actually touches');
  prose(sec.text, `
<p>An electrode measures what is left of the scalp potential after a voltage divider: the contact has an
impedance Z<sub>e</sub>, the amplifier input has Z<sub>in</sub>, and the amplifier sees
Z<sub>in</sub> / (Z<sub>in</sub> + Z<sub>e</sub>). The dry outer skin is the bottleneck. With gel but no
preparation, a square centimetre of skin ranges from 10 kΩ to 1 MΩ at 1 Hz ${c('rosell')}; abrading
it gives 5–10 kΩ ${c('abrasion')}. On the same skin, a wet gel electrode behaves like 350 kΩ in
parallel with 25 nF and a bare dry plate like 1.3 MΩ with 12 nF ${c('chi-table')}. Impedance falls with
the area that actually touches: contact over a quarter of a plate roughly triples it, and hair and skin
pores are why a plate never touches over its whole face ${c('area-scaling')}.</p>
<p>Hair makes the gap explicit. Scalp hair grows at 124–200 shafts per cm², each about 60 µm thick
${c('hair')}; a flat electrode resting on it couples through the capacitance of an air gap,
C = ε₀ε<sub>r</sub>A/d ${c('hair-permittivity')}: about 2 pF for 1 cm² over half a millimetre,
several gigaohms at 10 Hz. That is more than most amplifiers’ input impedance, so most of the signal is
lost, and the amplifier’s own input capacitance forms a second divider ${c('noncontact-cap')}${c('ads1299')}.
Non-contact sensing therefore needs extreme input impedances and shielding, and a methodological review
concluded that research-grade EEG over hair still requires wet electrodes ${c('haired-scalp-wet')}.</p>
<p>With a modern high-impedance amplifier the divider is forgiving up to tens of kilohms ${c('ferree')};
what suffers is noise. Sites left at their natural impedance needed three times as many trials as abraded
ones ${c('kappenman')}. Dry electrodes improve over minutes as sweat accumulates while gel dries over hours
${c('dry-vs-wet-time')}${c('searle')}, and fingered dry electrodes reach the skin through hair at 14–55 kΩ
per finger ${c('fingered')}.</p>`);

  const sArea = slider({ label: 'Electrode area', unit: 'cm²', min: 0.05, max: 5, value: 1, log: true, note: c('area-scaling') });
  const sGap = slider({ label: 'Hair / air gap thickness', unit: 'mm', min: 0.05, max: 3, value: 0.5, log: true, note: c('hair') });
  const sContact = slider({ label: 'Area touching skin through the hair', unit: '%', min: 0, max: 100, step: 1, value: 0 });
  const sRin = slider({ label: 'Amplifier input resistance', unit: 'Ω', min: 1e6, max: 1e13, value: 1e9, log: true, note: c('ads1299') });
  const sCin = slider({ label: 'Amplifier input capacitance', unit: 'pF', min: 0.1, max: 50, value: 20, log: true, note: c('ads1299') });
  const sCm = slider({ label: 'Common-mode mains voltage', unit: 'mV', min: 0.1, max: 200, value: 10, log: true, note: c('common-mode') });
  const sIn = slider({ label: 'Amplifier current noise', unit: 'fA/√Hz', min: 0.05, max: 100, value: 1, log: true, note: c('amp-current-noise') });

  const fig = figure(sec.fig, 'Two seconds of the raw scalp signal of section 4, in a stretch without a blink (top strip), and what reaches the amplifier through each electrode type: the signal after the impedance divider, plus the contact’s own skin noise, mains pickup from a 50% mismatch between the two electrodes, and the amplifier’s current noise flowing through the contact impedance. Each strip is drawn to its own scale (written at the left) so the shape stays visible; the table gives the numbers.');
  const plot = stripPlot(fig.viz, { xLabel: 'Time (s)', xDomain: [0, 2], stripHeight: 66 });
  const table = document.createElement('table');
  table.className = 'mini-table';
  fig.panel.append(controls(sArea.el, sGap.el, sContact.el, sRin.el, sCin.el, sCm.el, sIn.el), table);
  assumptions(fig.el, [
    { what: 'Wet gel on abraded skin', value: '7.5 kΩ·cm² ∥ 25 nF/cm² + 200 Ω·cm² series', cite: c('abrasion') },
    { what: 'Wet gel, unprepared / dry plate', value: '350 kΩ ∥ 25 nF and 1.3 MΩ ∥ 12 nF per cm²', cite: c('chi-table') },
    { what: 'Gap coupling', value: 'C = ε₀ε<sub>r</sub>A/d (air, ε<sub>r</sub> = 1) in series with dry skin; any contacting fraction in parallel', cite: c('hair-permittivity') },
    { what: 'Area scaling', value: 'R ∝ 1/A, C ∝ A relative to 1 cm²', cite: c('area-scaling') },
    { what: 'Skin noise by contact type', value: `${SKIN_NOISE.abraded} / ${SKIN_NOISE.wet} / ${SKIN_NOISE.dry} / ${SKIN_NOISE.gap} µV rms (abraded / wet / dry / gap), 1/f spectrum, scaled by 1/√area`, cite: c('electrode-noise-levels') },
    { what: 'Amplifier', value: 'R<sub>in</sub> ∥ C<sub>in</sub>; 1 µV rms voltage noise; current noise from the slider', cite: c('ads1299') + c('amp-current-noise') },
    { what: 'Mains pickup', value: 'the two contacts of a pair differ by 50% in impedance, so the common-mode voltage leaks in as V<sub>cm</sub> × |H(Z<sub>e</sub>) − H(1.5 Z<sub>e</sub>)| at 60 Hz, with H = Z<sub>in</sub>/(Z<sub>in</sub> + Z<sub>e</sub>)', cite: c('common-mode') },
  ]);

  const raw = synthesize({ ...RAW_DEFAULTS, seconds: 2, seed: 11, blinksPerMinute: 0 }); // a stretch without a blink
  const n = raw.total.length;

  function Ze(k: Kind, f: number): Complex {
    if (k === 'gap') return gapElectrodeImpedance(IFACE.dry, sArea.value, { contactFraction: sContact.value / 100, gapM: sGap.value * 1e-3, epsr: 1 }, f);
    return contactImpedance(IFACE[k], sArea.value, f);
  }

  function update() {
    const Zin = (f: number) => inputImpedance(sRin.value, sCin.value * 1e-12, f);
    const strips: Strip[] = [];
    const t = raw.t;
    strips.push({ name: 'Raw scalp signal', points: Array.from(raw.total, (v, i) => [t[i], v] as [number, number]), color: '#898781', note: '10 Hz alpha at 20 µV, with muscle, mains and skin noise' });
    const rows: string[] = [];
    KINDS.forEach((k, idx) => {
      // divider as a frequency response
      const H = (f: number): Complex => {
        const ze = Ze(k, f), zin = Zin(f);
        const den = { re: zin.re + ze.re, im: zin.im + ze.im };
        const d = den.re * den.re + den.im * den.im;
        return { re: (zin.re * den.re + zin.im * den.im) / d, im: (zin.im * den.re - zin.re * den.im) / d };
      };
      const sig = applyTransfer(raw.total, RAW_DEFAULTS.fs, H);
      const skin = pink(n, SKIN_NOISE[k] / Math.sqrt(sArea.value), 20 + idx);
      // amplifier current noise i_n (A/√Hz) flowing through |Ze(f)|: white current, shaped by the impedance
      const iWhite = new Float64Array(n);
      const rng = mulberry32(40 + idx);
      for (let i = 0; i < n; i++) { const u = Math.max(rng(), 1e-12), v = rng(); iWhite[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
      const inA = sIn.value * 1e-15 * Math.sqrt(RAW_DEFAULTS.fs / 2); // per-sample white noise with density i_n
      const curr = applyTransfer(iWhite, RAW_DEFAULTS.fs, (f) => { const z = Ze(k, f); return { re: z.re * inA * 1e6, im: z.im * inA * 1e6 }; }); // µV
      // mains pickup: the two electrodes of the pair differ by 50% in impedance, so the common-mode voltage
      // reaches the amplifier as Vcm × |Zin/(Zin+Ze) − Zin/(Zin+1.5·Ze)| at 60 Hz (bounded, unlike ΔZ/Zin)
      const ze60 = Ze(k, 60), zin60 = Zin(60);
      const div = (ze: Complex): Complex => { const den = { re: zin60.re + ze.re, im: zin60.im + ze.im }; const d = den.re * den.re + den.im * den.im; return { re: (zin60.re * den.re + zin60.im * den.im) / d, im: (zin60.im * den.re - zin60.re * den.im) / d }; };
      const h1 = div(ze60), h2 = div({ re: 1.5 * ze60.re, im: 1.5 * ze60.im });
      const mains = sCm.value * 1e3 * cabs({ re: h1.re - h2.re, im: h1.im - h2.im });
      const out = new Float64Array(n);
      let ps = 0, pn = 0;
      for (let i = 0; i < n; i++) {
        const noise = skin[i] + curr[i] + mains * Math.sin(2 * Math.PI * 60 * t[i] + 0.3);
        out[i] = sig[i] + noise;
        ps += sig[i] * sig[i]; pn += noise * noise;
      }
      const h10 = cabs(H(10));
      const snr = 10 * Math.log10(ps / Math.max(pn, 1e-30));
      strips.push({ name: NAMES[k], points: Array.from(out, (v, i) => [t[i], v] as [number, number]), color: COLOURS[k], note: `keeps ${fmt(100 * h10, 3)}% of the signal, adds ${fmt(Math.sqrt(pn / n), 2)} µV of noise` });
      rows.push(`<tr><td><i style="background:${COLOURS[k]}"></i>${NAMES[k]}</td><td>${fmtSI(cabs(Ze(k, 10)), 'Ω', 2)}</td><td>${fmt(100 * h10, 3)}%</td><td>${fmt(Math.sqrt(pn / n), 2)} µV</td><td>${fmt(snr, 2)} dB</td></tr>`);
    });
    plot.update(strips);
    table.innerHTML = `<thead><tr><th>Electrode</th><th>|Z<sub>e</sub>| at 10 Hz</th><th>Signal kept</th><th>Noise added</th><th>Signal / added noise</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    sGap.el.title = `gap capacitance ${fmt(gapCapacitance(sArea.value * (1 - sContact.value / 100), sGap.value * 1e-3, 1) * 1e12, 3)} pF`;
  }
  [sArea, sGap, sContact, sRin, sCin, sCm, sIn].forEach((s) => s.onChange(update));
  update();
}
