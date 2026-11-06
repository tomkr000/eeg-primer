# Task C: sleep stages and anesthesia, and what consumer products claim to read
Result path: docs/research/states-C.json (relative to /home/claude/eeg-primer-states). Read docs/research/states-BRIEF.md first.

Topics (use these keys in "topic"):
1. `sleep-spectra`: band power of delta (0.5–4), theta (4–8), alpha (8–13), sigma (12–15) and beta (13–30 Hz) in sleep
   stages N1, N2, N3 and REM relative to relaxed wakefulness, within subjects, from a quantitative spectral study (any
   paper tabulating power per stage, e.g., in µV² or as ratios to wake). Candidates: Dijk D-J et al.; Uchida S et al.
   (1992–1994) on sigma and beta; De Gennaro L, Ferrara M, Bertini M (2001) "The boundary between wakefulness and
   sleep: quantitative electroencephalographic changes during the sleep onset period", Neuroscience 107(1):1–11;
   Marzano C et al. (2013) "Electroencephalographic sleep inertia of the awakening brain" Neuroscience; or a textbook
   table. The site needs the ratio of each stage's band power to wake, at a central or frontal site.
2. `sleep-staging`: the standard epoch length (30 s) and the EEG criteria for N1, N2, N3 (slow waves 0.5–2 Hz with
   amplitude > 75 µV occupying > 20% of the epoch) and REM from the American Academy of Sleep Medicine manual (Berry RB
   et al., any edition; or Iber C et al. 2007), plus inter-scorer agreement for manual staging (Rosenberg RS, Van Hout S
   (2013) Journal of Clinical Sleep Medicine 9(1):81–87: about 82.6% agreement) and one accuracy figure for automatic
   staging from a single EEG channel (e.g., Supratak A et al. 2017 IEEE TNSRE 25(11):1998–2008, DeepSleepNet; or the
   Dreem headband study Arnal PJ et al. 2020 Sleep 43(11):zsaa097).
3. `anesthesia`: the EEG signature of propofol-induced unconsciousness: the increase of frontal alpha (8–12 Hz) and slow
   (0.1–1 Hz) power in dB or as a ratio, and the shift of alpha from posterior to frontal (anteriorization), from Purdon
   PL et al. (2013) PNAS 110(50):E1142–E1151 ("Electroencephalogram signatures of loss and recovery of consciousness
   from propofol"); and the fact that the bispectral index and similar monitors update from a window of EEG of some
   length (give the window if a source states it, e.g., Rampil IJ (1998) Anesthesiology 89(4):980–1002).
4. `consumer-states`: a peer-reviewed review that lists what direct-to-consumer EEG products claim to measure
   (meditation depth, calm, focus, stress, engagement, excitement, drowsiness, sleep stages, workload). Candidate:
   Wexler A, Thibault R (2019) "Mind-reading or misleading? Assessing direct-to-consumer EEG devices marketed for
   wellness and their ethical and regulatory implications", Journal of Cognitive Enhancement 3:131–137; also any
   systematic review of consumer EEG applications (e.g., Sawangjai P et al. 2020 IEEE Access; Niso G et al. 2023
   NeuroImage "Wireless EEG: a survey of systems and studies"). The site will describe the marketed states generically
   without naming vendors; it needs a source that lists them. Record the list of claimed states each review gives.
5. `research-states`: a review that catalogs the mental states EEG studies classify (workload, fatigue, emotions,
   attention, stress) and reports typical classification accuracies and chance levels, within and across subjects.
   Candidates: Zander TO, Kothe C (2011) Journal of Neural Engineering 8:025005 (passive BCI); Roy RN, Charbonnier S,
   Campagne A, Bonnet S (2016) Journal of Neural Engineering 13:046019 (workload and fatigue, cross-task); Lotte F
   et al. (2018) Journal of Neural Engineering 15:031005 (review of classification algorithms, ten-year update);
   Saha S, Baumert M (2020) Frontiers in Computational Neuroscience 13:87 (intra- and inter-subject variability).
