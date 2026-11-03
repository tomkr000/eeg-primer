import { detectionRadius, twoMonopole } from '../physics/dipole';
import { controls, readout, slider, fmt } from '../ui/slider';
import { glow, drawNeuron, drawCortexLayers, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw } from '../ui/layout';

export function mountNeuron(root: HTMLElement) {
  const sec = section(root, 'neuron', '1', 'Neurons make very small electric fields');
  prose(sec.text, `
<p>A neuron does not radiate. When a synapse opens, current flows into the dendrite there (a sink) and
leaves through the membrane near the cell body (a source). The loop closes through the extracellular
fluid, and because tissue conducts, each point of current raises or lowers the potential around it in
proportion to 1/distance ${c('quasistatic')}${c('monopole')}. A sink and a source a distance
<span class="math">d</span> apart make a current dipole, <span class="math">p = I·d</span>, whose field
falls as <span class="math">1/r²</span> beyond about <span class="math">d</span> ${c('dipole')}.</p>
<p>The figure draws that field around a pyramidal cell in grey matter
(σ ≈ ${P.sigmaGray} S/m ${c('sigma-gray')}). One synapse passes about 100 pA ${c('epsc')}; a cell driven by
many passes about a nanoampere, the value implied by measured single-cell dipole moments and dendrite
lengths ${c('cell-current')}.</p>
<p>Measured in vivo, the spike of a single pyramidal cell is at least 60 µV within 50 µm of the soma and
cannot be picked out of the noise beyond about 140 µm ${c('henze-50um')}${c('henze-140um')}; the slower
synaptic field reaches about as far. The cell body of a layer-5 pyramidal cell sits about 1.5 to 2 mm below
the cortical surface, in a cortex about 2.5 mm thick ${c('cortex-layers')}, with a millimetre of cerebrospinal
fluid (CSF), the dura and the skull above that. At one centimetre a single cell contributes nanovolts, a
thousand times below anything a scalp amplifier can separate from noise. One cell is invisible from
outside.</p>`);

  const sI = slider({ label: 'Net synaptic current into the cell', unit: 'pA', min: 100, max: 5000, value: P.cellCurrentPa, log: true, note: c('cell-current'), marks: [{ value: P.cellCurrentPa, label: 'Average current' }] });
  const TH_UV = P.spikeNoiseUv; // detection floor: the noise of a silicon probe in the tissue (claim spike-noise-floor)
  const d = P.dipoleLengthUm * 1e-6, sg = P.sigmaGray;
  const rRadius = readout(`Field above an electrode’s ${TH_UV} µV noise floor only within`, c('spike-noise-floor'));
  const rAt1cm = readout('Potential 1 cm away');
  const rMoment = readout('Dipole moment p = I·d');
  const rMeasured = readout('Measured: a single spike vanishes beyond', c('henze-140um'));
  rMeasured.set('140 µm');

  const fig = figure(sec.fig, `One pyramidal cell in the cortex, seen in cross-section with the tissue layers above it to scale. Current enters at the dendritic tuft (${sw('#2a78d6', 'glow')} negative) and leaves at the cell body (${sw('#e34948', 'glow')} positive); the colour fades with the logarithm of the potential, and it is below 0.1 µV before it reaches the cortical surface. Each grid square is 0.25 mm; the field is computed as in uniform grey matter.`);
  const W = 620, H = 400;
  const xr: [number, number] = [-3.1e-3, 3.1e-3], yr: [number, number] = [-0.9e-3, 3.1e-3];
  const surface = P.somaDepthMm * 1e-3, csf = P.thicknessCsfMm * 1e-3, dura = P.thicknessDuraMm * 1e-3;
  const g = glow(fig.viz, { width: W, height: H, scale: 2, xRange: xr, yRange: yr, floor: 3e-8, ceiling: 3e-5, gamma: 1, grid: { step: 0.25e-3, factor: 1e3, unit: 'mm', labelEvery: 4, note: 'each grid square = 0.25 mm' } });
  g.canvas.style.width = `${W}px`;
  glowLegend(fig.viz, '0.03 µV', '30 µV');
  fig.panel.append(controls(sI.el), readouts(rRadius.el, rMeasured.el, rAt1cm.el, rMoment.el));
  assumptions(fig.el, [
    { what: 'Cell geometry', value: `synaptic current enters at the apical tuft and leaves at the cell body ${P.dipoleLengthUm} µm away (a layer-5 pyramidal cell), so the cell is two opposite point sources`, cite: c('dipole-length') + c('monopole') },
    { what: 'Layers', value: `cell body ${P.somaDepthMm} mm below the cortical surface in a ${P.corticalThicknessMm} mm cortex; CSF ${P.thicknessCsfMm} mm and dura ${P.thicknessDuraMm} mm drawn to scale above it; the field itself is computed as in uniform grey matter (it is below 0.1 µV before it reaches the surface)`, cite: c('cortex-layers') + c('thickness-csf') + c('thickness-dura') },
    { what: 'Tissue', value: `uniform grey matter, ${P.sigmaGray} S/m, purely resistive at these frequencies`, cite: c('sigma-gray') + c('quasistatic') },
    { what: 'Current range', value: 'one synapse passes about 100 to 300 pA; a strongly driven cell a few nanoamps', cite: c('epsc') + c('cell-current') },
    { what: 'Detection floor', value: `${TH_UV} µV rms, the noise of a silicon probe in the action-potential band; the detection distance scales as current ÷ noise`, cite: c('spike-noise-floor') },
  ]);

  function update() {
    const I = sI.value * 1e-12, th = TH_UV * 1e-6;
    const rad = detectionRadius(I, sg, d, th);
    rRadius.set(rad === Infinity ? '> 1 m' : rad === 0 ? 'everywhere' : `${fmt(rad * 1e6, 3)} µm`);
    rAt1cm.set(`${fmt(Math.abs(twoMonopole(I, sg, d, 0, d / 2 + 0.01)) * 1e9, 3)} nV`);
    rMoment.set(`${fmt(I * d * 1e12, 3)} pA·m`);
    g.draw((x, y) => twoMonopole(I, sg, d, x, y), (ctx, toPx) => {
      drawCortexLayers(ctx, toPx, { xRange: xr, yTop: yr[1], surface, csf, dura });
      drawNeuron(ctx, toPx, { x: 0, soma: -d / 2, tuft: d / 2 });
      ctx.save();
      ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'right';
      const [sx, sy] = toPx(0, -d / 2), [ux, uy] = toPx(0, d / 2);
      ctx.fillText('synapse (current in)', ux - 30, uy - 6);
      ctx.fillText('cell body (current out)', sx - 22, sy + 5);
      ctx.restore();
    });
  }
  sI.onChange(update);
  update();
}
