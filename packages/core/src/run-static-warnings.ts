import { z } from "zod";
import { buildFacelessVoiceWarnings } from "./faceless-voices.js";
import { facelessMotionStyleWarnings } from "./faceless-public.js";
import { facelessPauseTrimWarnings } from "./ad-pause-trim.js";
import { motionStyle } from "./skills.js";
import { compositionVersionOf, parseSkill, resolvedScript, storedUgcInput, type MakeUgcInput } from "./skills.js";
import { storedCreateActorInput } from "./account-actors.js";
import { ANALYZE_CREATOR_SKILL } from "./creator-profile.js";
import { FIND_TRENDS_SKILL } from "./trend-search.js";
import { isOwnAgentSkill } from "./own-agent-runs.js";
import { ANALYZE_REFERENCE_SKILL } from "./reference-analysis.js";
import { dispositionWarnings, legacyCaptionWarnings } from "./contract-dispositions.js";
import { buildSpeechModelWarnings, buildVoiceWarnings, TTS_MODELS, ttsModelBeforeV4Default } from "./voices.js";
import { buildActorGenderWarnings, buildVoiceActorMatchWarnings, presenterViewWarnings, renderedPresenterFraming, type Gender } from "./actors.js";
import { resolveAspectRatio, upscaleWarning } from "./aspect.js";
import { pictureQualityWarnings, videoHoldWarnings } from "./ugc-video-media.js";
import { LEGACY_RUN_RESOLUTION } from "./skills.js";
import {
  parseRunPreflight,
  sourceNotProbedWarning,
  VOICE_CATALOG_INCOMPLETE_WARNING,
  type AspectProbeFact,
  type RunPreflight,
  type VoicePreflightFact,
} from "./run-preflight.js";

export type VoiceGenderResolver = (voice: string) => Gender | undefined;

export const UNREADABLE_RUN_INPUT_WARNING =
  "run input could not be read: parameters that are accepted but not honored cannot be listed for this run";

export const UNREADABLE_CREATE_ACTOR_INPUT_WARNING =
  "create_actor run input could not be read: a run that fails for this reason creates no actor and is not charged";

function aspectWarningsWithoutInput(fact: AspectProbeFact | undefined): string[] {
  if (fact?.kind !== "failed") return [];
  const resolution = resolveAspectRatio({ requested: undefined, source: null });
  return [
    sourceNotProbedWarning(fact.error_class),
    ...(resolution.kind === "resolved" ? resolution.warnings : []),
  ];
}

function aspectFactWarnings(
  fact: AspectProbeFact | undefined,
  input: MakeUgcInput,
): string[] {
  if (fact === undefined || fact.kind === "not_probed") return [];
  if (fact.kind === "failed") return aspectWarningsWithoutInput(fact);

  const source = { width: fact.width, height: fact.height, origin: "probed" as const };
  const resolution = resolveAspectRatio({ requested: input.aspect_ratio, source });
  if (resolution.kind !== "resolved") return [];
  const upscale = upscaleWarning(source, input.resolution ?? LEGACY_RUN_RESOLUTION, resolution.aspectRatio);
  return [...resolution.warnings, ...(upscale === null ? [] : [upscale])];
}

function voiceFactWarnings(fact: VoicePreflightFact | undefined): string[] {
  return fact?.kind === "catalog_incomplete" ? [VOICE_CATALOG_INCOMPLETE_WARNING] : [];
}

export function derivedRunWarnings(
  storedInput: unknown,
  preflight: RunPreflight,
  skill: string,
  voiceGenderOf: VoiceGenderResolver,
): string[] {
  if (skill === ANALYZE_REFERENCE_SKILL || skill === ANALYZE_CREATOR_SKILL || skill === FIND_TRENDS_SKILL || isOwnAgentSkill(skill)) return [];
  const parsed = parseSkill(skill);
  switch (parsed) {
    case "make_ugc":
      return ugcRunWarnings(storedInput, preflight, voiceGenderOf);
    case "create_actor":
      return storedCreateActorInput.safeParse(storedInput).success ? [] : [UNREADABLE_CREATE_ACTOR_INPUT_WARNING];
    case "make_faceless":
      return facelessRunWarnings(storedInput);
    case "edit_shot":
      return [];
    case "revise_long_form":
      return [];
    case "generate_image":
    case "generate_video":
      return [];
    case null:
      return [UNREADABLE_RUN_INPUT_WARNING];
    default:
      return parsed satisfies never;
  }
}

const storedFacelessVoice = z.object({
  voice: z.string().optional(),
  script: z.string().optional(),
  brief: z.string().optional(),
  captions: z.boolean().optional(),
  templates: z.array(z.unknown()).optional(),
  scenes: z.array(z.unknown()).optional(),
  shots: z.array(z.unknown()).optional(),
  motion_style: motionStyle.optional(),
  pause_trim: z.unknown().optional(),
  format: z.string().optional(),
});

function facelessRunWarnings(storedInput: unknown): string[] {
  const parsed = storedFacelessVoice.safeParse(storedInput);
  return parsed.success ? [...buildFacelessVoiceWarnings(parsed.data), ...facelessMotionStyleWarnings(parsed.data),
    ...facelessPauseTrimWarnings(parsed.data)] : [];
}

const pinnedView = z.object({ gender: z.enum(["female", "male"]).optional(), actor_id: z.string().optional(),
  asset: z.object({ aspect_ratio: z.string().optional(), framing: z.string().optional(), prop: z.string().optional(), width: z.number().optional() }).optional() });

function ugcRunWarnings(
  storedInput: unknown,
  preflight: RunPreflight,
  voiceGenderOf: VoiceGenderResolver,
): string[] {
  const parsed = storedUgcInput.safeParse(storedInput);
  if (!parsed.success) {
    return [
      UNREADABLE_RUN_INPUT_WARNING,
      ...aspectWarningsWithoutInput(preflight.aspect),
      ...voiceFactWarnings(preflight.voice),
    ];
  }
  const { tts_model: storedModel, actor_snapshot: _snapshot, ...rest } = parsed.data;
  const pin = pinnedView.safeParse((storedInput as { actor_snapshot?: unknown }).actor_snapshot).data;
  const ttsModel = TTS_MODELS.find((model) => model === storedModel);
  const input: MakeUgcInput = { ...rest, tts_model: ttsModel };
  const spokenModel = TTS_MODELS.find((model) => model === parsed.data.resolved_tts_model)
    ?? ttsModelBeforeV4Default({ ...input, script: resolvedScript(input) }, input.actor_gender);
  return [
    ...dispositionWarnings({ ...input, presenter_framing: renderedPresenterFraming(pin) }),
    ...videoHoldWarnings(input, parsed.data.insert_assets),
    ...pictureQualityWarnings(input, parsed.data.insert_assets),
    ...(compositionVersionOf(parsed.data) === 1 ? legacyCaptionWarnings(input) : []),
    ...aspectFactWarnings(preflight.aspect, input),
    ...presenterViewWarnings(input, pin),
    ...buildVoiceWarnings({ voice: input.voice, script: resolvedScript(input) }),
    ...buildActorGenderWarnings(input),
    ...buildVoiceActorMatchWarnings(input, voiceGenderOf, pin?.gender),
    ...buildSpeechModelWarnings({ ...input, script: resolvedScript(input) }, input.actor_gender, spokenModel),
    ...voiceFactWarnings(preflight.voice),
    ...storedStrings((storedInput as { move_warnings?: unknown }).move_warnings),
    ...storedStrings((storedInput as { voice_warnings?: unknown }).voice_warnings),
    ...storedStrings((storedInput as { request_warnings?: unknown }).request_warnings),
  ];
}

function storedStrings(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is string => typeof item === "string");
}

export function composeRunWarnings(
  stored: unknown,
  storedInput: unknown,
  storedPreflight: unknown,
  skill: string,
  voiceGenderOf: VoiceGenderResolver,
): string[] {
  return [
    ...new Set([
      ...derivedRunWarnings(storedInput, parseRunPreflight(storedPreflight), skill, voiceGenderOf),
      ...storedStrings(stored),
    ]),
  ];
}
