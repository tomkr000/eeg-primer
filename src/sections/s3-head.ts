import { exteriorPotential, potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt, choice } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { glow, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';

export function mountHead(root: HTMLElement) {
  const sec = section(root, 'head', '3', 'Out through cerebrospinal fluid, dura, skull and scalp');
  prose(sec.text, `
<p>Between a cortical source and a scalp electrode lie grey matter, a film of cerebrospinal fluid (CSF),
the dura, the skull and the scalp, each with its own conductivity ${c('mccann-meta')}. CSF is the best
conductor in the head (≈${P.sigmaCsf} S/m ${c('sigma-csf')}); the skull is by far the worst, around
${P.sigmaSkull} S/m, some 15 to 80 times lower than brain depending on the measurement
${c('sigma-skull')}${c('skull-brain-ratio')}. Scalp conducts about as well as brain ${c('sigma-scalp')}.</p>
<p>Two things happen on the way out. The CSF offers an easy sideways path, so much of the return current is
shunted along it before reaching the skull ${c('csf-shunt')}. The skull then resists the rest, so the
current that does cross spreads tangentially first and emerges over a wide area. The scalp potential is a
blurred, weakened image of the cortical one: features finer than a few centimetres are lost
${c('spatial-lowpass')}.</p>
<p>The figure solves the classical concentric-sphere head exactly ${c('sphere-model')}, with measured
thicknesses ${c('thickness-skull')}${c('thickness-scalp')}${c('thickness-csf')}${c('thickness-dura')} and a
dipole at an adjustable depth. A 10 nA·m source gives a few microvolts at the scalp, tens of times less
than at the cortical surface for a focal source ${c('ecog-vs-eeg')}, consistent with scalp EEG at tens of
microvolts ${c('eeg-amplitude')}. Nothing special happens at the skin: the potential continues into the
air, halving about a centimetre above it ${c('exterior-potential')}, which is what an electrode held off
the scalp has to work with (section 5).</p>`);

  const sDepth = slider({ label: 'Source depth', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5 });
  const sMoment = slider({ label: 'Source moment', unit: 'nA·m', min: 1, max: 500, value: 10, log: true, note: c('cells-for-10nam') });
  const sTh = slider({ label: 'Threshold (dark line)', unit: 'µV', min: 0.1, max: 100, value: 1, log: true });
  const sCsf = slider({ label: 'CSF thickness', unit: 'mm', min: 0, max: 5, value: P.thicknessCsfMm, step: 0.1, note: c('thickness-csf') });
  const sDura = slider({ label: 'Dura thickness', unit: 'mm', min: 0, max: 2, value: P.thicknessDuraMm, step: 0.05, note: c('thickness-dura') });
  const sSkull = slider({ label: 'Skull thickness', unit: 'mm', min: 1, max: 12, value: P.thicknessSkullMm, step: 0.5, note: c('thickness-skull') });
  const sScalp = slider({ label: 'Scalp thickness', unit: 'mm', min: 1, max: 10, value: P.thicknessScalpMm, step: 0.5, note: c('thickness-scalp') });
  const sSigSkull = slider({ label: 'Skull conductivity', unit: 'S/m', min: 0.002, max: 0.1, value: P.sigmaSkull, log: true, note: c('sigma-skull') });
  const sSigCsf = slider({ label: 'CSF conductivity', unit: 'S/m', min: 0.3, max: 2.5, value: P.sigmaCsf, step: 0.01, note: c('sigma-csf') });
  const sSigDura = slider({ label: 'Dura conductivity', unit: 'S/m', min: 0.01, max: 1, value: P.sigmaDura, log: true, note: c('sigma-dura') });
  let orientation: 'radial' | 'tangential' = 'radial';
  const orient = choice('Orientation', [{ value: 'radial', label: 'Radial' }, { value: 'tangential', label: 'Tangential' }], 'radial', (v) => { orientation = v; update(); });
  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout('Scalp half-width of the pattern');

  const fig = figure(sec.fig, 'Left: the top of the head in cross-section. Red is positive, blue negative, fading with the logarithm of the potential; the dark line is the threshold. The arcs, from the inside out, are the boundaries of grey matter, cerebrospinal fluid (CSF), dura, skull and scalp, and the field continues into the air above the scalp, where a non-contact electrode would sense it. Right: the potential along the line from the source straight out through the layers. Grid numbers are centimetres from the centre of the head; a radial source sits on a gyral crown, a tangential one on a sulcal wall.', { panelWidth: '400px' });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = '0 0 390px';
  row.append(left, right);
  fig.viz.append(row);
  const AIR = 0.02; // metres of air drawn above the scalp
  const hm = glow(left, { width: 390, height: 300, scale: 2, xRange: [-0.06, 0.06], yRange: [0.02, 0.02 + 0.12 * 300 / 390], floor: 1e-7, ceiling: 1e-4, threshold: 1e-6, grid: { step: 0.02, factor: 100, unit: 'cm' } });
  glowLegend(left, '0.1 µV', '100 µV', 'dark line = threshold');
  const radial = linePlot(right, {
    x: { label: 'Distance along the source axis (mm)' },
    y: { label: 'Potential (µV)', scale: 'log', domain: [1, 1e4] },
    height: 300,
  });
  fig.panel.append(
    controls(sDepth.el, sMoment.el, sTh.el, orient.el),
    controls(sCsf.el, sDura.el, sSkull.el, sScalp.el, sSigCsf.el, sSigDura.el, sSigSkull.el),
  );
  fig.viz.append(readouts(rScalp.el, rCortex.el, rRatio.el, rWidth.el));
  assumptions(fig.el, [
    { what: 'Head geometry', value: 'concentric spheres, brain radius 8.0 cm; layer thicknesses from the sliders', cite: c('brain-radius') + c('sphere-model') },
    { what: 'Grey matter', value: `${P.sigmaGray} S/m (classical value; meta-analysis 0.38–0.47 S/m)`, cite: c('sigma-gray') },
    { what: 'Scalp', value: `${P.sigmaScalp} S/m`, cite: c('sigma-scalp') },
    { what: 'Source', value: 'a single current dipole at the chosen depth; a real source is a sheet of many', cite: c('cells-for-10nam') },
    { what: 'Solution', value: 'Legendre series per degree with continuity of potential and radial current at each interface, 600 terms', cite: c('sphere-model') },
  ]);

  function build(): { shells: Shell[]; b: number } {
    const shells = stackShells(P.brainRadiusM, [
      { name: 'CSF', thickness: sCsf.value * 1e-3, sigma: sSigCsf.value },
      { name: 'dura', thickness: sDura.value * 1e-3, sigma: sSigDura.value },
      { name: 'skull', thickness: sSkull.value * 1e-3, sigma: sSigSkull.value },
      { name: 'scalp', thickness: sScalp.value * 1e-3, sigma: P.sigmaScalp },
    ], P.sigmaGray);
    return { shells, b: P.brainRadiusM - sDepth.value * 1e-3 };
  }

  function update() {
    const { shells, b } = build();
    const p = sMoment.value * 1e-9;
    const sol = solveShells(shells, b, p, orientation, 600);
    const solMap = solveShells(shells, b, p, orientation, 120);
    const R = shells[shells.length - 1].outerRadius;
    const rCortexSurf = P.brainRadiusM;
    // radial profile along the dipole axis
    const prof: [number, number][] = [];
    const thAxis = orientation === 'radial' ? 0 : 0.02;
    for (let k = 0; k <= 300; k++) {
      const r = b + ((R + AIR - b) * k) / 300;
      const v = r <= R ? potential(sol, Math.min(r, R - 1e-9), thAxis, 0) : exteriorPotential(sol, r, thAxis, 0);
      prof.push([(r - b) * 1e3, Math.abs(v) * 1e6]);
    }
    const layerColours = ['#2a78d6', '#1baf7a', '#eda100', '#898781', '#eb6834'];
    const bands = shells.map((sh, i) => ({ from: ((i === 0 ? b : shells[i - 1].outerRadius) - b) * 1e3, to: (sh.outerRadius - b) * 1e3, label: i === 0 ? 'grey matter' : sh.name, color: layerColours[i % layerColours.length] }));
    bands.push({ from: (R - b) * 1e3, to: (R + AIR - b) * 1e3, label: 'air', color: '#f4f1ea' });
    radial.update([{ name: 'Potential along the axis', points: prof, color: '#2a78d6', width: 2.5 }], [{ axis: 'y', value: sTh.value, label: 'threshold' }], bands);
    let peakScalp = 0, peakCortex = 0;
    for (let th = 0; th < Math.PI / 2; th += 0.005) {
      peakScalp = Math.max(peakScalp, Math.abs(surfacePotential(sol, th, 0)));
      peakCortex = Math.max(peakCortex, Math.abs(potential(sol, rCortexSurf - 1e-9, th)));
    }
    rScalp.set(`${fmt(peakScalp * 1e6, 3)} µV`);
    rCortex.set(`${fmt(peakCortex * 1e6, 3)} µV`);
    rRatio.set(`${fmt(peakCortex / peakScalp, 3)}×`);
    let hw = NaN;
    if (orientation === 'radial') for (let th = 0; th < Math.PI; th += 0.002) if (Math.abs(surfacePotential(sol, th)) < peakScalp / 2) { hw = th * R; break; }
    rWidth.set(isNaN(hw) ? 'n/a (off-axis)' : `${fmt(hw * 100, 3)} cm`);
    hm.setThreshold(sTh.value * 1e-6);
    hm.draw((x, y) => {
      const r = Math.hypot(x, y);
      const th = Math.atan2(Math.abs(x), y), ph = x < 0 ? Math.PI : 0;
      return r > R ? exteriorPotential(solMap, r, th, ph) : potential(solMap, r, th, ph);
    }, (ctx, toPx) => {
      ctx.save();
      ctx.lineWidth = 1;
      const [cx, cy] = toPx(0, 0);
      shells.forEach((s, i) => {
        const [rx] = toPx(s.outerRadius, 0);
        ctx.strokeStyle = i === shells.length - 1 ? 'rgba(26,26,26,0.9)' : 'rgba(26,26,26,0.55)';
        ctx.beginPath(); ctx.arc(cx, cy, rx - cx, Math.PI, 2 * Math.PI); ctx.stroke();
      });
      ctx.fillStyle = '#1a1a1a';
      ctx.font = CANVAS_FONT;
      const [ax, ay] = toPx(-0.052, R + 0.016);
      ctx.fillText('air', ax, ay);
      const [bx, by] = toPx(-0.052, 0.034);
      ctx.fillText('brain', bx, by);
      const [sx, sy] = toPx(0, b);
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillText('source', sx + 8, sy + 5);
      ctx.restore();
    });
  }
  [sDepth, sMoment, sTh, sCsf, sDura, sSkull, sScalp, sSigSkull, sSigCsf, sSigDura].forEach((s) => s.onChange(update));
  update();
}
