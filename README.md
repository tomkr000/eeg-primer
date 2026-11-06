# EEG primer: the physics of a non-invasive BCI

An interactive, cited guide to scalp electroencephalography (EEG) and brain–computer interfaces (BCI).
Twelve sections combine models, diagrams and explanations:

1. A single neuron's voltage falls rapidly with distance.
2. Coordinated cell currents produce larger signals.
3. Tissue layers weaken and spread the voltage pattern.
4. Local cortical patches produce broad scalp maps.
5. Patches can reinforce or cancel at an electrode.
6. EEG rhythms and event responses have different meanings and uses.
7. Artifacts and recording noise can hide a rhythm.
8. Electrode contact affects voltage loss and added noise.
9. Overlapping rhythm changes complicate independent joint commands.
10. A brain response and its measurement both take time.
11. More electrodes give diminishing returns in the modeled task.
12. Named brain states share a few scalp signals, so one reading confuses most of them.

The model sections keep their longer explanations, figure descriptions and assumptions under toggles.
Sections 5 and 6 place explanations beside their diagrams.

Physical claims carry citation markers; hovering it shows the claim and its
verification status. The verification log and reference list are generated from `src/data/claims.ts`
and `src/data/references.ts`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, hot reload on every save
npm test           # unit tests for head, lead-field, channel and arm models
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
                  population.ts, electrode.ts, noise.ts, fft.ts, linalg.ts, control.ts (channel and electrode-count estimates), arm.ts (joint-control simulation)
src/sections/     one module per page section (text in two columns, then a laptop-width figure with its sliders)
src/ui/           layout.ts (section/figure grid, In depth toggles), slider.ts (sliders with caret marks, readouts),
                  plot.ts (D3 line plot), profile.ts (vertical potential profile), strips.ts (small multiples),
                  field.ts (glow field renderer, grids, cortex layers, neuron and probe glyphs), citation helpers
src/data/         references.ts (bibliography), claims.ts (every assumption + status), params.ts (defaults),
                  leadfield-svd.json (realistic-head singular values), head-leadfield.json (128 × 5,124 lead field, int16,
                  electrode and source positions for the head views in sections 4 and 9)
scripts/          leadfield_svd.py and export_head_leadfield.py (MNE-Python), verification-report.mjs, merge-audit.mjs
tests/            vitest unit tests
docs/             verification.md, the independent audit of every claim
```

## Changing a number

Edit the claim in `src/data/claims.ts` (statement, value, refs, status) and the default in
`src/data/params.ts`. Sections cite claims by id with `claimCite('id')`, so the citation marker, hover
card and verification-log entry all follow.
