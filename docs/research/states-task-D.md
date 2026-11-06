# Task D: variability between people, between days, and artifacts
Result path: docs/research/states-D.json (relative to /home/claude/eeg-primer-states). Read docs/research/states-BRIEF.md first.

Topics (use these keys in "topic"):
1. `between-person`: how much resting band power varies between healthy adults: the standard deviation of log power
   (or the ratio between the 10th and 90th percentiles, or coefficient of variation) for absolute and for relative
   (fraction of total) power in the delta, theta, alpha and beta bands. Any large normative sample: Hashemi A et al.
   (2016) "Characterizing population EEG dynamics throughout adulthood", eNeuro 3(6) (over 6,000 people); John ER et
   al. (1988) Science 239:162–169 (neurometrics, log-transformed power is Gaussian across people); Smit DJA et al.
   (2005) Biological Psychology 71:271–287 (heritability of EEG power; between-subject variance); or the MIPDB / Child
   Mind Institute or LEMON datasets if a paper reports percentiles. The site needs a number for the spread of log power
   across people, separately for absolute and relative power if possible.
2. `test-retest`: test–retest reliability of resting band power in the same people across days to months
   (intraclass correlation or Pearson r per band), and the within-person day-to-day variation of log power. Candidates:
   Salinsky MC, Oken BS, Morehead L (1991) "Test-retest reliability in EEG frequency analysis", Electroencephalography
   and Clinical Neurophysiology 79(5):382–392; Näpflin M, Wildi M, Sarnthein J (2007) Clinical Neurophysiology
   118(11):2519–2524; Corsi-Cabrera M et al. (2007) Clinical Neurophysiology 118(1):9–21 (nine months, monthly);
   Gasser T, Bächer P, Steinberg H (1985) Electroencephalography and Clinical Neurophysiology 60(4):312–319; Dünkelberg
   et al.? Prefer sources that give both the between-subject spread and the within-subject spread.
3. `within-session`: how much band power drifts within a session (minutes), e.g., alpha power changes over a 10 min
   recording or with vigilance; Maltez J, Hyllienmark L, Nikulin VV, Brismar T (2004) "Time course and variability of
   power in different frequency bands of EEG during resting conditions", Neurophysiologie Clinique 34(5):195–202 is a
   candidate (coefficient of variation of power across epochs).
4. `emg-beta`: how much muscle activity adds to beta-band (13–30 Hz) scalp power at frontal and central sites in a relaxed
   person and with mild muscle tension, relative to genuine EEG: Goncharova II, McFarland DJ, Vaughan TM, Wolpaw JR
   (2003) "EMG contamination of EEG: spectral and topographical characteristics", Clinical Neurophysiology
   114(9):1580–1593 (numbers per site and contraction level); Whitham EM et al. (2007) Clinical Neurophysiology
   118(8):1877–1888 (paralysis: factor by which power at 20–30 Hz falls when muscle is removed, per site). The site
   needs the ratio of contaminated to clean beta power at frontal/central sites for relaxed sitting and for mild
   tension (clenched jaw or frown), and how variable that ratio is between windows.
5. `ocular`: how much blinks and eye movements add to delta, theta and alpha power at frontal sites when not removed:
   Hagemann D, Naumann E (2001) "The effects of ocular artifacts on (lateralized) broadband power in the EEG", Clinical
   Neurophysiology 112(2):215–231 (effect sizes per band and site); or any study giving the change in frontal band
   power before and after ocular artifact correction. Also the typical blink rate (about 15 per minute) and duration
   (about 0.3 s) if a primary source is handy.
6. `cross-subject`: for workload, drowsiness or emotion classifiers, the accuracy obtained within subject (calibrated
   per person) versus across subjects (no calibration), from the same study or a review: e.g., Roy RN et al. (2016)
   Journal of Neural Engineering 13:046019; Lan Z et al. (2019) "Domain adaptation techniques for EEG-based emotion
   recognition: a comparative study on two public datasets", IEEE TCDS; Li X et al. (2018) "Exploring EEG features in
   cross-subject emotion recognition", Frontiers in Neuroscience 12:162; Jiménez-Guarneros M, Gómez-Gil P (2020) on
   cross-subject workload. The site needs one or two clear within-vs-across comparisons with chance levels.
