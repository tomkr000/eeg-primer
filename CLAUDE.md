# Project notes for Claude Code

Interactive, cited explainer of the physical limits of scalp EEG for brain–machine interfaces.
Vite + vanilla TypeScript + D3; no framework. `npm run dev` for hot reload, `npm test` for the solver tests, `npm run build` type-checks.

## Rules that keep the site rigorous
- Every number or physical statement shown on the page must map to a claim in `src/data/claims.ts` with at least one reference in `src/data/references.ts`, cited in the section text via `claimCite('<id>')`. Never type a number into prose without a claim.
- A claim's `status` is set only from an independent check of the source (see `docs/verification.md`): `verified`, `partially` (with the nuance in `note`), `unverified`, `derived` (follows from cited inputs), or `assumption` (a modelling choice with no literature value). Do not upgrade a status without opening the source.
- Default parameter values live in `src/data/params.ts` and must agree with the claim they cite.
- Spell out abbreviations on first use in page copy (e.g., "cerebrospinal fluid (CSF)").
- Keep code concise; prefer editing an existing module over adding a dependency.

## Physics
- `src/physics/sphere.ts` solves the concentric-shell head model analytically (Legendre expansion per degree, continuity of potential and radial current). Tests in `tests/sphere.test.ts` compare with the closed-form homogeneous sphere and check interface continuity — keep them green.
- Units are SI inside the physics modules (m, S/m, A·m, V); sections convert for display.
