/** Speech pacing: 2–4 words per second. */
export const WORDS_PER_SECOND_MIN = 2;
export const WORDS_PER_SECOND_MAX = 4;

export function countWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}
