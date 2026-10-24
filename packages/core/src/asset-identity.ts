import { z } from "zod";

/** The asset id and kinds as a leaf module: `skills.ts` names them, and `assets.ts` would import it back through `runs.ts`. */
export const ASSET_KINDS = ["image", "video"] as const;
/** WebP is kept only as a generation's own output: its dimensions are not read from customer bytes. */
export const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "video/mp4"] as const;
export const assetId = z.string().regex(/^ast_[a-f0-9]{32}$/);
