import { z } from "zod";

export const OUTPUT_PROVENANCE_VERSION = "clipwright-output-marking-v2";
export const OUTPUT_PROVENANCE_WATERMARK_PROFILE = "trustmark-python-0.9.2-q-bch5-strength1";
export const OUTPUT_PROVENANCE_VIDEO_WATERMARK_PROFILE = "trustmark-python-0.9.2-p-bch5-strength1";
export const OUTPUT_PROVENANCE_VIDEO_DETECTOR = "p2-temporal-presence-v1";
export const OUTPUT_PROVENANCE_VIDEO_QUALITY_CONTRACT = "p2-psnr35-human-reviewed-v1";
export const OUTPUT_PROVENANCE_C2PA_VERSION = "0.28.2";
export const OUTPUT_PROVENANCE_PUBLIC_PAYLOAD = "1011011110011000111111000000011111011111011100000110110110111";

/** INTERNAL server snapshot, never a client authorization or public request schema. */
export const outputProvenancePolicySchema = z.object({
  policy_version: z.literal(OUTPUT_PROVENANCE_VERSION),
  watermark_profile: z.literal(OUTPUT_PROVENANCE_WATERMARK_PROFILE),
  video_watermark_profile: z.literal(OUTPUT_PROVENANCE_VIDEO_WATERMARK_PROFILE),
  video_detector: z.literal(OUTPUT_PROVENANCE_VIDEO_DETECTOR),
  video_quality_contract: z.literal(OUTPUT_PROVENANCE_VIDEO_QUALITY_CONTRACT),
  c2pa_version: z.literal(OUTPUT_PROVENANCE_C2PA_VERSION),
  public_payload: z.literal(OUTPUT_PROVENANCE_PUBLIC_PAYLOAD),
  visible_ai_label: z.boolean(),
}).strict().readonly();

export type OutputProvenancePolicy = z.infer<typeof outputProvenancePolicySchema>;

const supportedSkill = z.enum(["make_ugc", "make_faceless", "edit_shot", "create_actor"]);

/** make_ugc includes long-form presenter video; only these runs default to a label. */
export function createOutputProvenancePolicy(skill: unknown, visibleAiLabel?: unknown): OutputProvenancePolicy {
  const lane = supportedSkill.parse(skill);
  const visible = visibleAiLabel === undefined ? lane === "make_ugc" : z.boolean().parse(visibleAiLabel);
  if (visible && lane !== "make_ugc") {
    throw new Error("Visible AI labeling is only supported for make_ugc presenter video");
  }
  return outputProvenancePolicySchema.parse({
    policy_version: OUTPUT_PROVENANCE_VERSION,
    watermark_profile: OUTPUT_PROVENANCE_WATERMARK_PROFILE,
    video_watermark_profile: OUTPUT_PROVENANCE_VIDEO_WATERMARK_PROFILE,
    video_detector: OUTPUT_PROVENANCE_VIDEO_DETECTOR,
    video_quality_contract: OUTPUT_PROVENANCE_VIDEO_QUALITY_CONTRACT,
    c2pa_version: OUTPUT_PROVENANCE_C2PA_VERSION,
    public_payload: OUTPUT_PROVENANCE_PUBLIC_PAYLOAD,
    visible_ai_label: visible,
  });
}

/** Both own columns must be explicitly projected; omitted columns are not legacy SQL NULL. */
export function readStoredOutputProvenance(row: unknown): OutputProvenancePolicy | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Output provenance requires a stored run row");
  }
  const raw = row as Record<string, unknown>;
  if (!Object.hasOwn(raw, "output_provenance_version") || !Object.hasOwn(raw, "output_provenance")
    || raw.output_provenance_version === undefined || raw.output_provenance === undefined) {
    throw new Error("Stored output provenance columns were not loaded");
  }
  if (raw.output_provenance_version === null || raw.output_provenance_version === "legacy") {
    if (raw.output_provenance !== null) throw new Error("Legacy output provenance must have SQL NULL policy");
    return null;
  }
  if (raw.output_provenance_version !== OUTPUT_PROVENANCE_VERSION) {
    throw new Error("Unsupported stored output provenance version");
  }
  return outputProvenancePolicySchema.parse(raw.output_provenance);
}

const nativeMarkerTupleSchema = z.tuple([
  z.string().regex(/^[01]*$/), z.boolean(), z.number().int(),
]);

/** This checks the public namespace, not AI origin/authorship. Malformed output throws. */
export function matchesPublicOutputMarker(nativeTuple: unknown): boolean {
  const [decoded, present, schema] = nativeMarkerTupleSchema.parse(nativeTuple);
  return present === true && schema === 1 && decoded === OUTPUT_PROVENANCE_PUBLIC_PAYLOAD;
}
