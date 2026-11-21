import { ASPECT_MATCH_THRESHOLD, ASPECT_RATIO_VALUES, aspectDistance } from "./aspect.js";
import type { AspectRatio, MakeUgcInput, PresenterEngineChoice } from "./skills.js";

/** The short take's billing engine each presenter model is charged at (#1773). */
export const PRESENTER_ENGINE_OF: Readonly<Record<PresenterEngineChoice, "heygen" | "heygen_avatar6_turbo">> = Object.freeze({
  avatar_iv: "heygen", avatar6_turbo: "heygen_avatar6_turbo",
});

/** An Avatar 6 Turbo video opens on the presenter's still photo pose for this long before the words; these seconds are not charged. */
export const AVATAR6_LEAD_SEC = 0.6;

/** The longest presenter part HeyGen Avatar 6 Turbo renders at once (#1776); a longer one fails before any charge. */
export const TURBO_UNIT_MAX_SEC = 42;
/** The longest presenter part a long video may be estimated at and still render on HeyGen Avatar 6 Turbo (#1776). */
export const TURBO_UNIT_MAX_ESTIMATE_SEC = 36;

/** Avatar 6 Turbo is offered while its switch is on, on the API and the worker alike. */
export function isHeygenAvatar6Enabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_HEYGEN_AVATAR6 === "1";
}

/** The formats Turbo renders in this product: its output takes the portrait's shape. */
const AVATAR6_FORMATS: readonly AspectRatio[] = ["9:16"];

const AS_IV = "so it renders on avatar_iv (HeyGen Avatar IV) at its price";

/** The presenter picture's size (null when unknown) and a long video's longest estimated presenter part. */
export interface PresenterEngineFacts {
  source: { width: number; height: number } | null;
  longestUnitSec?: number | undefined;
}

/** The model a run renders its presenter on: Turbo by default where offered, Avatar IV elsewhere; an asked Turbo it cannot honour */
/** says why in warnings[]. Quote and run ask the same question. A video whose presenter takes cannot all be Turbo is all Avatar IV. */
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
