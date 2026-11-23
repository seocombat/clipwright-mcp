import { z } from "zod";


export const adId = z.string().regex(/^ad_[a-f0-9]{32}$/, "an ad id is ad_ and 32 hex characters").describe("An ad record of this account (create_ad)");
export const adSlotId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,23}$/, "a slot id is up to 24 lowercase letters, digits, - or _")
  .describe("A slot of the ad record: one shot of the shot list, such as hook or s2");
