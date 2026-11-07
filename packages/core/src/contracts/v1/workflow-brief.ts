import { z } from 'zod';
import { makeUgcInput, ugcSegment } from '../../skills.js';
import { makeFacelessInput } from '../../faceless-public.js';
import { MAX_MOVES } from '../../moves.js';
import { referenceProfileInput, referenceProfileRead } from '../../reference-profile.js';
import { workflowEvidenceSource } from './workflow-evidence.js';
import { workflowFormat, workflowFormatRead, workflowText } from './workflow-primitives.js';

/** The lines a plan adds beyond its reference (#1192): one a raised device count can reach, framing's sixty among them. */
export const WORKFLOW_ADDED_MAX = 200;
const nativeUgcSegments = makeUgcInput.shape.segments.unwrap();
const { minItems, maxItems } = z.toJSONSchema(nativeUgcSegments, { io: 'input' });
const strictUgcSegments = z.array(ugcSegment.strict().safeExtend({
    image_motion: ugcSegment.shape.image_motion.unwrap().strict().optional(),
})).meta({ minItems, maxItems }).pipe(nativeUgcSegments).optional();
// An empty layer list in a saved document means none (#1172): the run takes each list only with an item, so the key goes before it.
// The type stays the run's: only the empty list is let through, and it leaves the document as an absent key.
const noneWhenEmpty = <K extends 'inserts' | 'overlays' | 'layout_windows' | 'framing' | 'templates' | 'scenes' | 'presenter_gaze' | 'shots' | 'caption_emphasis'>(key: K) => {
    const native = makeUgcInput.shape[key] as z.ZodOptional<z.ZodArray<z.ZodType>>, list = native.unwrap();
    const { maxItems } = z.toJSONSchema(list, { io: 'input', unrepresentable: 'any' }) as { maxItems: number };
    return z.array(list.element).max(maxItems).transform(items => items.length ? items : undefined).pipe(native).optional() as unknown as (typeof makeUgcInput.shape)[K];
};
const workflowUgcInput = makeUgcInput.strict().safeExtend({ segments: strictUgcSegments, inserts: noneWhenEmpty('inserts'), overlays: noneWhenEmpty('overlays'),
    layout_windows: noneWhenEmpty('layout_windows'), framing: noneWhenEmpty('framing'), templates: noneWhenEmpty('templates'), scenes: noneWhenEmpty('scenes'),
    presenter_gaze: noneWhenEmpty('presenter_gaze'), shots: noneWhenEmpty('shots'), caption_emphasis: noneWhenEmpty('caption_emphasis') });
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
    // The reference's style the plan was compiled from; the document byte bound holds it (A1).
    reference_profile: referenceProfileInput.optional(),
    // What a compiled plan adds that its reference lacks (#1051), beside reference_profile.unmapped, what it lacks of the reference.
    added: z.array(workflowText(200)).max(WORKFLOW_ADDED_MAX).optional(),
    // The client's catalogue moves the plan could not draw on their words (#1175), said in the plan's warnings.
    move_warnings: z.array(workflowText(400)).max(MAX_MOVES).optional(),
    // The user's notes each script revision answered, oldest first (#921).
    review_notes: z.array(workflowText(2000)).max(50).optional(),
};
export const workflowBrief = z.strictObject(briefShape);
export type WorkflowBrief = z.infer<typeof workflowBrief>;
export type WorkflowBriefArgs = z.input<typeof workflowBrief>;
export const workflowBriefRead = z.looseObject({ ...briefShape,
    requested_format: workflowFormatRead.optional(), native: z.looseObject({ skill: z.string(), input: z.record(z.string(), z.unknown()) }).optional(),
    requirements: z.array(z.looseObject({ feature: z.string(), required: z.boolean() })).default([]),
    reference_profile: referenceProfileRead.optional(),
    references: z.array(z.looseObject({ kind: z.string(), reference: z.string(), url: z.string().optional(), observed_at: z.string().optional(), product_state: z.string().optional() })).default([]),
});
