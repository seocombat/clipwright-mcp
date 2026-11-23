import { z } from "zod";
import { ugcDeliveryRecordSchema, type UgcDeliveryRecord } from "./ugc-delivery.js";

const side = z.number().int().positive().safe();

export const runVideo = z.strictObject({ width: side, height: side });
export type RunVideo = z.infer<typeof runVideo>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function measuredVideoSize(finalOutput: unknown, sealed: (proof: UgcDeliveryRecord) => boolean): RunVideo | null {
  const output = record(finalOutput);
  if (output === null) return null;
  const proof = ugcDeliveryRecordSchema.safeParse(output.ugc_delivery_evidence);
  if (proof.success) {
    const { videoKey, durationSec, width, height } = proof.data.record;
    return sealed(proof.data) && videoKey === output.video_key && durationSec === output.duration_seconds ? { width, height } : null;
  }
  if (output.ugc_delivery_evidence !== undefined) return null;
  const size = runVideo.safeParse({ width: output.width, height: output.height });
  return size.success ? size.data : null;
}

const NAMED_SHORT_SIDES: readonly number[] = [480, 540, 720, 1080, 1440];

export function videoResolutionLabel(size: RunVideo): string {
  const short = Math.min(size.width, size.height);
  if (short === 2160) return "4K";
  return NAMED_SHORT_SIDES.includes(short) ? `${short}p` : `${size.width}×${size.height}`;
}
