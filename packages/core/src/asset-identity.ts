import { z } from "zod";

export const ASSET_KINDS = ["image", "video"] as const;
export const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "video/mp4"] as const;
export const assetId = z.string().regex(/^ast_[a-f0-9]{32}$/);
