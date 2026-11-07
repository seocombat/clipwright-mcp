import { SCENE_CREDITS } from "./parts-pricing.js";
import { isScenePurple } from "./scene-graph.js";
import { lexicalTokens } from "./semantic-inserts.js";
import { layerWordRange, type AnchoredItem } from "./ugc-layers.js";

// Scenes (#1107): graphics no library kind draws, authored for the run from words, checked, and drawn on their words beside templates.

export const MAX_SCENES = 12;
export const SCENE_BRIEF_MAX_CHARS = 2000;
export const SCENE_TEXT_MAX_CHARS = 200;

export const SCENES_DESCRIPTION = "Graphics made for this video from your words, for what no template draws: each is drawn over the presenter " +
  "(over) or on the full frame (full) while its words are spoken; one drawn on the captions hides them while it shows. " +
  "One that does not pass our check is left out and named in warnings[]. " +
  `${SCENE_CREDITS} credits per scene, its own quote line, charged only for scenes drawn in the delivered video. ` +
  "Needs script and long-form qualification on the server.";
export const SCENES_DISABLED_MESSAGE = "scenes are not available right now; omit scenes";

interface SceneLike extends AnchoredItem { id: string; colors?: readonly string[] | undefined }
interface ScenesInput {
  script?: string | undefined; segments?: unknown;
  scenes?: readonly SceneLike[] | undefined;
  inserts?: readonly { id: string }[] | undefined; overlays?: readonly { id: string }[] | undefined; layout_windows?: readonly { id: string }[] | undefined;
  templates?: readonly { id: string }[] | undefined; framing?: readonly { id: string }[] | undefined;
}

/** Scenes sit on the script's words and share the id space of the other layers. */
export function sceneRefusals(input: ScenesInput): { path: (string | number)[]; message: string }[] {
  if (!input.scenes?.length) return [];
  if (input.script === undefined || input.segments !== undefined) return [{ path: ["scenes"], message: "scenes require script and cannot be combined with segments" }];
  const tokens = lexicalTokens(input.script), refusals: { path: (string | number)[]; message: string }[] = [];
  const taken = new Set([input.inserts, input.overlays, input.layout_windows, input.templates, input.framing].flatMap(items => (items ?? []).map(item => item.id)));
  const seen = new Set<string>();
  for (const [index, scene] of input.scenes.entries()) {
    if (seen.has(scene.id) || taken.has(scene.id)) refusals.push({ path: ["scenes", index, "id"], message: `id "${scene.id}" is used by another layer or scene` });
    seen.add(scene.id);
    const range = layerWordRange(tokens, scene);
    if (typeof range === "string") refusals.push({ path: ["scenes", index, "anchor"], message: range });
  }
  return refusals;
}

/** Purple stays only where the customer named one in the scene's own colours. */
export const sceneAllowsPurple = (scene: { colors?: readonly string[] | undefined }): boolean => (scene.colors ?? []).some(isScenePurple);
