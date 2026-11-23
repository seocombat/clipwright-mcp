import { z } from "zod";
import { assetId } from "../asset-identity.js";

export const templateMedia = z.object({ asset_id: assetId.describe("A ready asset (list_assets, or create_asset from a generate_* run) of the kind the slot takes.") }).strict();

export interface TemplateSlot { type: "image" | "video"; cover?: number | undefined }
