import { z } from "zod";


export const filmLookTag = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/u, "a short snake_case tag, such as flat_2d");
export const filmLookDescription = z.string().trim().min(1).max(300);
