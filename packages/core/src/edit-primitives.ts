import { z } from "zod";

export const frame = z.number().int().nonnegative().safe();
export const frameCount = z.number().int().positive().safe();
const HALF_PAIR = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const text = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !value.includes("\u0000") && !HALF_PAIR.test(value), { error: "holds U+0000 or half of a surrogate pair, which cannot be stored" });
export const shotId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
