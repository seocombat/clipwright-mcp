import { z } from 'zod';
import { facelessSceneAnchor } from '../../faceless-public.js';
import { uploadId } from '../../uploads.js';
import { MAX_URL_LENGTH } from '../../skills.js';
import { workflowDigest, workflowLocalId, workflowText } from './workflow-primitives.js';

export const workflowEvidenceSource = z.strictObject({
    kind: z.enum(['owner', 'url', 'capture']), reference: workflowText(2000),
    url: z.string().url().max(MAX_URL_LENGTH).optional(), observed_at: z.string().datetime().optional(), product_state: workflowText(2000).optional(),
});
export const claimEvidence = z.strictObject({
    id: workflowLocalId, text: workflowText(4000), required: z.boolean(), status: z.enum(['supplied', 'checked', 'unresolved']), source: workflowEvidenceSource,
});
export type ClaimEvidence = z.infer<typeof claimEvidence>;
export const claimEvidenceRead = z.looseObject({
    id: z.string(), text: z.string(), required: z.boolean(), status: z.string(),
    source: z.looseObject({ kind: z.string(), reference: z.string(), url: z.string().optional(), observed_at: z.string().optional(), product_state: z.string().optional() }),
});
export const workflowAnchorRead = z.union([
    z.looseObject({ startWord: z.number().int().nonnegative(), endWord: z.number().int().positive() }),
    z.looseObject({ quote: z.string(), occurrence: z.number().int().nonnegative().optional() }),
]);
export const protectedProductArea = z.strictObject({ x: z.number().min(0).lt(1), y: z.number().min(0).lt(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })
    .refine(area => area.x + area.width <= 1 && area.y + area.height <= 1, 'Protected product area exceeds source bounds');
export const assetBinding = z.strictObject({
    instance_id: workflowLocalId, asset_id: uploadId, content_digest: workflowDigest, anchor: facelessSceneAnchor,
    provenance: z.enum(['owner_supplied', 'generated_illustration', 'verified_capture']), rights: z.enum(['owner_authorized', 'licensed', 'unresolved']),
    purpose: z.enum(['product_proof', 'illustration', 'ui_proof']), protected_area: protectedProductArea.optional(),
});
export type AssetBinding = z.infer<typeof assetBinding>;
export const assetBindingRead = z.looseObject({
    instance_id: z.string(), asset_id: z.string(), content_digest: workflowDigest, anchor: workflowAnchorRead,
    provenance: z.string(), rights: z.string(), purpose: z.string(),
    protected_area: z.looseObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
});
