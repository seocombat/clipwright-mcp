import { z } from "zod";


export const cutId = z.string().regex(/^fv_[a-f0-9]{32}$/, "a cut id is fv_ and 32 hex characters").describe("A cut record of this account (create_cut)");
export const cutSlotId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,23}$/, "a slot id is up to 24 lowercase letters, digits, - or _")
  .describe("A slot of the cut record: one shot of its plan, such as hook or s2");
