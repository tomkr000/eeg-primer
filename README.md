# EEG primer: the physics of a non-invasive BCI

An interactive, fully cited explorer of the physics that limits scalp electroencephalography (EEG) for
non-invasive brain–computer interfaces (BCI). Nine slider-driven models, each with its long-form text folded
under an "In depth" toggle:

1. Neurons make very small electric fields: one cell in a to-scale cortex cross-section (grey matter, CSF, dura, skull), with a microelectrode whose tip sits at the detection distance
2. Many neurons must fire synchronously to create larger signal: a patch of N cells with a fraction in step, in the same cross-section
3. Only large, multi-neuron signals reach outside the skull: the same patch at a chosen depth in the analytic multi-shell head, with the potential profile drawn vertically beside the cross-section
4. From outside, patches of cortex blur into broad blobs: a fixed, representative set of patches on a realistic head
   (the hand, foot and tongue motor areas a person can modulate at will), each one's own scalp map and the summed map
   the electrodes see, using a precomputed lead field for the fsaverage boundary-element head (MNE-Python)
   (After section 4, an unnumbered aside, "Which rhythms does the scalp see, and how do neurons synchronize?": a head map of where the scalp's signals come from, the alpha, mu and frontal-theta rhythms, the slow potentials of the vertex, parietal attention, and the eye and muscle artefacts, with their bands, switches and amplitudes; a schematic of thalamic drive, shared inhibition and travelling waves; and a cited note on which of these a person can change at will and why travelling waves are not a scalp control signal.)
5. The signal that gets outside the skull is noisy: the alpha amplitude derived from N and synchrony through the section 3 head, buried in muscle, blink, skin, mains and amplifier noise
6. Different electrode types result in different signals: the scalp signal through wet gel on abraded skin, wet gel, a dry plate and a plate over hair, each with an illustration
7. A head with EEG can operate only a few dimensions: a simulated recording in which rest and imagined movement
   alternate, the mu-band power a decoder estimates from a sliding window, and the spread of single-window estimates
   at rest and during imagery (gamma distributed over B·T degrees of freedom, the radiometer equation); readouts
   compare the model's left-or-right accuracy with measured medians and its four-way bit rate with the competition
   record. The rhythm's strength comes from the shared N and synchrony sliders through section 9's 64-electrode channel
8. EEG signals have inherent delays: a simulated imagined movement, the mu rhythm (a narrowband random process) fading
   on a cited time course and a sliding-window power estimate whose length is a slider, a robot arm that moves only
   when that estimate crosses the threshold, and a cited timeline of where the time goes (rhythm, window, P300
   repetitions, flicker plus gaze shift, readiness potential)
9. Adding electrodes gives diminishing returns: the best linear estimate of one patch from 2 to 100,000 electrodes on
   the section 3 sphere, against electrode noise alone (grows as √N) and against the brain's own background (flattens
   below a ceiling); the imagined-movement accuracy for the same counts, capped by the rhythm's own fluctuation; the
   calibration a decoder needs to learn its weights; the channel counts where measured decoders peak

Every number and physical statement carries a citation marker; hovering it shows the claim and its
verification status. The verification log and reference list are generated from `src/data/claims.ts`
and `src/data/references.ts`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, hot reload on every save
npm test           # unit tests for the multi-shell sphere solver
npm run build      # type-check + production build into dist/
```

## Deploy

Live at [eeg-primer.tomkr.ai](https://eeg-primer.tomkr.ai). Every push to `main` on GitHub runs
`.github/workflows/pages.yml`: `npm ci`, the tests, the type-checked build, then publishes `dist/` to GitHub Pages.
The custom domain is set in the repository's Settings → Pages, and DNS (GoDaddy, the registrar for tomkr.ai) has a
CNAME record `eeg-primer` → `tomkr000.github.io`. Assets use relative paths (`base: './'` in `vite.config.ts`), so the
build also works from a sub-path.

## Regenerating the realistic-head data

```bash
pip install mne nibabel
python scripts/leadfield_svd.py --ico 5     # downloads fsaverage (~300 MB) on first run; ~5 min; writes src/data/leadfield-svd.json
python scripts/export_head_leadfield.py     # compact ico-4 lead field (int16) + geometry for the head view of section 4; writes src/data/head-leadfield.json
npm test                                    # tests/leadfield.test.ts pins the counts quoted in claim 'svd-counts'
```

## Layout

```
src/physics/      models: sphere.ts (multi-shell head, including the potential in the air outside it), dipole.ts,
                  population.ts, electrode.ts, noise.ts, fft.ts, linalg.ts, control.ts (sections 7 to 9: band power
                  and decisions, SNR versus electrode count)
src/sections/     one module per page section (text in two columns, then a laptop-width figure with its sliders)
src/ui/           layout.ts (section/figure grid, In depth toggles), slider.ts (sliders with caret marks, readouts),
                  plot.ts (D3 line plot), profile.ts (vertical potential profile), strips.ts (small multiples),
                  field.ts (glow field renderer, grids, cortex layers, neuron and probe glyphs), citation helpers
src/data/         references.ts (bibliography), claims.ts (every assumption + status), params.ts (defaults),
                  leadfield-svd.json (realistic-head singular values), head-leadfield.json (128 × 5,124 lead field, int16,
                  electrode and source positions for the head of sections 4 and 7)
scripts/          leadfield_svd.py and export_head_leadfield.py (MNE-Python), verification-report.mjs, merge-audit.mjs
tests/            vitest unit tests
docs/             verification.md, the independent audit of every claim
```

## Changing a number

Edit the claim in `src/data/claims.ts` (statement, value, refs, status) and the default in
`src/data/params.ts`. Sections cite claims by id with `claimCite('id')`, so the citation marker, hover
card and verification-log entry all follow.
