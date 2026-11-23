import { z } from "zod";
import type { PartsLine } from "./parts-pricing.js";

export const MUSIC_BED_CREDITS = 60;
export const FILM_MUSIC_BED_CREDITS = 20;
export const MUSIC_MOOD_MAX_CHARS = 400;

export const MUSIC_DESCRIPTION = "Background music under the voice, made for this video by AI; it may carry an invisible watermark; off unless " +
  'you ask. "auto" takes the mood from the ' +
  `script; { mood } says it in your words, such as "calm lo-fi". ${MUSIC_BED_CREDITS} credits per video, its own line on the quote, ` +
  "charged only when the video is delivered with it.";

// biome-ignore lint/suspicious/noControlCharactersInRegex: the class names control characters to refuse them.
export const ONE_LINE_TEXT = /^[^\u0000-\u001F\u007F-\u009F]+$/;

export const musicRequest = z.union([
  z.literal("auto"),
  z.strictObject({
    mood: z.string().trim().min(1).max(MUSIC_MOOD_MAX_CHARS).regex(ONE_LINE_TEXT, "mood must be plain text on one line"),
  }),
], { error: 'music must be "auto" or { mood: "your words" }' });
export type MusicRequest = z.infer<typeof musicRequest>;

export function musicLine(credits: number = MUSIC_BED_CREDITS): PartsLine {
  return { label: "music", unit: "track", quantity: 1, unit_credits: credits, credits };
}

export function musicNotAddedWarning(reason: string): string {
  return `music was not added: ${reason}; it was not charged`;
}
