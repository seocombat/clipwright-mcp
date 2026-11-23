import { z } from "zod";
import { DELIVERED_VIDEO_MINIMUM_CREDITS, PRODUCTION_CREDITS_PER_SECOND, SCENE_CREDITS } from "./parts-pricing.js";
import { MUSIC_BED_CREDITS, type MusicRequest } from "./music.js";
import { MAX_SCENES } from "./ugc-scenes.js";
import { namedThings } from "./explainer-fit.js";

export const FACELESS_TARIFF_ID = "faceless-parts-v1" as const;
export const FACELESS_LEGACY_TARIFF_ID = "faceless-image-i2v-v1" as const;
export const FACELESS_DIRECTED_TARIFF_ID = "faceless-parts-v2" as const;
export const FACELESS_TARIFF_IDS = [FACELESS_TARIFF_ID, FACELESS_LEGACY_TARIFF_ID, FACELESS_DIRECTED_TARIFF_ID] as const;
export const FACELESS_MIN_OUTPUT_FRAMES = 625;
export const FACELESS_EXPLAINER_MIN_OUTPUT_FRAMES = 25;
export const FACELESS_MIN_SELECTED_SECONDS = 30;
export const FACELESS_MAX_SELECTED_SECONDS = 90;
export const FACELESS_MIN_ESTIMATE_SEC = 21;
export const facelessMaxEstimateFrames = (selectedFrames: number) => Math.min(selectedFrames + 125, 2250);
export const facelessMaxOutputFrames = (selectedFrames: number) => Math.min(Math.floor(selectedFrames * 1.25), 2250);
export const FACELESS_SPEECH_MAX_CHARACTERS = 2500;
export const FACELESS_SLOWEST_CHARACTERS_PER_SECOND = 13;
export const FACELESS_MAX_OUTPUT_FRAMES = Math.ceil(FACELESS_SPEECH_MAX_CHARACTERS / FACELESS_SLOWEST_CHARACTERS_PER_SECOND + 5) * 25;
export const FACELESS_PUBLIC_MAX_GENERATED_IMAGES = 31;
export const facelessMaxGeneratedImages = (selectedFrames: number, imageCeiling = Infinity) =>
  Math.min(imageCeiling, Math.floor(selectedFrames / 50) + 4);

export const facelessQuote = z.object({
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250),
  baseCredits: z.number().int().nonnegative(),
  openerCredits: z.number().int().nonnegative(),
  totalCredits: z.number().int().nonnegative(),
  tariffId: z.enum(FACELESS_TARIFF_IDS),
  captions: z.boolean(),
  images: z.number().int().nonnegative().optional(),
  imageCredits: z.number().int().nonnegative().optional(),
  musicCredits: z.number().int().positive().optional(),
  shotSeconds: z.number().int().nonnegative().optional(),
  shotCredits: z.number().int().nonnegative().optional(),
  textShotSeconds: z.number().int().nonnegative().optional(),
  textShotCredits: z.number().int().nonnegative().optional(),
  totalCreditsWithoutText: z.number().int().nonnegative().optional(),
  scenes: z.number().int().nonnegative().optional(),
  sceneCredits: z.number().int().nonnegative().optional(),
  posePictures: z.number().int().nonnegative().optional(),
  authoredScenes: z.number().int().nonnegative().optional(),
  authoredSceneCredits: z.number().int().nonnegative().optional(),
  objectPictures: z.number().int().nonnegative().optional(),
  objectPictureCredits: z.number().int().nonnegative().optional(),
  filmCredits: z.number().int().positive().optional(),
  directionCredits: z.number().int().positive().optional(),
}).strict();
export type FacelessQuote = z.infer<typeof facelessQuote>;
export const facelessRunBilling = facelessQuote.extend({ outputFrames: z.number().int().min(FACELESS_EXPLAINER_MIN_OUTPUT_FRAMES)
  .max(FACELESS_MAX_OUTPUT_FRAMES) }).strict();

export const FACELESS_LEGACY_CREDITS_PER_1500_FRAMES = 180;
export const FACELESS_LEGACY_MIN_BASE_CREDITS = 200;
export const FACELESS_LEGACY_OPENER_CREDITS = 150;

export const FACELESS_IMAGE_CREDITS = 7;
export const FACELESS_OPENER_CREDITS = 49;
export const FACELESS_CREDITS_PER_1500_FRAMES = PRODUCTION_CREDITS_PER_SECOND * 60;
export const FACELESS_MIN_BASE_CREDITS = DELIVERED_VIDEO_MINIMUM_CREDITS;

export const FACELESS_SHOT_CREDITS_PER_SECOND = 30;
export const FACELESS_MAX_SHOTS = 10;
export const FACELESS_SHOT_MAX_SEC = 5;
export const facelessShotSecondsCeiling =(shots: number) => shots * FACELESS_SHOT_MAX_SEC;

export function facelessPartsBase(images: number, outputFrames: number): number {
  return images * FACELESS_IMAGE_CREDITS + Math.ceil(FACELESS_CREDITS_PER_1500_FRAMES * outputFrames / 1500);
}

export const FACELESS_EXPLAINER_POSE_PICTURES = 9;
export const EXPLAINER_BEAT_CREDITS = 65;
export const EXPLAINER_MAX_AUTHORED_BEATS = 8;
export const EXPLAINER_MAX_OBJECT_PICTURES = 12;
export const explainerObjectCeiling = (script: string): number => Math.min(EXPLAINER_MAX_OBJECT_PICTURES, namedThings(script));
export const EXPLAINER_FILM_CREDITS = 500;
export const EXPLAINER_FILM_INCLUDED_SECONDS = 60;
export const EXPLAINER_FILM_CREDITS_PER_EXTRA_SECOND = 8;
export const SKILL_FILM_TARIFFS = {
  "skill-explainer-v1": { filmCredits: EXPLAINER_FILM_CREDITS, perExtraSecond: EXPLAINER_FILM_CREDITS_PER_EXTRA_SECOND },
  "skill-agent-opus-v1": { filmCredits: 1200, perExtraSecond: 20 },
  "skill-agent-sonnet-v1": { filmCredits: 900, perExtraSecond: 15 },
  "skill-agent-sonnet-v2": { filmCredits: 700, perExtraSecond: 12 },
} as const;
export type SkillFilmTariff = keyof typeof SKILL_FILM_TARIFFS;
export const isSkillFilmTariff = (value: unknown): value is SkillFilmTariff => typeof value === "string" && Object.hasOwn(SKILL_FILM_TARIFFS, value);
export const skillFilmCredits = (tariff: SkillFilmTariff, outputFrames: number): number => SKILL_FILM_TARIFFS[tariff].filmCredits +
  SKILL_FILM_TARIFFS[tariff].perExtraSecond * Math.max(0, Math.ceil(outputFrames / 25) - EXPLAINER_FILM_INCLUDED_SECONDS);
export const explainerFilmCredits = (outputFrames: number): number => skillFilmCredits("skill-explainer-v1", outputFrames);
export const EXPLAINER_TIERS = ["standard", "pro"] as const;
export type ExplainerTier = (typeof EXPLAINER_TIERS)[number];
export const EXPLAINER_TIER_TARIFFS = { standard: "skill-agent-sonnet-v2", pro: "skill-agent-opus-v1" } as const satisfies Record<ExplainerTier, SkillFilmTariff>;
export const explainerTierTariff = (tier: ExplainerTier | undefined): SkillFilmTariff => EXPLAINER_TIER_TARIFFS[tier ?? "standard"];

export const facelessImageCeilings = (selectedFrames: number): number[] =>
  [facelessMaxGeneratedImages(selectedFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES), FACELESS_EXPLAINER_POSE_PICTURES, 0];

export function quoteFaceless(input: { outputFrames: number; captions: boolean; music?: MusicRequest | undefined;
  shots?: number | undefined; scenes?: number | undefined;
  explainer?: { character: boolean; beats?: boolean; objects?: number; film?: SkillFilmTariff } | undefined }): FacelessQuote {
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).parse(input.outputFrames);
  const captions = z.boolean().parse(input.captions);
  const openerCredits = input.explainer ? 0 : FACELESS_OPENER_CREDITS;
  const posePictures = input.explainer ? (input.explainer.character ? FACELESS_EXPLAINER_POSE_PICTURES : 0) : undefined;
  const images = posePictures ?? facelessMaxGeneratedImages(outputFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES);
  if (input.explainer?.film) {
    const filmCredits = skillFilmCredits(input.explainer.film, outputFrames), baseCredits = images * FACELESS_IMAGE_CREDITS + filmCredits;
    return { outputFrames, baseCredits, openerCredits, totalCredits: Math.max(FACELESS_MIN_BASE_CREDITS, baseCredits), tariffId: FACELESS_TARIFF_ID,
      captions, images, imageCredits: FACELESS_IMAGE_CREDITS, posePictures: posePictures!, filmCredits };
  }
  const baseCredits = facelessPartsBase(images, outputFrames);
  const musicCredits = input.music === undefined ? 0 : MUSIC_BED_CREDITS;
  const shots = z.number().int().min(0).max(FACELESS_MAX_SHOTS).parse(input.shots ?? 0);
  const shotSeconds = facelessShotSecondsCeiling(shots), shotCredits = shotSeconds * FACELESS_SHOT_CREDITS_PER_SECOND;
  const scenes = z.number().int().min(0).max(MAX_SCENES).parse(input.scenes ?? 0), sceneCredits = scenes * SCENE_CREDITS;
  const authoredScenes = input.explainer?.beats ? EXPLAINER_MAX_AUTHORED_BEATS : 0, authoredSceneCredits = authoredScenes * EXPLAINER_BEAT_CREDITS;
  const objectPictures = z.number().int().min(0).max(EXPLAINER_MAX_OBJECT_PICTURES).parse(input.explainer?.objects ?? 0);
  const objectPictureCredits = objectPictures * FACELESS_IMAGE_CREDITS;
  return { outputFrames, baseCredits, openerCredits,
    totalCredits: Math.max(FACELESS_MIN_BASE_CREDITS, baseCredits + openerCredits) + musicCredits + shotCredits + sceneCredits + authoredSceneCredits +
      objectPictureCredits,
    tariffId: FACELESS_TARIFF_ID, captions, images, imageCredits: FACELESS_IMAGE_CREDITS, ...(musicCredits ? { musicCredits } : {}),
    ...(shots ? { shotSeconds, shotCredits } : {}), ...(scenes ? { scenes, sceneCredits } : {}), ...(posePictures === undefined ? {} : { posePictures }),
    ...(authoredScenes ? { authoredScenes, authoredSceneCredits } : {}), ...(objectPictures ? { objectPictures, objectPictureCredits } : {}) };
}

export const facelessDirectedPictures = (selectedSeconds: number): number => Math.min(24, Math.ceil(selectedSeconds / 2.5));
