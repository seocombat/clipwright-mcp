import { z } from "zod";


export const REFERENCE_BRING_KINDS = ["screen_recording", "screenshot", "product_photo", "live_clip"] as const;
export type ReferenceBringKind = (typeof REFERENCE_BRING_KINDS)[number];
export const referenceBringItem = z.strictObject({
  kind: z.enum(REFERENCE_BRING_KINDS),
  seconds: z.number().min(0).describe("How long the reel shows this kind of material, all its moments together."),
  at_s: z.array(z.number().min(0)).max(40).describe("Where each moment starts in the reel."),
});
export type ReferenceBringItem = z.infer<typeof referenceBringItem>;

interface BringSource {
  shots?: readonly { start_s: number; end_s: number; source?: { kind: string } | undefined }[] | undefined;
  beats: readonly { start_s: number; end_s: number; graphics: readonly { source_kind: string; device?: string | undefined }[] }[];
}

export function referenceBringList(profile: BringSource): ReferenceBringItem[] {
  const spans = new Map<ReferenceBringKind, [number, number][]>();
  const add = (kind: ReferenceBringKind, start: number, end: number) => spans.set(kind, [...spans.get(kind) ?? [], [start, end]]);
  for (const shot of profile.shots ?? []) {
    if (shot.source?.kind === "screen_capture") add("screen_recording", shot.start_s, shot.end_s);
    if (shot.source?.kind === "real_footage") add("live_clip", shot.start_s, shot.end_s);
  }
  for (const beat of profile.beats) {
    if (beat.graphics.some(graphic => graphic.source_kind === "screenshot" || graphic.source_kind === "product_ui")) add("screenshot", beat.start_s, beat.end_s);
    if (beat.graphics.some(graphic => graphic.device === "photo")) add("product_photo", beat.start_s, beat.end_s);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return REFERENCE_BRING_KINDS.flatMap(kind => {
    const list = spans.get(kind);
    return list ? [{ kind, seconds: round(list.reduce((sum, [a, b]) => sum + b - a, 0)), at_s: list.slice(0, 40).map(([a]) => round(a)) }] : [];
  });
}
