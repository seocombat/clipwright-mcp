import { z } from "zod";

import paceJson from "./voice-pace.generated.json" with { type: "json" };


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
export const PACE_MATCH_SHARE = 0.05;

export function measuredPaceOf(voice: string | undefined): MeasuredVoicePace | undefined {
  return voice === undefined ? undefined : paceByVoice.get(voice);
}

const ENGLISH_FUNCTION_WORDS = new Set(("the a an and or but to of in on at for with from by is are was were be it this that these those i you he she we they " +
  "me my your his her our their not no do does did have has had will would can just so if as all what").split(" "));
export function isEnglishScript(script: string, asciiLatin: boolean): boolean {
  const words = script.toLowerCase().match(/[a-z']+/g) ?? [];
  return asciiLatin && words.length > 0 && words.filter(word => ENGLISH_FUNCTION_WORDS.has(word)).length >= 0.15 * words.length;
}

export function voicesNearestPace(target: number, gender?: MeasuredVoicePace["gender"], limit = 3, except?: string): MeasuredVoicePace[] {
  return VOICE_PACE.voices.filter(entry => (gender === undefined || entry.gender === gender) && entry.voice !== except)
    .sort((a, b) => Math.abs(a.words_per_second - target) - Math.abs(b.words_per_second - target) || (a.voice < b.voice ? -1 : 1))
    .slice(0, limit);
}
