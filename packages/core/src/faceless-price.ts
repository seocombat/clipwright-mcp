import { z } from "zod";
import { DELIVERED_VIDEO_MINIMUM_CREDITS, PRODUCTION_CREDITS_PER_SECOND } from "./parts-pricing.js";

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

/** The parts price of `images` generated pictures in `outputFrames` frames: the production seconds rounded up once. */
export function facelessPartsBase(images: number, outputFrames: number): number {
  return images * FACELESS_IMAGE_CREDITS + Math.ceil(FACELESS_CREDITS_PER_1500_FRAMES * outputFrames / 1500);
}

/** The most a selection is charged: every picture the run may generate, every selected second, the opening clip. */
export function quoteFaceless(input: { outputFrames: number; captions: boolean }): FacelessQuote {
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).parse(input.outputFrames);
  const captions = z.boolean().parse(input.captions);
  const images = facelessMaxGeneratedImages(outputFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES);
  const openerCredits = FACELESS_OPENER_CREDITS;
  const baseCredits = facelessPartsBase(images, outputFrames);
  // At the shortest selection the ceiling is already past the delivered minimum, which only settlement applies.
  return { outputFrames, baseCredits, openerCredits, totalCredits: baseCredits + openerCredits, tariffId: FACELESS_TARIFF_ID, captions,
    images, imageCredits: FACELESS_IMAGE_CREDITS };
}
