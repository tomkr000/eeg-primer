import { describe, expect, it } from 'vitest';
import svd from '../src/data/leadfield-svd.json';
import head from '../src/data/head-leadfield.json';

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
    expect(svd.coordinate_frame).toBe('head');
    expect(svd.models.bem['scalp-mesh'].n_channels).toBe(1833);
    expect(svd.models.bem.fsaverage_1020.components_99pct).toBe(15);
    for (const m of montages.filter((k) => k !== 'fsaverage_1020')) {
      expect(svd.models.bem[m].components_99pct).toBeGreaterThanOrEqual(21);
      expect(svd.models.bem[m].components_99pct).toBeLessThanOrEqual(23);
      expect(svd.models.bem[m].components_90pct).toBeGreaterThanOrEqual(7);
      expect(svd.models.bem[m].components_90pct).toBeLessThanOrEqual(7);
      expect(svd.models.bem_subset[m].components_99pct).toBeGreaterThanOrEqual(16);
      expect(svd.models.bem_subset[m].components_99pct).toBeLessThanOrEqual(17);
      expect(svd.models.sphere[m].components_99pct).toBeGreaterThanOrEqual(15);
      expect(svd.models.sphere[m].components_99pct).toBeLessThanOrEqual(16);
    }
    expect(svd.sources.n).toBe(20484);
    expect(svd.sources.n_inside_sphere).toBe(14001);
  });
});

it('places the head-frame vertex electrode above the cortical crown', () => {
  expect(head.coordinate_frame).toBe('head');
  const vertex = head.electrodes.pos_mm[head.electrodes.names.indexOf('A1')];
  expect(Math.hypot(vertex[0], vertex[1])).toBeLessThan(2);
  expect(vertex[2]).toBeGreaterThan(Math.max(...head.sources.pos_mm.map(p => p[2])));
  // Independent MNE native-to-head transform and nearest-triangle projection, in mm.
  expect(vertex[2]).toBeCloseTo(145.0, 1);
});
