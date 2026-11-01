# Through the skull, dimly

An interactive, fully cited explorer of the physics that limits scalp electroencephalography (EEG) for
brain–machine interfaces (BMI). Six slider-driven models:

1. How far one neuron's extracellular signal reaches (point-source / dipole fields in grey matter)
2. How the field grows with population size — only with synchrony and aligned geometry; what glia do and do not add
3. Attenuation and blurring through cerebrospinal fluid (CSF), dura, skull and scalp (analytic multi-shell sphere)
4. Noise from outside the skull — muscle, blinks, mains, skin, amplifier — and what averaging buys
5. Electrode contact: wet gel, dry plate, dry over hair / air gap; area, hair thickness, amplifier input impedance
6. How many independent spatial patterns scalp EEG can resolve even with unlimited electrodes

Every number and physical statement carries a citation marker; hovering it shows the claim and its
verification status. The verification log and reference list are generated from `src/data/claims.ts`
and `src/data/references.ts`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — hot reload on every save
npm test           # unit tests for the multi-shell sphere solver
npm run build      # type-check + production build into dist/
```

## Layout

```
src/physics/      models: sphere.ts (multi-shell head), dipole.ts, population.ts, electrode.ts, noise.ts, dimensionality.ts
src/sections/     one module per page section (text + figure + sliders)
src/ui/           slider/readout widgets, D3 line plot, canvas heat map, citation helpers
src/data/         references.ts (bibliography), claims.ts (every assumption + status), params.ts (defaults)
tests/            vitest unit tests
docs/             verification.md — the independent audit of every claim
```

## Changing a number

Edit the claim in `src/data/claims.ts` (statement, value, refs, status) and the default in
`src/data/params.ts`. Sections cite claims by id with `claimCite('id')`, so the citation marker, hover
card and verification-log entry all follow.
