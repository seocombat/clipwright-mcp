import { z } from "zod";

const count = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

/** Trusted worker evidence after probing the file and verifying its persisted bytes. */
export const faceDeliverySchema = z.object({
  version: z.literal(1), runId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(200),
  accountId: z.string().min(1).max(200), planHash: digest,
  videoKey: z.string(), sha256: digest, bytes: count,
  width: count, height: count, fps: count, outputFrames: count, durationSec: z.number().positive().finite(),
}).strict().refine(value => value.videoKey === `runs/${value.runId}/deliveries/${value.sha256}.mp4` &&
  Math.abs(value.durationSec - value.outputFrames / value.fps) <= 1 / value.fps,
{ message: "delivery key or measured duration does not match its evidence" }).readonly();

export type FaceDelivery = z.infer<typeof faceDeliverySchema>;
