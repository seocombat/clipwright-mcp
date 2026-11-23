import { z } from "zod";

export const FACELESS_BEAT_KINDS = ["live", "still_move", "static_insert", "customer_image", "card"] as const;
export const FACELESS_SHOT_SIZES = ["ecu", "cu", "mcu", "ms", "mws", "ws", "ews"] as const;
export const FACELESS_CAMERA_MOVES = ["hold", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "handheld"] as const;
export const FACELESS_SPEEDS = ["steady", "brisk", "punch"] as const;
export const FACELESS_CUT_LOOKS = ["hard", "flash", "whip"] as const;

const word = z.number().int().nonnegative().safe();

export const facelessDirectionSummary = z.strictObject({
  beats: z.array(z.strictObject({ words: z.tuple([word, word]).nullable(), kind: z.enum(FACELESS_BEAT_KINDS), shot_size: z.enum(FACELESS_SHOT_SIZES) })),
  live_seconds: z.number().nonnegative(), pictures: z.number().int().nonnegative(),
});
export type FacelessDirectionSummary = z.infer<typeof facelessDirectionSummary>;
