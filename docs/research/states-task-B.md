# Task B: meditation, relaxation, emotion, mind wandering, memory retention
Result path: docs/research/states-B.json (relative to /home/claude/eeg-primer-states). Read docs/research/states-BRIEF.md first.

Topics (use these keys in "topic"):
1. `meditation`: within-subject changes of frontal theta and alpha power during meditation relative to eyes-closed rest
   (focused-attention or mindfulness), with sizes. Candidates: Cahn BR, Polich J (2006) Psychological Bulletin
   132(2):180–211 (review); Lomas T, Ivtzan I, Fu CHY (2015) Neuroscience & Biobehavioral Reviews 57:401–410
   (systematic review of mindfulness EEG); Aftanas LI, Golocheikine SA (2001) Neuroscience Letters 310:57–60 (theta and
   alpha during Sahaja yoga meditation, with percentages); Lagopoulos J et al. (2009) Journal of Alternative and
   Complementary Medicine 15(11):1187–1192 (theta and alpha during nondirective meditation). Also one source showing
   that consumer "meditation" or "calm" scores are built from alpha/theta (a review is fine).
2. `relaxation`: within-subject alpha (and theta) power changes during deliberate relaxation with the eyes open
   (progressive muscle relaxation, slow breathing, biofeedback relaxation) relative to ordinary eyes-open rest, with
   sizes. If the literature mostly reports eyes-closed conditions, say so.
3. `valence`: the frontal alpha asymmetry (log right minus log left alpha power at F4 and F3, or the equivalent) shift
   between positive and negative affect inductions within subjects, with the size of the shift (in ln or log10 units of
   power) and how reliable it is. Candidates: Davidson RJ et al. (1990) Journal of Personality and Social Psychology
   58(2):330–341; Coan JA, Allen JJB (2004) Biological Psychology 67:7–50 (review); Allen JJB, Coan JA, Nazarian M
   (2004) Biological Psychology 67:183–218 (methods, typical asymmetry magnitudes); Harmon-Jones E, Gable PA,
   Peterson CK (2010) Biological Psychology 84:451–462. Also the between-person spread and test–retest stability of
   resting asymmetry (Hagemann D et al. 2002 Journal of Personality and Social Psychology 82:619–641; Towers DN,
   Allen JJB 2009 Psychophysiology 46:132–142).
4. `arousal`: within-subject band-power correlates of emotional arousal (calm vs excited) from EEG: direction and size,
   e.g., Koelstra S et al. (2012) "DEAP: a database for emotion analysis using physiological signals", IEEE Transactions
   on Affective Computing 3(1):18–31 (reported correlations between arousal/valence ratings and band powers, and the
   single-trial classification accuracies for arousal and valence against chance). Also one meta-analysis or review of
   EEG emotion-recognition accuracy within subject versus across subjects (e.g., cross-subject accuracies on DEAP/SEED).
5. `mind-wandering`: within-subject band-power differences between mind wandering and breath focus. Candidate:
   Braboszcz C, Delorme A (2011) "Lost in thoughts: neural markers of low alertness during mind wandering", NeuroImage
   54(4):3040–3047 (theta, delta, alpha, beta changes with sizes).
6. `memory-retention`: within-subject increases of posterior alpha and frontal theta power with the number of items held
   in working memory during the retention interval. Candidates: Jensen O, Gelfand J, Kounios J, Lisman JE (2002)
   Cerebral Cortex 12(8):877–882 (alpha); Jensen O, Tesche CD (2002) European Journal of Neuroscience 15(8):1395–1399
   (theta, MEG). Report the size of the change from the smallest to the largest load.
