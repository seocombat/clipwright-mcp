import { ASPECT_MATCH_THRESHOLD, ASPECT_RATIO_VALUES, aspectDistance } from "./aspect.js";
import type { AspectRatio, MakeUgcInput, PresenterEngineChoice } from "./skills.js";

export const PRESENTER_ENGINE_OF: Readonly<Record<PresenterEngineChoice, "heygen" | "heygen_avatar6_turbo">> = Object.freeze({
  avatar_iv: "heygen", avatar6_turbo: "heygen_avatar6_turbo",
});

export const AVATAR6_LEAD_SEC = 0.6;

export const TURBO_UNIT_MAX_SEC = 42;
export const TURBO_UNIT_MAX_ESTIMATE_SEC = 36;

const AVATAR6_FORMATS: readonly AspectRatio[] = ["9:16"];

const AS_IV = "so it renders on avatar_iv (HeyGen Avatar IV) at its price";

export interface PresenterEngineFacts {
  source: { width: number; height: number } | null;
  longestUnitSec?: number | undefined;
}

export function resolvePresenterEngine(input: Pick<MakeUgcInput, "presenter_engine" | "call" | "interview" | "presenter_gaze" | "shots">,
  aspectRatio: AspectRatio | undefined, enabled: boolean, facts: PresenterEngineFacts): { choice: PresenterEngineChoice; warnings: string[] } {
  const asked = input.presenter_engine;
  if (asked === "avatar_iv") return { choice: "avatar_iv", warnings: [] };
  const { source, longestUnitSec } = facts;
  const why = !enabled ? "presenter_engine: avatar6_turbo is not available right now"
    : input.call !== undefined || input.interview !== undefined || input.presenter_gaze !== undefined ||
        input.shots?.some(shot => shot.kind === "talking")
      ? "presenter_engine: avatar6_turbo renders no video with a call, interview, presenter_gaze or talking shot"
      : aspectRatio === undefined || !AVATAR6_FORMATS.includes(aspectRatio)
        ? `presenter_engine: avatar6_turbo renders only ${AVATAR6_FORMATS.join(", ")} videos, and this one is ${aspectRatio ?? "of another format"}`
        : source === null
          ? "presenter_engine: avatar6_turbo needs a presenter picture of known shape, and this one could not be measured"
          : aspectDistance(ASPECT_RATIO_VALUES["9:16"], source.width / source.height) > ASPECT_MATCH_THRESHOLD
            ? `presenter_engine: avatar6_turbo needs a presenter picture within 2% of 9:16, and this one is ${source.width}×${source.height}`
            : longestUnitSec !== undefined && longestUnitSec > TURBO_UNIT_MAX_ESTIMATE_SEC
              ? `presenter_engine: avatar6_turbo renders presenter parts of up to ${TURBO_UNIT_MAX_ESTIMATE_SEC} s, and one part of this video ` +
                `is estimated at ${Math.ceil(longestUnitSec)} s`
              : undefined;
  if (why === undefined) return { choice: "avatar6_turbo", warnings: [] };
  return { choice: "avatar_iv", warnings: asked === "avatar6_turbo" ? [`${why}; ${AS_IV}`] : [] };
}
