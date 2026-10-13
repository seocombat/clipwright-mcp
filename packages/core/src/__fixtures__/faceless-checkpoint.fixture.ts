import type { FacelessMediaRecord, StoredObject } from "../faceless-media-record.js";
import type { FacelessPublicPlan } from "../faceless-public-plan.js";
import { facelessPlanFixture } from "./edit-views.fixture.js";

/** The host of the render props' URLs: signed for two hours at render time, dead when the run is read. */
export const DEAD_PROPS_HOST = "dead-props.example.test";
/** Plan indices of the shots whose picture the customer supplied; every other shot is generated. */
export const CUSTOMER_SHOT_INDICES: readonly number[] = [2, 5];
/** 4.99 s at 25 fps is 124.75 frames: 124 whole frames of footage, which rounding would call 125. */
export const OPENER_CLIP_SECONDS = 4.99;

const sha = (index: number) => index.toString(16).padStart(2, "0").repeat(32);
const object = (runId: string, kind: StoredObject["kind"], index: number, extension: string): StoredObject => ({
  kind, key: `runs/${runId}/faceless/media/${sha(index)}.${extension}`, sha256: sha(index), bytes: 1000 + index,
  width: kind === "audio" ? null : 1080, height: kind === "audio" ? null : 1920,
  duration_sec: kind === "video" ? OPENER_CLIP_SECONDS : kind === "audio" ? 41.64 : null,
});

/** What a delivered faceless run keeps in its checkpoint: the plan, the media record and render props with dead URLs. */
export function facelessCheckpointFixture(runId: string): { plan: FacelessPublicPlan; media: FacelessMediaRecord; props: unknown } {
  const plan = facelessPlanFixture();
  const media: FacelessMediaRecord = {
    v: 1,
    shots: plan.shots.map((shot, index) => ({
      id: shot.id, source: CUSTOMER_SHOT_INDICES.includes(index) ? "customer" : "generated", motion: shot.motion ?? null,
      media: object(runId, index === 0 ? "video" : "image", index, index === 0 ? "mp4" : "png"),
    })),
    opener_still: object(runId, "image", 200, "png"),
    references: [],
    narration: object(runId, "audio", 201, "wav"),
    settings: { captions: false, character_reference: false, character_details: null, image_model: "fixture-image-model",
      voice: null, lambda_site_sha256: sha(202) },
  };
  const props = {
    outputFrames: plan.outputFrames, narrationSrc: `https://${DEAD_PROPS_HOST}/narration.wav?X-Amz-Signature=dead`,
    shots: plan.shots.map(shot => ({ id: shot.id, src: `https://${DEAD_PROPS_HOST}/${shot.id}?X-Amz-Signature=dead` })),
  };
  return { plan, media, props };
}
