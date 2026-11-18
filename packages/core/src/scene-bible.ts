import { z } from "zod";
import { negationIn } from "./generation-shot.js";

/** One scene for a whole video (#1491): written once, every live shot is drawn in it. */

export const MAX_SCENE_TEXT = 400;
export const MAX_SCENE_PROPS = 6;
export const MAX_SHOT_START = 400;
export const SCENE_POSTURES = ["standing", "seated"] as const;
export type ScenePosture = (typeof SCENE_POSTURES)[number];

const sceneText = (max: number) => z.string().trim().min(1).max(max);
const absentMessage = (word: string) => `"${word}" describes what is absent; describe what is visible instead`;

export const sceneBible = z.strictObject({
  place: sceneText(MAX_SCENE_TEXT).optional()
    .describe("Where the whole video happens: the room and the one surface used, such as a white kitchen counter left of the sink, window on the left."),
  posture: z.enum(SCENE_POSTURES).optional()
    .describe("How the presenter is for the whole video: standing or seated. Live shots keep it."),
  wardrobe: sceneText(300).optional().describe("What the presenter wears: garment, colour, sleeves, jewellery."),
  product: sceneText(300).optional().describe("How the product looks: material, colour, finish, size against a hand. Without " +
    "product_asset_id, one picture of it is drawn and every live shot that shows the product uses it; free."),
  props: z.array(sceneText(160)).min(1).max(MAX_SCENE_PROPS).optional()
    .describe("Each other object seen for the whole video, once: the same kettle, the same plant. An object one live shot brings in goes " +
      "in that shot's start."),
  light: sceneText(200).optional().describe("The light and the colours: where the light comes from, time of day, three to five colours."),
}).superRefine((scene, context) => {
  for (const [key, value] of Object.entries(scene)) {
    (Array.isArray(value) ? value : [value]).forEach((text, at) => {
      const word = typeof text === "string" && key !== "posture" ? negationIn(text) : null;
      if (word) context.addIssue({ code: z.ZodIssueCode.custom, path: Array.isArray(value) ? [key, at] : [key], message: absentMessage(word) });
    });
  }
}).refine(scene => Object.keys(scene).length > 0, { message: "scene needs at least one field" });
export type SceneBible = z.infer<typeof sceneBible>;

/** A live shot's first frame (#1491), described as what is visible, like the scene. Stored runs only: no public body takes it now. */
export const shotStart = sceneText(MAX_SHOT_START).superRefine((text, context) => {
  const word = negationIn(text);
  if (word) context.addIssue({ code: z.ZodIssueCode.custom, message: absentMessage(word) });
});

/** Stored runs only: the accepted quote proposal a run named before proposals were withdrawn, read as it was written. */
export const storedSceneProposal = z.strictObject({
  id: z.string().regex(/^sp_[a-z0-9]{20}$/),
  accept: z.array(z.string().regex(/^o[1-9][0-9]?$/)).max(12)
    .refine(ids => new Set(ids).size === ids.length, { message: "each option id once" }).default([]),
});

/** Server-only: admission freezes the run's direction here, and a public body naming it is refused as an unknown field. */
export const sceneDirectionMark = z.strictObject({ mode: z.literal("complete"),
  /** A run made from an accepted quote proposal (#1491 S6): what was proposed, by digest, and what was picked. */
  proposal: z.strictObject({ id: z.string().regex(/^sp_[a-z0-9]{20}$/), content_digest: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.array(z.string().regex(/^o[1-9][0-9]?$/)).max(12) }).optional(),
  /** Set by admission when the run is directed as an ad (#1539); absent, it is directed as before. */
  knowledge: z.literal("ugc_ad").optional() });
export type SceneDirectionMark = z.infer<typeof sceneDirectionMark>;

/** Server-only (#1539 C5): who speaks on camera, decided at admission from the reference. On camera, the presenter says the */
/** hook and the call to action to the lens; voice-over, a narrator speaks over silent shots. Absent, a run keeps the shots it was admitted with. */
export const runSpeech = z.strictObject({ mode: z.enum(["on_camera", "voice_over"]), hook: z.enum(["spoken", "silent"]),
  why: z.string().min(1).max(300) });
export type RunSpeech = z.infer<typeof runSpeech>;
/** Server-only: the live shots of a voice-over run whose action admission wrote, by id. The director writes each one's action from its words. */
export const speechActions = z.array(z.string().min(1).max(64)).max(60);
/** The shots a stored run marked so, or none for a run admitted without the mark. */
export function speechActionsOf(storedInput: unknown): ReadonlySet<string> {
  if (storedInput === null || typeof storedInput !== "object") return new Set();
  const parsed = speechActions.safeParse((storedInput as { speech_actions?: unknown }).speech_actions);
  return new Set(parsed.success ? parsed.data : []);
}
/** The speech a stored run froze, or undefined for one admitted before C5 or off the ad epic. */
export function runSpeechOf(storedInput: unknown): RunSpeech | undefined {
  if (storedInput === null || typeof storedInput !== "object") return undefined;
  const parsed = runSpeech.safeParse((storedInput as { speech?: unknown }).speech);
  return parsed.success ? parsed.data : undefined;
}

/** An account switch's value read one way: `1` every account, a comma list of account ids only those, anything else nobody. */
export function listedAccounts(raw: string | undefined): "all" | ReadonlySet<string> | null {
  const value = raw?.trim();
  if (value === "1") return "all";
  const ids = (value ?? "").split(",").map(id => id.trim()).filter(id => /^acc_[A-Za-z0-9_-]+$/.test(id));
  return ids.length ? new Set(ids) : null;
}
