import { methodDescriptor, type MethodDescriptorArgs } from '../../contracts/v1/workflow-catalog.js';

export const verticalOutput = { formats: [{ aspect_ratio: '9:16' as const, resolution: '1080p' as const }],
    timing: 'Selected duration is a target. Actual duration follows the accepted speech and is reported separately.' };
export const nativeLimitations = ['Planning, validation and approval create no paid work. Launch requires the native admission checks.',
    'Proposed visual beats are advisory. The current executor chooses its own actual shot layout.'];
export const nativeQa = ['Keep the exact accepted script, numbers, required terms and pronunciation.',
    'Check delivery, actual geometry and duration separately from human creative acceptance.'];
export const compositionReasons = [
    { kind: 'composition_not_qualified', path: 'binding', message: 'The composition executor and this output profile have not been qualified.' },
    { kind: 'tariff_not_chosen', path: 'binding', message: 'The owner has not selected a composition tariff. This method supports planning only.' },
];
export function defineWorkflowMethod(value: MethodDescriptorArgs) { return methodDescriptor.parse(value); }
