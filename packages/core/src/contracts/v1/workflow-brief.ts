import { z } from 'zod';
import { makeUgcInput, ugcSegment } from '../../skills.js';
import { makeFacelessInput } from '../../faceless-public.js';
import { workflowEvidenceSource } from './workflow-evidence.js';
import { workflowFormat, workflowFormatRead, workflowText } from './workflow-primitives.js';

const nativeUgcSegments = makeUgcInput.shape.segments.unwrap();
const { minItems, maxItems } = z.toJSONSchema(nativeUgcSegments, { io: 'input' });
const strictUgcSegments = z.array(ugcSegment.strict().safeExtend({
    image_motion: ugcSegment.shape.image_motion.unwrap().strict().optional(),
})).meta({ minItems, maxItems }).pipe(nativeUgcSegments).optional();
const workflowUgcInput = makeUgcInput.strict().safeExtend({ segments: strictUgcSegments });
const [nativeFacelessScript, nativeFacelessBrief] = makeFacelessInput.options;
const nativeScript = nativeFacelessScript.shape.script;
const { minLength, maxLength } = z.toJSONSchema(nativeScript, { io: 'input' });
const exactFacelessScript = z.string().superRefine((value, context) => {
    const parsed = nativeScript.safeParse(value);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
}).meta({ minLength, maxLength });
// Reuse native validation while preserving raw text and a visible input shape for tools/list.
const workflowFacelessInput = z.discriminatedUnion('input_mode', [nativeFacelessScript.safeExtend({ script: exactFacelessScript }), nativeFacelessBrief]);
export const workflowNativeInput = z.discriminatedUnion('skill', [
    z.strictObject({ skill: z.literal('make_ugc'), input: workflowUgcInput }),
    z.strictObject({ skill: z.literal('make_faceless'), input: workflowFacelessInput }),
]);
export type WorkflowNativeInput = z.infer<typeof workflowNativeInput>;
export const workflowRequirement = z.strictObject({ feature: workflowText(80), required: z.boolean() });
const briefShape = {
    audience: workflowText(2000), message: workflowText(4000), script: workflowText(10_000).optional(), cta: workflowText(2000).optional(),
    question: workflowText(2000).optional(), product: workflowText(2000).optional(), topic: workflowText(2000).optional(), brand_intent: workflowText(2000).optional(),
    required_terms: z.array(workflowText(200)).max(100).default([]), requirements: z.array(workflowRequirement).max(100).default([]),
    requested_format: workflowFormat.optional(), native: workflowNativeInput.optional(), references: z.array(workflowEvidenceSource).max(100).default([]),
};
export const workflowBrief = z.strictObject(briefShape);
export type WorkflowBrief = z.infer<typeof workflowBrief>;
export type WorkflowBriefArgs = z.input<typeof workflowBrief>;
export const workflowBriefRead = z.object({ ...briefShape,
    requested_format: workflowFormatRead.optional(), native: z.object({ skill: z.string(), input: z.record(z.string(), z.unknown()) }).optional(),
    requirements: z.array(z.object({ feature: z.string(), required: z.boolean() })).default([]),
    references: z.array(z.object({ kind: z.string(), reference: z.string(), url: z.string().optional(), observed_at: z.string().optional(), product_state: z.string().optional() })).default([]),
});
