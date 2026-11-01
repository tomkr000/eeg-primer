import { detectionRadius, twoMonopole } from '../physics/dipole';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot, type Series } from '../ui/plot';
import { glow, drawNeuron, scaleBar, glowLegend } from '../ui/field';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts } from '../ui/layout';

export function mountNeuron(root: HTMLElement) {
  const sec = section(root, 'neuron', '1', 'How far does one neuron’s signal reach?');
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
synaptic field reaches about as far. At one centimetre a single cell contributes nanovolts, a thousand
times below anything a scalp amplifier can separate from noise. One cell is invisible from outside.</p>`);

  const sI = slider({ label: 'Net synaptic current into the cell', unit: 'pA', min: 10, max: 10000, value: P.cellCurrentPa, log: true, note: c('cell-current') });
  const sD = slider({ label: 'Synapse-to-soma distance', unit: 'µm', min: 100, max: 1000, value: P.dipoleLengthUm, step: 10, note: c('dipole-length') });
  const sSig = slider({ label: 'Grey-matter conductivity σ', unit: 'S/m', min: 0.1, max: 0.6, step: 0.01, value: P.sigmaGray, note: c('sigma-gray') });
  const sTh = slider({ label: 'Detection threshold (electrode noise)', unit: 'µV', min: 1, max: 50, value: P.spikeNoiseUv, log: true, note: c('spike-noise-floor') });
  const rRadius = readout('Signal drops below threshold within');
  const rAt1cm = readout('Potential 1 cm away');
  const rMoment = readout('Dipole moment p = I·d');

  const fig = figure(sec.fig, 'Left: the extracellular field of one pyramidal cell. Current enters at the dendritic tuft (blue, negative) and leaves at the cell body (red, positive); colour fades with the logarithm of the potential and the dashed circles mark the detection threshold. Right: potential along the cell’s axis against distance from the nearer pole; the dot is the measured spike amplitude of single hippocampal cells (at least 60 µV within 50 µm), the dotted line the 140 µm limit beyond which spikes vanish into noise.');
  const row = document.createElement('div');
  row.className = 'viz-row';
  const left = document.createElement('div');
  left.style.flex = '0 1 340px';
  const right = document.createElement('div');
  row.append(left, right);
  fig.viz.append(row);
  const span = 1.15e-3;
  const g = glow(left, { width: 340, height: 420, xRange: [-span, span], yRange: [-span * 1.25, span * 1.25], floor: 3e-8, ceiling: 3e-5, gamma: 1 });
  glowLegend(left, '0.03 µV', '30 µV', 'dashed circles = the detection threshold (detectable inside)');
  const plot = linePlot(right, {
    x: { label: 'Distance from the nearer pole (m)', scale: 'log', domain: [1e-5, 0.1] },
    y: { label: 'Potential (µV)', scale: 'log', domain: [1e-4, 1e4] },
    height: 300,
  });
  fig.panel.append(controls(sI.el, sD.el, sSig.el, sTh.el), readouts(rRadius.el, rAt1cm.el, rMoment.el));

  function update() {
    const I = sI.value * 1e-12, d = sD.value * 1e-6, sg = sSig.value, th = sTh.value * 1e-6;
    const pts: [number, number][] = [], mono: [number, number][] = [], dip: [number, number][] = [];
    for (let k = 0; k <= 160; k++) {
      const r = 1e-5 * Math.pow(1e4, k / 160);
      pts.push([r, Math.abs(twoMonopole(I, sg, d, 0, d / 2 + r)) * 1e6]);
      mono.push([r, (I / (4 * Math.PI * sg * r)) * 1e6]);
      const rc = r + d / 2;
      dip.push([r, ((I * d) / (4 * Math.PI * sg * rc * rc)) * 1e6]);
    }
    const series: Series[] = [
      { name: 'This cell', points: pts, color: '#2a78d6', width: 2.5 },
      { name: 'Nearer pole alone (1/r)', points: mono, color: '#898781', dashed: true, width: 1.5 },
      { name: 'Ideal dipole (1/r²)', points: dip, color: '#eb6834', dashed: true, width: 1.5 },
      { name: 'Measured spike (Henze 2000)', points: P.henzeSpikePoints, color: '#6250d6', dots: true },
    ];
    plot.update(series, [
      { axis: 'y', value: sTh.value, label: 'threshold' },
      { axis: 'x', value: P.henzeDetectionLimitM, label: '140 µm' },
      { axis: 'x', value: 1e-2, label: '1 cm' },
    ]);
    const rad = detectionRadius(I, sg, d, th);
    rRadius.set(rad === Infinity ? '> 1 m' : rad === 0 ? 'everywhere' : `${fmt(rad * 1e6, 3)} µm`);
    rAt1cm.set(`${fmt(Math.abs(twoMonopole(I, sg, d, 0, d / 2 + 0.01)) * 1e9, 3)} nV`);
    rMoment.set(`${fmt(I * d * 1e12, 3)} pA·m`);
    g.draw((x, y) => twoMonopole(I, sg, d, x, y), (ctx, toPx) => {
      // detection distance from each pole as a dashed circle
      if (rad > 0 && rad < span * 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(26,26,26,0.85)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
        for (const yc of [d / 2, -d / 2]) {
          const [cx, cy] = toPx(0, yc), [rx] = toPx(rad, yc);
          ctx.beginPath(); ctx.arc(cx, cy, rx - cx, 0, 2 * Math.PI); ctx.stroke();
        }
        ctx.restore();
      }
      drawNeuron(ctx, toPx, { x: 0, soma: -d / 2, tuft: d / 2 });
      scaleBar(ctx, toPx, -span * 0.9, -span * 1.15, 0.5e-3, '0.5 mm');
      ctx.save();
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#1a1a1a';
      const [tx, ty] = toPx(0, d / 2), [sx, sy] = toPx(0, -d / 2);
      ctx.fillText('synapse (current in)', tx + 10, ty - 8);
      ctx.fillText('cell body (current out)', sx + 14, sy + 4);
      ctx.restore();
    });
  }
  [sI, sD, sSig, sTh].forEach((s) => s.onChange(update));
  update();
}
