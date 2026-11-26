import { z } from "zod";
import { longFormBillingSummarySchema } from "./long-form-pricing.js";
import { partsBillingSummarySchema } from "./parts-pricing.js";
import { speechRhythmResult } from "./speech-rhythm-contract.js";
import { actorSelection } from "./actors.js";
import { createdActor } from "./account-actors.js";
import { faceBillingAdmissionTermsSchema } from "./billing-terms.js";
import { brollPolicy } from "./broll-policy.js";
import { facelessRunBilling } from "./faceless-price.js";
import { revisionBilling } from "./edit-billing.js";
import { SHOT_OPERATION_MODES, shotId } from "./edit-operations.js";
import { runGeneration } from "./generations-output.js";
import { postText } from "./post-text.js";
import { runVideo } from "./video-size.js";
import type { ANALYZE_CREATOR_SKILL } from "./creator-profile.js";
import type { OwnAgentSkill } from "./own-agent-price.js";
import type { ANALYZE_REFERENCE_SKILL } from "./reference-analysis.js";
import type { Skill } from "./skills.js";
import type { FIND_TRENDS_SKILL } from "./trend-search.js";

export const RUN_STATES = [
  "queued",
  "generating",
  "scripting",
  "tts",
  "avatar",
  "compositing",
  "uploading",
  "succeeded",
  "failed",
] as const;

export const runState = z.enum(RUN_STATES);
export type RunState = z.infer<typeof runState>;

export const VIDEO_URL_CHECK =
  "signed for GET only: HEAD returns 403. To check it without downloading, " +
  'use a ranged GET (curl -r 0-0), not curl -I.';

export const runStep = z.object({
  step: z.string(),
  state: z.enum(["pending", "running", "succeeded", "failed"]),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  artifacts: z
    .array(z.object({ kind: z.string(), url: z.string().url(), bytes: z.number().int() }))
    .default([]),
});

export const AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the actor, the voice and the lip sync are synthetic.";

export const FACELESS_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice, the opening clip and the images are synthetic.";

export const FACELESS_EXPLAINER_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice, the animation and the images in it are synthetic.";

export const FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice and the opening clip are synthetic, " +
  "and so is every image its author did not supply.";

export const FILM_CUT_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice is synthetic, and so is every picture and clip its author did not supply.";

export const FILM_RENDER_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice is synthetic, and so are any music made for it and every picture and clip its author " +
  "did not supply; any person shown in it may be synthetic too.";

export const FILM_STILLS_AI_DISCLOSURE_TEXT =
  "These images were generated with AI: every picture and clip in them that their author did not supply is synthetic, " +
  "and any person shown in them may be synthetic too.";

export const FILM_EDIT_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: any voice-over and any music made for it are synthetic, and so is every clip its author did not supply.";

export const FILM_EDIT_OWN_VIDEOS_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: any voice-over and any music made for it are synthetic, and so is every clip its author did not " +
  "supply; any person shown in it may be synthetic too.";

export const GENERATED_VIDEO_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: any sound is synthetic, and so is every frame its author did not supply.";

export const GENERATED_IMAGE_AI_DISCLOSURE_TEXT = "This image was generated with AI: the picture is synthetic.";

export const SHOT_CANDIDATE_AI_DISCLOSURE_TEXT =
  "This shot was generated with AI: any clip in it is synthetic, and so is every picture its author did not supply.";

export const VOICE_AI_DISCLOSURE_TEXT = "This audio was generated with AI: the voice is synthetic.";
export const HERO_AI_DISCLOSURE_TEXT = "These pictures were generated with AI: the hero's poses are synthetic.";
export const ACTOR_AI_DISCLOSURE_TEXT = "These pictures were generated with AI: the actor is synthetic.";

export const AI_DISCLOSURE_PLAIN_TEXT = "This video was generated with AI.";

export type RunSkill = Skill | OwnAgentSkill | typeof ANALYZE_REFERENCE_SKILL | typeof ANALYZE_CREATOR_SKILL | typeof FIND_TRENDS_SKILL;

export const RUN_AI_DISCLOSURE: Readonly<Record<RunSkill, string | ((input: unknown) => string) | null>> = Object.freeze({
  make_ugc: AI_DISCLOSURE_TEXT,
  revise_long_form: AI_DISCLOSURE_TEXT,
  make_faceless: (input: unknown) => (input as { format?: unknown } | null)?.format === "explainer" ? FACELESS_EXPLAINER_AI_DISCLOSURE_TEXT
    : facelessOwnImages(input) ? FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT : FACELESS_AI_DISCLOSURE_TEXT,
  create_actor: ACTOR_AI_DISCLOSURE_TEXT,
  edit_shot: SHOT_CANDIDATE_AI_DISCLOSURE_TEXT,
  generate_image: GENERATED_IMAGE_AI_DISCLOSURE_TEXT,
  generate_video: GENERATED_VIDEO_AI_DISCLOSURE_TEXT,
  film_render: FILM_RENDER_AI_DISCLOSURE_TEXT,
  film_stills: FILM_STILLS_AI_DISCLOSURE_TEXT,
  film_cut: FILM_CUT_AI_DISCLOSURE_TEXT,
  film_cut_preview: FILM_CUT_AI_DISCLOSURE_TEXT,
  film_edit: (input: unknown) => editCutsOwnVideos(input) ? FILM_EDIT_OWN_VIDEOS_AI_DISCLOSURE_TEXT : FILM_EDIT_AI_DISCLOSURE_TEXT,
  film_voice: VOICE_AI_DISCLOSURE_TEXT,
  film_hero: HERO_AI_DISCLOSURE_TEXT,
  film_take_frames: null,
  film_take_check: null,
  analyze_reference: null,
  analyze_creator: null,
  find_trends: null,
});

export function aiDisclosureText(skill: string, input: unknown): string {
  const entry = Object.hasOwn(RUN_AI_DISCLOSURE, skill) ? RUN_AI_DISCLOSURE[skill as RunSkill] : null;
  return typeof entry === "function" ? entry(input) : entry ?? AI_DISCLOSURE_PLAIN_TEXT;
}

export function facelessOwnImages(input: unknown): boolean {
  const stored = typeof input === "object" && input !== null
    ? input as { scene_images?: unknown; resolved_revision?: { own_images?: unknown } } : {};
  return stored.resolved_revision !== undefined ? stored.resolved_revision?.own_images === true
    : Array.isArray(stored.scene_images) && stored.scene_images.length > 0;
}

export function editCutsOwnVideos(input: unknown): boolean {
  const clips = typeof input === "object" && input !== null ? (input as { clips?: unknown }).clips : undefined;
  return Array.isArray(clips) && clips.some(clip => {
    const c = clip as { asset_id?: unknown; source?: { asset_id?: unknown } } | null;
    return typeof c?.asset_id === "string" || typeof c?.source?.asset_id === "string";
  });
}

export const AI_DISCLOSURE_EMBEDDED_METADATA_KEY = "ai-disclosure-embedded";

export function aiDisclosureObjectMetadata(text: string, embedded?: boolean): Readonly<Record<string, string>> {
  return { "ai-generated": "true", generator: "clipwright", "ai-disclosure": text,
    ...(embedded === undefined ? {} : { [AI_DISCLOSURE_EMBEDDED_METADATA_KEY]: String(embedded) }) };
}

export const AI_DISCLOSURE_OBJECT_METADATA = aiDisclosureObjectMetadata(AI_DISCLOSURE_TEXT);

export const runId = z.string().regex(/^run_[a-zA-Z0-9]+$/);

export const runCandidate = z.object({
  source_run_id: runId, root_run_id: runId, shot_id: shotId,
  kind: z.enum(["picture", "clip"]),
  operation_mode: z.enum(SHOT_OPERATION_MODES).nullable(),
  take: z.number().int().positive().safe().nullable(),
  preview_url: z.string().url().nullable(),
  usable_until: z.string().datetime().nullable(),
});
export type RunCandidate = z.infer<typeof runCandidate>;

export const RUN_ELEMENT_ORIGINS = ["library", "generated"] as const;
export const runElement = z.object({ id: z.string().min(1).max(64), kind: z.string().min(1).max(64), origin: z.enum(RUN_ELEMENT_ORIGINS) }).strict();
export type RunElement = z.infer<typeof runElement>;

export const run = z.object({
  run_id: runId,
  actor: actorSelection.optional(),
  skill: z.string(),
  state: runState,
  credits_reserved: z.number().int().nonnegative(),
  credits_charged: z.number().int().nonnegative().nullable(),
  balance_after_credits: z.number().int().nullable().optional(),
  billing_terms: faceBillingAdmissionTermsSchema.optional(),
  faceless_billing: facelessRunBilling.optional(),
  revision: z.object({
    source_run_id: runId, root_run_id: runId,
    quoted_credits: z.number().int().nonnegative(),
    billing: revisionBilling.nullable(),
  }).optional(),
  candidate: runCandidate.optional(),
  generation: runGeneration.optional(),
  resolved_broll_policy: brollPolicy.optional(),
  warnings: z.array(z.string()).default([]),
  error: z.string().nullable(),
  created_actor: createdActor.optional(),
  final_output: z
    .object({
      video_url: z.string().url(),
      video_url_unsubtitled: z.string().url().optional(),
      portrait_url: z.string().url().optional(),
      character_sheet_url: z.string().url().optional(),
      character_id: z.string().optional(),
      duration_seconds: z.number().positive(),
      long_form_billing: longFormBillingSummarySchema.optional(),
      parts_billing: partsBillingSummarySchema.optional(),
      face_duration_seconds: z.number().nonnegative().optional(),
      full_speech_duration_seconds: z.number().positive().optional(),
      face_credits_per_second: z.number().int().positive().optional(),
      face_tariff_id: z.string().min(1).optional(),
      speech_timing_gaps: speechRhythmResult.optional(),
      ai_generated: z.literal(true),
      ai_disclosure: z.string().min(1),
      requested_aspect_ratio: z.string().optional(),
      vendor_aspect_ratio: z.string().optional(),
      final_aspect_ratio: z.string().optional(),
      composition_policy: z.string().optional(),
      elements: z.array(runElement).max(64).optional(),
      post_text: postText.optional(),
    })
    .nullable(),
  video: runVideo.optional(),
  steps: z.array(runStep).default([]),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type Run = z.infer<typeof run>;

export const SUCCEEDED_STATE = "succeeded" as const;
export const FAILED_STATE = "failed" as const;

export const TERMINAL_STATES = [SUCCEEDED_STATE, FAILED_STATE] as const;

export const runRead = run.extend({ state: z.string() });
export type RunRead = z.infer<typeof runRead>;

export type RunMoneyField = Extract<keyof RunRead, `credits_${string}` | "balance_after_credits">;

export const RUN_MONEY_FIELDS: readonly RunMoneyField[] = Object.keys(run.shape).filter(
  (field): field is RunMoneyField => field.startsWith("credits_") || field === "balance_after_credits",
);

export function runMoney(read: Pick<RunRead, RunMoneyField>): Pick<RunRead, RunMoneyField> {
  return Object.fromEntries(RUN_MONEY_FIELDS.map((field) => [field, read[field]])) as Pick<
    RunRead,
    RunMoneyField
  >;
}

export function isTerminal(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export const RUN_WAIT_MAX_SECONDS = 50;
export const runQuery = z.object({
  wait_seconds: z.coerce.number().int().min(0).max(RUN_WAIT_MAX_SECONDS).optional()
    .describe(`Wait up to this many seconds (at most ${RUN_WAIT_MAX_SECONDS}) for the run to succeed or fail before answering.`),
});
export type RunQuery = z.infer<typeof runQuery>;
