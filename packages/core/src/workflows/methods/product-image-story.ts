import { defineWorkflowMethod, nativeLimitations, nativeQa, verticalOutput } from './shared.js';

const script = 'This ceramic mug is shown in the supplied photograph. Start with its overall shape, then look at the wide handle in the second view. These pictures show the actual item, while the opening animation is only an illustration. Check the visible details against the supplied images. If a detail is not shown, ask for another photograph rather than guessing what it looks like.';
export const productImageStory = defineWorkflowMethod({
    id: 'product-image-story', version: 1, content_digest: 'f073ff5a7147a5f95add0ae90f168dc9e99ba1e2430daedbf84bfbb7e9abfa16', authoring_status: 'ready', title: 'Tell a product story with supplied images',
    purpose: 'Bind original product images to the exact words describing visible facts, preserving the distinction between proof and illustration.',
    required_inputs: ['audience', 'message', 'product', 'script', 'assets'], required_features: ['exact_script', 'voice', 'word_anchors', 'scene_images'],
    script_rules: { structure: ['product_context', 'visible_fact', 'image_evidence', 'decision'], instructions: [
        'Describe only product facts supported by the approved original images. Bind each image instance to a nonoverlapping word range or unambiguous quote.',
        'Reuse one asset through distinct instance IDs. Keep important product areas visible and make the illustrative opening explicit.',
    ] },
    binding: { kind: 'native', skill: 'make_faceless', profile: 'faceless-native-v1', visual_beats: 'advisory' }, output: verticalOutput,
    limitations: [...nativeLimitations, 'B1 places originals in supported IMAGE shots. The generated opener is illustrative and never exact product proof.',
        'An exact still-only slideshow or customer-only opener is unsupported and must block launch when required.',
        'Crop, motion and protected product area need placement preflight; this card does not itself verify media bytes.'], qa_policy: [...nativeQa, 'Compare product shots to the approved source bytes and protected areas.'],
    example: { brief: { audience: 'People comparing handmade mugs', message: 'Inspect the shape and handle', product: 'Photographed ceramic mug', script,
        native: { skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } } },
        beats: [{ id: 'shape', role: 'visible_fact', anchor: { quote: 'ceramic mug' }, required: false },
            { id: 'handle', role: 'image_evidence', anchor: { quote: 'wide handle' }, required: false }] },
});
