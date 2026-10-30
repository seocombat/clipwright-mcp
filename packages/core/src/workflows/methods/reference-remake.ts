import { REFERENCE_BEAT_ROLES } from '../../reference-profile.js';
import { defineWorkflowMethod, nativeLimitations, nativeQa, verticalOutput } from './shared.js';

const script = 'Missed calls cost you customers. It answers every call and books the visit. Here is one at two in the morning. ' +
    'It books the cleaning while you sleep. Set it up today.';

export const referenceRemake = defineWorkflowMethod({
    id: 'reference-remake', version: 1, content_digest: 'aedecd3beda09830de0ab34ec955bab980ce9e87d2b89d7223b606ba00c9fea4', authoring_status: 'ready',
    title: 'Remake a reference ad in its style with your script',
    purpose: 'Lay an accepted script on the beats, graphics, captions and sounds of an analysed reference ad, without changing a word.',
    required_inputs: ['audience', 'message', 'script'], required_features: ['exact_script', 'actor', 'voice', 'long_form'],
    script_rules: { structure: [...REFERENCE_BEAT_ROLES], role_order: 'revisits', instructions: [
        'Compile this plan with plan_reference_remake from a reference_profile and the accepted script; the server maps the reference beats onto script spans.',
        'A role may return, as the reference returns to a demo, but each beat starts after the one before it.',
        'Copy techniques, never the reference: no faces, voices, music, brands or quoted words of it.',
    ] },
    binding: { kind: 'native', skill: 'make_ugc', profile: 'ugc-native-v1', visual_beats: 'advisory' }, output: verticalOutput,
    limitations: [...nativeLimitations, 'Graphics that need media come only from supplied ast_* assets; the plan generates nothing and names each gap in warnings.',
        'Runs only where native long-form qualification is on, and bills the presenter\'s face seconds on the long-form tariff.'], qa_policy: nativeQa,
    example: { brief: { audience: 'Owners of small service businesses', message: 'Every missed call is a lost customer', script,
        native: { skill: 'make_ugc', input: { script, actor_id: 'actor_marcus' } } },
        beats: [{ id: 'hook', role: 'hook', anchor: { quote: 'Missed calls cost you customers' }, required: false },
            { id: 'demo', role: 'demo', anchor: { quote: 'It answers every call' }, required: false },
            { id: 'proof', role: 'proof', anchor: { quote: 'Here is one at two in the morning' }, required: false },
            { id: 'demo-again', role: 'demo', anchor: { quote: 'It books the cleaning' }, required: false },
            { id: 'cta', role: 'cta', anchor: { quote: 'Set it up today' }, required: false }] },
});
