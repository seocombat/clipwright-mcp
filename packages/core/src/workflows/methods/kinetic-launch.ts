import { compositionReasons, defineWorkflowMethod, nativeQa, verticalOutput } from './shared.js';

export const kineticLaunch = defineWorkflowMethod({
    id: 'kinetic-launch', version: 1, content_digest: 'a05f94e129e64c7f16bbc9e638c9aebfbfe6c62e74b1b41a150e4a0197557063', authoring_status: 'ready', title: 'Launch a message with exact moving text',
    purpose: 'Build a concise launch from accepted copy, selected narration and deliberate text emphasis, with one closing CTA.',
    required_inputs: ['audience', 'message', 'script'], required_features: ['exact_script', 'authored_scenes', 'accepted_word_clock'],
    script_rules: { structure: ['announcement', 'text_emphasis', 'brand', 'end_card'], instructions: [
        'Group exact accepted words by meaning, choose a few deliberate emphasis words, and finish with one brand and CTA.',
        'Preserve all numbers and punctuation. Resolve text reveals against the accepted word clock; unchanged copy reuses its accepted narration master.',
    ] },
    binding: { kind: 'blocked', skill: 'make_composition', profile: 'kinetic-launch-v1', reasons: compositionReasons }, output: verticalOutput,
    limitations: ['Planning only until the composition profile is qualified and its tariff chosen.',
        'A missing narration master is a readiness issue. Replanning must not silently buy new speech.'],
    qa_policy: [...nativeQa, 'Check glyph coverage, font availability, overflow, safe area and reveal/hold/end-card timing against measured words.'],
    example: { brief: { audience: 'A small workshop community', message: 'Announce the next session', brand_intent: 'Quiet, clear typography', cta: 'Read the schedule',
        script: 'The next workshop is ready. Bring one question and one idea. We will explore them together. Read the schedule and choose your session.' },
        beats: [{ id: 'announce', role: 'announcement', anchor: { quote: 'The next workshop is ready' }, required: true, visual: 'Reveal the exact announcement copy' },
            { id: 'cta', role: 'end_card', anchor: { quote: 'Read the schedule' }, required: true, visual: 'Hold the accepted CTA after its spoken words' }] },
});
