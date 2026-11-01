import { dimensionality } from '../physics/dimensionality';
import { stackShells } from '../physics/sphere';
import { controls, readout, slider, fmt, choice } from '../ui/slider';
import svd from '../data/leadfield-svd.json';
import { linePlot, type Series } from '../ui/plot';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, assumptions } from '../ui/layout';

export function mountDimensionality(root: HTMLElement) {
  const sec = section(root, 'dimensionality', '6', 'How many independent signals can scalp EEG carry?');
  prose(sec.text, `
<p>Suppose electrodes were free and you could tile the scalp with them. How many independent numbers
would the EEG still contain at any instant? The question has a spatial part and a temporal part.</p>
<p><strong>Spatial.</strong> Write the cortical source pattern as a sum of spherical harmonics — the
head’s equivalent of spatial frequencies, indexed by degree <span class="math">l</span>, with 2l+1
patterns per degree. In a spherically layered head each degree reaches the scalp with its own gain, and
the gain collapses with <span class="math">l</span>: a fine pattern on the cortex is a dipole layer whose
neighbouring patches have opposite sign, and their fields cancel over the distance to the scalp before the
skull even adds its own smearing. The figure computes that gain from the section-3 head model. A pattern is
<em>resolvable</em> if its scalp amplitude exceeds the noise floor; counting the surviving patterns gives
(l<sub>max</sub>+1)² − 1 independent spatial channels (the l = 0 term is unobservable because
potentials are measured relative to a reference). With realistic numbers that count is a few dozen to a
couple of hundred, and no number of electrodes can raise it: beyond roughly (l<sub>max</sub>+1)²
electrodes, extra sensors sample the same smooth field again ${c('spatial-nyquist')}.</p>
<p>Published analyses land in the same place by different routes. A generalised spatial-frequency analysis of
a realistic head model finds that ~110 components capture 99% of the scalp-EEG energy of superficial sources
in the noiseless case, that an electrode spacing of ~2.6 cm (about 120 sensors) suffices to sample them, and
that in a head with no skull or CSF the count would roughly triple ${c('iivanainen-components')}. For spatially
independent cortical sources only 26 eigencomponents explain 99% of the scalp variance; with noise, ~20
sensors capture 90% of it at low noise, while at high noise even 400 sensors explain only ~80%; and for a
small motor-cortex region of interest just 8 components rise above white sensor noise (4 above brain
background noise) ${c('iivanainen-eigen')}. Earlier
spatial-Nyquist estimates asked for 128 sensors to capture degrees up to about 7 ${c('spatial-nyquist')};
dense arrays help only when noise is low ${c('ryynanen')}; measured scalp spatial spectra peak at wavelengths
of 2.5–10 cm ${c('freeman-spectra')}; and blind decomposition of 71-channel EEG yields on average 34
near-dipolar components ${c('ica-dipolar')}. The inverse problem, with far more candidate sources than
electrodes, is underdetermined whatever the array ${c('inverse-illposed')}.</p>
<p><strong>A realistic head, not a sphere.</strong> The sphere is convenient, but is the count an artefact of
it? The second figure repeats the exercise numerically on a public realistic head: FreeSurfer’s
<em>fsaverage</em> template as shipped with MNE-Python, with a three-layer boundary-element model (BEM)
of inner skull, outer skull and scalp (5120 triangles each; 0.3, 0.006 and 0.3 S/m, downloaded by
<code>fetch_fsaverage</code>) ${c('fsaverage-bem')},
a 20,484-vertex cortical source mesh with dipoles normal to the folded surface, and standard electrode
layouts from 19 to 335 channels plus every scalp-mesh vertex under the cap (2,246 “electrodes”)
${c('montages')}. The lead field is computed with MNE’s linear-collocation BEM solver ${c('mne-bem')} and
decomposed by singular values ${c('svd-method')}; a sphere fitted to the same surfaces, with the same
conductivities, sources and electrodes, is decomposed the same way. With the default amplitude and noise
sliders the realistic head resolves a few dozen components, fewer than the sphere’s flat-spectrum count
above (independent cortical sources put most of their scalp variance into the lowest modes), and about
20–25 components carry 99% of the variance however many electrodes are used ${c('svd-counts')} —
within a hair of the 26 found by Iivanainen et al. with a four-compartment model
${c('iivanainen-eigen')}. The folded geometry changes the numbers by only a few components; the skull and
the distance do the rest.</p>
<p><strong>Temporal.</strong> Each of those spatial channels carries a time series, so the bandwidth matters
too — but what fills it is constrained by section 2: only populations of 10⁴–10⁵ synchronous
cells over centimetres of cortex register at all ${c('cells-for-10nam')}${c('tao-area')}, and such
synchrony is organised by oscillations whose period scales with the size of the pool engaged
${c('oscillations-synchrony')}. Out of ~16 billion cortical neurons ${c('cortical-neurons')}, the scalp
reports a handful of coarse, slow ensemble variables. Brain–computer interfaces show the practical ceiling:
volitional control from sensorimotor rhythms has been demonstrated in three simultaneous independent
dimensions ${c('dof-control')}; the fastest EEG spellers reach ~5.3 bits/s (about 325 bits/min)
${c('itr-ssvep')} — up from 10–25 bits/min two decades earlier ${c('itr-2002')} — but, in our
reading, they do so by decoding flicker-evoked visual responses to 40 targets selected by gaze, not an
internally generated command. Claims of
reconstructing limb trajectories from low-frequency EEG did not survive a chance-level analysis
${c('kinematics-chance')}. For comparison, intracortical arrays decode handwriting at 90 characters/min and
speech at 62 words/min ${c('intracortical')}.</p>`);

  const sScalp = slider({ label: 'Scalp amplitude of the broadest (l = 1) pattern', unit: 'µV', min: 1, max: 200, value: 20, log: true, note: c('eeg-amplitude') });
  const sNoise = slider({ label: 'Noise floor per pattern', unit: 'µV', min: 0.1, max: 20, value: 1, log: true, note: c('skin-noise') });
  const sDepth = slider({ label: 'Source sheet depth below cortical surface', unit: 'mm', min: 0.5, max: 15, value: 2, step: 0.5 });
  const sSkull = slider({ label: 'Skull conductivity', unit: 'S/m', min: 0.002, max: 0.1, value: P.sigmaSkull, log: true, note: c('sigma-skull') });
  const sE = slider({ label: 'Number of electrodes', min: 8, max: 2048, value: 128, log: true, format: (v) => String(Math.round(v)) });
  const rModes = readout('Independent spatial patterns above the noise (layered head)');
  const rElec = readout('… and with this many electrodes');
  const rRes = readout('Finest resolvable pattern (half-wavelength on the scalp)');
  const rCortex = readout('Same count for an electrode on the cortical surface');

  const fig = figure(sec.fig, 'Scalp (or cortex-surface) amplitude of a unit cortical pattern versus its spherical-harmonic degree, with the source strength scaled so the l = 1 pattern has the chosen amplitude. Patterns below the dashed noise line cannot be resolved.');
  const plot = linePlot(fig.plotArea, {
    x: { label: 'Spherical-harmonic degree l (higher = finer pattern)', domain: [1, 60] },
    y: { label: 'Amplitude at the sensor (µV)', scale: 'log', domain: [1e-3, 1e3] },
    height: 320,
  });
  fig.controls.append(controls(sScalp.el, sNoise.el, sDepth.el, sSkull.el, sE.el), rModes.el, rElec.el, rRes.el, rCortex.el);
  assumptions(fig.el, [
    { what: 'Head model', value: 'section-3 five-shell sphere with the default thicknesses and conductivities', cite: c('sphere-model') },
    { what: 'Source', value: 'a sheet of radial dipoles at the chosen depth with a flat spatial spectrum (every degree equally strong at the source)', cite: '<span class="assumption-tag">model assumption</span>' },
    { what: 'Resolvable', value: 'a pattern counts if its sensor-side amplitude exceeds the noise floor; D = (l<sub>max</sub>+1)² − 1', cite: '<span class="assumption-tag">derived</span>' },
    { what: 'Electrode cap', value: 'E electrodes can determine at most E − 1 independent coefficients', cite: '<span class="assumption-tag">derived</span>' },
  ]);

  // ── realistic-head check: precomputed lead-field singular values (scripts/leadfield_svd.py) ──
  type Montage = keyof typeof svd.models.bem;
  const montageLabels: Record<Montage, string> = {
    fsaverage_1020: '10–20 (19)', biosemi64: 'BioSemi 64', biosemi128: 'BioSemi 128', biosemi256: 'BioSemi 256', fsaverage_1005: '10–05 (335)', 'scalp-mesh': 'every scalp vertex (2,246)',
  };
  let montage: Montage = 'biosemi128';
  const mCtl = choice('Electrode layout', (Object.keys(montageLabels) as Montage[]).map((k) => ({ value: k, label: montageLabels[k] })), montage, (v) => { montage = v; updateSvd(); });
  const rBem = readout('Realistic head: components above the noise floor');
  const rSph = readout('Fitted sphere, same sources and electrodes');
  const r99 = readout('Components carrying 90% / 99% of the scalp variance (realistic head)', c('svd-counts'));
  const fig2 = figure(sec.fig, 'Singular values of the average-referenced lead field (channels × cortical sources), normalised to the largest, for the realistic fsaverage head with all 20,484 sources, the same head restricted to the 14,001 sources that fit inside a sphere, and a fitted three-layer sphere with those sources. Dashed line: the noise floor relative to the strongest component, from the sliders above.');
  const plot2 = linePlot(fig2.plotArea, {
    x: { label: 'Component index k', scale: 'log', domain: [1, 1000] },
    y: { label: 'Singular value sₖ / s₁', scale: 'log', domain: [1e-3, 1] },
    height: 300,
  });
  fig2.controls.append(controls(mCtl.el), rBem.el, rSph.el, r99.el);
  assumptions(fig2.el, [
    { what: 'Head', value: `fsaverage three-layer BEM: ${svd.head_model.layers.map((l) => l.sigma_S_per_m.toFixed(3)).join(' / ')} S/m, ${svd.head_model.layers[0].triangles} triangles per surface`, cite: c('fsaverage-bem') + c('mne-bem') },
    { what: 'Sources', value: `${svd.sources.n.toLocaleString('en-US')} cortical vertices (${svd.sources.spacing}), dipoles normal to the cortex, independent and identically distributed; ${svd.sources.n_inside_sphere.toLocaleString('en-US')} lie inside the fitted sphere`, cite: '<span class="assumption-tag">model assumption</span>' },
    { what: 'Sphere', value: `centred on the scalp centroid; radii ${svd.sphere_model.relative_radii.map((r) => (r * svd.sphere_model.outer_radius_m * 1000).toFixed(0)).join(' / ')} mm (mean radii of the BEM surfaces); electrodes projected onto its surface`, cite: '<span class="assumption-tag">derived</span>' },
    { what: 'Resolvable', value: 'component k counts if sₖ × (top-component scalp amplitude) exceeds the noise floor; the variance fractions use Σ sₖ²', cite: c('svd-method') },
    { what: 'Computation', value: `MNE-Python ${svd.mne_version}, scripts/leadfield_svd.py, ${svd.generated}`, cite: c('mne-bem') },
  ]);
  function updateSvd() {
    const ratio = sNoise.value / sScalp.value;
    const pick = (model: 'bem' | 'bem_subset' | 'sphere') => svd.models[model][montage];
    const series: Series[] = [
      { name: 'Realistic head, all cortical sources', points: pick('bem').singular_values_normalised.map((v, i) => [i + 1, v] as [number, number]), color: '#2a78d6', width: 2.5 },
      { name: 'Realistic head, sources inside the sphere', points: pick('bem_subset').singular_values_normalised.map((v, i) => [i + 1, v] as [number, number]), color: '#1baf7a', width: 2 },
      { name: 'Fitted sphere, same sources', points: pick('sphere').singular_values_normalised.map((v, i) => [i + 1, v] as [number, number]), color: '#eb6834', width: 2 },
    ];
    plot2.update(series, [{ axis: 'y', value: ratio, label: 'noise floor / strongest component' }]);
    const count = (m: 'bem' | 'bem_subset' | 'sphere') => pick(m).singular_values_normalised.filter((v) => v >= ratio).length;
    rBem.set(`${count('bem')} of ${pick('bem').n_channels}`);
    rSph.set(`${count('sphere')} (realistic head with the same sources: ${count('bem_subset')})`);
    r99.set(`${pick('bem').components_90pct} / ${pick('bem').components_99pct}`);
  }

  function update() {
    updateSvd();
    const b = P.brainRadiusM - sDepth.value * 1e-3;
    const layered = stackShells(P.brainRadiusM, [
      { name: 'CSF', thickness: P.thicknessCsfMm * 1e-3, sigma: P.sigmaCsf },
      { name: 'dura', thickness: P.thicknessDuraMm * 1e-3, sigma: P.sigmaDura },
      { name: 'skull', thickness: P.thicknessSkullMm * 1e-3, sigma: sSkull.value },
      { name: 'scalp', thickness: P.thicknessScalpMm * 1e-3, sigma: P.sigmaScalp },
    ], P.sigmaGray);
    const noSkull = layered.map((s) => ({ ...s, sigma: s.name === 'skull' ? P.sigmaGray : s.sigma }));
    const common = { b, scalpUvAtL1: sScalp.value, noiseUv: sNoise.value, electrodes: Math.round(sE.value), L: 60 };
    const dL = dimensionality({ shells: layered, ...common });
    // same source strength as the layered-head case, skull replaced by brain tissue
    const dN = dimensionality({ shells: noSkull, ...common, sourceScale: dL.sourceScale });
    // same head and source, sensing surface moved to the cortical surface (under the CSF)
    const dC = dimensionality({ shells: layered, ...common, sensorRadius: P.brainRadiusM, sourceScale: dL.sourceScale, L: 250 });
    const toPts = (d: typeof dL) => d.l.map((l, i) => [l, d.amplitudeUv[i]] as [number, number]);
    const series: Series[] = [
      { name: 'Scalp, layered head', points: toPts(dL), color: '#2a78d6', width: 2.5 },
      { name: 'Scalp, skull replaced by brain tissue', points: toPts(dN), color: '#eb6834', width: 2 },
      { name: 'Electrode on the cortical surface', points: toPts(dC), color: '#1baf7a', width: 2 },
    ];
    plot.update(series, [{ axis: 'y', value: sNoise.value, label: 'noise floor' }]);
    rModes.set(`${dL.modesBySnr} (l ≤ ${dL.lMax})`);
    rElec.set(`${dL.modes}`);
    rRes.set(dL.resolutionM === Infinity ? '—' : `${fmt(dL.resolutionM * 100, 2)} cm`);
    rCortex.set(`${dC.modesBySnr} (l ≤ ${dC.lMax})`);
  }
  [sScalp, sNoise, sDepth, sSkull, sE].forEach((s) => s.onChange(update));
  update();
}
