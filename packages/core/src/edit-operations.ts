import { z } from "zod";
import { shotId, text } from "./edit-primitives.js";

export { shotId } from "./edit-primitives.js";

export const SHOT_OPERATION_MODES = ["retake", "new_picture", "edit_picture", "animate"] as const;
export type ShotOperationMode = (typeof SHOT_OPERATION_MODES)[number];

/** What to generate for one shot. */
export const shotOperation = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("retake") }),
  z.strictObject({ mode: z.literal("new_picture"), description: text(600) }),
  z.strictObject({ mode: z.literal("edit_picture"), instruction: text(600) }),
  z.strictObject({ mode: z.literal("animate"), motion: text(300).optional() }),
]);
export type ShotOperation = z.infer<typeof shotOperation>;

export const shotChange = z.strictObject({ shot_id: shotId, operation: shotOperation });
export type ShotChange = z.infer<typeof shotChange>;
