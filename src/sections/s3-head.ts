import { exteriorPotential, potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { verticalProfile } from '../ui/profile';
import { glow, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { netDipole } from '../physics/population';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';

export function mountHead(root: HTMLElement) {
  const sec = section(root, 'head', '3', 'Only large, multi-neuron signals reach outside the skull');
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

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3), marks: [{ value: P.patchDefaultN, label: 'Typical source' }] });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Seizure' }] });
  const sDepth = slider({ label: 'Source depth below the cortical surface', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5, marks: [{ value: 2, label: 'Gyral crown' }, { value: 20, label: 'Deep in a sulcus' }] });
  const TH_UV = 1; // dark contour: the quietest electrode contact alone (section 4 adds the rest)
  const orientation = 'radial' as const;
  const rSource = readout('Source: the patch of section 2', c('single-cell-moment') + c('cells-for-10nam'));
  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout('Scalp half-width of the pattern');

  const fig = figure(sec.fig, 'Left: the top of the head in cross-section; red positive, blue negative, fading with the logarithm of the potential; the dark line is where the potential falls to 1 µV, the noise of the quietest electrode contact alone (section 4 adds everything else). The arcs, inside to out, bound grey matter, cerebrospinal fluid (CSF), dura, skull and scalp; the field continues into the air above the scalp, where a non-contact electrode would sense it. Right: the potential straight above the source, drawn on the same vertical scale as the picture, through each layer and out into the air. The source is the patch of section 2 at the chosen depth, pointing outward as on a gyral crown; grid numbers are centimetres from the head centre.', { panelWidth: '400px' });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = '0 0 390px';
  row.append(left, right);
  fig.viz.append(row);
  const yRange: [number, number] = [0.02, 0.02 + 0.12 * 300 / 390];
  const hm = glow(left, { width: 390, height: 300, scale: 2, xRange: [-0.06, 0.06], yRange, floor: 1e-7, ceiling: 1e-4, threshold: 1e-6, grid: { step: 0.02, factor: 100, unit: 'cm' } });
  glowLegend(left, '0.1 µV', '100 µV', 'dark line = 1 µV, the quietest contact’s own noise');
  const radial = verticalProfile(right, { height: 300, yDomain: [yRange[0] * 100, yRange[1] * 100], yLabel: 'cm from the head centre', xLabel: 'Potential straight above the source (µV)', xDomain: [0.1, 1e4] });
  fig.panel.append(controls(sN.el, sF.el, sDepth.el));
  fig.viz.append(readouts(rSource.el, rScalp.el, rCortex.el, rRatio.el, rWidth.el));
  assumptions(fig.el, [
    { what: 'Head geometry', value: `concentric spheres, brain radius 8.0 cm; CSF ${P.thicknessCsfMm} mm, dura ${P.thicknessDuraMm} mm, skull ${P.thicknessSkullMm} mm, scalp ${P.thicknessScalpMm} mm (measured averages)`, cite: c('brain-radius') + c('sphere-model') + c('thickness-csf') + c('thickness-dura') + c('thickness-skull') + c('thickness-scalp') },
    { what: 'Conductivities', value: `grey matter ${P.sigmaGray} S/m, CSF ${P.sigmaCsf}, dura ${P.sigmaDura}, skull ${P.sigmaSkull} (the key uncertain one: measured values span 0.003 to 0.08), scalp ${P.sigmaScalp}`, cite: c('sigma-gray') + c('sigma-csf') + c('sigma-dura') + c('sigma-skull') + c('sigma-scalp') },
    { what: 'Source', value: `the patch of section 2 as one current dipole at the chosen depth, pointing outward (a gyral crown): N × fraction in step × ${P.singleCellMomentPAm} pA·m per cell, plus the √N random-walk part; a real source is a sheet, not a point`, cite: c('single-cell-moment') + c('variances-add') + c('cells-for-10nam') + c('orientation') },
    { what: 'Detection floor', value: `${TH_UV} µV, the lower end of measured electrode–skin noise: the quietest contact alone, with muscle, blinks, mains and amplifier noise all removed`, cite: c('skin-noise') },
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
    // profile straight above the source, from the head centre out into the air (cm from the centre)
    const prof: [number, number][] = [];
    for (let k = 0; k <= 400; k++) {
      const r = yRange[0] + ((yRange[1] - yRange[0]) * k) / 400;
      const v = r <= R ? potential(sol, Math.min(r, R - 1e-9), 0, 0) : exteriorPotential(sol, r, 0, 0);
      prof.push([Math.abs(v) * 1e6, r * 100]);
    }
    const layerColours = ['#2a78d6', '#1baf7a', '#eda100', '#898781', '#eb6834'];
    const bands = shells.map((sh, i) => ({ from: (i === 0 ? yRange[0] : shells[i - 1].outerRadius) * 100, to: sh.outerRadius * 100, label: i === 0 ? 'brain' : sh.name, color: layerColours[i % layerColours.length] }));
    bands.push({ from: R * 100, to: yRange[1] * 100, label: 'air', color: '#f4f1ea' });
    radial.update(prof, bands, [{ value: TH_UV, label: '1 µV' }], b * 100);
    let peakScalp = 0, peakCortex = 0;
    for (let th = 0; th < Math.PI / 2; th += 0.005) {
      peakScalp = Math.max(peakScalp, Math.abs(surfacePotential(sol, th, 0)));
      peakCortex = Math.max(peakCortex, Math.abs(potential(sol, rCortexSurf - 1e-9, th)));
    }
    rScalp.set(`${fmt(peakScalp * 1e6, 3)} µV`);
    rCortex.set(`${fmt(peakCortex * 1e6, 3)} µV`);
    rRatio.set(`${fmt(peakCortex / peakScalp, 3)}×`);
    let hw = NaN;
    for (let th = 0; th < Math.PI; th += 0.002) if (Math.abs(surfacePotential(sol, th)) < peakScalp / 2) { hw = th * R; break; }
    rWidth.set(isNaN(hw) ? 'n/a' : `${fmt(hw * 100, 3)} cm`);
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
  [sN, sF, sDepth].forEach((s) => s.onChange(update));
  update();
}
