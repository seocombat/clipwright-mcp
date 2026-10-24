import { z } from "zod";
import { assetId } from "../asset-identity.js";

/** A template's media slot: a ready asset of the account, pinned at admission by (template id, slot) (#778 S3a(ii), A1). */
export const templateMedia = z.object({ asset_id: assetId.describe("A ready asset from list_assets, of the kind the slot takes.") }).strict();

/** What a slot takes; `cover` is the shape it fills, width over height, so a picture of another shape is cut and named. */
export interface TemplateSlot { type: "image" | "video"; cover?: number | undefined }
