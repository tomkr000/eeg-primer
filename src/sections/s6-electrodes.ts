import { cabs, contactImpedance, gapCapacitance, gapElectrodeImpedance, inputImpedance, type InterfaceParams, type Complex } from '../physics/electrode';
import { applyTransfer } from '../physics/fft';
import { synthesize } from '../physics/noise';
import { mulberry32 } from '../physics/population';
import { controls, slider, fmt, fmtSI } from '../ui/slider';
import { stripPlot, type Strip } from '../ui/strips';
import { claimCite as c } from '../data/params';
import { section, figure, prose, assumptions, vizTitle } from '../ui/layout';
import { RAW_DEFAULTS, alphaUv, sourceSliders } from './s5-noise';

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
const SUBS: Record<Kind, string> = { abraded: 'Yes, literally abraded skin', wet: 'the clinical standard', dry: 'most common: consumer headsets', gap: 'a plate resting on hair' };

/** Small schematic icons (44 × 44): skin at the bottom, the electrode above it. */
const skin = (scratched = false) => `<rect x="2" y="32" width="40" height="10" fill="#f0c9a6" stroke="#1a1a1a" stroke-width="1"/>${scratched ? '<path d="M8,32 l3,3 M15,32 l3,3 M22,32 l3,3 M29,32 l3,3 M36,32 l3,3" stroke="#b5542a" stroke-width="1.2"/>' : '<rect x="2" y="32" width="40" height="2.5" fill="#d9b48f"/>'}`;
const cup = (y: number) => `<path d="M11,${y} h22 v8 q0,6 -6,6 h-10 q-6,0 -6,-6 z" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1.2"/><rect x="20" y="${y - 7}" width="4" height="7" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1"/>`;
const ICONS: Record<Kind, string> = {
  abraded: `${skin(true)}${cup(12)}<path d="M14,24 q8,9 16,0 v8 h-16 z" fill="#2a78d6" opacity="0.75"/>`,
  wet: `${skin(false)}${cup(12)}<path d="M14,24 q8,9 16,0 v8 h-16 z" fill="#2a78d6" opacity="0.75"/>`,
  dry: `${skin(false)}<rect x="9" y="25" width="26" height="7" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1.2"/><rect x="20" y="18" width="4" height="7" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1"/>`,
  gap: `${skin(false)}<path d="M7,32 l1,-11 M13,32 l-1,-12 M19,32 l1,-11 M25,32 l-1,-12 M31,32 l1,-11 M37,32 l-1,-12" stroke="#52514e" stroke-width="1.2"/><rect x="9" y="12" width="26" height="7" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1.2"/><rect x="20" y="5" width="4" height="7" fill="#c3c2b7" stroke="#1a1a1a" stroke-width="1"/>`,
};
/** The head of section 3 in miniature, with an arrow at the scalp. */
const HEAD_ICON = `<path d="M4,40 A20,20 0 0 1 40,40" fill="#fde1df" stroke="#1a1a1a" stroke-width="1.2"/><path d="M8,40 A16,16 0 0 1 36,40" fill="#e8e7e1" stroke="#898781" stroke-width="1"/><path d="M12,40 A12,12 0 0 1 32,40" fill="#dbe8f7" stroke="#898781" stroke-width="1"/><circle cx="22" cy="31" r="2" fill="#1a1a1a"/><path d="M22,4 L22,17" stroke="#d03b3b" stroke-width="2"/><path d="M18,13 L22,19 L26,13 z" fill="#d03b3b"/>`;
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
  const sec = section(root, 'electrodes', '6', 'Different electrode types result in different signals', 'Most electrodes are the Dry Metal Plate below, wet gel will be difficult for consumers');
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

  const { sN, sF } = sourceSliders(); // the same source model as sections 2 to 5
  const sArea = slider({ label: 'Electrode area', unit: 'cm²', min: 0.1, max: 3, value: 1, log: true, note: c('area-scaling'), marks: [{ value: 1, label: 'Typical' }] });
  const sGap = slider({ label: 'Hair / air gap thickness', unit: 'mm', min: 0.05, max: 2, value: 0.5, log: true, note: c('hair'), marks: [{ value: 0.06, label: 'One hair' }, { value: 0.5, label: 'Assumed' }] });
  const sRin = slider({ label: 'Amplifier input resistance', min: 1e7, max: 5e13, value: 1e9, log: true, format: (v) => fmtSI(v, 'Ω', 2), note: c('ads1299'), marks: [{ value: 1e9, label: 'Typical' }, { value: 5e13, label: 'Research amp' }] });
  const BLINK_S = 0.4; // one eye blink in the two-second window (section 5's size and width)
  const C_IN_PF = 20, V_CM_MV = RAW_DEFAULTS.mainsUvcm / 1e3, I_NOISE_FA = 1; // fixed amplifier and mains values (assumptions table)

  const fig = figure(sec.fig, `Top strip: the scalp signal before any electrode touches it: the alpha rhythm of N cells with a fraction in step (sections 2 to 5) in the noise of section 5, including its muscle (EMG) noise and one eye blink, over two seconds. Below it, what reaches the amplifier through each electrode: the signal after the impedance divider, plus the contact’s skin noise, mains pickup from a 50% impedance mismatch between a pair, and the amplifier’s current noise through the contact impedance. The table gives the impedance at 10 Hz, the signal kept, the noise added, and the signal-to-noise ratio (SNR) of the alpha rhythm against everything else. Most consumer headsets use dry contacts ${c('consumer-electrodes')}.`, { panelWidth: '410px' });
  fig.viz.append(vizTitle('Signal at the amplifier input for four electrode–skin interfaces'));
  const plot = stripPlot(fig.viz, { xLabel: 'Time (s)', xDomain: [0, 2], stripHeight: 82 });
  const table = document.createElement('table');
  table.className = 'mini-table';
  fig.panel.append(controls(sN.el, sF.el, sArea.el, sGap.el, sRin.el), table);
  assumptions(fig.el, [
    { what: 'Wet gel on abraded skin', value: '7.5 kΩ·cm² ∥ 25 nF/cm² + 200 Ω·cm² series', cite: c('abrasion') },
    { what: 'Wet gel, unprepared / dry plate', value: '350 kΩ ∥ 25 nF and 1.3 MΩ ∥ 12 nF per cm²', cite: c('chi-table') },
    { what: 'Gap coupling', value: 'C = ε₀ε<sub>r</sub>A/d (air, ε<sub>r</sub> = 1) in series with dry skin; a flat plate resting on hair touches none of the skin (fingered electrodes that reach through hair behave like the dry plate above)', cite: c('hair-permittivity') + c('fingered') },
    { what: 'Area scaling', value: 'R ∝ 1/A, C ∝ A relative to 1 cm²', cite: c('area-scaling') },
    { what: 'Hair gap default', value: '0.5 mm, a modelling choice of several hair diameters (one hair is about 0.06 mm); one hair is marked on the slider', cite: c('hair') },
    { what: 'Amplifier input resistance marks', value: '1 GΩ as the ADS1299 front end; 50 TΩ as a research non-contact amplifier', cite: c('ads1299') + c('noncontact-cap') },
    { what: 'Skin noise by contact type', value: `${SKIN_NOISE.abraded} / ${SKIN_NOISE.wet} / ${SKIN_NOISE.dry} / ${SKIN_NOISE.gap} µV rms (abraded / wet / dry / gap), 1/f spectrum, scaled by 1/√area`, cite: c('electrode-noise-levels') },
    { what: 'Amplifier', value: `R<sub>in</sub> from the slider in parallel with ${C_IN_PF} pF; 1 µV rms voltage noise; ${I_NOISE_FA} fA/√Hz current noise`, cite: c('ads1299') + c('amp-current-noise') },
    { what: 'Muscle (EMG) and eye blink', value: `in the scalp signal before any electrode: ${RAW_DEFAULTS.emgUvRms} µV rms of muscle noise in 20–300 Hz, and one blink at ${BLINK_S} s, a ${RAW_DEFAULTS.blinkUv} µV deflection 160 ms wide (section 5); both are potentials at the scalp, so each electrode passes them like the neural signal`, cite: c('emg-level') + c('blink-amplitude') + c('blink-rate') },
    { what: 'Mains pickup', value: `${V_CM_MV} mV of common-mode mains on the body (section 5); the two contacts of a pair differ by 50% in impedance, so it leaks in as V<sub>cm</sub> × |H(Z<sub>e</sub>) − H(1.5 Z<sub>e</sub>)| at 60 Hz, with H = Z<sub>in</sub>/(Z<sub>in</sub> + Z<sub>e</sub>)`, cite: c('common-mode') },
  ]);

  function Ze(k: Kind, f: number): Complex {
    if (k === 'gap') return gapElectrodeImpedance(IFACE.dry, sArea.value, { contactFraction: 0, gapM: sGap.value * 1e-3, epsr: 1 }, f);
    return contactImpedance(IFACE[k], sArea.value, f);
  }

  function update() {
    const alpha = alphaUv(sN.value, sF.value);
    const raw = synthesize({ ...RAW_DEFAULTS, seconds: 2, seed: 11, blinkAtS: [BLINK_S], signalUv: alpha }); // two seconds with one eye blink
    const n = raw.total.length;
    const Zin = (f: number) => inputImpedance(sRin.value, C_IN_PF * 1e-12, f);
    const strips: Strip[] = [];
    const t = raw.t;
    strips.push({ name: 'Ground truth neural signal at scalp', sub: 'before any electrode touches it', icon: HEAD_ICON, points: Array.from(raw.total, (v, i) => [t[i], v] as [number, number]), color: '#898781', note: `${fmt(alpha, 3)} µV alpha + muscle (EMG), blink, mains, skin` });
    const rows: string[] = [];
    KINDS.forEach((k, idx) => {
      // divider as a frequency response
      const H = (f: number): Complex => {
        const ze = Ze(k, f), zin = Zin(f);
        const den = { re: zin.re + ze.re, im: zin.im + ze.im };
        const d = den.re * den.re + den.im * den.im;
        return { re: (zin.re * den.re + zin.im * den.im) / d, im: (zin.im * den.re - zin.re * den.im) / d };
      };
      const sig = applyTransfer(raw.total, RAW_DEFAULTS.fs, H), alphaOut = applyTransfer(raw.signal, RAW_DEFAULTS.fs, H); // everything, and the alpha alone
      const skin = pink(n, SKIN_NOISE[k] / Math.sqrt(sArea.value), 20 + idx);
      // amplifier current noise i_n (A/√Hz) flowing through |Ze(f)|: white current, shaped by the impedance
      const iWhite = new Float64Array(n);
      const rng = mulberry32(40 + idx);
      for (let i = 0; i < n; i++) { const u = Math.max(rng(), 1e-12), v = rng(); iWhite[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
      const inA = I_NOISE_FA * 1e-15 * Math.sqrt(RAW_DEFAULTS.fs / 2); // per-sample white noise with density i_n
      const curr = applyTransfer(iWhite, RAW_DEFAULTS.fs, (f) => { const z = Ze(k, f); return { re: z.re * inA * 1e6, im: z.im * inA * 1e6 }; }); // µV
      // mains pickup: the two electrodes of the pair differ by 50% in impedance, so the common-mode voltage
      // reaches the amplifier as Vcm × |Zin/(Zin+Ze) − Zin/(Zin+1.5·Ze)| at 60 Hz (bounded, unlike ΔZ/Zin)
      const ze60 = Ze(k, 60), zin60 = Zin(60);
      const div = (ze: Complex): Complex => { const den = { re: zin60.re + ze.re, im: zin60.im + ze.im }; const d = den.re * den.re + den.im * den.im; return { re: (zin60.re * den.re + zin60.im * den.im) / d, im: (zin60.im * den.re - zin60.re * den.im) / d }; };
      const h1 = div(ze60), h2 = div({ re: 1.5 * ze60.re, im: 1.5 * ze60.im });
      const mains = V_CM_MV * 1e3 * cabs({ re: h1.re - h2.re, im: h1.im - h2.im });
      const out = new Float64Array(n);
      let ps = 0, pn = 0, pAdded = 0; // alpha power, power of everything else, power the electrode added
      for (let i = 0; i < n; i++) {
        const noise = skin[i] + curr[i] + mains * Math.sin(2 * Math.PI * 60 * t[i] + 0.3);
        out[i] = sig[i] + noise;
        const rest = out[i] - alphaOut[i];
        ps += alphaOut[i] * alphaOut[i]; pn += rest * rest; pAdded += noise * noise;
      }
      const h10 = cabs(H(10));
      const snr = 10 * Math.log10(ps / Math.max(pn, 1e-30));
      strips.push({ name: NAMES[k], sub: SUBS[k], icon: ICONS[k], highlight: k === 'dry', points: Array.from(out, (v, i) => [t[i], v] as [number, number]), color: COLOURS[k], note: `keeps ${fmt(100 * h10, 3)}% of the signal, adds ${fmt(Math.sqrt(pAdded / n), 2)} µV of noise` });
      rows.push(`<tr><td><i style="background:${COLOURS[k]}"></i>${NAMES[k]}</td><td>${fmtSI(cabs(Ze(k, 10)), 'Ω', 2)}</td><td>${fmt(100 * h10, 3)}%</td><td>${fmt(Math.sqrt(pAdded / n), 2)} µV</td><td>${fmt(snr, 2)} dB</td></tr>`);
    });
    plot.update(strips, [{ t: BLINK_S, label: 'eye blink' }]);
    table.innerHTML = `<thead><tr><th>Electrode</th><th>|Z<sub>e</sub>|</th><th>Kept</th><th>Adds</th><th>SNR</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    sGap.el.title = `gap capacitance ${fmt(gapCapacitance(sArea.value, sGap.value * 1e-3, 1) * 1e12, 3)} pF`;
  }
  [sN, sF, sArea, sGap, sRin].forEach((s) => s.onChange(update));
  update();
}
