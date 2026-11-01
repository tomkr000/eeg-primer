"""
Lead-field singular-value analysis on a realistic (non-spherical) head versus a fitted sphere.

Realistic head: the MNE-Python `fsaverage` template — a three-layer boundary-element model (BEM: inner
skull, outer skull, scalp; 2562 vertices / 5120 triangles per surface; conductivities 0.3, 0.006, 0.3 S/m) with a cortical
source space (icosahedral subdivision, fixed orientation normal to the cortical surface).
Sphere: a three-layer concentric sphere fitted to the same BEM surfaces, with the same conductivities,
the same sources and the same electrodes — so geometry is the only difference.

For each electrode layout the fixed-orientation, average-referenced lead field L (channels × sources) is
decomposed by singular values. With independent, identically distributed sources of rms moment q and
white sensor noise of rms n, component k is resolvable when s_k·q > n; the number of components needed
to explain a given fraction of the signal variance is computed from the cumulative s_k².

Output: src/data/leadfield-svd.json (normalised singular values per model and montage).

Usage:  python scripts/leadfield_svd.py [--ico 4|5] [--subjects-dir DIR]
Needs:  pip install mne nibabel   (fsaverage is downloaded on first use, ~300 MB)
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import mne

CLASSIC_1020 = ['Fp1', 'Fp2', 'F7', 'F3', 'Fz', 'F4', 'F8', 'T7', 'C3', 'Cz', 'C4', 'T8', 'P7', 'P3', 'Pz', 'P4', 'P8', 'O1', 'O2']


def montage_positions(name, subjects_dir):
    """Electrode positions in the head coordinate frame (metres) for a standard montage."""
    if name == 'scalp-mesh':
        # every vertex of the fsaverage scalp (outer skin BEM surface) at the level of the 10-05 cap or above
        surf = mne.read_bem_surfaces(subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-5120-5120-5120-bem.fif', verbose=False)
        skin = [s for s in surf if s['id'] == mne.io.constants.FIFF.FIFFV_BEM_SURF_ID_HEAD][0]
        trans = mne.read_trans(subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-trans.fif')
        rr_head = mne.transforms.apply_trans(mne.transforms.invert_transform(trans), skin['rr'])  # MRI → head
        cap = montage_positions('fsaverage_1005', subjects_dir)
        zmin = min(p[2] for p in cap.values())
        keep = rr_head[:, 2] >= zmin
        return {f'S{i}': rr_head[i] for i in np.where(keep)[0]}
    # MNE ≥ 1.13 ships 10-20/10-05 templates fitted to fsaverage itself (fsaverage_1020 / fsaverage_1005)
    m = mne.channels.make_standard_montage(name)
    pos = m.get_positions()['ch_pos']
    if name == 'fsaverage_1020':
        pos = {k: v for k, v in pos.items() if k in CLASSIC_1020}
    return pos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ico', type=int, default=4)
    ap.add_argument('--subjects-dir', default='/tmp/subjects')
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[1] / 'src' / 'data' / 'leadfield-svd.json'))
    args = ap.parse_args()
    mne.set_log_level('WARNING')
    subjects_dir = Path(mne.datasets.fetch_fsaverage(subjects_dir=Path(args.subjects_dir), verbose=False)).parent
    bem_file = subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-5120-5120-5120-bem-sol.fif'
    bem = mne.read_bem_solution(bem_file, verbose=False)
    layers = [(s['id'], s['sigma'], s['np']) for s in bem['surfs']]
    print('BEM layers (id, sigma, nvert):', layers)

    # cortical source space, fixed orientation = surface normal
    src = mne.setup_source_space('fsaverage', spacing=f'ico{args.ico}', subjects_dir=subjects_dir, add_dist=False, verbose=False)
    n_src = sum(s['nuse'] for s in src)
    print('sources:', n_src)

    # union of all electrode layouts → one forward computation, rows sliced per montage afterwards
    montages = ['fsaverage_1020', 'biosemi64', 'biosemi128', 'biosemi256', 'fsaverage_1005', 'scalp-mesh']
    positions = {m: montage_positions(m, subjects_dir) for m in montages}
    all_pos = {}
    index = {}
    for m in montages:
        index[m] = []
        for ch, p in positions[m].items():
            key = f'{m}:{ch}'
            all_pos[key] = p
            index[m].append(key)
    names = list(all_pos)
    print({m: len(index[m]) for m in montages}, 'union', len(names))
    info = mne.create_info(names, 1000.0, 'eeg')
    info.set_montage(mne.channels.make_dig_montage(ch_pos={k: np.asarray(v) for k, v in all_pos.items()}, coord_frame='head'))
    trans = subjects_dir / 'fsaverage' / 'bem' / 'fsaverage-trans.fif'

    def fixed_leadfield(model, info_):
        # one hemisphere at a time to bound memory (the BEM intermediate is n_sources × 3 × n_bem_nodes)
        t0 = time.time()
        Ls, used = [], []
        for h in range(len(src)):
            fwd = mne.make_forward_solution(info_, trans=str(trans), src=mne.SourceSpaces([src[h]]), bem=model, eeg=True, meg=False, mindist=2.0, n_jobs=1, verbose=False)
            fwd = mne.convert_forward_solution(fwd, surf_ori=True, force_fixed=True, use_cps=True, verbose=False)
            Ls.append(fwd['sol']['data'].astype(np.float64))  # channels × sources, V per A·m
            used += [(h, int(v)) for v in fwd['src'][0]['vertno']]
            del fwd
        L = np.concatenate(Ls, axis=1)
        print(f'  forward {L.shape} in {time.time() - t0:.0f} s')
        return L, used

    # realistic head (MNE projects the electrodes onto the scalp surface of the BEM)
    L_bem, used_bem = fixed_leadfield(bem, info)
    # sphere fitted to the BEM surfaces: centre and mean radii of inner skull / outer skull / scalp
    surfs = {s['id']: s for s in bem['surfs']}
    F = mne.io.constants.FIFF
    skin_rr = surfs[F.FIFFV_BEM_SURF_ID_HEAD]['rr']
    r0 = skin_rr.mean(axis=0)
    radii = {sid: float(np.linalg.norm(surfs[sid]['rr'] - r0, axis=1).mean()) for sid in surfs}
    R = radii[F.FIFFV_BEM_SURF_ID_HEAD]
    rel = (radii[F.FIFFV_BEM_SURF_ID_BRAIN] / R, radii[F.FIFFV_BEM_SURF_ID_SKULL] / R, 1.0)
    sig = tuple(surfs[sid]['sigma'] for sid in (F.FIFFV_BEM_SURF_ID_BRAIN, F.FIFFV_BEM_SURF_ID_SKULL, F.FIFFV_BEM_SURF_ID_HEAD))
    # the sphere model is specified in head coordinates
    trans_obj = mne.read_trans(str(trans))
    r0_head = mne.transforms.apply_trans(mne.transforms.invert_transform(trans_obj), r0)
    print('sphere centre (head coords) m:', np.round(r0_head, 4), 'R', round(R, 4), 'relative radii', np.round(rel, 3), 'sigmas', sig)
    sphere = mne.make_sphere_model(r0=r0_head, head_radius=R, relative_radii=rel, sigmas=sig, verbose=False)
    # project the electrodes radially onto the sphere surface so none sits inside or above it
    proj_pos = {}
    for k, p in all_pos.items():
        d = np.asarray(p) - r0_head
        proj_pos[k] = r0_head + d / np.linalg.norm(d) * R
    info_sph = mne.create_info(names, 1000.0, 'eeg')
    info_sph.set_montage(mne.channels.make_dig_montage(ch_pos=proj_pos, coord_frame='head'))
    L_sph, used_sph = fixed_leadfield(sphere, info_sph)
    # the sphere model can only hold sources inside its innermost layer; restrict the BEM to the same subset
    keep = [i for i, u in enumerate(used_bem) if u in set(used_sph)]
    assert len(keep) == L_sph.shape[1], (len(keep), L_sph.shape)
    L_bem_sub = L_bem[:, keep]
    print(f'sources inside the fitted sphere: {len(keep)} of {len(used_bem)}')

    out = {
        'generated': time.strftime('%Y-%m-%d'),
        'mne_version': mne.__version__,
        'head_model': {
            'template': 'fsaverage (MNE-Python bundle)',
            'bem_file': bem_file.name,
            'layers': [{'id': int(i), 'sigma_S_per_m': float(s), 'vertices': int(n), 'triangles': 5120} for i, s, n in layers],
        },
        'sphere_model': {'relative_radii': [float(x) for x in rel], 'outer_radius_m': R, 'sigmas': [float(x) for x in sig]},
        'sources': {'spacing': f'ico{args.ico}', 'n': len(used_bem), 'n_inside_sphere': len(keep), 'orientation': 'fixed, normal to cortical surface', 'mindist_mm': 2.0},
        'models': {},
    }
    for label, L in (('bem', L_bem), ('bem_subset', L_bem_sub), ('sphere', L_sph)):
        out['models'][label] = {}
        for m in montages:
            rows = [names.index(k) for k in index[m]]
            Lm = L[rows]
            Lm = Lm - Lm.mean(axis=0, keepdims=True)  # average reference
            s = np.linalg.svd(Lm, compute_uv=False)
            s = s[s > 0]
            cum = np.cumsum(s ** 2) / np.sum(s ** 2)
            out['models'][label][m] = {
                'n_channels': len(rows),
                's1_V_per_Am': float(s[0]),
                'singular_values_normalised': [float(x) for x in (s / s[0])[:600]],
                'n_singular_values': int(len(s)),
                'components_90pct': int(np.searchsorted(cum, 0.90) + 1),
                'components_99pct': int(np.searchsorted(cum, 0.99) + 1),
            }
            print(f'{label:6s} {m:14s} ch={len(rows):4d}  s1={s[0]:.3e}  90%={out["models"][label][m]["components_90pct"]:4d}  99%={out["models"][label][m]["components_99pct"]:4d}')
    Path(args.out).write_text(json.dumps(out))
    print('wrote', args.out)


if __name__ == '__main__':
    main()
