import { defineWorkflowMethod, nativeLimitations, nativeQa, verticalOutput } from './shared.js';

export const ugcFaqAnswer = defineWorkflowMethod({
    id: 'ugc-faq-answer', version: 1, content_digest: '267a26c7a5f6f605f4ffa88a68957809f4645e3ec8c5e645f6015275ccb508d3', authoring_status: 'ready', title: 'Answer one product question',
    purpose: 'Answer a single audience question directly, explain the supplied facts, and give a useful next step.',
    required_inputs: ['audience', 'message', 'question', 'script'], required_features: ['exact_script', 'actor', 'voice'],
    script_rules: { structure: ['answer', 'explanation', 'next_step'], instructions: [
        'Start with the answer to the supplied question. Explain only supplied facts, then state a concrete next step.',
        'Preserve product terms, numbers and pronunciation. Mark an unknown answer as unresolved instead of inventing reassurance.',
    ] },
    binding: { kind: 'native', skill: 'make_ugc', profile: 'ugc-native-v1', visual_beats: 'advisory' }, output: verticalOutput,
    limitations: [...nativeLimitations, 'The presenter is synthetic and must not be described as a real customer.',
        'Captions and look follow native UGC dispositions; they are not made available by this method.'], qa_policy: nativeQa,
    example: { brief: { audience: 'New Clipwright users', message: 'Explain the download step', question: 'Can I download the finished video?', cta: 'Open the completed run',
        script: 'Yes, you can download the finished MP4. Open the completed run and use its video link. Keep the file for your own review.',
        native: { skill: 'make_ugc', input: { script: 'Yes, you can download the finished MP4. Open the completed run and use its video link. Keep the file for your own review.', actor_id: 'actor_marcus' } } },
        beats: [{ id: 'direct-answer', role: 'answer', anchor: { quote: 'Yes, you can download the finished MP4' }, required: false },
            { id: 'how', role: 'next_step', anchor: { quote: 'Open the completed run' }, required: false }] },
});
