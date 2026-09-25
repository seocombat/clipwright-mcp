import { z } from "zod";
import { actorId, ASPECT_RATIOS } from "./skills.js";
import { DEFAULT_VOICE_PRESET, VOICE_PRESETS } from "./voices.js";

export const ACTORS_PATH = "/v1/actors";

/** An account's personal actor: the quote is free, the run is paid. The API routes repeat */
/** these paths as literals, and a test keeps them equal. */
export const CREATE_ACTOR_QUOTE_PATH = "/v1/skills/create_actor/quote";
export const CREATE_ACTOR_RUN_PATH = "/v1/skills/create_actor/run";

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
  return input.image !== undefined && explicit === undefined ? [IMAGE_DEFAULT_VOICE_WARNING] : [];
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
  })).min(1),
});
export const actorsResponse = z.object({ actors: z.array(actorCatalogEntry) });
export type ActorCatalogEntry = z.infer<typeof actorCatalogEntry>;
