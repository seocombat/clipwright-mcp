import { z } from "zod";
import type { PartsLine } from "./parts-pricing.js";

// Opt-in music: one track made for the video and mixed under the voice; its own quote line, charged only on delivery.

/** Credits for the music of one video. */
export const MUSIC_BED_CREDITS = 60;
export const MUSIC_MOOD_MAX_CHARS = 400;

export const MUSIC_DESCRIPTION = 'Background music under the voice, made for this video; off unless you ask. "auto" takes the mood from the ' +
  `script; { mood } says it in your words, such as "calm lo-fi". ${MUSIC_BED_CREDITS} credits per video, its own line on the quote, ` +
  "charged only when the video is delivered with it.";

export const musicRequest = z.union([
  z.literal("auto"),
  z.strictObject({
    mood: z.string().trim().min(1).max(MUSIC_MOOD_MAX_CHARS).regex(/^[^\p{Cc}]+$/u, "mood must be plain text on one line"),
  }),
], { error: 'music must be "auto" or { mood: "your words" }' });
export type MusicRequest = z.infer<typeof musicRequest>;

/** The quote's and the bill's music line. */
export function musicLine(credits: number = MUSIC_BED_CREDITS): PartsLine {
  return { label: "music", unit: "track", quantity: 1, unit_credits: credits, credits };
}

/** Off, the field is refused before any reserve. */
export function isMusicEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_MUSIC === "1";
}

export const MUSIC_DISABLED_MESSAGE = "music is not available right now; omit it";

/** A delivered video that asked for music and carries none says why, and the music is not charged. */
export function musicNotAddedWarning(reason: string): string {
  return `music was not added: ${reason}; it was not charged`;
}
