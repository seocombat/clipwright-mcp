import { z } from "zod";
import { buildFacelessVoiceWarnings } from "./faceless-voices.js";
import { facelessMotionStyleWarnings } from "./faceless-public.js";
import { motionStyle } from "./skills.js";
import { compositionVersionOf, parseSkill, resolvedScript, storedUgcInput, type MakeUgcInput } from "./skills.js";
import { storedCreateActorInput } from "./account-actors.js";
import { ANALYZE_CREATOR_SKILL } from "./creator-profile.js";
import { FIND_TRENDS_SKILL } from "./trend-search.js";
import { ANALYZE_REFERENCE_SKILL } from "./reference-analysis.js";
import { dispositionWarnings, legacyCaptionWarnings } from "./contract-dispositions.js";
import { buildSpeechModelWarnings, buildVoiceWarnings, TTS_MODELS, ttsModelBeforeV4Default } from "./voices.js";
import { buildActorGenderWarnings, buildVoiceActorMatchWarnings, presenterViewWarnings, renderedPresenterFraming, type Gender } from "./actors.js";
import { resolveAspectRatio, upscaleWarning } from "./aspect.js";
import { videoHoldWarnings } from "./ugc-video-media.js";
import { DEFAULT_RESOLUTION } from "./skills.js";
import {
  parseRunPreflight,
  sourceNotProbedWarning,
  VOICE_CATALOG_INCOMPLETE_WARNING,
  type AspectProbeFact,
  type RunPreflight,
  type VoicePreflightFact,
} from "./run-preflight.js";

// Writers store what cannot be derived; the reader derives the static warnings.

/** Voice gender comes FROM THE CALLER and is required: the voice catalog is not in the */
/** barrel, and a presets-only default would silently lose catalog voices. */
export type VoiceGenderResolver = (voice: string) => Gender | undefined;

/** The stored input is unreadable: there is nothing to list unhonored fields from. */
export const UNREADABLE_RUN_INPUT_WARNING =
  "run input could not be read: parameters that are accepted but not honored cannot be listed for this run";

/** The same for `create_actor`: it has no unhonored parameters, and an unreadable input fails uncharged. */
export const UNREADABLE_CREATE_ACTOR_INPUT_WARNING =
  "create_actor run input could not be read: a run that fails for this reason creates no actor and is not charged";

/** What a probe fact gives WITHOUT the input. `undefined` below is not a format default: only */
/** `warnings` are taken, and with `source === null` they do not depend on `requested`. */
function aspectWarningsWithoutInput(fact: AspectProbeFact | undefined): string[] {
  if (fact?.kind !== "failed") return [];
  const resolution = resolveAspectRatio({ requested: undefined, source: null });
  return [
    sourceNotProbedWarning(fact.error_class),
    ...(resolution.kind === "resolved" ? resolution.warnings : []),
  ];
}

// The format is derived from the probe fact by the same resolver as `quote`
// (`decideAspect` → `resolveAspectRatio`), so the two surfaces cannot diverge.
function aspectFactWarnings(
  fact: AspectProbeFact | undefined,
  input: MakeUgcInput,
): string[] {
  if (fact === undefined || fact.kind === "not_probed") return [];
  // A failure calls THE SAME function as the input-free path, so the two paths are
  // equal by structure, not by a coincidence that the next edit breaks.
  if (fact.kind === "failed") return aspectWarningsWithoutInput(fact);

  const source = { width: fact.width, height: fact.height, origin: "probed" as const };
  const resolution = resolveAspectRatio({ requested: input.aspect_ratio, source });
  // A refusal is unreachable here: a run with a format conflict is refused before insert (400).
  if (resolution.kind !== "resolved") return [];
  const upscale = upscaleWarning(source, input.resolution ?? DEFAULT_RESOLUTION, resolution.aspectRatio);
  return [...resolution.warnings, ...(upscale === null ? [] : [upscale])];
}

/** Voice preflight: the reader rebuilds the line, since it has no access to the vendor catalog. */
function voiceFactWarnings(fact: VoicePreflightFact | undefined): string[] {
  return fact?.kind === "catalog_incomplete" ? [VOICE_CATALOG_INCOMPLETE_WARNING] : [];
}

/** Derived warnings by run skill. `create_actor` has nothing to derive: its warnings are */
/** written at admission and not recomputed on read. */
export function derivedRunWarnings(
  storedInput: unknown,
  preflight: RunPreflight,
  skill: string,
  voiceGenderOf: VoiceGenderResolver,
): string[] {
  // An analysis and a creator profile are runs outside `SKILLS`: their own row writes their warnings (#1032).
  if (skill === ANALYZE_REFERENCE_SKILL || skill === ANALYZE_CREATOR_SKILL || skill === FIND_TRENDS_SKILL) return [];
  const parsed = parseSkill(skill);
  switch (parsed) {
    case "make_ugc":
      return ugcRunWarnings(storedInput, preflight, voiceGenderOf);
    case "create_actor":
      return storedCreateActorInput.safeParse(storedInput).success ? [] : [UNREADABLE_CREATE_ACTOR_INPUT_WARNING];
    case "make_faceless":
      return facelessRunWarnings(storedInput);
    // A candidate speaks no narration and has no input-derived line: its warnings are written by its run.
    case "edit_shot":
      return [];
    // A long-form revision re-renders stored media and speaks nothing new: its warnings are written by its run.
    case "revise_long_form":
      return [];
    // A generation's warnings are written at admission and by its run, never derived from input.
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
  motion_style: motionStyle.optional(),
});

/** The derived lines of a faceless run: its chosen voice against its script or brief, and a style with nothing to dress, as `quote` names them. */
function facelessRunWarnings(storedInput: unknown): string[] {
  const parsed = storedFacelessVoice.safeParse(storedInput);
  return parsed.success ? [...buildFacelessVoiceWarnings(parsed.data), ...facelessMotionStyleWarnings(parsed.data)] : [];
}

/** The pinned view, read beside `storedUgcInput`: widening that schema would change the timeline digest of runs admitted earlier. */
const pinnedView = z.object({ gender: z.enum(["female", "male"]).optional(), actor_id: z.string().optional(),
  asset: z.object({ aspect_ratio: z.string().optional(), framing: z.string().optional(), prop: z.string().optional(), width: z.number().optional() }).optional() });

// The disposition registry and the preset language warning; the raw `voice_id` warning
// is quote-only, since the run verifies the id itself.
function ugcRunWarnings(
  storedInput: unknown,
  preflight: RunPreflight,
  voiceGenderOf: VoiceGenderResolver,
): string[] {
  const parsed = storedUgcInput.safeParse(storedInput);
  if (!parsed.success) {
    // An unreadable input does not cancel the facts: everything derivable WITHOUT the
    // input is derived. An `ok` snap depends on the requested format, so it is absent.
    return [
      UNREADABLE_RUN_INPUT_WARNING,
      ...aspectWarningsWithoutInput(preflight.aspect),
      ...voiceFactWarnings(preflight.voice),
    ];
  }
  const { tts_model: storedModel, actor_snapshot: _snapshot, ...rest } = parsed.data;
  const pin = pinnedView.safeParse((storedInput as { actor_snapshot?: unknown }).actor_snapshot).data;
  const ttsModel = TTS_MODELS.find((model) => model === storedModel);
  // A removed model (`eleven_multilingual_v2`) reads as no model named: the voice's own one.
  const input: MakeUgcInput = { ...rest, tts_model: ttsModel };
  // The model admission pinned; a run admitted before it was pinned spoke what the rules of its day chose.
  const spokenModel = TTS_MODELS.find((model) => model === parsed.data.resolved_tts_model)
    ?? ttsModelBeforeV4Default({ ...input, script: resolvedScript(input) }, input.actor_gender);
  // The same ORDER as `quote`: dispositions, format, voice, so the two surfaces are
  // equal, not merely the same set.
  return [
    // Templates are judged against the face as rendered, the view the pin holds (#884 S5d).
    ...dispositionWarnings({ ...input, presenter_framing: renderedPresenterFraming(pin) }),
    ...videoHoldWarnings(input, parsed.data.insert_assets),
    ...(compositionVersionOf(parsed.data) === 1 ? legacyCaptionWarnings(input) : []),
    ...aspectFactWarnings(preflight.aspect, input),
    ...presenterViewWarnings(input, pin),
    ...buildVoiceWarnings({ voice: input.voice, script: resolvedScript(input) }),
    ...buildActorGenderWarnings(input),
    ...buildVoiceActorMatchWarnings(input, voiceGenderOf, pin?.gender),
    // The pinned gender does not feed MODEL choice: both genders' default voices share a
    // model. If they diverge, a test turns red.
    ...buildSpeechModelWarnings({ ...input, script: resolvedScript(input) }, input.actor_gender, spokenModel),
    ...voiceFactWarnings(preflight.voice),
    // The moves admission could not draw (#1175), pinned beside the input as the quote said them.
    ...storedStrings((storedInput as { move_warnings?: unknown }).move_warnings),
  ];
}

/** Strings of the `warnings` column; an unreadable value gives an empty list. */
function storedStrings(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is string => typeof item === "string");
}

/** A run's full `warnings[]`; derived lines in `quote` order. Preflight and skill are */
/** REQUIRED on purpose: an optional one would silently lose the fact for a new reader. */
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
