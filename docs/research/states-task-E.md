# Task E: absolute resting band amplitudes at the scalp (the model's scale)
Result path: docs/research/states-E.json (relative to /home/claude/eeg-primer-states). Read docs/research/states-BRIEF.md first.

The site's model needs, for an awake adult sitting quietly with the eyes open, the typical root-mean-square amplitude
(or absolute power in µV²) at the scalp of each rhythm, and the typical total power per band at a few sites. A previous
search found Barry et al. 2007 closed, Kan et al. 2017 with unexplained units and Gu et al. 2026 with doubtful units
(their values look like decibels). Find sources whose units are explicit and whose numbers can be trusted.

Topics (use these keys in "topic"):
1. `absolute-power-table`: any open table of absolute band power (µV²) or amplitude (µV) at rest (eyes open and/or
   eyes closed) in healthy adults for delta, theta, alpha and beta at frontal, central and parietal/occipital sites,
   with the unit stated (per band, not per hertz, or say which). Candidates: normative-database papers (e.g.,
   Bosch-Bayard J et al. 2020 "A quantitative EEG toolbox for the MNI neuroinformatics ecosystem: normative SPM of EEG
   source spectra", Frontiers in Neuroinformatics 14:33, or Valdés-Sosa's Cuban Human Brain Mapping Project papers;
   Hashemi A et al. 2016 eNeuro 3(6) Figure 3 gives mean log10 power in µV² per band at AF7/AF8/TP9/TP10 by age, eyes
   closed: read the means at age 30 if the figure is legible; the LEMON dataset papers (Babayan A et al. 2019
   Scientific Data 6:180308) or any paper reporting LEMON band powers; Thatcher's normative database papers; Gasser T
   et al. 1988 "Development of the EEG of school-age children and adolescents" (Electroencephalogr Clin Neurophysiol
   69:91-99) gives absolute power tables for children, which can anchor orders of magnitude).
2. `rhythm-amplitudes`: textbook or glossary statements of typical amplitudes: the alpha rhythm (eyes closed, occipital;
   e.g., 20-60 µV), the mu rhythm, the beta rhythm (fronto-central, < 30 µV), frontal midline theta (amplitude at Fz
   during tasks), waking delta (small) versus sleep slow waves (> 75 µV peak-to-peak criterion), propofol frontal alpha.
   Kane N et al. (2017) "A revised glossary of terms most commonly used by clinical electroencephalographers and
   updated proposal for the report format of the EEG findings", Clinical Neurophysiology Practice 2:170-185 (open
   access) is a good source for several of these; Niedermeyer's Electroencephalography textbook chapters for others.
3. `aperiodic-background`: the typical level and slope of the aperiodic (1/f) part of the resting scalp spectrum in
   adults, which sets how much non-rhythmic power sits in each band: Donoghue T et al. (2020) Nature Neuroscience
   23:1655-1665 ("Parameterizing neural power spectra into periodic and aperiodic components") reports exponents
   (about 1 to 2 at the scalp); any paper giving the aperiodic offset in log10 µV²/Hz for scalp EEG at rest. The site
   would use it to apportion a measured total power between the rhythm and the background.
4. `eyes-closed-ratio`: the eyes-closed over eyes-open ratio of occipital or parietal alpha power in healthy adults,
   from a source with explicit units or an explicit ratio (several studies report "alpha power roughly doubles to
   quadruples"); and the same ratio at frontal sites. Also whether theta and beta change with eye closure (direction
   and size). Barry RJ et al. (2007) Clinical Neurophysiology 118(12):2765-2773 (DOI 10.1016/j.clinph.2007.07.028) is
   the classic but closed; look for open papers that quote its table values, or other open studies with explicit power
   values in both conditions (e.g., Chen ACN et al. 2008 "EEG default mode network in the human brain: spectral
   regional field powers", NeuroImage 41:561-574; Jennings JR et al. 2016; Wan L et al. 2019 "From eyes-closed to
   eyes-open: role of cholinergic projections in EC-to-EO alpha reactivity revealed by combining EEG and MRI", Human
   Brain Mapping 40:1702-1712, open access).
