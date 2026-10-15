import { defineWorkflowMethod, nativeLimitations, nativeQa, verticalOutput } from './shared.js';

export const ugcProductIntro = defineWorkflowMethod({
    id: 'ugc-product-intro', version: 1, content_digest: '5bdbc3b1b287e5b3a5c7af233addffb1ff7bd6b4fe8b7dd7882101f85ec3f63a', authoring_status: 'ready', title: 'Introduce a product through its benefit',
    purpose: 'Help a defined audience understand one verified product benefit and take one next step.',
    required_inputs: ['audience', 'message', 'product', 'script'], required_features: ['exact_script', 'actor', 'voice'],
    script_rules: { structure: ['opening', 'problem', 'solution', 'cta'], instructions: [
        'Begin with a concrete benefit, describe the audience problem, connect one supplied product fact to the solution, and end with one CTA.',
        'Use a presenter voice, never an invented customer testimonial. Do not invent prices, performance claims or product footage.',
    ] },
    binding: { kind: 'native', skill: 'make_ugc', profile: 'ugc-native-v1', visual_beats: 'advisory' }, output: verticalOutput,
    limitations: [...nativeLimitations, 'UGC captions and look are currently warned fields; required captions or look block this workflow.',
        'A product insert needs qualified long-form admission; choosing this method does not grant it.'], qa_policy: nativeQa,
    example: { brief: { audience: 'People managing several plants', product: 'A local plant-care checklist', message: 'Keep each watering task visible', cta: 'Open your checklist',
        script: 'Keep your watering tasks in one place. A missed note can leave a plant waiting. This checklist keeps each task visible. Open your checklist today.',
        native: { skill: 'make_ugc', input: { script: 'Keep your watering tasks in one place. A missed note can leave a plant waiting. This checklist keeps each task visible. Open your checklist today.', actor_id: 'actor_male' } } },
        beats: [{ id: 'benefit', role: 'opening', anchor: { quote: 'Keep your watering tasks in one place' }, required: false },
            { id: 'next-step', role: 'cta', anchor: { quote: 'Open your checklist today' }, required: false }] },
});
