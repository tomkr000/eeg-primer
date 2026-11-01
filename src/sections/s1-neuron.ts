import { detectionRadius, twoMonopole } from '../physics/dipole';
import { controls, readout, slider, fmt } from '../ui/slider';
import { linePlot, type Series } from '../ui/plot';
import { heatmap, sequential, colorbar } from '../ui/heatmap';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose } from '../ui/layout';

export function mountNeuron(root: HTMLElement) {
  const sec = section(root, 'neuron', '1', 'How far does one neuron’s signal reach?');
  prose(sec.text, `
<p>A neuron does not radiate. Its signal is a loop of ionic current: when a synapse opens, current flows
<em>into</em> the dendrite there (an extracellular sink) and back <em>out</em> through the membrane elsewhere,
mostly near the cell body (a source). Because brain tissue conducts, that loop closes through the
extracellular fluid, and the return current sets up a small potential difference in the tissue. At the
frequencies of electroencephalography (EEG) the tissue behaves as a plain resistor: capacitive, inductive
and wave-propagation effects are negligible, so the field is <em>quasi-static</em> and each point of
current creates a potential that falls as the inverse of distance, <span class="math">V = I / (4πσr)</span>
${c('quasistatic')}${c('monopole')}.</p>
<p>A sink and a source of equal strength a distance <span class="math">d</span> apart form a current dipole of
moment <span class="math">p = I·d</span>. Up close (within about <span class="math">d</span>) you feel the
nearer pole alone and the potential decays as <span class="math">1/r</span>; farther out the two poles cancel
to first order and the dipole field takes over, decaying as <span class="math">1/r²</span>
${c('dipole')}. The slider model below uses exactly this: synaptic current entering a pyramidal cell’s
apical dendrite and leaving near the soma, in grey matter of conductivity σ ≈ ${P.sigmaGray} S/m
${c('sigma-gray')}. A single synapse passes about 100 pA ${c('epsc')}; a cell driven by many synapses at
once passes about a nanoampere, the figure implied by measured single-cell dipole moments and dendrite
lengths ${c('cell-current')}.</p>
<p>Measured against a recording electrode's noise floor of a few microvolts ${c('spike-noise-floor')}, the
answer to “how far” is sobering. In vivo, the extracellular spike of a single hippocampal pyramidal cell
is at least 60 µV within ≈50 µm of the soma and cannot be picked out of the noise beyond
about 140 µm ${c('henze-50um')}${c('henze-140um')}. Spikes are briefly larger than the synaptic currents
modelled here but last only a millisecond, so from a distance they matter even less; models agree that
their amplitude falls between 1/r and 1/r² and that they are low-pass filtered with distance
${c('spike-decay')}, and that the local field potential of uncorrelated activity reaches only a few hundred
micrometres ${c('lfp-reach')}. Modelled as a single dipole of a few tenths of a picoampere-metre ${c('single-cell-moment')}, a
neuron's field at one centimetre is in the nanovolt range — three orders of magnitude below what any
scalp amplifier can separate from noise. (Fields of a fraction of a millivolt per millimetre do influence
<em>neighbouring</em> neurons — ephaptic coupling ${c('ephaptic')} — but that is a within-tissue effect.)
One cell is invisible from outside; everything that follows is about how populations, geometry and tissue
change that arithmetic.</p>`);

  const sI = slider({ label: 'Net synaptic current into the cell', unit: 'pA', min: 10, max: 10000, value: P.cellCurrentPa, log: true, note: c('cell-current') });
  const sD = slider({ label: 'Sink–source separation (apical dendrite)', unit: 'µm', min: 50, max: 1500, value: P.dipoleLengthUm, step: 10, note: c('dipole-length') });
  const sSig = slider({ label: 'Grey-matter conductivity σ', unit: 'S/m', min: 0.1, max: 0.6, step: 0.01, value: P.sigmaGray, note: c('sigma-gray') });
  const sTh = slider({ label: 'Detection threshold (recording noise floor)', unit: 'µV', min: 1, max: 50, value: P.spikeNoiseUv, log: true, note: c('spike-noise-floor') });
  const rRadius = readout('Distance at which the signal drops below threshold');
  const rAt1cm = readout('Potential 1 cm away, on axis');
  const rMoment = readout('Equivalent dipole moment p = I·d');

  const fig = figure(sec.fig, 'Top: potential along the dipole axis; shaded band: dipole regime (1/r²); dot: measured extracellular spike amplitude of single hippocampal pyramidal cells in vivo (≥ 60 µV within 50 µm). Bottom: field magnitude in a 2 mm × 2 mm plane through the cell on a log colour scale; the dark contour is the detection threshold.');
  const plot = linePlot(fig.plotArea, {
    x: { label: 'Distance from the nearer pole (m)', scale: 'log', domain: [1e-5, 0.1] },
    y: { label: 'Potential magnitude (µV)', scale: 'log', domain: [1e-4, 1e4] },
    height: 320,
  });
  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  fig.plotArea.append(mapWrap);
  const span = 1e-3; // ±1 mm
  const hm = heatmap(mapWrap, { width: 360, height: 360, xRange: [-span, span], yRange: [-span, span], color: sequential });
  colorbar(mapWrap, sequential, ['0.01 µV', 'log |V|', '1 mV']);

  fig.controls.append(controls(sI.el, sD.el, sSig.el, sTh.el), rRadius.el, rAt1cm.el, rMoment.el);

  const henze: [number, number][] = P.henzeSpikePoints; // [distance m, amplitude µV]

  function update() {
    const I = sI.value * 1e-12, d = sD.value * 1e-6, sg = sSig.value, th = sTh.value * 1e-6;
    const pts: [number, number][] = [], mono: [number, number][] = [], dip: [number, number][] = [];
    for (let k = 0; k <= 200; k++) {
      const r = 1e-5 * Math.pow(1e4, k / 200); // distance from the nearer pole, 10 µm → 10 cm
      const v = Math.abs(twoMonopole(I, sg, d, 0, d / 2 + r)) * 1e6;
      pts.push([r, v]);
      mono.push([r, (I / (4 * Math.PI * sg * r)) * 1e6]);
      const rc = r + d / 2; // distance from the dipole centre
      dip.push([r, ((I * d) / (4 * Math.PI * sg * rc * rc)) * 1e6]);
    }
    const series: Series[] = [
      { name: 'Two-pole neuron model', points: pts, color: '#2a78d6', width: 2.5 },
      { name: 'Nearer pole alone (1/r)', points: mono, color: '#898781', dashed: true, width: 1.5 },
      { name: 'Ideal dipole (1/r²)', points: dip, color: '#eb6834', dashed: true, width: 1.5 },
      { name: 'Measured spike amplitude (Henze 2000)', points: henze, color: '#6250d6', dots: true },
    ];
    plot.update(series, [
      { axis: 'y', value: sTh.value, label: 'detection threshold' },
      { axis: 'x', value: P.henzeDetectionLimitM, label: 'spikes undetectable beyond 140 µm' },
      { axis: 'x', value: 1e-2, label: '1 cm' },
    ], [{ from: d, to: 0.1, label: 'dipole regime', color: '#eb6834' }]);
    const rad = detectionRadius(I, sg, d, th);
    rRadius.set(rad === Infinity ? '> 1 m' : rad === 0 ? 'below threshold everywhere' : `${fmt(rad * 1e6, 3)} µm`);
    const v1 = Math.abs(twoMonopole(I, sg, d, 0, d / 2 + 0.01));
    rAt1cm.set(`${fmt(v1 * 1e9, 3)} nV`);
    rMoment.set(`${fmt(I * d * 1e12, 3)} pA·m`);
    const lo = Math.log10(1e-8), hi = Math.log10(1e-3);
    const tNorm = (Math.log10(th) - lo) / (hi - lo);
    const W = hm.canvas.width, H = hm.canvas.height, grid = new Float32Array(W * H);
    hm.draw((x, y) => {
      const v = Math.abs(twoMonopole(I, sg, d, x, y));
      const n = (Math.log10(Math.max(v, 1e-12)) - lo) / (hi - lo);
      const i = Math.min(W - 1, Math.floor(((x + span) / (2 * span)) * W)), j = Math.min(H - 1, Math.floor(((span - y) / (2 * span)) * H));
      grid[j * W + i] = n;
      return n;
    });
    hm.overlay((ctx, toPx) => {
      ctx.save();
      // threshold contour: pixels at or above the threshold with a 4-neighbour below it
      ctx.fillStyle = '#0b0b0b';
      for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        if (grid[k] >= tNorm && (grid[k - 1] < tNorm || grid[k + 1] < tNorm || grid[k - W] < tNorm || grid[k + W] < tNorm)) ctx.fillRect(i, j, 1, 1);
      }
      ctx.strokeStyle = '#0b0b0b';
      ctx.lineWidth = 1.5;
      const [x0, y0] = toPx(0, -d / 2), [x1, y1] = toPx(0, d / 2);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.beginPath(); ctx.arc(x0, y0, 5, 0, 2 * Math.PI); ctx.fillStyle = '#fcfcfb'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x1, y1, 3, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#0b0b0b';
      ctx.fillText('soma (source)', x0 + 8, y0 + 4);
      ctx.fillText('synapse (sink)', x1 + 8, y1 + 4);
      // scale bar 0.5 mm
      const [sx0, sy] = toPx(-0.9e-3, -0.9e-3), [sx1] = toPx(-0.4e-3, -0.9e-3);
      ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
      ctx.fillText('0.5 mm', sx0, sy - 6);
      ctx.restore();
    });
  }
  [sI, sD, sSig, sTh].forEach((s) => s.onChange(update));
  update();
}
