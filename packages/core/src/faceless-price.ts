import { z } from "zod";

export const FACELESS_TARIFF_ID = "faceless-image-i2v-v1" as const;
/** A faceless video ends with its speech and runs at least 25 s (owner, 2026-09-27). */
export const FACELESS_MIN_OUTPUT_FRAMES = 625;
/** The pre-speech estimate floor keeps the 4 s offset the 26 s floor had from the former 30 s minimum. */
export const FACELESS_MIN_ESTIMATE_SEC = 21;
/** A video may run up to 5 s past its selection, never past 90 s; the charge stays within the selection's quote (owner, 2026-09-27). */
export const facelessMaxOutputFrames = (selectedFrames: number) => Math.min(selectedFrames + 125, 2250);

export const facelessQuote = z.object({
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250),
  baseCredits: z.number().int().nonnegative(),
  openerCredits: z.number().int().nonnegative(),
  totalCredits: z.number().int().nonnegative(),
  tariffId: z.literal(FACELESS_TARIFF_ID),
  captions: z.boolean(),
}).strict();
export type FacelessQuote = z.infer<typeof facelessQuote>;

export function quoteFaceless(input: { outputFrames: number; captions: boolean }): FacelessQuote {
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).parse(input.outputFrames);
  const captions = z.boolean().parse(input.captions);
  const baseCredits = Math.max(200, Math.ceil(180 * outputFrames / 1500));
  const openerCredits = 150;
  return { outputFrames, baseCredits, openerCredits,
    totalCredits: baseCredits + openerCredits, tariffId: FACELESS_TARIFF_ID, captions };
}
