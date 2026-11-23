import { z } from "zod";
import { captionLanguageOf } from "./caption-language.js";

export const POST_TEXT_MAX_LINES = 3, POST_TEXT_MAX_CHARS = 500;

const lines = (text: string) => text.split("\n");
const shaped = (text: string) => {
  const all = lines(text);
  return all.length <= POST_TEXT_MAX_LINES && all.every(line => line.length > 0 && line === line.trim());
};

export const postText = z.string().min(1).max(POST_TEXT_MAX_CHARS)
  .refine(shaped, { message: `1–${POST_TEXT_MAX_LINES} non-empty lines` })
  .describe("1–3 lines to publish with the video, in its script's language, saying nothing the script does not; absent when none was written");

const family = (text: string) => { const language = captionLanguageOf(text); return ["en", "pl", "vi"].includes(language) ? "latin" : language; };

export function postTextFor(raw: string, script: string): string | undefined {
  const kept = lines(raw.replace(/\r\n?/g, "\n")).map(line => line.trim()).filter(Boolean).join("\n");
  const parsed = postText.safeParse(kept);
  return parsed.success && family(parsed.data) === family(script) ? parsed.data : undefined;
}
