import { compositionReasons, defineWorkflowMethod, filmLimitations, nativeQa, verticalOutput } from './shared.js';

const qa = [...nativeQa, 'Check glyph coverage, font availability, overflow, safe area and reveal/hold/end-card timing against measured words.'];
const script = 'The next workshop is ready. Bring one question and one idea from your own work. We meet on Thursday at 6 pm, in small groups of 8 people. ' +
    'Your mentor reads every idea before the session starts. Each group explores two ideas together and leaves with one clear next step. ' +
    'Coffee and snacks are on us, so come hungry and curious. Seats are limited, so pick early. Read the schedule and choose your session.';

export const kineticLaunch = defineWorkflowMethod({
    id: 'kinetic-launch', version: 1, content_digest: 'bd6a51d4b773b773238f6aa894feecc09d7aa7612363b77f09fd02147b61c33c', authoring_status: 'ready', title: 'Launch a message with exact moving text',
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

/** The method on the explainer film (#1461): offered while the faceless executor qualifies its profile, else the planning-only version 1. */
export const kineticLaunchFilm = defineWorkflowMethod({
    id: 'kinetic-launch', version: 2, content_digest: '617de92b6205c4366c5115ac53a3cb3cfe706c5a6e22457b86fe504ace5048bc', authoring_status: 'ready', title: 'Launch a message with exact moving text',
    purpose: 'Build a concise launch from accepted copy, selected narration and deliberate text emphasis, with one closing CTA.',
    required_inputs: ['audience', 'message', 'script'], required_features: ['exact_script', 'authored_scenes', 'accepted_word_clock'],
    script_rules: { structure: ['announcement', 'text_emphasis', 'brand', 'end_card'], instructions: [
        'Group exact accepted words by meaning, choose a few deliberate emphasis words, and finish with one brand and CTA.',
        'Preserve all numbers and punctuation. Each required beat shows the exact words of its quote anchor on screen once they are spoken; an end_card beat holds them to the end.',
    ] },
    binding: { kind: 'native', skill: 'make_faceless', profile: 'kinetic-launch-film-v1', visual_beats: 'enforced' }, output: verticalOutput,
    limitations: [...filmLimitations, 'Required beats use quote anchors in letters the film fonts draw (Latin and Cyrillic).'],
    qa_policy: qa,
    example: { brief: { audience: 'A small workshop community', message: 'Announce the next session', brand_intent: 'Quiet, clear typography', cta: 'Read the schedule', script,
        native: { skill: 'make_faceless', input: { input_mode: 'script', script, format: 'explainer', duration_seconds: 30 } } },
        beats: [{ id: 'announce', role: 'announcement', anchor: { quote: 'The next workshop is ready' }, required: true, visual: 'Reveal the exact announcement copy' },
            { id: 'time', role: 'text_emphasis', anchor: { quote: 'Thursday at 6 pm' }, required: true, visual: 'Emphasize the exact day and time' },
            { id: 'cta', role: 'end_card', anchor: { quote: 'Read the schedule' }, required: true, visual: 'Hold the accepted CTA after its spoken words' }] },
});
