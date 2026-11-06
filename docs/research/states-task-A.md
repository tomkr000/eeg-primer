# Task A: resting band amplitudes and the task-related states
Result path: docs/research/states-A.json (relative to /home/claude/eeg-primer-states). Read docs/research/states-BRIEF.md first.

Topics (use these keys in "topic"):
1. `rest-spectrum`: absolute band power (or rms amplitude in µV) of delta (0.5–4), theta (4–8), alpha (8–13) and beta
   (13–30 Hz) at rest in healthy adults, eyes open AND eyes closed, at frontal, central and parieto-occipital sites, with
   the eyes-closed over eyes-open ratio per band and region. Barry RJ, Clarke AR, Johnstone SJ, Magee CA, Rushby JA
   (2007) "EEG differences between eyes-closed and eyes-open resting conditions", Clinical Neurophysiology 118(12):
   2765–2773, is a candidate; find its tables or an equivalent normative table (any paper that tabulates absolute power
   per band and region in a healthy adult sample).
2. `workload`: within-subject changes of frontal midline theta and parietal/posterior alpha power with mental workload
   (n-back, mental arithmetic), relative to rest or to the easiest level: how much (ratio or % or dB) for low and for high
   load. Candidates: Gevins A, Smith ME, McEvoy L, Yu D (1997) Cerebral Cortex 7(4):374–385 ("High-resolution EEG
   mapping of cortical activation related to working memory"); Gevins & Smith (2003) Theoretical Issues in Ergonomics
   Science 4:113–131; Brouwer A-M et al. (2012) Journal of Neural Engineering 9:045008 (n-back, theta and alpha);
   Borghini G et al. (2014) Neuroscience & Biobehavioral Reviews 44:58–75 (review). Report the clearest numbers.
3. `focus-engagement`: how "attention", "focus" and "engagement" are defined from band powers in the literature
   consumer devices build on: the engagement index beta/(alpha+theta) (Pope AT, Bogart EH, Bartolome DS (1995)
   Biological Psychology 40:187–195; Freeman FG et al. (1999) Biological Psychology 50:61–76), the theta/beta ratio as an
   attention measure (Arns M, Conners CK, Kraemer HC (2013) Journal of Attention Disorders 17(5):374–383, a meta-analysis;
   or Angelidis A et al. 2016 on theta/beta ratio and attentional control). Also any within-subject number for alpha and
   beta power during a sustained-attention task relative to rest.
4. `drowsiness`: within-subject changes of delta, theta, alpha and beta power from alert to drowsy/fatigued (driving
   simulators, time on task). Candidate: Lal SKL, Craig A (2002) "Driver fatigue: electroencephalography and
   psychological assessment", Psychophysiology 39(3):313–321 (percentage increases per band); Jap BT, Lal S, Fischer P,
   Bekiaris E (2009) Expert Systems with Applications 36:2352–2359 (ratio indices); also the anteriorization of alpha
   with drowsiness if a quantitative source exists.
5. `stress`: within-subject EEG band-power changes during acute mental stress induction (arithmetic under time pressure,
   Trier social stress test, Stroop) relative to a relaxed baseline: alpha, beta, theta, frontal asymmetry, with sizes.
   Candidates: Alonso JF, Romero S, Ballester MR, Antonijoan RM, Mañanas MA (2015) Physiological Measurement
   36(7):1351–1365; Seo S-H, Lee J-T (2010) "Stress and EEG" (book chapter); Al-Shargie F et al. (2016) Biomedical
   Optics Express 7(10):3882 (review of EEG stress studies); Katmah R et al. (2021) Sensors 21(15):5043 (review). Say
   how consistent the direction of each band's change is across studies.
