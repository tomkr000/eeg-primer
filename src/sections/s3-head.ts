import { exteriorPotential, potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { verticalProfile } from '../ui/profile';
import { glow, glowLegend, CANVAS_FONT, drawCortexLayers } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { netDipole } from '../physics/population';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';

export function mountHead(root: HTMLElement) {
  const sec = section(root, 'head', '3', 'Between the brain and scalp, many layers attenuate signal', 'Only large-scale synchronous events get through');
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
the scalp has to work with, and why, as section 5 shows, it gets almost nothing: the coupling through air is
far too weak to use what is there.</p>`);

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3), marks: [{ value: P.patchDefaultN, label: 'Typical source' }] });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Seizure' }] });
  const sDepth = slider({ label: 'Source depth below the cortical surface', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5, marks: [{ value: 2, label: 'Gyral crown' }, { value: 20, label: 'Deep in a sulcus' }] });
  const TH_UV = 1; // dark contour: the quietest electrode contact alone (section 4 adds the rest)
  const orientation = 'radial' as const;
  const rSource = readout('Source: the patch of section 2', c('single-cell-moment') + c('cells-for-10nam'));
  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout(`Stretch of scalp above ${1} µV`);

  const fig = figure(sec.fig, 'Left: the layers between cortex and air in cross-section, drawn flat like sections 1 and 2 (the sphere model unrolled; axes in centimetres). Red positive, blue negative, fading with the logarithm of the potential. The thick black stretch of scalp is where an electrode on it would see more than 1 µV, the noise of the quietest electrode contact alone (section 4 adds the rest). The potential continues into the air, but no electrode can read it there: a square centimetre held a centimetre off the scalp couples through under a tenth of a picofarad, hopeless as section 5 shows, so the air is faded and the profile stops at the scalp. Right: the potential straight above the source, on the same vertical scale. The source is the patch of section 2 at the chosen depth, pointing outward.', { panelWidth: '400px' });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = '0 0 390px';
  row.append(left, right);
  fig.viz.append(row);
  // picture coordinates: x along the scalp, y above the cortical surface (metres); the sphere is unrolled
  const xRange: [number, number] = [-0.04, 0.04];
  const yRange: [number, number] = [-0.033, -0.033 + 0.08 * 330 / 390];
  let scalpY = Infinity; // height of the scalp surface above the cortex (set in update)
  const hm = glow(left, { width: 390, height: 330, scale: 2, xRange, yRange, floor: 1e-7, ceiling: 1e-4, fadeWhere: (_x, y) => (y > scalpY ? 0.3 : 1), grid: { step: 0.01, factor: 100, unit: 'cm', note: 'each grid square = 1 cm' } });
  glowLegend(left, '0.1 µV', '100 µV', 'black bar: scalp where an electrode sees > 1 µV; air faded: unreadable');
  const radial = verticalProfile(right, { height: 330, yDomain: [yRange[0] * 100, yRange[1] * 100], yLabel: 'cm above the cortical surface', xLabel: 'Potential straight above the source (µV)', xDomain: [0.1, 1e4] });
  fig.panel.append(controls(sN.el, sF.el, sDepth.el));
  fig.viz.append(readouts(rSource.el, rScalp.el, rCortex.el, rRatio.el, rWidth.el));
  assumptions(fig.el, [
    { what: 'Head geometry', value: `concentric spheres, brain radius 8.0 cm; CSF ${P.thicknessCsfMm} mm, dura ${P.thicknessDuraMm} mm, skull ${P.thicknessSkullMm} mm, scalp ${P.thicknessScalpMm} mm (measured averages)`, cite: c('brain-radius') + c('sphere-model') + c('thickness-csf') + c('thickness-dura') + c('thickness-skull') + c('thickness-scalp') },
    { what: 'Conductivities', value: `grey matter ${P.sigmaGray} S/m, CSF ${P.sigmaCsf}, dura ${P.sigmaDura}, skull ${P.sigmaSkull} (the key uncertain one: measured values span 0.003 to 0.08), scalp ${P.sigmaScalp}`, cite: c('sigma-gray') + c('sigma-csf') + c('sigma-dura') + c('sigma-skull') + c('sigma-scalp') },
    { what: 'Source', value: `the patch of section 2 as one current dipole at the chosen depth, pointing outward (a gyral crown): N × fraction in step × ${P.singleCellMomentPAm} pA·m per cell, plus the √N random-walk part; a real source is a sheet, not a point`, cite: c('single-cell-moment') + c('variances-add') + c('cells-for-10nam') + c('orientation') },
    { what: 'Detection floor', value: `${TH_UV} µV, the lower end of measured electrode–skin noise: the quietest contact alone, with muscle, blinks, mains and amplifier noise all removed; drawn grey above the scalp because a contact floor does not apply there (a plate in air couples through C = ε₀A/d, under 0.1 pF for 1 cm² at 1 cm)`, cite: c('skin-noise') + c('hair-permittivity') },
    { what: 'Solution', value: 'Legendre series per degree with continuity of potential and radial current at each interface, 600 terms; the air above the scalp carries the exterior solution', cite: c('sphere-model') + c('exterior-potential') },
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
      if (r > R) break; // the profile stops at the scalp: nothing can read the field in the air
      prof.push([Math.abs(potential(sol, Math.min(r, R - 1e-9), 0, 0)) * 1e6, y * 100]);
    }
    const layerColours = ['#2a78d6', '#1baf7a', '#eda100', '#898781', '#eb6834'];
    const above = (r: number) => (r - rCortexSurf) * 100;
    const bands = shells.map((sh, i) => ({ from: i === 0 ? yRange[0] * 100 : above(shells[i - 1].outerRadius), to: above(sh.outerRadius), label: i === 0 ? 'grey matter' : sh.name, color: layerColours[i % layerColours.length] }));
    bands.push({ from: above(R), to: yRange[1] * 100, label: 'air: unreadable', color: '#f4f1ea' });
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
      drawCortexLayers(ctx, toPx, { xRange, yTop: yRange[1], surface: 0, csf: t(1), dura: t(2), skull: t(3), scalp: t(4), greyLabelY: -0.012 });
      ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
      const [lx, ly] = toPx(xRange[0] + 0.0065, yRange[1] - 0.006);
      ctx.fillText('the field continues into the air,', lx, ly);
      ctx.fillText('but nothing can read it without contact', lx, ly + 16);
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
