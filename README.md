# EEG primer: the physics of a non-invasive BCI

An interactive, fully cited explorer of the physics that limits scalp electroencephalography (EEG) for
non-invasive brain–computer interfaces (BCI). Eight slider-driven models, each with its long-form text folded
under an "In depth" toggle:

1. Neurons make very small electric fields: one cell in a to-scale cortex cross-section (grey matter, CSF, dura, skull), with a microelectrode whose tip sits at the detection distance
2. Many neurons must fire synchronously to create larger signal: a patch of N cells with a fraction in step, in the same cross-section
3. Only large, multi-neuron signals reach outside the skull: the same patch at a chosen depth in the analytic multi-shell head, with the potential profile drawn vertically beside the cross-section
4. From outside, patches of cortex blur into broad blobs: a fixed, representative set of patches on a realistic head
   (the hand, foot and tongue motor areas a person can modulate at will), each one's own scalp map and the summed map
   the electrodes see with contact noise added, using a precomputed lead field for the fsaverage boundary-element head (MNE-Python)
   (After section 4, an unnumbered aside, "How do neurons synchronize?": a cited note and schematic on thalamic drive, shared inhibition and travelling waves.)
5. The signal that gets outside the skull is noisy: the alpha amplitude derived from N and synchrony through the section 3 head, buried in muscle, blink, skin, mains and amplifier noise
6. Different electrode types result in different signals: the scalp signal through wet gel on abraded skin, wet gel, a dry plate and a plate over hair, each with an illustration
7. A head with EEG can operate only a few dimensions: movable patches on the head (drag, add, remove), each a coherent
   dipole of the stated moment, taken in turn; each bar the signal-to-noise ratio of what the patch adds beyond the earlier
   ones against the brain's own in-band activity plus contact noise over a 1 s window, with a bits-per-second axis and the
   rates of real interfaces marked; plus the tiled-cortex ceiling and the record. The N, synchrony and radius sliders are
   shared with section 4
8. EEG signals have inherent delays: a simulated imagined movement, the mu rhythm fading on a cited time course and a
   sliding-window power estimate whose length is a slider, with a cited timeline of where the time goes (rhythm,
   window, P300 repetitions, flicker plus gaze shift, readiness potential)

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
python scripts/export_head_leadfield.py     # compact ico-4 lead field (int16) + geometry for the head view of sections 4 and 7; writes src/data/head-leadfield.json
npm test                                    # tests/leadfield.test.ts pins the counts quoted in claim 'svd-counts'
```

## Layout

```
src/physics/      models: sphere.ts (multi-shell head, including the potential in the air outside it), dipole.ts,
                  population.ts, electrode.ts, noise.ts, fft.ts, linalg.ts
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
