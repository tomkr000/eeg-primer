import { potential, solveShells, surfacePotential, stackShells, type Shell } from '../physics/sphere';
import { controls, readout, slider, fmt, choice } from '../ui/slider';
import { linePlot, type Series } from '../ui/plot';
import { heatmap, diverging, colorbar } from '../ui/heatmap';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, assumptions } from '../ui/layout';

export function mountHead(root: HTMLElement) {
  const sec = section(root, 'head', '3', 'Out through cerebrospinal fluid, dura, skull and scalp');
  prose(sec.text, `
<p>Between a cortical source and a scalp electrode lie, in order: the remaining grey matter, a thin film of
cerebrospinal fluid (CSF) in the subarachnoid space, the dura mater, the skull, and the scalp. Each has
its own conductivity ${c('mccann-meta')}. CSF is the best conductor in the head
(≈${P.sigmaCsf} S/m) ${c('sigma-csf')}; the skull is by far the worst, with a whole-skull
conductivity around ${P.sigmaSkull} S/m — some 15 to 80 times lower than brain depending on the
measurement ${c('sigma-skull')}${c('skull-brain-ratio')}. Scalp conducts about as well as brain
${c('sigma-scalp')}.</p>
<p>Two things happen to the current loop. First, the highly conductive CSF offers an easy sideways path, so
a good share of the return current never approaches the skull at all; it is shunted along the CSF
layer, and the potential just outside the cortex is spread out and weakened before the skull is even
reached ${c('csf-shunt')}. Second, the skull is a resistive shell: current crossing it meets a large
resistance, so most of the current that reaches it spreads tangentially instead and crosses wherever it
can over a wide area. The scalp potential becomes a blurred, low-amplitude image of the cortical pattern.
The skull is a spatial low-pass filter; features finer than a few centimetres are lost
${c('spatial-lowpass')}.</p>
<p>The model below is the classical concentric-sphere head ${c('sphere-model')}: five shells with
measured conductivities and thicknesses ${c('thickness-skull')}${c('thickness-scalp')}${c('thickness-csf')}${c('thickness-dura')},
a radial or tangential dipole at an adjustable depth below the cortical surface, and an analytic
solution that satisfies the boundary conditions exactly (the code is unit-tested against the
closed-form homogeneous sphere and checked for continuity of potential and current at every interface).
It reproduces the familiar numbers: a 10 nA·m source gives microvolts at the scalp, while an electrode on
the cortex itself sees tens of times more for a focal source (far less for a broad synchronous sheet)
${c('ecog-vs-eeg')} — consistent with scalp EEG being tens of microvolts ${c('eeg-amplitude')} and
intracranial recordings hundreds.</p>`);

  const sDepth = slider({ label: 'Source depth below cortical surface', unit: 'mm', min: 0.5, max: 25, value: 2, step: 0.5 });
  const sCsf = slider({ label: 'CSF layer thickness', unit: 'mm', min: 0, max: 5, value: P.thicknessCsfMm, step: 0.1, note: c('thickness-csf') });
  const sDura = slider({ label: 'Dura thickness', unit: 'mm', min: 0, max: 2, value: P.thicknessDuraMm, step: 0.05, note: c('thickness-dura') });
  const sSkull = slider({ label: 'Skull thickness', unit: 'mm', min: 1, max: 12, value: P.thicknessSkullMm, step: 0.5, note: c('thickness-skull') });
  const sScalp = slider({ label: 'Scalp thickness', unit: 'mm', min: 1, max: 10, value: P.thicknessScalpMm, step: 0.5, note: c('thickness-scalp') });
  const sSigSkull = slider({ label: 'Skull conductivity', unit: 'S/m', min: 0.002, max: 0.1, value: P.sigmaSkull, log: true, note: c('sigma-skull') });
  const sSigCsf = slider({ label: 'CSF conductivity', unit: 'S/m', min: 0.3, max: 2.5, value: P.sigmaCsf, step: 0.01, note: c('sigma-csf') });
  const sSigDura = slider({ label: 'Dura conductivity', unit: 'S/m', min: 0.01, max: 1, value: P.sigmaDura, log: true, note: c('sigma-dura') });
  const sMoment = slider({ label: 'Source dipole moment', unit: 'nA·m', min: 1, max: 500, value: 10, log: true, note: c('cells-for-10nam') });
  let orientation: 'radial' | 'tangential' = 'radial';
  const orient = choice('Dipole orientation', [{ value: 'radial', label: 'Radial (gyral crown)' }, { value: 'tangential', label: 'Tangential (sulcal wall)' }], 'radial', (v) => { orientation = v; update(); });

  const rScalp = readout('Peak scalp potential');
  const rCortex = readout('Peak potential at the cortical surface');
  const rRatio = readout('Cortex-to-scalp attenuation');
  const rWidth = readout('Scalp half-width (distance to half the peak)');

  const fig = figure(sec.fig, 'Top: potential in a cross-section of the layered head (blue negative, red positive; the colour scale saturates at ±1 µV). Middle: potential along the straight line from the source out to the scalp, with the layers shaded. Bottom: potential along the surface at three depths — cortex, top of the skull, scalp — versus distance from the point above the source.');
  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  fig.plotArea.append(mapWrap);
  const W = 420, H = 300;
  const divergingUnit = (v: number) => diverging(2 * v - 1); // heat map feeds values in [0, 1]
  const hm = heatmap(mapWrap, { width: W, height: H, xRange: [-0.07, 0.07], yRange: [0.0, 0.10], color: divergingUnit });
  colorbar(mapWrap, divergingUnit, ['−1 µV', 'potential', '+1 µV']);
  const radial = linePlot(fig.plotArea, {
    x: { label: 'Distance from the source along its axis (mm)' },
    y: { label: 'Potential (\u00b5V)', scale: 'log', domain: [1, 1e4] },
    height: 240,
  });
  const plot = linePlot(fig.plotArea, {
    x: { label: 'Distance along the surface from the source axis (cm)', domain: [-8, 8] },
    y: { label: 'Potential (µV)', scale: 'log', domain: [1e-2, 1e3] },
    height: 300,
  });
  fig.controls.append(
    controls(sDepth.el, sMoment.el, orient.el),
    controls(sCsf.el, sDura.el, sSkull.el, sScalp.el),
    controls(sSigCsf.el, sSigDura.el, sSigSkull.el),
    rScalp.el, rCortex.el, rRatio.el, rWidth.el,
  );

  assumptions(fig.el, [
    { what: 'Head geometry', value: 'concentric spheres, brain radius 8.0 cm; layer thicknesses from the sliders', cite: c('brain-radius') + c('sphere-model') },
    { what: 'Grey matter', value: `${P.sigmaGray} S/m (classical value; meta-analysis 0.38–0.47 S/m)`, cite: c('sigma-gray') },
    { what: 'Scalp', value: `${P.sigmaScalp} S/m`, cite: c('sigma-scalp') },
    { what: 'Source', value: 'a single current dipole at the chosen depth; a real source is a sheet of many such dipoles', cite: c('cells-for-10nam') },
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
    const sol = solveShells(shells, b, p, orientation, 600); // long series: the cortical-surface curve sits 2 mm from the source
    const solMap = solveShells(shells, b, p, orientation, 120);
    const R = shells[shells.length - 1].outerRadius;
    const rCortexSurf = P.brainRadiusM;
    const skullTop = shells.find((s) => s.name === 'skull')?.outerRadius ?? R;
    const mk = (r: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let k = -100; k <= 100; k++) {
        const s = (k / 100) * 0.08; // arc length, m
        const theta = s / r;
        const v = Math.abs(potential(sol, r - 1e-9, Math.abs(theta))) * 1e6;
        pts.push([s * 100, v]);
      }
      return pts;
    };
    const series: Series[] = [
      { name: 'Cortical surface', points: mk(rCortexSurf), color: '#2a78d6', width: 2.5 },
      { name: 'Top of skull', points: mk(skullTop), color: '#eb6834', width: 2 },
      { name: 'Scalp', points: mk(R), color: '#1baf7a', width: 2.5 },
    ];
    plot.update(series);
    // radial profile along the dipole axis (θ = 0 for radial; for a tangential dipole use the direction of its maximum, θ = 0 still passes through the layers)
    const prof: [number, number][] = [];
    for (let k = 0; k <= 240; k++) {
      const r = b + ((R - b) * k) / 240;
      const v = Math.abs(potential(sol, Math.min(r, R - 1e-9), orientation === 'radial' ? 0 : 0.02, 0)) * 1e6;
      prof.push([(r - b) * 1e3, v]);
    }
    const layerColours = ['#2a78d6', '#1baf7a', '#eda100', '#898781', '#eb6834'];
    const bands = shells.map((sh, i) => ({ from: ((i === 0 ? b : shells[i - 1].outerRadius) - b) * 1e3, to: (sh.outerRadius - b) * 1e3, label: i === 0 ? 'grey matter' : sh.name, color: layerColours[i % layerColours.length] }));
    radial.update([{ name: 'Potential along the axis', points: prof, color: '#2a78d6', width: 2.5 }], [], bands);
    const vScalp = Math.abs(surfacePotential(sol, orientation === 'radial' ? 0 : Math.PI / 2, 0));
    // for a tangential dipole the scalp maximum is off-axis; scan for it
    let peakScalp = vScalp, peakCortex = Math.abs(potential(sol, rCortexSurf - 1e-9, 0));
    for (let th = 0; th < Math.PI / 2; th += 0.005) {
      peakScalp = Math.max(peakScalp, Math.abs(surfacePotential(sol, th, 0)));
      peakCortex = Math.max(peakCortex, Math.abs(potential(sol, rCortexSurf - 1e-9, th)));
    }
    rScalp.set(`${fmt(peakScalp * 1e6, 3)} µV`);
    rCortex.set(`${fmt(peakCortex * 1e6, 3)} µV`);
    rRatio.set(`${fmt(peakCortex / peakScalp, 3)}×`);
    // half width on the scalp (radial case: from the axis)
    let hw = NaN;
    if (orientation === 'radial') {
      for (let th = 0; th < Math.PI; th += 0.002) if (Math.abs(surfacePotential(sol, th)) < peakScalp / 2) { hw = th * R; break; }
    }
    rWidth.set(isNaN(hw) ? '—' : `${fmt(hw * 100, 3)} cm`);
    const lim = 1e-6;
    hm.draw((x, y) => {
      const r = Math.hypot(x, y);
      if (r > R) return NaN;
      const theta = Math.atan2(Math.abs(x), y);
      const v = potential(solMap, r, theta, x < 0 ? Math.PI : 0);
      return 0.5 + 0.5 * Math.max(-1, Math.min(1, v / lim));
    });
    hm.overlay((ctx, toPx) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(11,11,11,0.45)';
      ctx.lineWidth = 1;
      for (const s of shells) {
        ctx.beginPath();
        const [cx, cy] = toPx(0, 0);
        const [rx] = toPx(s.outerRadius, 0);
        ctx.arc(cx, cy, rx - cx, Math.PI, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0b0b';
      ctx.font = '11px system-ui';
      // layer labels with leader lines, fanned out on the left
      const ang = -0.35;
      const mids = [P.brainRadiusM - 0.006, ...shells.slice(1).map((sh, i) => (shells[i].outerRadius + sh.outerRadius) / 2)];
      const names = ['grey matter', ...shells.slice(1).map((sh) => sh.name)];
      mids.forEach((r, i) => {
        const [x0, y0] = toPx(r * Math.sin(ang), r * Math.cos(ang));
        const [x1, y1] = toPx(-0.045, 0.097 - i * 0.0075);
        ctx.strokeStyle = 'rgba(11,11,11,0.5)';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + 2, y1 - 3); ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(names[i], x1, y1);
        ctx.textAlign = 'left';
      });
      const [sx, sy] = toPx(0, b);
      ctx.fillStyle = '#eb6834';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
    });
  }
  [sDepth, sCsf, sDura, sSkull, sScalp, sSigSkull, sSigCsf, sSigDura, sMoment].forEach((s) => s.onChange(update));
  update();
}
