import { resolveFacelessCustomerAnchors } from "./faceless-customer-anchors.js";
import type { FacelessSceneAnchor } from "./faceless-public.js";

/** How an action shot (#1113) may enter: a plain cut, or one of the looks a faceless cut already draws. */
export const FACELESS_SHOT_TRANSITIONS = ["cut", "flash", "light_leak", "whoosh"] as const;
export type FacelessShotTransition = (typeof FACELESS_SHOT_TRANSITIONS)[number];
export type FacelessActionShotInput = { id: string; anchor: FacelessSceneAnchor; action: string; transition?: FacelessShotTransition | undefined;
  asset_id?: string | undefined };

/** A shot that starts from the account's own image asset reaches the stage as a scene image under this source name, like a picture by link. */
export const facelessAssetSource = (assetId: string): string => `asset:${assetId}`;
/** The scene images of a run as the stage plans them: the customer's own, then one for each shot that starts from an asset. */
export function facelessSceneImagesOf(input: { scene_images?: ReadonlyArray<{ image_url: string; anchor: FacelessSceneAnchor }> | undefined;
  shots?: readonly FacelessActionShotInput[] | undefined }): Array<{ image_url: string; anchor: FacelessSceneAnchor }> {
  return [...input.scene_images ?? [], ...(input.shots ?? []).flatMap(shot => shot.asset_id === undefined ? []
    : [{ image_url: facelessAssetSource(shot.asset_id), anchor: shot.anchor }])];
}
/** A shot on the script's lexical words [first, end), as the planner reads it. */
export type ResolvedFacelessActionShot = FacelessActionShotInput & { first: number; end: number };

/** The look a shot's transition draws on the cut into it; `whoosh` is the light leak, whose sound it is. A cut draws none. */
export function facelessShotTransitionLook(transition: FacelessShotTransition | undefined): "flash" | "light_leak" | undefined {
  return transition === "flash" ? "flash" : transition === "light_leak" || transition === "whoosh" ? "light_leak" : undefined;
}

/** Each shot's words in the script, in the order asked; throws as the customer anchors do. */
export function resolveFacelessActionShots(script: string, shots: readonly FacelessActionShotInput[]): ResolvedFacelessActionShot[] {
  return shots.map(shot => {
    const [range] = resolveFacelessCustomerAnchors(script, [{ image_url: "", anchor: shot.anchor }]);
    return { ...shot, first: range!.first, end: range!.end };
  });
}

/** What admission refuses before any money: an anchor naming no words, a repeated id, two shots on the same words, */
/** and a shot on the words of a scene image of the customer's (a shot animates a picture the run draws). */
export function facelessActionShotRefusals(input: { script: string; shots: readonly FacelessActionShotInput[];
  scene_images?: ReadonlyArray<{ anchor: FacelessSceneAnchor }> | undefined }): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = [];
  const ranges: Array<{ index: number; first: number; end: number }> = [];
  const ids = new Set<string>();
  for (const [index, shot] of input.shots.entries()) {
    if (ids.has(shot.id)) issues.push({ path: ["shots", index, "id"], message: "each shot needs its own id" });
    ids.add(shot.id);
    try { const [range] = resolveFacelessActionShots(input.script, [shot]); ranges.push({ index, first: range!.first, end: range!.end }); }
    catch (error) {
      issues.push({ path: ["shots", index, "anchor"], message: error instanceof Error && error.message === "ambiguous_customer_anchor"
        ? "the quote is said more than once in the script; add occurrence (0 is the first)" : "the anchor names no words of the script" });
    }
  }
  for (const range of ranges) {
    if (range.first === 0 && input.shots[range.index]!.asset_id !== undefined)
      issues.push({ path: ["shots", range.index, "asset_id"], message: "the first words belong to the opening clip; start a shot from your image on later words" });
  }
  for (const [k, range] of ranges.entries()) {
    if (ranges.slice(0, k).some(other => range.first < other.end && other.first < range.end))
      issues.push({ path: ["shots", range.index, "anchor"], message: "two shots cover the same words; give each shot its own words" });
  }
  let images: Array<{ first: number; end: number }> = [];
  try { images = resolveFacelessCustomerAnchors(input.script, (input.scene_images ?? []).map(image => ({ image_url: "", anchor: image.anchor }))); }
  catch { images = []; }
  for (const range of ranges) {
    if (images.some(image => range.first < image.end && image.first < range.end))
      issues.push({ path: ["shots", range.index, "anchor"], message: "a shot animates a picture the video draws; these words show your scene image" });
  }
  return issues;
}
