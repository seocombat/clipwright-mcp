import { defineWorkflowMethod, nativeLimitations, nativeQa, verticalOutput } from './shared.js';

const script = 'A seed needs three simple things to begin growing. First, moisture helps the seed take in water. Next, suitable warmth supports its early growth. Finally, air allows the living seed to breathe. The exact conditions depend on the plant. Check the instructions for your seed before you start. Keep the steps in that order and watch for the first small root.';
export const facelessExplainer = defineWorkflowMethod({
    id: 'faceless-explainer', version: 1, content_digest: '58c1f9c2f5fa4c59e4d655331f29a72627e3a1980c300d09f868f141f94bb5a8', authoring_status: 'ready', title: 'Explain a topic in an ordered sequence',
    purpose: 'Make one topic or supplied list understandable through an opening, ordered explanation and takeaway.',
    required_inputs: ['audience', 'message', 'topic', 'script'], required_features: ['exact_script', 'voice', 'word_anchors'],
    script_rules: { structure: ['opening', 'ordered_points', 'takeaway'], instructions: [
        'Name the topic, explain the supplied points in their accepted order, and close with one takeaway.',
        'Freeze the narration before launch. Separate a target length from the measured output and do not promise exact final frames before speech.',
    ] },
    binding: { kind: 'native', skill: 'make_faceless', profile: 'faceless-native-v1', visual_beats: 'advisory' }, output: verticalOutput,
    limitations: [...nativeLimitations, 'The native profile is 9:16 at 1080p with an animated opening clip and image scenes.',
        'Duration, captions and voice follow the current faceless checks. This binding does not accept arbitrary scene layouts.'], qa_policy: nativeQa,
    example: { brief: { audience: 'First-time gardeners', message: 'Explain seed germination', topic: 'Three needs of a germinating seed', script,
        native: { skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } } },
        beats: [{ id: 'topic', role: 'opening', anchor: { quote: 'A seed needs three simple things' }, required: false },
            { id: 'moisture', role: 'ordered_points', anchor: { quote: 'First, moisture helps the seed take in water' }, required: false },
            { id: 'takeaway', role: 'takeaway', anchor: { quote: 'Check the instructions for your seed' }, required: false }] },
});
