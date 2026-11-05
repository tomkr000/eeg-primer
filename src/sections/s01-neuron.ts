import { detectionRadius, twoMonopole } from '../physics/dipole';
import { controls, readout, slider, fmt } from '../ui/slider';
import { glow, drawNeuron, drawCortexLayers, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

export function mountNeuron(root: HTMLElement) {
  const sec = section(root, 'neuron', '1', 'Neurons make very small electric fields');
  prose(sec.text, `
<p>Synaptic activity drives current into a neuron's dendrite and out through other parts of its membrane.
The current returns through the fluid around the cell. This creates a voltage, also called an electric
potential, in the surrounding tissue ${c('quasistatic')}${c('monopole')}.</p>
<p>The model represents the cell as a pair of points where current enters and leaves. This pair is a
<strong>current dipole</strong>. Its strength is current I times the distance d between the points:
<span class="math">p = I·d</span>. Far from the pair, doubling the distance from the cell reduces the voltage to about a
quarter ${c('dipole')}.</p>
<p>The current slider starts at about one nanoampere, or 1,000 picoamperes (pA). This is a model value
inferred from published estimates of cell source strength and dendrite length ${c('cell-current')}. The figure calculates
the voltage around one pyramidal neuron in uniform gray matter ${c('sigma-gray')}.</p>
<p>Measurements show how local the signal is. In one rat hippocampus study, a cell's spike
was at least 60 microvolts (µV) within 50 micrometers (µm) of its cell body ${c('henze-50um')}.
Beyond about 140 µm, the spike could not be distinguished from noise ${c('henze-140um')}. A cortical cell
also lies beneath brain tissue and the layers that separate the brain from the scalp ${c('cortex-layers')}.
In this model, the voltage 1 cm from one cell is on the nanovolt scale ${c('dipole')}${c('cell-current')}.
That is far below the microvolt noise of scalp contacts ${c('skin-noise')}.</p>`);

  const sI = slider({ label: 'Net synaptic current into the cell', unit: 'pA', min: 100, max: 5000, value: P.cellCurrentPa, log: true, note: c('cell-current'), marks: [{ value: P.cellCurrentPa, label: 'Average current' }] });
  const TH_UV = P.spikeNoiseUv; // detection floor: the noise of a silicon probe in the tissue (claim spike-noise-floor)
  const d = P.dipoleLengthUm * 1e-6, sg = P.sigmaGray;
  const rRadius = readout(`Field above an electrode’s ${TH_UV} µV noise floor only within`, c('spike-noise-floor'));
  const rAt1cm = readout('Potential 1 cm away');
  const rMoment = readout('Dipole moment p = I·d');
  const rMeasured = readout('Detection radius', c('henze-140um'));
  rMeasured.set('140 µm');

  const fig = figure(sec.fig, `One modeled pyramidal cell, viewed from the side. Current enters at its dendritic tuft (${sw('#2a78d6', 'glow')} negative voltage) and leaves at its cell body (${sw('#e34948', 'glow')} positive voltage) ${c('dipole')}. The glow fades as voltage decreases, using a logarithmic scale. The dotted line encloses the region where the voltage exceeds the ${TH_UV} µV noise of a silicon probe in the tissue ${c('spike-noise-floor')}. Each grid square is 0.1 mm wide. The view shows gray matter only: the cortical surface lies ${P.somaDepthMm} mm above the middle of the cell. The calculation treats all surrounding tissue as uniform gray matter ${c('sigma-gray')}${c('cortex-layers')}. Section 3 adds the effects of the head's layers.`);
  const W = 620, H = 400;
  const xr: [number, number] = [-0.8e-3, 0.8e-3], yr: [number, number] = [-0.6e-3, -0.6e-3 + 1.6e-3 * H / W];
  const surface = P.somaDepthMm * 1e-3, csf = P.thicknessCsfMm * 1e-3, dura = P.thicknessDuraMm * 1e-3;
  fig.viz.append(vizTitle('Extracellular potential of one pyramidal neuron (cortical cross-section)'));
  const g = glow(fig.viz, { width: W, height: H, scale: 2, xRange: xr, yRange: yr, floor: 1e-7, ceiling: 1e-4, gamma: 1, threshold: P.spikeNoiseUv * 1e-6, dotted: true, grid: { step: 0.1e-3, factor: 1e3, unit: 'mm', labelEvery: 2, note: 'each grid square = 0.1 mm' } });
  g.canvas.style.width = `${W}px`;
  glowLegend(fig.viz, '0.1 µV', '100 µV', undefined, `${sw('#141414', 'dot')} detection radius`);
  fig.panel.append(controls(sI.el), readouts(rRadius.el, rMeasured.el, rAt1cm.el, rMoment.el));
  assumptions(fig.el, [
    { what: 'Cell geometry', value: `Two points represent current entering the tuft and leaving the cell body. They are ${P.dipoleLengthUm} µm apart.`, cite: c('dipole-length') + c('monopole') },
    { what: 'Layers shown', value: `The drawn cell body is ${P.somaDepthMm + P.dipoleLengthUm / 2000} mm below the surface of a ${P.corticalThicknessMm} mm cortex ${c('cortex-layers')}. Above it are ${P.thicknessCsfMm} mm of cerebrospinal fluid (CSF) ${c('thickness-csf')} and ${P.thicknessDuraMm} mm of dura, the membrane around the brain.`, cite: c('thickness-dura') },
    { what: 'Tissue calculation', value: `Uniform gray matter with conductivity ${P.sigmaGray} siemens per meter (S/m), a measure of how easily current flows ${c('sigma-gray')}. The model treats tissue as resistive at EEG frequencies.`, cite: c('quasistatic') },
    { what: 'Current range', value: 'The slider ranges from 100 to 5,000 pA. The default is an illustrative cell-scale current inferred from source strength and cell length.', cite: c('cell-current') },
    { what: 'Detection floor', value: `${TH_UV} µV root mean square (rms), a measure of noise size. This is the noise of a silicon probe inside tissue when recording spikes, rather than the noise of a scalp contact.`, cite: c('spike-noise-floor') },
  ]);

  function update() {
    const I = sI.value * 1e-12, th = TH_UV * 1e-6;
    const rad = detectionRadius(I, sg, d, th);
    rRadius.set(rad === Infinity ? '> 1 m' : rad === 0 ? 'everywhere' : `${fmt(rad * 1e6, 3)} µm`);
    rAt1cm.set(`${fmt(Math.abs(twoMonopole(I, sg, d, 0, d / 2 + 0.01)) * 1e9, 3)} nV`);
    rMoment.set(`${fmt(I * d * 1e12, 3)} pA·m`);
    g.draw((x, y) => twoMonopole(I, sg, d, x, y), (ctx, toPx) => {
      drawCortexLayers(ctx, toPx, { xRange: xr, yTop: yr[1], surface, csf, dura, grayLabelY: yr[1] - 0.06e-3 });
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
