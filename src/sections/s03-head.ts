import { exteriorPotential, potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { verticalProfile } from '../ui/profile';
import { glow, glowLegend, CANVAS_FONT, drawCortexLayers } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { netDipole } from '../physics/population';
import { section, figure, prose, assumptions, readouts, sw, vizTitle } from '../ui/layout';

export function mountHead(root: HTMLElement) {
  const sec = section(root, 'head', '3', 'The head weakens and spreads cortical signals', 'Tissue layers change the voltage pattern before it reaches the scalp');
  prose(sec.text, `
<p>Current from the cortex passes through several tissues before reaching the scalp. These include
cerebrospinal fluid (CSF), the protective membrane called the dura, and the skull. Their conductivities
describe how easily current flows ${c('mccann-meta')}. CSF conducts well ${c('sigma-csf')}; the skull
conducts much less well than brain tissue ${c('sigma-skull')}${c('skull-brain-ratio')}.</p>
<p>CSF lets current spread sideways before it reaches the skull ${c('csf-shunt')}. The poorly conducting
skull further broadens and weakens the voltage pattern seen at the scalp. Fine spatial detail is strongly
reduced ${c('spatial-lowpass')}. Section 4 shows how nearby sources can then look alike.</p>
<p>The figure uses the cell-group model from section 2. The head is represented by spherical layers with a
shared center. The calculation solves that simplified geometry, rather than an individual person's head
${c('sphere-model')}. The readouts compare voltage at the cortex and scalp as you change source depth.</p>
<p>Voltage also extends into the air above the skin ${c('exterior-potential')}. That does not mean a plate
held away from the scalp records it well: the air gap forms a very weak electrical connection and noise dominates the signal.
Section 8 examines this gap and the amplifier needed to measure through it ${c('noncontact-cap')}.</p>`);

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3), marks: [{ value: P.patchDefaultN, label: 'Typical source' }] });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Theoretical<br>max' }] });
  const sDepth = slider({ label: 'Source depth below the cortical surface', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5, marks: [{ value: 2, label: 'Gyral crown' }, { value: 20, label: 'Deep in a sulcus' }] });
  const TH_UV = 1; // dark contour: the quietest electrode contact alone (section 7 adds the rest)
  const orientation = 'radial' as const;
  const rSource = readout('Net dipole moment of the patch', c('single-cell-moment') + c('cells-for-10nam'));
  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout(`Stretch of scalp above ${1} µV`);

  const fig = figure(sec.fig, `Left: the head's layers, drawn flat for a side view of the spherical model. The source points outward at the selected depth ${c('sphere-model')}. The glow shows voltage (${sw('#e34948', 'glow')} positive, ${sw('#2a78d6', 'glow')} negative) on a logarithmic scale. The ${sw('#1a1a1a', 'thick')} bar marks scalp voltage magnitude above 1 µV, the noise of an unusually quiet contact alone ${c('skin-noise')}. Other noise is excluded. Right: voltage along the line directly above the source, with height aligned to the left panel. Voltage continues into the air above the scalp, faded in the drawing and shown in the profile ${c('exterior-potential')}. Section 8 explains the difficulty of recording across an air gap.`, { panelWidth: '400px' });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = '0 0 390px';
  row.append(left, right);
  fig.viz.append(row);
  // picture coordinates: x along the scalp, y above the cortical surface (meters); the sphere is unrolled
  const xRange: [number, number] = [-0.04, 0.04];
  const yRange: [number, number] = [-0.033, -0.033 + 0.08 * 330 / 390];
  let scalpY = Infinity; // height of the scalp surface above the cortex (set in update)
  left.append(vizTitle('Potential through the layers (cross-section)'));
  right.append(vizTitle('Potential versus height above the source'));
  const hm = glow(left, { width: 390, height: 330, scale: 2, xRange, yRange, floor: 1e-7, ceiling: 1e-4, fadeWhere: (_x, y) => (y > scalpY ? 0.3 : 1), grid: { step: 0.01, factor: 100, unit: 'cm', note: 'each grid square = 1 cm' } });
  glowLegend(left, '0.1 µV', '100 µV');
  const radial = verticalProfile(right, { height: 330, yDomain: [yRange[0] * 100, yRange[1] * 100], yLabel: 'cm above the cortical surface', xLabel: 'Potential straight above the source (µV)', xDomain: [0.1, 1e4] });
  fig.panel.append(controls(sN.el, sF.el, sDepth.el));
  fig.viz.append(readouts(rSource.el, rScalp.el, rCortex.el, rRatio.el, rWidth.el));
  assumptions(fig.el, [
    { what: 'Head geometry', value: `Spherical layers share one center ${c('sphere-model')}. Brain radius: 8.0 cm ${c('brain-radius')}. Layer thicknesses: CSF ${P.thicknessCsfMm} mm ${c('thickness-csf')}; dura ${P.thicknessDuraMm} mm ${c('thickness-dura')}; skull ${P.thicknessSkullMm} mm ${c('thickness-skull')}; scalp ${P.thicknessScalpMm} mm. These representative inputs come from different studies.`, cite: c('thickness-scalp') },
    { what: 'Conductivities', value: `Values are in siemens per meter (S/m). Gray matter: ${P.sigmaGray} ${c('sigma-gray')}; CSF: ${P.sigmaCsf} ${c('sigma-csf')}; dura: ${P.sigmaDura} ${c('sigma-dura')}; skull: ${P.sigmaSkull} ${c('sigma-skull')}; scalp: ${P.sigmaScalp}.`, cite: c('sigma-scalp') },
    { what: 'Source', value: `The cell group is represented by one outward-pointing current dipole. Each cell contributes ${P.singleCellMomentPAm} pA·m ${c('single-cell-moment')}. The fraction in step adds directly; the squared amplitudes of the remaining contributions add, as in section 2.`, cite: c('variances-add') },
    { what: 'Detection floor', value: `${TH_UV} µV, the low end of measured electrode–skin noise. Muscle activity, blinks, electrical interference and amplifier noise are excluded. This threshold applies to a contact on the scalp, not a plate in air.`, cite: c('skin-noise') },
    { what: 'Solution', value: `The calculation matches voltage and current across every tissue boundary ${c('sphere-model')}. It uses a 600-term Legendre expansion, a mathematical series for spherical geometry. A separate solution gives voltage in the insulating air.`, cite: c('exterior-potential') },
  ]);

  function build(): { shells: Shell[]; b: number } {
    const shells = stackShells(P.brainRadiusM, [
      { name: 'CSF', thickness: P.thicknessCsfMm * 1e-3, sigma: P.sigmaCsf },
      { name: 'dura', thickness: P.thicknessDuraMm * 1e-3, sigma: P.sigmaDura },
      { name: 'skull', thickness: P.thicknessSkullMm * 1e-3, sigma: P.sigmaSkull },
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
    // profile straight above the source, from below the cortex out into the air (cm above the cortical surface)
    const prof: [number, number][] = [];
    for (let k = 0; k <= 400; k++) {
      const y = yRange[0] + ((yRange[1] - yRange[0]) * k) / 400, r = rCortexSurf + y;
      // the air has a potential too (claim exterior-potential), but no current flows there for an electrode to draw
      const v = r > R ? exteriorPotential(sol, r, 0, 0) : potential(sol, Math.min(r, R - 1e-9), 0, 0);
      prof.push([Math.abs(v) * 1e6, y * 100]);
    }
    const layerColors = ['#2a78d6', '#1baf7a', '#eda100', '#898781', '#eb6834'];
    const above = (r: number) => (r - rCortexSurf) * 100;
    const bands = shells.map((sh, i) => ({ from: i === 0 ? yRange[0] * 100 : above(shells[i - 1].outerRadius), to: above(sh.outerRadius), label: i === 0 ? 'gray matter' : sh.name, color: layerColors[i % layerColors.length] }));
    bands.push({ from: above(R), to: yRange[1] * 100, label: 'air: weak electrical connection', color: '#f4f1ea' });
    scalpY = R - rCortexSurf;
    radial.update(prof, bands, [{ value: TH_UV, label: '1 µV' }], (b - rCortexSurf) * 100);
    let peakScalp = 0, peakCortex = 0;
    for (let th = 0; th < Math.PI / 2; th += 0.005) {
      peakScalp = Math.max(peakScalp, Math.abs(surfacePotential(sol, th, 0)));
      peakCortex = Math.max(peakCortex, Math.abs(potential(sol, rCortexSurf - 1e-9, th)));
    }
    rScalp.set(`${fmt(peakScalp * 1e6, 3)} µV`);
    rCortex.set(`${fmt(peakCortex * 1e6, 3)} µV`);
    rRatio.set(`${fmt(peakCortex / peakScalp, 3)}×`);
    // the stretch of scalp where a contact electrode sees more than the floor, measured along the scalp from the point above the source
    let reach = 0;
    for (let th = 0; th < Math.PI; th += 0.002) { if (Math.abs(surfacePotential(sol, th)) < TH_UV * 1e-6) break; reach = th * R; }
    rWidth.set(reach > 0 ? `${fmt(2 * reach * 100, 3)} cm` : 'none');
    hm.draw((x, y) => {
      // unrolled sphere: x is distance along the scalp, y height above the cortical surface
      const r = rCortexSurf + y, th = Math.abs(x) / R, ph = x < 0 ? Math.PI : 0;
      return r > R ? exteriorPotential(solMap, r, th, ph) : potential(solMap, r, th, ph);
    }, (ctx, toPx) => {
      ctx.save();
      const t = (i: number) => shells[i].outerRadius - shells[i - 1].outerRadius;
      drawCortexLayers(ctx, toPx, { xRange, yTop: yRange[1], surface: 0, csf: t(1), dura: t(2), skull: t(3), scalp: t(4), grayLabelY: -0.012 });
      ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
      if (reach > 0) {
        // the black bar along the scalp; arrowheads where it runs past the edge of the picture
        const [x1, y1] = toPx(-reach, scalpY), [x2] = toPx(reach, scalpY), a = Math.max(x1, 10), z = Math.min(x2, 380);
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a, y1); ctx.lineTo(z, y1); ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        if (x1 < 10) { ctx.beginPath(); ctx.moveTo(1, y1); ctx.lineTo(11, y1 - 6); ctx.lineTo(11, y1 + 6); ctx.fill(); }
        if (x2 > 380) { ctx.beginPath(); ctx.moveTo(389, y1); ctx.lineTo(379, y1 - 6); ctx.lineTo(379, y1 + 6); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        const t = `electrodes on this ${fmt(2 * reach * 100, 2)} cm of scalp see more than ${TH_UV} µV`;
        ctx.strokeText(t, (a + z) / 2, y1 - 9); ctx.fillText(t, (a + z) / 2, y1 - 9);
      }
      const [sx, sy] = toPx(0, b - rCortexSurf);
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillText('source', sx + 8, sy + 5);
      ctx.restore();
    });
  }
  [sN, sF, sDepth].forEach((s) => s.onChange(update));
  update();
}
