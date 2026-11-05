import { claimCite as c } from '../data/params';
import { prose, plainSection } from '../ui/layout';

export function mountConclusion(root: HTMLElement) {
  const body = plainSection(root, 'conclusion', 'Conclusion');
  prose(body, `
<p>Despite the drawbacks I still believe that EEG is a powerful tool for the right applications. It has already
proven itself in many medical applications like epilepsy, sleep studies ${c('eeg-clinical-uses')} and monitoring the
depth of anesthesia during surgery ${c('eeg-anesthesia')}. In the consumer space it is being used for low bandwidth
applications where timing is less critical like meditation feedback, sleep tracking and drowsiness detection
${c('eeg-consumer-uses')}. It is by far the most accessible and widely distributed neurotech on the planet
${c('eeg-reach')} and will be the first to achieve a dataset that could be considered foundational. While typing will
be quite difficult (if even possible) to achieve ${c('finger-count')}, what it is already good at (attentional state
${c('alpha-function')}, error catching, workload ${c('theta-function')}, surprise ${c('evoked-map')}) is still useful,
particularly in the age of AI. It can be used as an analog signal that tracks how a person is viewing content and used
to align the AI to the human brain. The current reinforcement learning from human feedback (RLHF) environment, where a
person reads an output, types a response and reads again, could be replaced by a person simply reading outputs, and the
EEG signal aligned to the token the eye is pointed at. This would both increase throughput and use a graded, raw brain
signal that has more human meaning and information than an RLHF-based text response. “I don’t like this because…” is
replaced with a multi-dimensional signal that includes emotion, attention, and cognitive workload.</p>
<p>These ideas have already been discussed by others, for example in Saturnin Pugnet’s essay
<a href="https://phaselock.satpugnet.com/part-3" target="_blank" rel="noopener">Phase Lock</a> ${c('bci-rlhf')},
however I want to emphasize them here as much of this site is about limitations. That is not because I’m anti-EEG, but
because I want realistic expectations for the technology and for neurotech to thrive because people believe in it and
trust it. Failures that could have been stopped with back-of-the-napkin calculations need to be. The models presented
here are physics and anatomy-based. In some cases there is simply not enough physical signal ${c('finger-count')}.
Scaling noise will only train noise. But the future of EEG is bright, and so are so many of the other amazing
modalities being pursued in neurotech.</p>`);
}
