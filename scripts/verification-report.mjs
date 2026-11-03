// Build docs/verification.md from the independent audit results and the resolved claims.
// Usage: node scripts/verification-report.mjs <audit-dir>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const results = readdirSync(dir).filter((f) => /^result-\d+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const byId = new Map(results.map((r) => [r.id, r]));
const claimsSrc = readFileSync('src/data/claims.ts', 'utf8');
const claims = eval(claimsSrc.slice(claimsSrc.indexOf('[', claimsSrc.indexOf('CLAIMS')), claimsSrc.lastIndexOf('];') + 1));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
const sections = ['', 'Neuron', 'Population', 'Head', 'Blur', 'Noise', 'Electrodes', 'Dimensions', 'Delays'];
let md = `# Verification log

Every claim on the site was fact-checked by an auditor that had not seen the site, the research notes, or the
other auditors' work. Each auditor received a batch of claims with their citations and was instructed to find
errors: open the cited source, locate the statement, and report SUPPORTED / PARTIAL / NOT_SUPPORTED / NO_ACCESS
with the evidence location and any discrepancy. Where a discrepancy was found, the claim text in
\`src/data/claims.ts\` was corrected and the correction is noted below; the status badge on the site reflects the
corrected statement.

Auditor verdicts on the original statements (${results.length} claims with sources): ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.
Two NO_ACCESS claims were re-verified by hand afterwards (see their rows). Resolved statuses:
${Object.entries(claims.reduce((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}.

| Claim | Section | Auditor verdict | Evidence | Discrepancy found | Resolution |
|---|---|---|---|---|---|
`;
for (const c of claims) {
  const r = byId.get(c.id);
  md += `| \`${c.id}\` | ${sections[c.section]} | ${r ? r.verdict : '— (assumption, no source)'} | ${esc(r?.evidence_location ?? '').slice(0, 220)} | ${esc(r?.discrepancy ?? '').slice(0, 400)} | **${c.status}**${c.note ? ' — ' + esc(c.note) : ''} |\n`;
}
md += `
## Bibliographic corrections made after the audit
- Fam et al. 2018: title corrected to "...A Postmortem Study and Literature Review".
- Khalil et al. 2024: title corrected to "...Further Evidence for a Genetic Role".
- Van Neste 2004: title corrected to "...according to pigmentation and scalp location during ageing".
- McCann, Pisano & Beltrachini 2021 correction (Brain Topogr 34:110–115) added; corrected brain-tissue conductivities adopted.
- Alizadeh-Taheri, Smith & Knight 1996 added as the source of the ~300 pF insulated-electrode capacitance (previously misattributed to Taheri et al. 1994, which was removed).
- Iivanainen et al. 2019 arXiv preprint added as a separate reference for the figures that appear only in the preprint.

## Known limitations recorded against claims
- Electrode impedances (Chi et al. 2010, Table I) were measured on the forearm with no skin-preparation details and no stated electrode area; the site uses them as per-cm² reference values for scalp electrodes.
- The scalp-thickness value rests on a two-patient case report stating a normal range; no normative study was located.
- The dura-thickness value is from the petrous apex (skull base), not the convexity.
- The relative permittivity of a hair/air gap is a modelling assumption (air, εr = 1).
- The dimensionality count in section 6 is a model-derived upper bound (flat source spectrum; "above the noise floor" criterion).
`;
writeFileSync('docs/verification.md', md);
console.log('wrote docs/verification.md', md.length, 'chars');
