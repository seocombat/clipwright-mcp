import { z } from "zod";

// A video's picture look, shared by the faceless cut sheet and the brand kit's saved look, so a saved look drops into a cut sheet as is.

export const filmLookTag = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/u, "a short snake_case tag, such as flat_2d");
export const filmLookDescription = z.string().trim().min(1).max(300);
