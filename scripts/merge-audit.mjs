// Merge independent audit results (research/audit/result-*.json) into a summary table and
// print the verdict for every claim so statuses in src/data/claims.ts can be set by hand.
// Usage: node scripts/merge-audit.mjs <audit-dir>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const results = readdirSync(dir).filter((f) => /^result-\d+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const by = new Map(results.map((r) => [r.id, r]));
const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
console.log(JSON.stringify(counts));
for (const r of [...results].sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`\n[${r.id}] ${r.verdict}  (${r.evidence_location ?? ''})`);
  if (r.quote) console.log(`  quote: ${r.quote}`);
  if (r.discrepancy) console.log(`  discrepancy: ${r.discrepancy}`);
  if (r.suggested_fix) console.log(`  fix: ${r.suggested_fix}`);
  if (r.bibliographic_issues) console.log(`  biblio: ${r.bibliographic_issues}`);
}
export { by };
