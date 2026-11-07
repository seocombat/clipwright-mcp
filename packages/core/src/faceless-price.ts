import { z } from "zod";
import { DELIVERED_VIDEO_MINIMUM_CREDITS, PRODUCTION_CREDITS_PER_SECOND, SCENE_CREDITS } from "./parts-pricing.js";
import { MUSIC_BED_CREDITS, type MusicRequest } from "./music.js";
import { MAX_SCENES } from "./ugc-scenes.js";

/** The tariff new faceless runs are admitted on (#800); runs admitted on `faceless-image-i2v-v1` keep it. */
export const FACELESS_TARIFF_ID = "faceless-parts-v1" as const;
export const FACELESS_LEGACY_TARIFF_ID = "faceless-image-i2v-v1" as const;
export const FACELESS_TARIFF_IDS = [FACELESS_TARIFF_ID, FACELESS_LEGACY_TARIFF_ID] as const;
/** A faceless video ends with its speech and runs at least 25 s. */
export const FACELESS_MIN_OUTPUT_FRAMES = 625;
/** The length a caller selects, in seconds. */
export const FACELESS_MIN_SELECTED_SECONDS = 30;
export const FACELESS_MAX_SELECTED_SECONDS = 90;
/** The pre-speech estimate floor keeps the 4 s offset the 26 s floor had from the former 30 s minimum. */
export const FACELESS_MIN_ESTIMATE_SEC = 21;
/** A script is admitted when its estimate fits the selection plus 5 s; a video longer than that is named in `warnings[]`. */
export const facelessMaxEstimateFrames = (selectedFrames: number) => Math.min(selectedFrames + 125, 2250);
/** A video is planned within a quarter past its selection, at most 90 s; the charge stays within the selection's quote. */
export const facelessMaxOutputFrames = (selectedFrames: number) => Math.min(Math.floor(selectedFrames * 1.25), 2250);
/** The most characters one narration speaks, and a pace below every voice's: the slowest measured one reads 13.87 a second. */
export const FACELESS_SPEECH_MAX_CHARACTERS = 2500;
export const FACELESS_SLOWEST_CHARACTERS_PER_SECOND = 13;
/** A narration longer than its plan is delivered at its length: the longest one at that pace, a 5 s lead, whole seconds. */
export const FACELESS_MAX_OUTPUT_FRAMES = Math.ceil(FACELESS_SPEECH_MAX_CHARACTERS / FACELESS_SLOWEST_CHARACTERS_PER_SECOND + 5) * 25;
/** Pictures a public run may generate, the opener's first frame included. */
export const FACELESS_PUBLIC_MAX_GENERATED_IMAGES = 31;
/** One picture per two selected seconds plus four, never past the runtime's ceiling: the run's beat limit and the admission cap read it. */
export const facelessMaxGeneratedImages = (selectedFrames: number, imageCeiling = Infinity) =>
  Math.min(imageCeiling, Math.floor(selectedFrames / 50) + 4);

export const facelessQuote = z.object({
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250),
  baseCredits: z.number().int().nonnegative(),
  openerCredits: z.number().int().nonnegative(),
  totalCredits: z.number().int().nonnegative(),
  tariffId: z.enum(FACELESS_TARIFF_IDS),
  captions: z.boolean(),
  /** On the parts tariff: the generated pictures priced (at most, on a quote; delivered, on a run) and each one's price. */
  images: z.number().int().nonnegative().optional(),
  imageCredits: z.number().int().nonnegative().optional(),
  /** Asked-for music, inside `totalCredits` (#1063); absent when not asked. */
  musicCredits: z.number().int().positive().optional(),
  /** Action shots (#1113), inside `totalCredits`: on a quote the ceiling, on a run the drawn seconds; absent when none was asked. */
  shotSeconds: z.number().int().nonnegative().optional(),
  shotCredits: z.number().int().nonnegative().optional(),
  /** Scenes made for the video (#1107 on faceless, #1113), inside `totalCredits`: asked on a quote, drawn on a run; absent when none was asked. */
  scenes: z.number().int().nonnegative().optional(),
  sceneCredits: z.number().int().nonnegative().optional(),
}).strict();
export type FacelessQuote = z.infer<typeof facelessQuote>;
/** A run's bill names the delivered frames, which may pass the selection; its total stays within the quote. */
export const facelessRunBilling = facelessQuote.extend({ outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(FACELESS_MAX_OUTPUT_FRAMES) }).strict();

/** The legacy tariff's numbers: base credits per 1500 frames (a minute at 25 fps), the base's floor, and the opening clip. */
export const FACELESS_LEGACY_CREDITS_PER_1500_FRAMES = 180;
export const FACELESS_LEGACY_MIN_BASE_CREDITS = 200;
export const FACELESS_LEGACY_OPENER_CREDITS = 150;

/** The parts tariff: a generated picture, the opening clip, */
/** and every second of the video for story, voice, checks and render, at least 50 for a delivered video. */
export const FACELESS_IMAGE_CREDITS = 7;
export const FACELESS_OPENER_CREDITS = 49;
export const FACELESS_CREDITS_PER_1500_FRAMES = PRODUCTION_CREDITS_PER_SECOND * 60;
export const FACELESS_MIN_BASE_CREDITS = DELIVERED_VIDEO_MINIMUM_CREDITS;

/** An action shot (#1113): its seconds at make_ugc's shot rate, at most ten a run (#1192) and five seconds each. */
export const FACELESS_SHOT_CREDITS_PER_SECOND = 30;
export const FACELESS_MAX_SHOTS = 10;
export const FACELESS_SHOT_MAX_SEC = 5;
/** The seconds a run with `shots` action shots may be charged for, every shot at its longest. */
/** Faceless scenes have their own switch beside make_ugc's (#1113): their model calls join the faceless cost journal first. */
export const facelessScenesEnabled = (env: Record<string, string | undefined>): boolean => env.CLIPWRIGHT_FACELESS_SCENES === "1";
export const facelessShotSecondsCeiling =(shots: number) => shots * FACELESS_SHOT_MAX_SEC;

/** The parts price of `images` generated pictures in `outputFrames` frames: the production seconds rounded up once. */
export function facelessPartsBase(images: number, outputFrames: number): number {
  return images * FACELESS_IMAGE_CREDITS + Math.ceil(FACELESS_CREDITS_PER_1500_FRAMES * outputFrames / 1500);
}

/** The most a selection is charged: every picture the run may generate, every selected second, the opening clip. */
export function quoteFaceless(input: { outputFrames: number; captions: boolean; music?: MusicRequest | undefined;
  shots?: number | undefined; scenes?: number | undefined }): FacelessQuote {
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).parse(input.outputFrames);
  const captions = z.boolean().parse(input.captions);
  const images = facelessMaxGeneratedImages(outputFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES);
  const openerCredits = FACELESS_OPENER_CREDITS;
  const baseCredits = facelessPartsBase(images, outputFrames);
  const musicCredits = input.music === undefined ? 0 : MUSIC_BED_CREDITS;
  const shots = z.number().int().min(0).max(FACELESS_MAX_SHOTS).parse(input.shots ?? 0);
  const shotSeconds = facelessShotSecondsCeiling(shots), shotCredits = shotSeconds * FACELESS_SHOT_CREDITS_PER_SECOND;
  // A scene costs what it costs on make_ugc: one price per scene drawn.
  const scenes = z.number().int().min(0).max(MAX_SCENES).parse(input.scenes ?? 0), sceneCredits = scenes * SCENE_CREDITS;
  // At the shortest selection the ceiling is already past the delivered minimum, which only settlement applies.
  return { outputFrames, baseCredits, openerCredits, totalCredits: baseCredits + openerCredits + musicCredits + shotCredits + sceneCredits,
    tariffId: FACELESS_TARIFF_ID, captions, images, imageCredits: FACELESS_IMAGE_CREDITS, ...(musicCredits ? { musicCredits } : {}),
    ...(shots ? { shotSeconds, shotCredits } : {}), ...(scenes ? { scenes, sceneCredits } : {}) };
}
