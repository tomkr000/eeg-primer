# Page prose clarity review

Base: main at `3fba3c0`. Scope: the remaining In depth paragraphs, figure descriptions and assumption tables, plus American English throughout the site's own text. Sections 5 and 6 retain the earlier layout and explanations.

## Reader checks

First-time agents received only text extracted from their assigned section, with citation placeholders. They had no conversation history, source code or research notes. Each model section had its own reader; another reader checked the introduction and method notes. Reviewers paraphrased every paragraph and identified wording they could not explain.

| Section | Initial difficulty | Revision |
| --- | --- | --- |
| Introduction | Long topic list and an unclear reference to signals arriving late | Two short paragraphs describing the page and its purpose. |
| 1: Neuron | Undefined potential and dipole terms; measurements mixed with calculations | Define the quantities, identify the rat measurements, and label calculated voltages. |
| 2: Population | Timing, geometry and cell counts packed together; small cell-count area seemed to contradict large scalp-visible discharges | Separate these ideas and scope the epilepsy study to its recorded discharges. |
| 3: Head | Unexplained conductivity, exact-model wording and an outdated source default | Explain the layers in plain language; calculate the default from shared parameters; distinguish voltage in air from recording across a gap. |
| 4: Scalp maps | Four tasks versus five patches; model setup and anatomical claims tangled | Explain the patch count, template and reference; separate panel descriptions and display assumptions. |
| 7: Noise | An unfulfilled “three defenses” list; undefined amplifier formula; signal versus recording-noise confusion | Explain the main contaminants and amplifier rejection separately; label the trace as a synthetic recording. |
| 8: Electrodes | Divider fraction unclear; area claims and model scaling mixed; long assumption rows | Define the fraction, distinguish attenuation from added noise, and label the circuit settings as choices. |
| 9: Joint control | Two very long paragraphs; competition tasks presented as a biological ceiling | Separate measured responses, source mapping, optimistic assumptions and simulated outcomes. Explain the fifth joint's missing command. |
| 10: Delay | Cue timing treated as private intention timing; a universal typing floor inferred from different tasks | Separate biological observations from model timing. Explain cumulative readouts and retain only distinct, labeled timing examples. |
| 11: Electrode count | Independent contact noise confused with shared brain noise; unconverted cap counts overlaid on a whole-sphere axis | Explain the two noise types. Keep empirical cap counts in prose and remove the misleading overlays and system marks. |
| Method | Long algorithm lists and vague limits | Short paragraphs describing each group of models, with explicit evidence limits. |

Three second-round readers reviewed sections they had not seen in the first round. All could explain the main arguments. Their remaining questions prompted explicit distance-from-cell wording, typical voltage amplitude, noise-inclusive delay reference curves and removal of the cap-count overlay. These are language-model comprehension checks, not human usability studies.

## Citation and fidelity checks

An independent audit compared the revised wording with the claim registry and implementation. Corrections included:

- Cell-current estimates come partly from modeled source strengths, rather than direct measurements of the pictured synaptic current.
- The source default is 200,000 cells with 10% in step, not the old 100,000-cell example.
- The local probe threshold is distinct from scalp-contact noise. The incorrect linear detection-distance rule was removed.
- The drawn neuron body is 1.85 mm below the surface at the default geometry. The checked-in anatomical lead field has 5,124 sources.
- Patch weights are normalized for their current directions, rather than dividing total moment by source count alone.
- The muscle-noise simulation uses 20 Hz and 225 Hz filters at its default sample rate. The broader literature band is stated separately.
- Gaussian blink width, circuit parameters, peak mains amplitude, controller definitions and task success rules are recorded as model assumptions.
- Four imagery choices, a fifth joint with no command and the simulated success rates do not prove universal biological limits.
- Timing examples do not establish a universal minimum typing interval or a delay from a private decision.

New assumption entries document existing choices. Existing source-verification statuses were not upgraded. Published paper titles, author names and generated data keys retain their original spellings.

## Validation

- All cited claim IDs and reference keys resolve, with no duplicate claim IDs.
- Browser checks found no missing citation markers or broken reference links.
- Reviewed the revised paragraphs, labels, captions and timing comparison at laptop size. Checked narrow-screen prose and captions for internal overflow.
- All 33 existing tests and the production build pass. Physics calculations and simulation constants are unchanged; visual differences are labels, the corrected timeline and the removed cap-count annotations.
- README and project notes describe the current eleven sections and the revised modeling qualifications.
