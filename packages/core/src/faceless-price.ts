import { z } from "zod";
import { DELIVERED_VIDEO_MINIMUM_CREDITS, PRODUCTION_CREDITS_PER_SECOND } from "./parts-pricing.js";

/** The tariff new faceless runs are admitted on (#800); runs admitted on `faceless-image-i2v-v1` keep it. */
export const FACELESS_TARIFF_ID = "faceless-parts-v1" as const;
export const FACELESS_LEGACY_TARIFF_ID = "faceless-image-i2v-v1" as const;
export const FACELESS_TARIFF_IDS = [FACELESS_TARIFF_ID, FACELESS_LEGACY_TARIFF_ID] as const;
/** A faceless video ends with its speech and runs at least 25 s (owner, 2026-09-27). */
export const FACELESS_MIN_OUTPUT_FRAMES = 625;
/** The length a caller selects, in seconds. */
export const FACELESS_MIN_SELECTED_SECONDS = 30;
export const FACELESS_MAX_SELECTED_SECONDS = 90;
/** The pre-speech estimate floor keeps the 4 s offset the 26 s floor had from the former 30 s minimum. */
export const FACELESS_MIN_ESTIMATE_SEC = 21;
/** A script is admitted when its estimate fits the selection plus 5 s; a video longer than that is named in `warnings[]`. */
export const facelessMaxEstimateFrames = (selectedFrames: number) => Math.min(selectedFrames + 125, 2250);
/** A video may run a quarter past its selection, never past 90 s; the charge stays within the selection's quote (owner, 2026-10-07, #529). */
export const facelessMaxOutputFrames = (selectedFrames: number) => Math.min(Math.floor(selectedFrames * 1.25), 2250);
/** Pictures a public run may generate, the opener's first frame included (docs/70, clipwright#519). */
export const FACELESS_PUBLIC_MAX_GENERATED_IMAGES = 31;
/** One picture per two selected seconds plus four, never past the runtime's ceiling: the worker's beat limit and the admission cap read it. */
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

/** The legacy tariff's numbers: base credits per 1500 frames (a minute at 25 fps), the base's floor, and the opening clip. */
export const FACELESS_LEGACY_CREDITS_PER_1500_FRAMES = 180;
export const FACELESS_LEGACY_MIN_BASE_CREDITS = 200;
export const FACELESS_LEGACY_OPENER_CREDITS = 150;

/** The parts tariff (owner, 29.10, #800), ×2.5 over the S0 costs: a generated picture ($0.0218), the opening clip ($0.162), */
/** and every second of the video for story, voice, checks and render ($0.0028 a second), at least 50 for a delivered video. */
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
