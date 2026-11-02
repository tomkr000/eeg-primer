import { exteriorPotential, potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt, choice } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { glow, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { netDipole } from '../physics/population';
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
<p>The figure takes the patch of section 2, N cells with a fraction firing in step, and places it at an
adjustable depth in the classical concentric-sphere head, solved exactly ${c('sphere-model')} with measured
thicknesses ${c('thickness-skull')}${c('thickness-scalp')}${c('thickness-csf')}${c('thickness-dura')}. The
default patch, 100,000 cells with a tenth in step, is a 5 nA·m source and gives a few microvolts at the
scalp, tens of times less than at the cortical surface for a focal source ${c('ecog-vs-eeg')}, consistent
with scalp EEG at tens of microvolts ${c('eeg-amplitude')}; 10 nA·m, a typical measured source, takes
10,000 to 50,000 cells in step ${c('cells-for-10nam')}. Nothing special happens at the skin: the potential continues into the
air, halving about a centimetre above it ${c('exterior-potential')}, which is what an electrode held off
the scalp has to work with (section 5).</p>`);

  const sDepth = slider({ label: 'Source depth', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5 });
  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: 1e7, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3) });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add') });
  const TH_UV = 1; // dark contour: the noise floor of a good scalp electrode (section 4)
  const sCsf = slider({ label: 'CSF thickness', unit: 'mm', min: 0, max: 5, value: P.thicknessCsfMm, step: 0.1, note: c('thickness-csf') });
  const sSkull = slider({ label: 'Skull thickness', unit: 'mm', min: 3, max: 10, value: P.thicknessSkullMm, step: 0.5, note: c('thickness-skull') });
  const sSigSkull = slider({ label: 'Skull conductivity', unit: 'S/m', min: 0.003, max: 0.08, value: P.sigmaSkull, log: true, note: c('sigma-skull') });
  let orientation: 'radial' | 'tangential' = 'radial';
  const orient = choice('Orientation', [{ value: 'radial', label: 'Radial' }, { value: 'tangential', label: 'Tangential' }], 'radial', (v) => { orientation = v; update(); });
  const rSource = readout('Source: the patch of section 2', c('single-cell-moment') + c('cells-for-10nam'));
  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout('Scalp half-width of the pattern');

  const fig = figure(sec.fig, 'Left: the top of the head in cross-section; red positive, blue negative, fading with the logarithm of the potential; the dark line is where the potential falls to 1 µV, the noise floor of a good electrode. The arcs, inside to out, bound grey matter, cerebrospinal fluid (CSF), dura, skull and scalp; the field continues into the air above the scalp, where a non-contact electrode would sense it. Right: the potential along the source axis out through the layers. The source is the patch of section 2 at the chosen depth; radial means on a gyral crown, tangential on a sulcal wall; grid numbers are centimetres from the head centre.', { panelWidth: '400px' });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = '0 0 390px';
  row.append(left, right);
  fig.viz.append(row);
  const AIR = 0.02; // metres of air drawn above the scalp
  const hm = glow(left, { width: 390, height: 300, scale: 2, xRange: [-0.06, 0.06], yRange: [0.02, 0.02 + 0.12 * 300 / 390], floor: 1e-7, ceiling: 1e-4, threshold: 1e-6, grid: { step: 0.02, factor: 100, unit: 'cm' } });
  glowLegend(left, '0.1 µV', '100 µV', 'dark line = 1 µV, the noise floor of a good electrode');
  const radial = linePlot(right, {
    x: { label: 'Distance along the source axis (mm)' },
    y: { label: 'Potential (µV)', scale: 'log', domain: [1, 1e4] },
    height: 300,
  });
  fig.panel.append(
    controls(sN.el, sF.el, sDepth.el, orient.el),
    controls(sCsf.el, sSkull.el, sSigSkull.el),
  );
  fig.viz.append(readouts(rSource.el, rScalp.el, rCortex.el, rRatio.el, rWidth.el));
  assumptions(fig.el, [
    { what: 'Head geometry', value: 'concentric spheres, brain radius 8.0 cm; layer thicknesses from the sliders', cite: c('brain-radius') + c('sphere-model') },
    { what: 'Grey matter', value: `${P.sigmaGray} S/m (classical value; meta-analysis 0.38–0.47 S/m)`, cite: c('sigma-gray') },
    { what: 'CSF', value: `${P.sigmaCsf} S/m; thickness from the slider`, cite: c('sigma-csf') + c('thickness-csf') },
    { what: 'Dura', value: `${P.thicknessDuraMm} mm, ${P.sigmaDura} S/m`, cite: c('thickness-dura') + c('sigma-dura') },
    { what: 'Scalp', value: `${P.thicknessScalpMm} mm, ${P.sigmaScalp} S/m`, cite: c('thickness-scalp') + c('sigma-scalp') },
    { what: 'Detection floor', value: `${TH_UV} µV, the lower end of measured electrode noise`, cite: c('skin-noise') },
    { what: 'Source', value: `the patch of section 2 as one current dipole at the chosen depth: N × fraction in step × ${P.singleCellMomentPAm} pA·m per cell, plus the √N random-walk part; a real source is a sheet, not a point`, cite: c('single-cell-moment') + c('variances-add') + c('cells-for-10nam') },
    { what: 'Solution', value: 'Legendre series per degree with continuity of potential and radial current at each interface, 600 terms', cite: c('sphere-model') },
  ]);

  function build(): { shells: Shell[]; b: number } {
    const shells = stackShells(P.brainRadiusM, [
      { name: 'CSF', thickness: sCsf.value * 1e-3, sigma: P.sigmaCsf },
      { name: 'dura', thickness: P.thicknessDuraMm * 1e-3, sigma: P.sigmaDura },
      { name: 'skull', thickness: sSkull.value * 1e-3, sigma: sSigSkull.value },
      { name: 'scalp', thickness: P.thicknessScalpMm * 1e-3, sigma: P.sigmaScalp },
    ], P.sigmaGray);
    return { shells, b: P.brainRadiusM - sDepth.value * 1e-3 };
  }

  function update() {
    const { shells, b } = build();
    const p = netDipole(Math.round(sN.value), sF.value, 1, P.singleCellMomentPAm * 1e-12).total; // A·m
    rSource.set(`${fmt(p * 1e9, 3)} nA·m`);
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
    radial.update([{ name: 'Potential along the axis', points: prof, color: '#2a78d6', width: 2.5 }], [{ axis: 'y', value: TH_UV, label: '1 µV floor' }], bands);
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
    hm.setThreshold(TH_UV * 1e-6);
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
  [sN, sF, sDepth, sCsf, sSkull, sSigSkull].forEach((s) => s.onChange(update));
  update();
}
