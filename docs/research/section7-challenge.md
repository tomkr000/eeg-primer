# Section 7 challenge: "A head with EEG can operate only a few dimensions"

## (a) Verdict

The conclusion (a handful of dimensions) is right, but it is reached by the wrong physics: it compares a cancelled, under-sized motor signal with the wrong noise, and its numbers (4 of 5, ceiling 23) are artefacts of the 1 µV and 10 mm defaults. The binding limit on a sensorimotor-rhythm brain–computer interface (BCI) is the brain's own activity in the same band, read in about a second, which leaves each volitional area at a signal-to-noise ratio (SNR) near one; the skull's blur only caps the count at a few dozen.

## (b) The three biggest problems

### 1. The noise floor omits the dominant noise

Model: a patch counts when the 2-norm of its residual over 128 electrodes exceeds one contact's noise (1 µV): a one-sample matched filter against spatially white noise.

Why wrong: the electrodes also carry the brain's own electroencephalography (EEG), 10 to 100 µV (claim `eeg-amplitude`), which arrives through the same lead field, is spatially correlated, and removes most of the √128 gain. With background from independent cortical sources whitened into the greedy residual: 1 µV root mean square (rms) of background per electrode drops the count from 4 to 0; at 10 µV each motor patch sits at per-sample SNR 0.1 to 0.2. Time averaging helps little: a 3 Hz band in McFarland et al. 2010's 400 ms window has about 2.4 independent samples, 1 s at 4 Hz about 8, so SNR gains ×1.5 to ×2.8, not hundreds.

Evidence: Iivanainen et al. 2019 (arXiv:1912.05401, section 4.4.2, figure 11): 8 EEG components with SNR > 1 in a 3 cm motor region under white sensor noise, 4 with background sources at only 1/100 of the region's variance (NeuroImage 2021, 245:118747, figure 10: maximum EEG SNR 0.3 with coloured noise). Blankertz et al. 2010 (NeuroImage 51:1303, N = 80): the height of the sensorimotor-rhythm peak above a 1/f fit at Laplacian C3/C4 predicts BCI accuracy (r = 0.53); about 20% of users never reach criterion.

### 2. "Only 20 to 26 distinct scalp patterns exist at all" is unsupported

Model: the ceiling tiles the cortex with 10 mm, 10 nA·m patches and counts singular values above 1 µV (23); the prose equates this with the 99%-variance count and calls it a limit "however many electrodes are added".

Why wrong: the variance-fraction count says nothing about resolvability, and the above-noise count is purely an SNR statement: in the page's own lead field, independent point sources of 0.1, 1 and 10 nA·m give 4, 26 and 82 components above 1 µV. The tiled ceiling is also a radius artefact (55 at 4 mm, 23 at 10 mm, 6 at 30 mm) because every tile keeps 10 nA·m, so the total cortical moment scales as 1/r². It measures the assumed source strength, not the head.

Evidence: Iivanainen et al. 2021 (section 3.2, figure 6): for sources with SNR 10, "at maximum ... 91 components are above noise" in EEG. Ryynänen et al. 2004 (IEEE Transactions on Biomedical Engineering 51:1547), cited for "electrodes beyond the skull's resolution only sample the same blur again", conclude the opposite: arrays up to 256 electrodes help at low noise, less as noise grows. Delorme et al. 2012 (PLoS ONE 7:e30135): 34 near-dipolar components out of 71 channels bounds nothing physical.

### 3. The signal is mis-sized, the callout is a mesh artefact, and "3 dimensions" is a different quantity

Model: each motor patch gives 0.3 to 0.9 µV peak from 10 nA·m; the left hand is "not counted"; the record is 3.

Why wrong: averaging lead-field columns over a 10 mm disc of folded cortex cancels 70 to 90% of the moment, so it is not the 10 nA·m equivalent dipole of claim `cells-for-10nam`. Mirror hand patches differ 2.3× in scalp norm (0.82 versus 1.87 µV) from mesh geometry, and the "not counted" patch moves with the radius: right hand at 6 to 8 mm, left hand at 10 to 20 mm, feet at 30 mm. A coherent 10 nA·m dipole at the same sites gives 1.1 to 1.9 µV peak and, against 5 to 10 µV of in-band background in a 1 s window, SNR 1 to 2 for all five: borderline, where real BCIs live.

Evidence: McFarland et al. 2010 (Journal of Neural Engineering 7:036007, Table 1) built the three dimensions as adaptive linear mixtures of log amplitudes in 3 Hz bands at C3, C4, Cz and CPz; for user 3 one feature (C3 at 10 Hz) feeds two dimensions. Those are learned mixtures, not distinct patches. More classes are distinguishable in cued trials: four at kappa 0.57 (Tangermann et al. 2012, Frontiers in Neuroscience 6:55, dataset 2a; about 0.6 bit per 4 s trial); seven, including compound imagery, at 70% (Yi et al. 2013, Journal of NeuroEngineering and Rehabilitation 10:106, Table 1; about 1.2 bit per trial).

## (c) What is right and should stay

The lead-field machinery, the drag-to-move head, the pivoted QR and singular value decomposition (SVD) counting, and the order of ideas: volition restricts the areas, blur merges neighbours, noise sets the threshold. Blur does cap distinguishable patterns at a few dozen in EEG's SNR range (Iivanainen 2021; Srinivasan 1998). The intracortical and flicker-speller comparisons are fair.

## (d) What section 7 should claim and plot

Claim: "A scalp BCI operates a handful of dimensions because each area a person can modulate at will is read against the brain's own activity in the same band within about a second, which leaves it at SNR near one, worth roughly half a bit per second. Four to seven such areas can be told apart in cued trials; three have been driven at once. Blur caps distinct scalp patterns at a few dozen at this SNR, far beyond what volition supplies."

Smallest change: (1) add the brain's in-band background as a second noise term (independent cortical sources scaled by a per-electrode rms slider, default 10 µV, claim `eeg-amplitude`), whitening the greedy residual by its covariance; (2) make each patch a coherent dipole of the stated moment (export source normals, normalise the vector sum) and drop the "left hand not counted" callout; (3) add a window slider (0.4 to 4 s, marks at McFarland 2010's 0.4 s and the competition's 4 s) multiplying SNR by √(2BT), bandwidth B = 3 Hz, window T.

Figure: keep the head; beside it one bar per patch, height = whitened SNR in the window, dashed floor at SNR 1, second axis in bits per second, 0.5·log2(1 + SNR²)/T, with markers at 0.1 to 0.15 bits/s for four-class imagery (Tangermann 2012), 10 to 25 bits/min (Wolpaw 2002) and 5.32 bits/s for flicker selection (Chen 2015). Readouts: areas above SNR 1, their bits/s, and distinct patterns above noise as a curve against source strength (4 to 82), not a fixed 23. New claims: background rms (Chi 2010; Malmivuo 1995); count versus SNR (Iivanainen 2021, figure 6; 2019, figure 11); class accuracies (Tangermann 2012; Yi 2013); predictor (Blankertz 2010).

Not verified by me: Ryynänen 2004 (from the page's audit note) and any absolute mu amplitude in µV (no stated number found).
