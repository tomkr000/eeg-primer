"""Run with the MNE environment: python -m unittest discover -s tests -p 'test_leadfield_generation.py'."""
import importlib.util
from pathlib import Path
import unittest

import mne
import numpy as np

spec = importlib.util.spec_from_file_location('leadfield_svd', Path(__file__).parents[1] / 'scripts' / 'leadfield_svd.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class MontageCoordinates(unittest.TestCase):
    def test_standard_montages_are_transformed_not_relabeled(self):
        for name in ['biosemi64', 'biosemi128', 'biosemi256', 'fsaverage_1020', 'fsaverage_1005']:
            with self.subTest(name=name):
                native = mne.channels.make_standard_montage(name)
                pos = native.get_positions()
                transform = mne.channels.compute_native_head_t(native)
                actual = generator.montage_positions(name, Path('/unused'))
                for ch, rr in actual.items():
                    expected = mne.transforms.apply_trans(transform, pos['ch_pos'][ch])
                    np.testing.assert_allclose(rr, expected, atol=1e-12)
                self.assertGreater(np.linalg.norm(next(iter(actual.values())) - pos['ch_pos'][next(iter(actual))]), 0.03)

    def test_biosemi_vertex_has_fiducial_origin_offset(self):
        vertex = generator.montage_positions('biosemi128', Path('/unused'))['A1']
        np.testing.assert_allclose(vertex, [0, 0, 0.095 * (1 - np.cos(np.deg2rad(115)))], atol=1e-12)


if __name__ == '__main__':
    unittest.main()
