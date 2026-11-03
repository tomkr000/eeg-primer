"""
Export a compact realistic-head lead field for the browser (the head views of sections 4 and 7).

fsaverage three-layer BEM (MNE-Python), ico-4 cortical sources (5124 vertices, about 4 mm apart, fixed
orientation normal to the cortex; ico-3 at 7 mm left a 10 mm patch with only 4 to 7 points, so mirror-image
patches came out up to twice as strong as each other), BioSemi-128 electrodes fitted to the same head. The
lead field is average-referenced, in µV per nA·m, quantised to int16 with one scale per source (base64), with
electrode and source positions in head coordinates (mm).

Usage: python scripts/export_head_leadfield.py   →  src/data/head-leadfield.json
"""
import base64
import json
from pathlib import Path

import numpy as np
import mne

mne.set_log_level('WARNING')
subjects_dir = Path(mne.datasets.fetch_fsaverage(subjects_dir=Path('/tmp/subjects'), verbose=False)).parent
bem = mne.read_bem_solution(subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-5120-5120-5120-bem-sol.fif', verbose=False)
src = mne.setup_source_space('fsaverage', spacing='ico4', subjects_dir=subjects_dir, add_dist=False, verbose=False)
montage = mne.channels.make_standard_montage('biosemi128')
info = mne.create_info(montage.ch_names, 1000.0, 'eeg')
info.set_montage(montage)
trans = str(subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-trans.fif')
fwd = mne.make_forward_solution(info, trans=trans, src=src, bem=bem, eeg=True, meg=False, mindist=2.0, verbose=False)
fwd = mne.convert_forward_solution(fwd, surf_ori=True, force_fixed=True, use_cps=True, verbose=False)
L = fwd['sol']['data']  # channels × sources, V per A·m
L = L - L.mean(axis=0, keepdims=True)  # average reference
L_uv_per_nAm = (L * 1e-3)  # V/(A·m) → µV/(nA·m)
scale = (np.abs(L_uv_per_nAm).max(axis=0) / 32767.0).astype(np.float32)  # one scale per source
L_q = np.round(L_uv_per_nAm / scale).astype(np.int16)

# positions in head coordinates (mm): the forward solution's source space is already in head coordinates
assert all(s['coord_frame'] == mne.io.constants.FIFF.FIFFV_COORD_HEAD for s in fwd['src'])
src_head = np.concatenate([s['rr'][s['vertno']] for s in fwd['src']]) * 1e3
hemi = np.concatenate([np.full(len(s['vertno']), i) for i, s in enumerate(fwd['src'])])
# electrode positions: the template montage is a sphere; MNE projects EEG electrodes onto the BEM scalp for the
# forward computation, so report the projected positions (nearest scalp-surface vertex, head coordinates, mm)
trans_obj = mne.read_trans(trans)
skin = [s_ for s_ in bem['surfs'] if s_['id'] == mne.io.constants.FIFF.FIFFV_BEM_SURF_ID_HEAD][0]
skin_head = mne.transforms.apply_trans(mne.transforms.invert_transform(trans_obj), skin['rr']) * 1e3
el_template = np.array([montage.get_positions()['ch_pos'][c] for c in montage.ch_names]) * 1e3
el = np.array([skin_head[np.argmin(np.linalg.norm(skin_head - p, axis=1))] for p in el_template])
centre = skin_head.mean(axis=0)

out = {
    'description': 'fsaverage 3-layer BEM (0.3/0.006/0.3 S/m), ico-4 cortical sources with fixed normal orientation, BioSemi-128 electrodes, average reference; lead field in µV per nA·m as base64 int16 (row-major channels × sources) times one float32 scale per source',
    'mne_version': mne.__version__,
    'electrodes': {'names': montage.ch_names, 'pos_mm': np.round(el, 1).tolist(), 'note': 'projected onto the fsaverage scalp surface, head coordinates'},
    'scalp_centre_mm': np.round(centre, 1).tolist(),
    'sources': {'pos_mm': np.round(src_head, 1).tolist(), 'hemi': hemi.tolist(), 'n': int(L.shape[1])},
    'leadfield': {'shape': list(L.shape), 'units': 'uV per nA·m', 'int16_base64': base64.b64encode(L_q.tobytes()).decode('ascii'), 'scale_float32_base64': base64.b64encode(scale.tobytes()).decode('ascii')},
}
out_path = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'head-leadfield.json'
out_path.write_text(json.dumps(out))
print('wrote', out_path, out_path.stat().st_size // 1024, 'KB; lead field', L.shape, 'max |L| µV/nA·m', float(np.abs(L_uv_per_nAm).max()), 'quantisation error max', float(np.abs(L_q * scale - L_uv_per_nAm).max()))
