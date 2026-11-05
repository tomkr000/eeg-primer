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
${c('eeg-reach')}, and I expect it to be the first to reach a dataset that could be considered foundational. Typing
by imagining rapid, natural finger movements looks very difficult in this site's model ${c('finger-count')}, but what
EEG is already good at (attentional state ${c('alpha-function')}, error catching ${c('error-potential')}, workload in
defined tasks ${c('theta-function')} and surprise ${c('p300-response')}) is still useful, particularly in the age of
AI.</p>
<p>I believe it could serve as an analog signal that tracks how a person is viewing content and helps align AI to the
human brain. EEG error signals have already supplied implicit feedback to learning agents in simple games and
corrected a robot's choices in real time ${c('errp-feedback')}. The step I would like to see tested is replacing the
current reinforcement learning from human feedback (RLHF) environment, where a person reads an output, types a
response and reads again, with a person simply reading outputs while eye tracking aligns the EEG signal to the token
being read. If it works, it could raise throughput and add a graded brain signal of attention, surprise and workload
alongside a written “I don’t like this because…”. Whether EEG read this way is reliable, how much information it
carries and whether it beats explicit feedback all remain to be demonstrated.</p>
<p>These ideas have already been discussed by others, for example in Saturnin Pugnet’s essay
<a href="https://phaselock.satpugnet.com/part-3" target="_blank" rel="noopener">Phase Lock</a> ${c('bci-rlhf')},
however I want to emphasize them here as much of this site is about limitations. That is not because I’m anti-EEG, but
because I want realistic expectations of the technology and for neurotech to thrive because people believe in it and
trust it. Failures that could have been stopped with back-of-the-napkin calculations need to be. The models presented
here are physics and anatomy-based, and in some cases they find simply not enough physical signal for the task
${c('finger-count')}. Scaling noise will only train noise. But the future of EEG is bright, and so are so many of the
other amazing modalities being pursued in neurotech.</p>`);
}
