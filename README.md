# Through the skull, dimly

An interactive, fully cited explorer of the physics that limits scalp electroencephalography (EEG) for
brain–machine interfaces (BMI). Six slider-driven models:

1. How far one neuron's extracellular signal reaches (point-source / dipole fields in grey matter)
2. How the field grows with population size (only with synchrony and aligned geometry); what glia do and do not add
3. Attenuation and blurring through cerebrospinal fluid (CSF), dura, skull and scalp (analytic multi-shell sphere)
4. Noise from outside the skull (muscle, blinks, mains, skin, amplifier) and what reaches the electrode
5. Electrode contact: wet gel, dry plate, dry over hair / air gap; area, hair thickness, amplifier input impedance
6. How many independent signals scalp EEG can carry: place synchronous patches (and patches inside their overlap) on a
   realistic head and count the scalp patterns that stand above the noise, using a precomputed lead field for the
   fsaverage boundary-element head (MNE-Python); plus the full lead-field singular-value ceiling

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

## Regenerating the realistic-head data

```bash
pip install mne nibabel
python scripts/leadfield_svd.py --ico 5     # downloads fsaverage (~300 MB) on first run; ~5 min; writes src/data/leadfield-svd.json
python scripts/export_head_leadfield.py     # compact ico-3 lead field + geometry for the section 6 head view; writes src/data/head-leadfield.json
npm test                                    # tests/leadfield.test.ts pins the counts quoted in claim 'svd-counts'
```

## Layout

```
src/physics/      models: sphere.ts (multi-shell head, including the potential in the air outside it), dipole.ts,
                  population.ts, electrode.ts, noise.ts, fft.ts, linalg.ts
src/sections/     one module per page section (text in two columns, then a laptop-width figure with its sliders)
src/ui/           layout.ts (section/figure grid), slider/readout widgets, plot.ts (D3 line plot), strips.ts (small
                  multiples), field.ts (glow field renderer and neuron glyph), citation helpers
src/data/         references.ts (bibliography), claims.ts (every assumption + status), params.ts (defaults),
                  leadfield-svd.json (realistic-head singular values), head-leadfield.json (128 × 1,284 lead field,
                  electrode and source positions for the section 6 head)
scripts/          leadfield_svd.py and export_head_leadfield.py (MNE-Python), verification-report.mjs, merge-audit.mjs
tests/            vitest unit tests
docs/             verification.md, the independent audit of every claim
```

## Changing a number

Edit the claim in `src/data/claims.ts` (statement, value, refs, status) and the default in
`src/data/params.ts`. Sections cite claims by id with `claimCite('id')`, so the citation marker, hover
card and verification-log entry all follow.
