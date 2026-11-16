import { methodDescriptor, type MethodDescriptorArgs } from '../../contracts/v1/workflow-catalog.js';

// 720p first: a plan that names no resolution is admitted at 720p, as a direct run is (#911, #1464); 1080p is taken when named.
export const verticalOutput = { formats: [{ aspect_ratio: '9:16' as const, resolution: '720p' as const }, { aspect_ratio: '9:16' as const, resolution: '1080p' as const }],
    timing: 'Selected duration is a target. Actual duration follows the accepted speech and is reported separately.' };
export const nativeLimitations = ['Planning, validation and approval create no paid work. Launch requires the native admission checks.',
    'Proposed visual beats are advisory. The current executor chooses its own actual shot layout.'];
export const nativeQa = ['Keep the exact accepted script, numbers, required terms and pronunciation.',
    'Check delivery, actual geometry and duration separately from human creative acceptance.'];
export const compositionReasons = [
    { kind: 'composition_not_qualified', path: 'binding', message: 'Rendering with this method is not available yet.' },
    { kind: 'tariff_not_chosen', path: 'binding', message: 'This method has no price yet. You can plan with it, but not run it.' },
];
/** The film binding of the two composition methods (#1461): an explainer film that must show every required beat or is not delivered. */
export const filmLimitations = ['Planning, validation and approval create no paid work. Launch requires the native admission checks.',
    'The film is drawn for the accepted script with a drawn presenter; pass a saved mascot to reuse one. It is priced as an explainer film.',
    'The narration must run at least about 21 seconds.',
    'A film that does not show every required beat as planned is not delivered and is not charged.'];
export function defineWorkflowMethod(value: MethodDescriptorArgs) { return methodDescriptor.parse(value); }
