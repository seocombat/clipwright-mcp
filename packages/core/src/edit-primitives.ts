import { z } from "zod";

// Shared by the edit modules only: these generic names stay out of the public barrel.

/** A frame index, a word index, a millisecond count. */
export const frame = z.number().int().nonnegative().safe();
/** A length in frames, a pixel size. */
export const frameCount = z.number().int().positive().safe();
const HALF_PAIR = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** A JSON column refuses U+0000 and half of a surrogate pair, so the schema does first. */
export const text = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !value.includes("\u0000") && !HALF_PAIR.test(value), { error: "holds U+0000 or half of a surrogate pair, which cannot be stored" });
export const shotId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
