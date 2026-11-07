import { z } from "zod";
import { ACTOR_FULL_PORTRAIT_FACE_HEIGHT, ACTOR_WIDE_PORTRAIT_FACE_HEIGHT, actorIdScope } from "./account-actors.js";
import { expectedVendorFrame } from "./aspect.js";
import { sharpCropOf } from "./scene-place.js";
import { actorId, ASPECT_RATIOS, DEFAULT_RESOLUTION, RESOLUTIONS, type AspectRatio } from "./skills.js";
import { defaultVoiceOf, DEFAULT_VOICE_PRESET, speaksOwnVoices, VOICE_PRESETS } from "./voices.js";

export const ACTORS_PATH = "/v1/actors";

/** An account's personal actor: the quote is free, the run is paid. The API routes repeat */
/** these paths as literals, and a test keeps them equal. */
export const CREATE_ACTOR_QUOTE_PATH = "/v1/skills/create_actor/quote";
export const CREATE_ACTOR_RUN_PATH = "/v1/skills/create_actor/run";

/** A catalog actor's picture on the API's own host (#1125): short, stable and unsigned, so chat clients show it inline. */
export const ACTOR_PREVIEW_PATH = "/v1/public/actor-previews/:actor_id/:version/:file";

export interface ActorPreviewView {
  aspect_ratio: AspectRatio;
  framing?: "wide" | "full" | undefined;
  gaze?: "left" | "right" | undefined;
  prop?: "mic" | undefined;
}

/** One file name per view of a version: `9x16`, `9x16-wide-mic`, `16x9-left`. */
export function actorPreviewFile(view: ActorPreviewView): string {
  return `${[view.aspect_ratio.replace(":", "x"), view.framing, view.gaze, view.prop].filter(Boolean).join("-")}.png`;
}

export function actorPreviewUrl(origin: string, actor: { actor_id: string; version: number }, view: ActorPreviewView): string {
  return `${origin}/v1/public/actor-previews/${encodeURIComponent(actor.actor_id)}/${actor.version}/${actorPreviewFile(view)}`;
}

/** The path of one actor. The id is encoded, since it comes from the caller. */
export function actorItemPath(id: string): string {
  return `${ACTORS_PATH}/${encodeURIComponent(id)}`;
}
export type Gender = "female" | "male";
export interface AspectSource { width: number; height: number; origin: "default" | "probed" }
// Default portrait dimensions and gender were measured on 2026-09-09 (#64, D50).
export const DEFAULT_ACTOR_SOURCE: AspectSource = { width: 432, height: 768, origin: "default" };
export const DEFAULT_ACTOR = { gender: "male" as Gender };
export const DEFAULT_ACTOR_GENDER = DEFAULT_ACTOR.gender;
export type DefaultActor = { gender: Gender };
export interface ActorDescription extends DefaultActor { actor_id?: string; version?: number }

export function actorForInput(
  input: { image?: string | undefined; actor_id?: string | undefined },
  selected?: { actor_id: string; gender: Gender; version: number } | undefined,
): ActorDescription | null {
  if (input.actor_id !== undefined) {
    if (!selected || selected.actor_id !== input.actor_id || input.image !== undefined) {
      throw new Error("actor identity must be resolved before describing the actor");
    }
    return { actor_id: selected.actor_id, gender: selected.gender, version: selected.version };
  }
  return input.image === undefined ? DEFAULT_ACTOR : null;
}

export interface VoiceGenderInput {
  image?: string | undefined;
  actor_id?: string | undefined;
  actor_gender?: Gender | undefined;
  voice?: string | undefined;
  voice_id?: string | undefined;
  tts_model?: string | undefined;
}

/** Gender for the default voice: `actor_id` → pin; `image` → `actor_gender`; else the default actor. */
/** Only from the same actor's pin, not the catalog: personal actors are not in it. */
export function voiceGenderFor(
  input: VoiceGenderInput,
  pin?: { actor_id: string; gender: Gender } | undefined,
): Gender | undefined {
  if (input.actor_id !== undefined) {
    if (pin?.actor_id !== input.actor_id) {
      throw new Error("actor identity must be resolved before choosing its voice");
    }
    return pin.gender;
  }
  return input.image === undefined ? DEFAULT_ACTOR_GENDER : input.actor_gender;
}

export const IMAGE_DEFAULT_VOICE_WARNING =
  `no voice was chosen for the face in image: the default ${VOICE_PRESETS[DEFAULT_VOICE_PRESET].gender} ` +
  `voice "${DEFAULT_VOICE_PRESET}" is used; pass voice (from list_voices) or actor_gender to match the face`;

/** The same warning for the run's model: a model with its own voices names its default and where its voices are listed. */
export function imageDefaultVoiceWarning(ttsModel: string | undefined): string {
  if (!speaksOwnVoices(ttsModel)) return IMAGE_DEFAULT_VOICE_WARNING;
  const voice = defaultVoiceOf(ttsModel, undefined);
  return (
    `no voice was chosen for the face in image: the default ${voice.gender} voice "${voice.name}" of ${ttsModel} ` +
    `is used; pass voice (from list_voices with model=${ttsModel}) or actor_gender to match the face`
  );
}

export function actorGenderIgnoredWarning(field: "voice" | "voice_id"): string {
  return `actor_gender did not change the voice: the explicit ${field} is used as requested`;
}

export function voiceActorGenderWarning(voice: string, voiceGender: Gender, actorGender: Gender): string {
  return (
    `voice "${voice}" is ${voiceGender} and the actor is ${actorGender}: the run uses both as asked, ` +
    `so the face and the voice will not match. Choose a ${actorGender} voice from list_voices, ` +
    "or another actor, if that is not what you want."
  );
}

/** The actor's gender WITHOUT throwing: a pin's comes from the snapshot, not the catalog. */
function actorGenderOf(input: VoiceGenderInput, pinGender: Gender | undefined): Gender | undefined {
  if (input.actor_id !== undefined) return pinGender;
  return input.image === undefined ? DEFAULT_ACTOR_GENDER : input.actor_gender;
}

/** An explicit voice is used as requested, but a mismatch with the actor's gender is */
/** NAMED in warnings, never left silent. */
export function buildVoiceActorMatchWarnings(
  input: VoiceGenderInput,
  voiceGenderOf: (voice: string) => Gender | undefined,
  pinGender?: Gender | undefined,
): string[] {
  if (input.voice === undefined) return [];
  const voiceGender = voiceGenderOf(input.voice);
  const actorGender = actorGenderOf(input, pinGender);
  if (voiceGender === undefined || actorGender === undefined || voiceGender === actorGender) return [];
  return [voiceActorGenderWarning(input.voice, voiceGender, actorGender)];
}

/** Reads input fields only, without the pin: the run path calls it on the stored input. */
export function buildActorGenderWarnings(input: VoiceGenderInput): string[] {
  const explicit = input.voice_id !== undefined ? "voice_id" : input.voice !== undefined ? "voice" : undefined;
  if (input.actor_gender !== undefined) {
    return explicit === undefined ? [] : [actorGenderIgnoredWarning(explicit)];
  }
  return input.image !== undefined && explicit === undefined ? [imageDefaultVoiceWarning(input.tts_model)] : [];
}

/** The presenter's framing as rendered: the view admission pinned, close without one (#884 S5d). */
export function renderedPresenterFraming(pin?: { asset?: { framing?: string | undefined } | undefined } | undefined): "close" | "wide" | "full" {
  const framing = pin?.asset?.framing;
  return framing === "wide" || framing === "full" ? framing : "close";
}

/** presenter_place's face on a view whose face is known small (a full view, a personal actor's wide view): when even the least crop it needs is
 *  past what the portrait holds sharp, the quote says the presenter is framed wider (#1196), before the run measures the exact face. */
function presenterPlaceSoftness(input: { presenter_place?: { face_height: number } | undefined; resolution?: string | undefined },
  pin?: { actor_id?: string | undefined; asset?: { aspect_ratio?: string | undefined; framing?: string | undefined; width?: number | undefined } | undefined }):
  string | undefined {
  const place = input.presenter_place, asset = pin?.asset, view = renderedPresenterFraming(pin);
  const largest = view === "full" ? ACTOR_FULL_PORTRAIT_FACE_HEIGHT
    : view === "wide" && pin?.actor_id !== undefined && actorIdScope(pin.actor_id) === "account" ? ACTOR_WIDE_PORTRAIT_FACE_HEIGHT : undefined;
  const aspect = ASPECT_RATIOS.find(ratio => ratio === asset?.aspect_ratio), resolution = RESOLUTIONS.find(entry => entry === input.resolution) ?? DEFAULT_RESOLUTION;
  if (!place || largest === undefined || !asset?.width || !aspect) return undefined;
  const sharp = sharpCropOf(asset.width, expectedVendorFrame(resolution, aspect).width);
  if (place.face_height / largest <= sharp) return undefined;
  return `presenter_place face height ${place.face_height.toFixed(2)}: the actor's ${view} portrait shows the face under ${largest} of its height, so a ` +
    `crop that tight would be soft; the presenter is framed wider, at face height ${(largest * Math.max(1, sharp)).toFixed(2)} or less`;
}

/** What a wide, full or mic request did not get, one line each, read from the pin admission made: a view is pinned only when drawn (#884 S5d, */
/** rule 3). A take is never widened or cropped to match: a full framing[] size on a narrower take names it (#1175 S7). */
export function presenterViewWarnings(
  input: { presenter_framing?: string | undefined; presenter_mic?: boolean | undefined; aspect_ratio?: string | undefined;
    framing?: readonly { id?: unknown; size?: unknown }[] | undefined; presenter_place?: { face_height: number } | undefined; resolution?: string | undefined },
  pin?: { actor_id?: string | undefined; asset?: { aspect_ratio?: string | undefined; framing?: string | undefined; prop?: string | undefined;
    width?: number | undefined } | undefined } | undefined,
): string[] {
  const warnings: string[] = [];
  const whose = pin?.actor_id === undefined ? undefined : `${actorIdScope(pin.actor_id) === "account" ? "personal actor" : "actor"} ${pin.actor_id}`;
  const asked = input.presenter_framing, rendered = renderedPresenterFraming(pin);
  if ((asked === "wide" || asked === "full") && rendered !== asked) {
    const aspect = pin?.asset?.aspect_ratio ?? input.aspect_ratio ?? "9:16";
    const used = rendered === "close" ? "the close portrait" : `the ${rendered} view`;
    warnings.push(whose === undefined ? `presenter_framing ${asked} needs an actor_id with a ${asked} view (see list_actors): the presenter was rendered close`
      : aspect !== "9:16" ? `presenter_framing ${asked} is drawn in 9:16 only: the ${aspect} close portrait was used`
      : `presenter_framing ${asked}: ${whose} has no ${asked} view yet; ${used} was used`);
  }
  if (asked === "close" && rendered !== "close") {
    warnings.push(`presenter_framing close: ${whose ?? "the actor"} has only a ${rendered} view (a ${rendered} portrait or one made with framing ${rendered}); ` +
      `the ${rendered} view was used`);
  }
  for (const item of rendered === "full" ? [] : input.framing ?? []) {
    if (item.size === "full") {
      warnings.push(`framing "${String(item.id)}" full: the presenter's take is ${rendered}, not full height; it shows the take as rendered, ` +
        "neither widened nor cropped (presenter_framing full with an actor's full view draws it)");
    }
  }
  const soft = presenterPlaceSoftness(input, pin);
  if (soft) warnings.push(soft);
  if (input.presenter_mic === true && pin?.asset?.prop !== "mic") {
    warnings.push(whose === undefined ? "presenter_mic needs an actor_id with a mic view (see list_actors): rendered without the mic"
      : `presenter_mic: ${whose} has no ${renderedPresenterFraming(pin)} mic view (library mic views are wide); rendered without the mic`);
  }
  return warnings;
}

export const actorSelection = z.object({
  actor_id: actorId,
  version: z.number().int().positive(),
  aspect_ratio: z.enum(ASPECT_RATIOS),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ActorSelection = z.infer<typeof actorSelection>;

export const actorCatalogEntry = z.object({
  actor_id: actorId,
  name: z.string().min(1),
  description: z.string().min(1),
  gender: z.enum(["female", "male"]),
  approximate_age: z.number().int().min(18),
  version: z.number().int().positive(),
  variants: z.array(z.object({
    aspect_ratio: z.enum(ASPECT_RATIOS),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    preview_url: z.url(),
    preview_expires_at: z.iso.datetime(),
    framing: z.enum(["wide", "full"]).optional().describe("wide: the presenter lower with room above; full: head to feet. Used by presenter_framing " +
      "of the same name; absent is close."),
    gaze: z.enum(["left", "right"]).optional().describe("The side of the frame the presenter looks to, used by interview.gaze and presenter_gaze; " +
      "absent is the camera."),
    prop: z.enum(["mic"]).optional().describe("mic: the presenter holds a tiny handheld microphone, used by presenter_mic; absent is none."),
  })).min(1),
});
export const actorsResponse = z.object({ actors: z.array(actorCatalogEntry) });
export type ActorCatalogEntry = z.infer<typeof actorCatalogEntry>;
