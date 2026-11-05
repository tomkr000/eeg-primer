import { netDipole, mulberry32 } from '../physics/population';
import { solveShells, surfacePotential } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { glow, drawCortexLayers, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c, defaultHead } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

export function mountPopulation(root: HTMLElement) {
  const sec = section(root, 'population', '2', 'Coordinated neurons make larger signals');
  prose(sec.text, `
<p>Voltages from different cells add together ${c('superposition')}. 
When cellular currents rise and fall together and point the same way, the voltage amplitude grows in proportion
to the number of cells N. With unrelated timing, its typical amplitude grows only as the square root of N ${c('variances-add')}.</p>
<p>The direction of each cell affects the summed voltage as much as its timing does. Nearby pyramidal cells tend to point perpendicular to the cortical
surface, so their currents can reinforce each other. Cells with branches in many directions tend to produce
voltages that cancel at a distance ${c('open-closed')}. Synaptic currents last longer and overlap more often
than brief spikes. They are often the main source of the distant signal ${c('psp-dominate')}.</p>
<p style="break-inside: auto">A typical EEG source has a strength of about 10 nA·m.
The unit combines current with distance, as in section 1. It takes tens of thousands of cells acting together
to produce this strength ${c('cells-for-10nam')}. The figure uses 200,000 cells with 10% in step
to produce roughly that strength ${c('cells-for-10nam')}${c('single-cell-moment')}.</p>
<p>EEG is sensitive to individual sources pointing in different directions ${c('orientation')}. But when several
sources are active, cortical folding can make their voltage contributions oppose and partly cancel.
Even synchronized sources can therefore produce a smaller scalp signal ${c('patch-cancellation')}.</p>
<h3 style="column-span: none">What about supporting cells?</h3>
<p>Supporting cells called glia also carry current. Their contribution is thought to consist mainly of
very slow voltage changes, below 0.1 cycles per second ${c('glia-slow')}. Neuronal signals can grow through
stronger dendritic currents ${c('ca-spike-moment')}, shared rhythmic activity ${c('oscillations-synchrony')},
or inhibitory currents in active cells ${c('inhibitory-contrib')}.</p>`);

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3), marks: [{ value: P.patchDefaultN, label: 'Typical source' }] });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Theoretical<br>max' }] });
  const rMoment = readout('Net dipole moment');
  const rArea = readout('Cortical area of the patch', c('neuron-density') + c('pyramidal-fraction'));
  const rScalp = readout('Peak scalp potential (section 3 head)');

  const fig = figure(sec.fig, `A modeled patch of pyramidal cells. The white block is the patch of cells. Their voltages add to form the glow (${sw('#e34948', 'glow')} positive, ${sw('#2a78d6', 'glow')} negative) ${c('superposition')}. Unrelated current timing causes partial cancellation; shared timing produces a stronger signal ${c('variances-add')}. The dotted line encloses the region where the summed voltage exceeds the ${P.spikeNoiseUv} µV noise of a silicon probe in the tissue, as in section 1 ${c('spike-noise-floor')}. Each grid square is 0.5 cm wide. The layers up to the top of the scalp are drawn to scale, but the voltage calculation treats all of the tissue as uniform gray matter, so the field drawn in the skull and scalp is not their real field. The default 200,000 cells with 10% correlated approximate a typical 10 nA·m source ${c('cells-for-10nam')}${c('single-cell-moment')}.`);
  const W = 620, H = 400;
  const surfaceTop = (P.somaDepthMm + P.thicknessCsfMm + P.thicknessDuraMm + P.thicknessSkullMm + P.thicknessScalpMm) * 1e-3; // top of the scalp
  const xr: [number, number] = [-3e-2, 3e-2], yr: [number, number] = [surfaceTop - 6e-2 * H / W, surfaceTop];
  const surface = P.somaDepthMm * 1e-3, csf = P.thicknessCsfMm * 1e-3, dura = P.thicknessDuraMm * 1e-3;
  fig.viz.append(vizTitle('Summed potential of a patch of N pyramidal neurons (cortical cross-section)'));
  const gz = glow(fig.viz, { width: W, height: H, scale: 2, xRange: xr, yRange: yr, floor: 1e-7, ceiling: 1e-2, threshold: P.spikeNoiseUv * 1e-6, dotted: true, grid: { step: 0.5e-2, factor: 1e2, unit: 'cm', labelEvery: 2, note: 'each grid square = 0.5 cm' } });
  gz.canvas.style.width = `${W}px`;
  glowLegend(fig.viz, '0.1 µV', '10 mV', undefined, `${sw('#141414', 'dot')} detection radius`);
  const note = document.createElement('p');
  note.className = 'panel-note'; note.style.fontSize = '16px';
  note.textContent = 'Tissue differences are not taken into account.';
  fig.panel.append(controls(sN.el, sF.el), readouts(rMoment.el, rArea.el, rScalp.el), note);
  assumptions(fig.el, [
    { what: 'Per-cell source', value: `Each cell is assigned a dipole strength of ${P.singleCellMomentPAm} pA·m ${c('single-cell-moment')}. All currents point perpendicular to the cortical surface.`, cite: c('open-closed') },
    { what: 'Summation', value: 'The cells in step add in proportion to their number. Contributions with unrelated timing add in squared amplitude, giving square-root growth in amplitude.', cite: c('superposition') + c('variances-add') },
    { what: 'Patch', value: `Cell density sets the square patch's area ${c('neuron-density')}${c('pyramidal-fraction')}. A 16 × 16 grid represents groups of cells. The calculation treats all tissue as uniform gray matter; the drawn layers show their anatomical positions.`, cite: c('cortex-layers') },
    { what: 'Default source', value: `${fmt(P.patchDefaultN, 3)} cells with ${P.patchDefaultSync * 100}% in step give about ${fmt(P.patchDefaultN * P.patchDefaultSync * P.singleCellMomentPAm * 1e-3, 2)} nA·m. These are model choices that approximate a typical measured source.`, cite: c('single-cell-moment') + c('cells-for-10nam') },
    { what: 'Detection radius', value: `${P.spikeNoiseUv} µV rms, the noise of a silicon probe in the tissue (section 1). Scalp contacts and the skull are added in section 3.`, cite: c('spike-noise-floor') },
    { what: 'Cell-count limit', value: `The slider ends at ${fmt(P.patchMaxN, 2)} cells. At the assumed cell density and pyramidal-cell fraction, that occupies about ${fmt(P.patchMaxN / (P.neuronsPerMm2 * P.pyramidalFraction) / 100, 2)} cm².`, cite: c('neuron-density') + c('pyramidal-fraction') },
  ]);

  const head = defaultHead();
  const sol = solveShells(head.shells, head.sourceRadius, 1, 'radial', 120);
  const scalpPerAm = surfacePotential(sol, 0);
  const d = P.dipoleLengthUm * 1e-6;
  const sigma = P.sigmaGray;
  const densityPerM2 = P.neuronsPerMm2 * P.pyramidalFraction * 1e6; // pyramidal cells per m²

  function update() {
    const N = Math.round(sN.value), f = sF.value, p = P.singleCellMomentPAm * 1e-12;
    const Wp = Math.sqrt(N / densityPerM2); // side of the square patch, m
    const M = N === 1 ? 1 : 16; // macro-dipoles per side
    const n = N / (M * M); // cells per macro-dipole
    const rng = mulberry32(3);
    // amplitude of each macro-dipole in units of one cell's current: coherent n·f plus a random-walk √(n(1−f))
    const amps: number[] = [], xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      xs.push(M === 1 ? 0 : -Wp / 2 + ((i + 0.5) / M) * Wp);
      zs.push(M === 1 ? 0 : -Wp / 2 + ((j + 0.5) / M) * Wp);
      amps.push(n * f + Math.sqrt(n * (1 - f)) * Math.cos(rng() * 2 * Math.PI));
    }
    const Icell = p / d; // A per cell
    const k0 = Icell / (4 * Math.PI * sigma);
    const field = (x: number, y: number) => {
      let v = 0;
      for (let q = 0; q < amps.length; q++) {
        const dx = x - xs[q], dz = zs[q];
        const rSink = Math.sqrt(dx * dx + (y - d / 2) * (y - d / 2) + dz * dz);
        const rSrc = Math.sqrt(dx * dx + (y + d / 2) * (y + d / 2) + dz * dz);
        v += amps[q] * (1 / Math.max(rSrc, 1e-6) - 1 / Math.max(rSink, 1e-6));
      }
      return k0 * v;
    };
    const m = netDipole(N, f, 1, p).total;
    gz.draw(field, (ctx, toPx) => {
      drawCortexLayers(ctx, toPx, { xRange: xr, yTop: yr[1], surface, csf, dura, skull: P.thicknessSkullMm * 1e-3, scalp: P.thicknessScalpMm * 1e-3, grayLabelY: -0.6e-2 });
      const half = Wp / 2;
      const [bx0, by0] = toPx(-half, d / 2), [bx1, by1] = toPx(half, -d / 2);
      ctx.save(); // the patch as one block of cells, at least 3 px so a single cell stays visible
      const bw = Math.max(3, bx1 - bx0), bh = Math.max(3, by1 - by0);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(26,26,26,0.7)'; ctx.lineWidth = 1.5;
      ctx.fillRect((bx0 + bx1 - bw) / 2, (by0 + by1 - bh) / 2, bw, bh); ctx.strokeRect((bx0 + bx1 - bw) / 2, (by0 + by1 - bh) / 2, bw, bh);
      ctx.restore();
      ctx.save();
      ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
      const [px, py] = toPx(half, -d / 2 - 0.25e-3);
      const label = `patch: ${fmt(N, 3)} ${N === 1 ? 'cell' : 'cells'}, ${Wp < 1e-3 ? `${fmt(Wp * 1e6, 2)} µm` : `${fmt(Wp * 1e3, 2)} mm`} across`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeText(label, px + 10, py + 14); ctx.fillText(label, px + 10, py + 14);
      ctx.restore();
    });
    rMoment.set(`${fmt(m * 1e9, 3)} nA·m`);
    const areaMm2 = N / (P.neuronsPerMm2 * P.pyramidalFraction);
    rArea.set(areaMm2 < 100 ? `${fmt(areaMm2, 3)} mm²` : `${fmt(areaMm2 / 100, 3)} cm²`);
    rScalp.set(`${fmt(m * scalpPerAm * 1e6, 3)} µV`);
  }
  [sN, sF].forEach((s) => s.onChange(update));
  update();

}
