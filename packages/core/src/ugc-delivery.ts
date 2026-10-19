import { z } from "zod";

const count = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

const fields = {
  runId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(200),
  accountId: z.string().min(1).max(200), videoKey: z.string(), sha256: digest, bytes: count,
  width: count, height: count, fps: z.number().positive().finite(), outputFrames: count,
  durationSec: z.number().positive().finite(),
};
/** Two 1024-sample AAC-LC frames bound the qualified encoder's audio tail. */
const AAC_MAX_TAIL_SAMPLES = 2048;

/** Internal worker proof; v1 remains readable, v2 separates stream timing from the container. */
export const ugcDeliveryEvidenceSchema = z.discriminatedUnion("version", [
  z.strictObject({ version: z.literal(1), ...fields }),
  z.strictObject({ version: z.literal(2), ...fields, videoDurationSec: z.number().positive().finite(),
    audioDurationSec: z.number().positive().finite(), audioSampleRate: count.min(8000).max(96000) }),
]).refine(value => {
  if (value.videoKey !== `runs/${value.runId}/final.mp4` &&
      value.videoKey !== `runs/${value.runId}/deliveries/${value.sha256}.mp4`) return false;
  const frameDuration = value.outputFrames / value.fps;
  const videoDuration = value.version === 2 ? value.videoDurationSec : value.durationSec;
  if (!Number.isFinite(frameDuration) || Math.abs(videoDuration - frameDuration) > 1 / value.fps) return false;
  if (value.version === 1) return true;
  const streamEnd = Math.max(value.videoDurationSec, value.audioDurationSec);
  const arithmeticEpsilon = Number.EPSILON * Math.max(1, value.durationSec, streamEnd) * 4;
  return Math.abs(value.durationSec - streamEnd) <= 0.001 + arithmeticEpsilon &&
    value.audioDurationSec - value.videoDurationSec <= AAC_MAX_TAIL_SAMPLES / value.audioSampleRate + 0.000001;
},
{ message: "UGC artifact key or measured duration does not match its evidence" }).readonly();
export type UgcDeliveryEvidence = z.infer<typeof ugcDeliveryEvidenceSchema>;

/** The server checks this canonical record hash before projecting a stored proof. */
export const ugcDeliveryRecordSchema = z.strictObject({ record: ugcDeliveryEvidenceSchema, record_hash: digest }).readonly();
export type UgcDeliveryRecord = z.infer<typeof ugcDeliveryRecordSchema>;
