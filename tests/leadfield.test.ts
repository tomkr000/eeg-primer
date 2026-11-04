import { describe, expect, it } from 'vitest';
import svd from '../src/data/leadfield-svd.json';

// Keeps the numbers quoted in claim 'svd-counts' honest: if scripts/leadfield_svd.py is re-run and the
// counts move, this test fails and the claim text must be updated.
describe('precomputed lead-field singular values', () => {
  const montages = Object.keys(svd.models.bem) as (keyof typeof svd.models.bem)[];
  it('has normalized, monotonically decreasing singular values for every model and montage', () => {
    for (const model of ['bem', 'bem_subset', 'sphere'] as const) {
      for (const m of montages) {
        const s = svd.models[model][m].singular_values_normalised;
        expect(s[0]).toBe(1);
        for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1]);
        expect(svd.models[model][m].n_channels).toBeGreaterThan(0);
      }
    }
  });
  it('matches the counts quoted on the page', () => {
    expect(svd.models.bem.fsaverage_1020.components_99pct).toBe(12);
    for (const m of montages.filter((k) => k !== 'fsaverage_1020')) {
      expect(svd.models.bem[m].components_99pct).toBeGreaterThanOrEqual(21);
      expect(svd.models.bem[m].components_99pct).toBeLessThanOrEqual(23);
      expect(svd.models.bem[m].components_90pct).toBeGreaterThanOrEqual(6);
      expect(svd.models.bem[m].components_90pct).toBeLessThanOrEqual(7);
      expect(svd.models.bem_subset[m].components_99pct).toBeGreaterThanOrEqual(16);
      expect(svd.models.bem_subset[m].components_99pct).toBeLessThanOrEqual(18);
      expect(svd.models.sphere[m].components_99pct).toBeGreaterThanOrEqual(15);
      expect(svd.models.sphere[m].components_99pct).toBeLessThanOrEqual(16);
    }
    expect(svd.sources.n).toBe(20484);
    expect(svd.sources.n_inside_sphere).toBe(14001);
  });
});
