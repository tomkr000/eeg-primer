import { cabs, contactImpedance, gapCapacitance, gapElectrodeImpedance, inputImpedance, type InterfaceParams, type Complex } from '../physics/electrode';
import { applyTransfer } from '../physics/fft';
import { synthesize } from '../physics/noise';
import { mulberry32 } from '../physics/population';
import { controls, slider, fmt, fmtSI } from '../ui/slider';
import { stripPlot, type Strip } from '../ui/strips';
import { claimCite as c } from '../data/params';
import { section, figure, prose, assumptions, vizTitle } from '../ui/layout';
import { RAW_DEFAULTS, ALPHA_N, alphaUv, sourceSliders } from './s07-noise';

/** Reference interface values per cm² (claims 'chi-table' and 'abrasion'). */
const IFACE: Record<string, InterfaceParams> = {
  abraded: { RpA: 7.5e3, CpA: 25e-9, RsA: 200 },
  wet: { RpA: 350e3, CpA: 25e-9, RsA: 200 },
  dry: { RpA: 1.3e6, CpA: 12e-9, RsA: 200 },
};
type Kind = 'abraded' | 'wet' | 'dry' | 'gap';
const KINDS: Kind[] = ['abraded', 'wet', 'dry', 'gap'];
const NAMES: Record<Kind, string> = { abraded: 'Wet gel, abraded skin', wet: 'Wet gel, unprepared skin', dry: 'Dry metal plate', gap: 'Dry plate over hair (gap)' };
const COLORS: Record<Kind, string> = { abraded: '#1baf7a', wet: '#2a78d6', dry: '#eb6834', gap: '#6250d6' };
const SUBS: Record<Kind, string> = { abraded: 'skin prepared for lower impedance', wet: 'gel on intact skin', dry: 'direct skin contact (Consumer grade)', gap: 'no direct skin contact' };

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
  const sec = section(root, 'electrodes', '8', 'Electrode contact affects signal loss and added noise', 'Compare gel, dry contact (the most common), and a plate separated from the scalp by hair');
  prose(sec.text, `
<p>Research EEG usually records with a small silver/silver-chloride (Ag/AgCl) disc held in conductive gel on
skin that has been lightly scraped ${c('haired-scalp-wet')}. Scraping lowers the contact
resistance to 5 to 10 kΩ and makes the contact quieter ${c('abrasion')}. In one study, abraded sites needed about
12 trials to detect a brain response, while unprepared sites needed about 35 ${c('kappenman')}. Preparing each
site takes time, and the gel slowly dries. In one study its impedance rose from 5 to 15 kΩ over 5 hours
${c('dry-vs-wet-time')}.</p>
<p>Skipping the scraping makes the gel electrode faster to apply and gentler on the skin, and it loses almost no
signal. Impedance rises to around 40 kΩ without abrasions. Modern amplifiers have input impedances of about 200 MΩ, so raising
the contact impedance from below 10 kΩ to 40 kΩ drives little change in signal amplitude ${c('ferree')} but does increase noise, particularly at low frequencies ${c('kappenman')}.</p>
<p>Most consumer headsets use dry metal electrodes, which need no gel and go on in seconds
${c('consumer-electrodes')}. A flat dry plate works on the forehead where there is no dense hair. Over hairy
scalp, dry electrodes use pins or combs to reach the skin with impedances ranging from 10's of
kilohms up to 600 kΩ ${c('contact-area-hair')}. A dry contact does not dry out, and its impedance can fall
toward that of a wet electrode within minutes if sweat builds up ${c('dry-vs-wet-time')}. Its impedance is still
much higher (~1.3 MΩ for a plate on the forearm ${c('chi-table')}), so it suffers greater noise
${c('electrode-noise-levels')} and larger motion artifacts ${c('fingered')}. Shielded dry electrodes do pick up
less interference from nearby electric fields than wet ones ${c('searle')}.</p>
<p>A flat plate that rests on hair never touches the skin. The hair and air between them act as a capacitor, and
a wider gap gives less capacitance and more impedance ${c('hair-permittivity')}${c('electrode-model-settings')}.
The amplifier's own input capacitance then reduces the voltage further, so raising the input resistance alone
does not recover the signal ${c('noncontact-cap')}. For this reason a 2010 review judged wet electrodes still
necessary for research EEG over hairy scalp ${c('haired-scalp-wet')}. Wet electrodes remain the usual reference for
demanding recordings, while dry electrodes with pins that reach the scalp have since matched wet electrodes in some
comparisons ${c('dry-through-hair')}. How well any of them works depends on the contact, the amplifier and the task.</p>`);

  const { sN, sF } = sourceSliders(ALPHA_N, 0.13); // the same source model as sections 2 to 7, a little more in step so the rhythm stands out
  const sArea = slider({ label: 'Electrode area', unit: 'cm²', min: 0.1, max: 3, value: 0.1, log: true, note: c('area-scaling') + c('contact-area-hair'), marks: [{ value: 0.1, label: 'In hair' }, { value: 1, label: 'Forehead or gel' }] });
  const sGap = slider({ label: 'Hair / air gap thickness', unit: 'mm', min: 0.05, max: 2, value: 0.06, log: true, note: c('hair'), marks: [{ value: 0.06, label: 'One hair' }, { value: 0.5, label: 'Many hairs' }] });
  const sRin = slider({ label: 'Amplifier input resistance', min: 1e7, max: 5e13, value: 1e9, log: true, format: (v) => fmtSI(v, 'Ω', 2), note: c('ads1299') + c('electrode-model-settings'), marks: [{ value: 1e9, label: 'Typical' }, { value: 5e13, label: 'Research amp' }] });
  const BLINK_S = 0.4; // one eye blink in the two-second window (section 7's size and width)
  const C_IN_PF = 20, V_CM_MV = RAW_DEFAULTS.mainsUvcm / 1e3, I_NOISE_FA = 1; // fixed amplifier and mains values (assumptions table)

  const fig = figure(sec.fig, `Top: the shared input from section 7, which holds the alpha rhythm, artifacts and baseline recording noise. Each lower trace passes that input through one contact circuit and adds that contact's extra noise ${c('electrode-model-settings')}. Each trace has its own vertical scale, so compare the printed amplitudes and the table, which gives impedance and the share of voltage kept at 10 Hz. Added noise leaves out the noise inherited from the input. The signal-to-noise ratio (SNR), in decibels (dB), compares alpha power with everything else in the output ${c('electrode-model-settings')}.`, { panelWidth: '410px' });
  fig.viz.append(vizTitle('Signal at the amplifier for four electrode–skin interfaces'));
  const plot = stripPlot(fig.viz, { xLabel: 'Time (s)', xDomain: [0, 2], stripHeight: 82 });
  const table = document.createElement('table');
  table.className = 'mini-table';
  fig.panel.append(controls(sN.el, sF.el, sArea.el, sGap.el, sRin.el), table);
  assumptions(fig.el, [
    { what: 'Scope of the contact circuits', value: 'Forearm circuit fits serve as references for a chosen 1 cm² scalp contact. The source omits electrode area and skin preparation.', cite: c('chi-table') + c('electrode-model-settings') },
    { what: 'Wet gel on abraded skin', value: 'Chosen at 1 cm²: 7.5 kΩ in parallel with 25 nF. Reported abraded-skin resistance is 5–10 kΩ.', cite: c('electrode-model-settings') + c('abrasion') },
    { what: 'Wet gel on intact skin', value: 'Forearm fit: 350 kΩ in parallel with 25 nF. Used here as an intact-scalp approximation.', cite: c('chi-table') + c('electrode-model-settings') },
    { what: 'Dry plate touching skin', value: '1.3 MΩ in parallel with 12 nF, from the forearm fit.', cite: c('chi-table') },
    { what: 'Series resistance', value: 'Each reference circuit adds a chosen 200 Ω in series.', cite: c('electrode-model-settings') },
    { what: 'Area scaling', value: 'Chosen scaling: resistance follows 1/A and capacitance follows A, where A is contact area in cm².', cite: c('electrode-model-settings') + c('area-scaling') },
    { what: 'Electrode area marks', value: 'Illustrative marks: 0.1 cm² for “In hair,” 1 cm² for “Forehead or gel.” Actual contact depends on design, hair and pressure.', cite: c('electrode-model-settings') + c('contact-area-hair') },
    { what: 'Gap coupling', value: 'No direct skin contact. Gap capacitance C = ε₀A/d sits in series with dry skin. A is plate area in m², d is gap thickness in m, and ε₀ is air’s approximate permittivity.', cite: c('electrode-model-settings') + c('hair-permittivity') },
    { what: 'Hair gap marks', value: 'Chosen marks: 0.06 mm at “One hair” and 0.5 mm at “Many hairs.” These illustrate separation, not measured gaps beneath electrodes.', cite: c('electrode-model-settings') + c('hair') },
    { what: 'Source starting point', value: 'The section 7 source has a chosen 13% of cells in step to make the rhythm visible.', cite: c('alpha-source-chain') + c('electrode-model-settings') },
    { what: 'Shared input trace', value: 'Two seconds of section 7’s model, including baseline skin noise (3 µV rms) and amplifier voltage noise (1 µV rms).', cite: c('electrode-model-settings') },
    { what: 'Added contact noise', value: `Chosen at 1 cm²: prepared gel ${SKIN_NOISE.abraded} µV rms; intact-skin gel ${SKIN_NOISE.wet} µV rms; dry plate ${SKIN_NOISE.dry} µV rms; plate over hair ${SKIN_NOISE.gap} µV rms. Noise grows at low frequencies (1/f) and scales as 1/√area. Dry values are extrapolated.`, cite: c('electrode-noise-levels') },
    { what: 'Amplifier input', value: `The selected resistance is in parallel with a chosen ${C_IN_PF} pF. Resistance marks reference different devices: ADS1299 (1 GΩ) and a research amplifier (50 TΩ).`, cite: c('ads1299') + c('noncontact-cap') + c('electrode-model-settings') },
    { what: 'Added amplifier current noise', value: `Chosen current noise: ${I_NOISE_FA} fA/√Hz. Flow through contact impedance adds voltage noise, beyond the shared baseline.`, cite: c('amp-current-noise') + c('electrode-model-settings') },
    { what: 'Muscle activity', value: `The shared input includes ${RAW_DEFAULTS.emgUvRms} µV rms of muscle activity.`, cite: c('emg-level') + c('electrode-model-settings') },
    { what: 'Eye blink', value: `One chosen blink at ${BLINK_S} s: ${RAW_DEFAULTS.blinkUv} µV peak, about 190 ms wide at half height. The width convention is a model choice.`, cite: c('electrode-model-settings') + c('blink-amplitude') + c('blink-width') },
    { what: 'Mains pickup', value: `Chosen shared body voltage: ${V_CM_MV} mV peak at 60 Hz. The second contact has 1.5 times the first’s impedance, converting shared voltage into a measured difference. Peak amplitude is a model setting.`, cite: c('electrode-model-settings') + c('common-mode') + c('potential-divider') },
    { what: 'Mains calculation', value: 'Added amplitude = V<sub>cm</sub> × |H(Z<sub>e</sub>) − H(1.5 Z<sub>e</sub>)|, with H(Z<sub>e</sub>) = Z<sub>in</sub>/(Z<sub>in</sub> + Z<sub>e</sub>). H is the voltage fraction transmitted by each contact at 60 Hz.', cite: c('electrode-model-settings') + c('potential-divider') },
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
    strips.push({ name: 'Shared input: alpha + artifacts', sub: 'includes section 7 recording noise', icon: HEAD_ICON, points: Array.from(raw.total, (v, i) => [t[i], v] as [number, number]), color: '#898781', note: `${fmt(alpha, 3)} µV alpha + artifacts + recording noise` });
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
      strips.push({ name: NAMES[k], sub: SUBS[k], icon: ICONS[k], highlight: k === 'dry', points: Array.from(out, (v, i) => [t[i], v] as [number, number]), color: COLORS[k], note: `keeps ${fmt(100 * h10, 3)}% of the signal, adds ${fmt(Math.sqrt(pAdded / n), 2)} µV of noise` });
      rows.push(`<tr><td><i style="background:${COLORS[k]}"></i>${NAMES[k]}</td><td>${fmtSI(cabs(Ze(k, 10)), 'Ω', 2)}</td><td>${fmt(100 * h10, 3)}%</td><td>${fmt(Math.sqrt(pAdded / n), 2)} µV</td><td>${fmt(snr, 2)} dB</td></tr>`);
    });
    plot.update(strips, [{ t: BLINK_S, label: 'eye blink, not muscle' }]);
    table.innerHTML = `<thead><tr><th>Electrode</th><th>|Z<sub>e</sub>|</th><th>Kept</th><th>Adds</th><th>SNR</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    sGap.el.title = `gap capacitance ${fmt(gapCapacitance(sArea.value, sGap.value * 1e-3, 1) * 1e12, 3)} pF`;
  }
  [sN, sF, sArea, sGap, sRin].forEach((s) => s.onChange(update));
  update();
}
