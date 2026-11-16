import { z } from "zod";

/** What a directed faceless video's shots are: moving footage, a picture with a camera move, a held picture, your own picture or a card. */
export const FACELESS_BEAT_KINDS = ["live", "still_move", "static_insert", "customer_image", "card"] as const;
export const FACELESS_SHOT_SIZES = ["ecu", "cu", "mcu", "ms", "mws", "ws", "ews"] as const;

const word = z.number().int().nonnegative().safe();

/** What a quote or a run says about a directed video: each shot's words, kind and size, the seconds of moving footage, the pictures made. */
export const facelessDirectionSummary = z.strictObject({
  beats: z.array(z.strictObject({ words: z.tuple([word, word]).nullable(), kind: z.enum(FACELESS_BEAT_KINDS), shot_size: z.enum(FACELESS_SHOT_SIZES) })),
  live_seconds: z.number().nonnegative(), pictures: z.number().int().nonnegative(),
});
export type FacelessDirectionSummary = z.infer<typeof facelessDirectionSummary>;
