import { z } from "zod";

import paceJson from "./voice-pace.generated.json" with { type: "json" };

// English make_ugc voices on eleven_v4, which has no speed (#890): words/s over sentence spans, as the reference presenter is measured.
// Source: docs/assets/measurements/voice-pace-2026-10-28.json (apps/web/scripts/voice-pace-probe.mts); two takes differ by up to 11%.

export const voicePaceFile = z.strictObject({
  model: z.string().min(1),
  language: z.literal("en"),
  measured_at: z.iso.datetime(),
  voices: z.array(z.strictObject({ voice: z.string().min(1), gender: z.enum(["female", "male"]), words_per_second: z.number().positive() })).min(1),
});

export const VOICE_PACE = voicePaceFile.parse(paceJson);
export type MeasuredVoicePace = (typeof VOICE_PACE.voices)[number];
const paceByVoice = new Map(VOICE_PACE.voices.map(entry => [entry.voice, entry]));
const paces = VOICE_PACE.voices.map(entry => entry.words_per_second);
export const VOICE_PACE_RANGE = `${Math.min(...paces)}–${Math.max(...paces)}`;
/** A named voice within this share of the reference pace gets no note: two takes of one voice already differ by more. */
export const PACE_MATCH_SHARE = 0.05;

/** The voice's measured pace on English, or undefined when it was not measured. */
export function measuredPaceOf(voice: string | undefined): MeasuredVoicePace | undefined {
  return voice === undefined ? undefined : paceByVoice.get(voice);
}

const ENGLISH_FUNCTION_WORDS = new Set(("the a an and or but to of in on at for with from by is are was were be it this that these those i you he she we they " +
  "me my your his her our their not no do does did have has had will would can just so if as all what").split(" "));
/** Paces hold for English only: ASCII Latin is not enough (unaccented Spanish passes it), so English function words must make up 15%. */
export function isEnglishScript(script: string, asciiLatin: boolean): boolean {
  const words = script.toLowerCase().match(/[a-z']+/g) ?? [];
  return asciiLatin && words.length > 0 && words.filter(word => ENGLISH_FUNCTION_WORDS.has(word)).length >= 0.15 * words.length;
}

/** Measured voices nearest `target` words/s, of one gender when it is named, leaving out `except`. */
export function voicesNearestPace(target: number, gender?: MeasuredVoicePace["gender"], limit = 3, except?: string): MeasuredVoicePace[] {
  return VOICE_PACE.voices.filter(entry => (gender === undefined || entry.gender === gender) && entry.voice !== except)
    .sort((a, b) => Math.abs(a.words_per_second - target) - Math.abs(b.words_per_second - target) || (a.voice < b.voice ? -1 : 1))
    .slice(0, limit);
}
