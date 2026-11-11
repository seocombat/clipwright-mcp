import { z } from "zod";
import { captionLanguageOf } from "./caption-language.js";

/** The lines to publish with a delivered film: at most three lines and this many characters in all. */
export const POST_TEXT_MAX_LINES = 3, POST_TEXT_MAX_CHARS = 500;

const lines = (text: string) => text.split("\n");
const shaped = (text: string) => {
  const all = lines(text);
  return all.length <= POST_TEXT_MAX_LINES && all.every(line => line.length > 0 && line === line.trim());
};

export const postText = z.string().min(1).max(POST_TEXT_MAX_CHARS)
  .refine(shaped, { message: `1–${POST_TEXT_MAX_LINES} non-empty lines` })
  .describe("1–3 lines to publish with the video, in its script's language, saying nothing the script does not; absent when none was written");

/** Latin-alphabet languages read as one family: a caption without diacritics on a Polish film is still in its alphabet. */
const family = (text: string) => { const language = captionLanguageOf(text); return ["en", "pl", "vi"].includes(language) ? "latin" : language; };

/** The writer's lines as the run carries them: trimmed, blank lines dropped; undefined when they are not 1–3 lines of the script's alphabet. */
export function postTextFor(raw: string, script: string): string | undefined {
  const kept = lines(raw.replace(/\r\n?/g, "\n")).map(line => line.trim()).filter(Boolean).join("\n");
  const parsed = postText.safeParse(kept);
  return parsed.success && family(parsed.data) === family(script) ? parsed.data : undefined;
}
