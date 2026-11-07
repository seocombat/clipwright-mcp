/** Live shots (#1103): what the actor does on some words of the script, drawn by the engine of the shot's kind. */
export const LIVE_SHOT_KINDS = ["talking", "talking_action", "action"] as const;
export type LiveShotKind = (typeof LIVE_SHOT_KINDS)[number];
/** The look of the cuts into and out of a live shot (#1129); whoosh is a cut with the whoosh sound. */
export const LIVE_SHOT_TRANSITIONS = ["cut", "flash", "light_leak", "whoosh"] as const;
export type LiveShotTransition = (typeof LIVE_SHOT_TRANSITIONS)[number];
/** Where a live shot's product sits (#1146): in the actor's hand or beside them. */
export const LIVE_SHOT_PRODUCT_PLACEMENTS = ["hand", "beside"] as const;
export type LiveShotProductPlacement = (typeof LIVE_SHOT_PRODUCT_PLACEMENTS)[number];
/** How much wider than the actor's view a shot's first frame is drawn (#1175 S7): waist-up with the hands, or head to feet. */
export const LIVE_SHOT_FRAMINGS = ["wide", "full"] as const;
export type LiveShotFraming = (typeof LIVE_SHOT_FRAMINGS)[number];
/** A shot's product placement: `true` is the hand, as before #1146; absent or `false` shows no product. */
export function liveShotProductPlacement(shot: { product?: boolean | { placement: LiveShotProductPlacement } | undefined }):
  LiveShotProductPlacement | undefined {
  return shot.product === true ? "hand" : shot.product ? shot.product.placement : undefined;
}
/** The most people a live shot's cast adds beside the actor (#1192). */
export const MAX_SHOT_CAST = 3;
export const CAST_INSERT_ID = "cast";
/** A cast picture's key in a run: one per picture. */
export function castSlotOf(assetId: string): string {
  return `c${BigInt(`0x${assetId.replace(/^ast_/, "")}`).toString(36)}`;
}
/** Who a shot's cast is, in order: shots of one setup share one first frame, so they name one cast. */
export function liveShotCastKey(shot: { cast?: readonly { asset_id: string; role: string }[] | undefined }): string {
  return JSON.stringify((shot.cast ?? []).map(person => [person.asset_id, person.role.trim().replace(/\s+/g, " ")]));
}
/** The place a shot is drawn in, one per distinct setup; shots without one share the actor's own photo setting (""). */
export function liveShotSetupKey(shot: { setup?: string | undefined }): string {
  return shot.setup?.trim().replace(/\s+/g, " ") ?? "";
}
