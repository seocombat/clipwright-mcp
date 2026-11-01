import { createHash } from "node:crypto";
import { z } from "zod";
import { RESOLVED_TIMELINE_MAX_SLOTS } from "./long-form-profile.js";
import { CANVAS_FPS, completeFrames, secondsToFrames } from "./media-timebase.js";
import { coverWordOf } from "./semantic-inserts.js";
import { MAX_INSERTS } from "./skills.js";
import { place } from "./scene-place.js";
import { LAYER_ENTERS, LAYER_EXITS, LAYOUT_WINDOW_KINDS, MAX_LAYOUT_WINDOWS, MAX_OVERLAYS, OVERLAY_POSITIONS } from "./ugc-layers.js";
import { MAX_TEMPLATES, TEMPLATE_PLACEMENTS, TEMPLATE_SOUND_BEATS } from "./templates/index.js";
import { FRAMING_SIZES, MAX_FRAMING } from "./ugc-framing.js";

// The long-form timeline a render freezes: the run writes it, the editor reads it.

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const frame = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const audioArtifact = z.object({ key: z.string().min(1), sha256: digest, bytes: positive }).strict();
const semanticPlanSchema = z.object({ sourceTokens: z.array(z.string().min(1)).min(1).max(10000),
  inserts: z.array(z.object({ insertId: z.string().min(1), mediaId: z.string().min(1),
    startWord: frame, endWord: positive, coverWord: positive.optional() }).strict()).max(MAX_INSERTS) }).strict();
const interval = { position: positive, startFrame: frame, endFrame: positive };
const actorSlot = z.object({ ...interval, kind: z.literal("actor"), requestHash: digest,
  speechDurationSec: z.number().positive().finite(), audio: audioArtifact.optional(),
  /** The actor's view the take is rendered from (#972); absent keeps the hash of every take frozen before it. */
  gaze: z.enum(["camera", "left", "right"]).optional() }).strict();
const mediaSlot = z.object({ ...interval, kind: z.literal("media"), key: z.string().min(1), sha256: digest,
  bytes: positive, width: positive, height: positive, durationSec: z.number().positive().finite(),
  mediaType: z.enum(["image", "video"]), contentType: z.enum(["image/png", "image/jpeg", "video/mp4"]),
  insertId: z.string().min(1).optional() }).strict();
/** A freeze of the take before it, or of the one after it at an opening, while others speak (reference-elements S3, #972): no vendor renders it. */
const holdSlot = z.object({ ...interval, kind: z.literal("hold"), sourcePosition: positive }).strict();
/** The presenter listening between the take before it and the hold that freezes it (S4d, D1): a silent alpha take, billed as face seconds. */
const liveSlot = z.object({ ...interval, kind: z.literal("live"), sourcePosition: positive, requestHash: digest }).strict();
/** `exit` and `enterFrames` (#973 S3) are absent on every layer frozen before them, which keeps their hash; the enter offset is in `startFrame`. */
const layerMedia = { id: z.string().min(1).max(64), startFrame: frame, endFrame: positive, enter: z.enum(LAYER_ENTERS),
  exit: z.enum(LAYER_EXITS).optional(), enterFrames: positive.optional(),
  key: z.string().min(1), sha256: digest, bytes: positive, width: positive, height: positive,
  mediaType: z.enum(["image", "video"]), contentType: z.enum(["image/png", "image/jpeg", "video/mp4"]) };
/** An overlay or layout window drawn over the slots (#778 S2b); optional, so a timeline frozen without it keeps its hash. */
/** An overlay holds its preset position or its place as admitted (#973 S1): absent `place` keeps the hash of every overlay frozen before it. */
const layerSlot = z.discriminatedUnion("kind", [
  z.object({ ...layerMedia, kind: z.literal("overlay"), position: z.enum(OVERLAY_POSITIONS).optional(), place: place.optional() }).strict()
    .refine(layer => (layer.position === undefined) !== (layer.place === undefined), { path: ["position"], message: "an overlay holds a position or a place" }),
  z.object({ ...layerMedia, kind: z.literal("window"), layout: z.enum(LAYOUT_WINDOW_KINDS), blurPresenter: z.boolean() }).strict(),
]);
/** A frozen template, in a long-form timeline or in a single take's record. */
export const resolvedTimelineTemplate = z.object({ id: z.string().min(1).max(64), kind: z.string().min(1).max(64), kindVersion: positive,
  placement: z.enum(TEMPLATE_PLACEMENTS), preset: z.string().min(1).max(64), startFrame: frame, endFrame: positive,
  /** The run's accent as admitted (#778 S3a(iii)); absent draws the preset's own. */
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  data: z.record(z.string(), z.unknown()),
  /** A full frame's wipe, flash or zoom; absent is a cut. */
  transition: z.enum(["wipe", "flash", "zoom"]).optional(),
  /** Its place as admitted (#973 S4); absent draws the kind's own rect and keeps the hash of every template frozen before it. */
  place: place.optional(),
  /** Each beat's frame from its start, resolved from the words (#778 S3b(i)); absent when the kind has none. */
  moments: z.array(frame).min(1).max(6).optional(),
  /** The sound of each beat it plays, frozen at admission (#778 S3c); absent plays none, as every run before S3c. */
  sounds: z.partialRecord(z.enum(TEMPLATE_SOUND_BEATS), z.string().regex(/^[a-z][a-z0-9_]{0,31}$/)).optional(),
  /** The pinned bytes of each media slot (#778 S3a(ii)); absent when the template has none. */
  media: z.array(z.object({ slot: z.string().min(1).max(32), key: z.string().min(1), sha256: digest, bytes: positive, width: positive, height: positive,
    contentType: z.enum(["image/png", "image/jpeg", "video/mp4"]) }).strict()).min(1).max(4).optional() }).strict();
const contentSchema = z.object({ version: z.literal(1), mode: z.enum(["segments", "script_inserts"]),
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), accountId: z.string().min(1).max(200), inputHash: digest,
  fps: z.literal(CANVAS_FPS), outputFrames: positive, fullSpeechDurationSec: z.number().positive().finite(),
  slots: z.array(z.discriminatedUnion("kind", [actorSlot, mediaSlot, holdSlot, liveSlot])).min(1).max(RESOLVED_TIMELINE_MAX_SLOTS),
  warnings: z.array(z.string().max(2000)).max(100),
  narration: audioArtifact.extend({ alignmentHash: digest, semanticPlan: semanticPlanSchema }).strict().optional(),
  layers: z.array(layerSlot).min(1).max(MAX_OVERLAYS + MAX_LAYOUT_WINDOWS).optional(),
  /** Templates with the data as admitted and the kind version they were admitted at (#778 S3, D11); absent keeps the hash. */
  templates: z.array(resolvedTimelineTemplate).min(1).max(MAX_TEMPLATES).optional(),
  /** The edit sound a run with edit_sounds plays on its cuts, frozen at admission (reference-elements S1); absent keeps the hash and plays none. */
  editSound: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).optional(),
  /** Presenter sizes by frame (reference-elements S2); absent keeps the hash, and a flash is the only transition written. */
  framing: z.array(z.object({ id: z.string().min(1).max(64), startFrame: frame, endFrame: positive, size: z.enum(FRAMING_SIZES),
    transition: z.literal("flash").optional() }).strict()).min(1).max(MAX_FRAMING).optional(),
  /** A run's call (#857 S5, D2): its levelled audio, mixed into the narration's gap from its first word to its last; absent keeps the hash. */
  call: audioArtifact.extend({ startFrame: frame, endFrame: positive }).strict().optional(),
  /** The talking takes' crop (#910 S4d, #924), frozen so a resume asks for the same takes; absent keeps the hash and crops nothing. */
  talkingCrop: z.object({ k: z.number().positive().finite(), anchor: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]) }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.call) {
    const gap = value.slots.filter(slot => slot.kind === "live" || slot.kind === "hold");
    if (value.mode !== "script_inserts" || !gap.some(slot => slot.kind === "hold") || value.call.key !== `runs/${value.runId}/narration/${value.call.sha256}.wav` ||
        value.call.startFrame < gap[0]!.startFrame || value.call.endFrame <= value.call.startFrame || value.call.endFrame > gap.at(-1)!.endFrame) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["call"], message: "a call lies inside its hold's gap, as narration audio of the run" });
    }
  }
  if (value.editSound !== undefined && value.mode !== "script_inserts") context.addIssue({ code: z.ZodIssueCode.custom, path: ["editSound"],
    message: "an edit sound needs a narrated timeline" });
  for (const [index, item] of (value.framing ?? []).entries()) {
    const others = value.framing!.slice(0, index);
    if (value.mode !== "script_inserts" || item.endFrame <= item.startFrame || item.endFrame > value.outputFrames ||
        others.some(other => other.id === item.id || (other.startFrame < item.endFrame && item.startFrame < other.endFrame))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["framing", index], message: "invalid framing interval or identity" });
    }
  }
  const ids = new Set<string>();
  for (const [index, template] of (value.templates ?? []).entries()) {
    if (value.mode !== "script_inserts" || template.endFrame <= template.startFrame || template.endFrame > value.outputFrames || ids.has(template.id) ||
        template.moments?.some(moment => moment >= template.endFrame - template.startFrame) ||
        value.layers?.some(layer => layer.id === template.id) || template.media?.some(media => !media.key.startsWith(`runs/${value.runId}/`))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["templates", index], message: "invalid template interval or identity" });
    }
    ids.add(template.id);
  }
  ids.clear();
  for (const [index, layer] of (value.layers ?? []).entries()) {
    if (value.mode !== "script_inserts" || layer.endFrame <= layer.startFrame || layer.endFrame > value.outputFrames || ids.has(layer.id) ||
        !layer.key.startsWith(`runs/${value.runId}/`) || (layer.kind === "window" && layer.blurPresenter && layer.layout !== "card") ||
        (layer.mediaType === "video") !== (layer.contentType === "video/mp4")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index], message: "invalid layer interval, identity or artifact" });
    }
    ids.add(layer.id);
  }
  let cursor = 0; let speech = 0; let actors = 0;
  const hashes = new Set<string>();
  for (const [index, slot] of value.slots.entries()) {
    const failures: string[] = [];
    const check = (ok: boolean, code: string) => { if (!ok) failures.push(code); };
    check(slot.position === index + 1, "position");
    check(slot.startFrame === cursor && slot.endFrame > cursor, "frame_interval");
    if (slot.kind === "actor") {
      actors++; speech += slot.speechDurationSec;
      check(!hashes.has(slot.requestHash), "duplicate_actor_request");
      check(slot.speechDurationSec <= (slot.endFrame - slot.startFrame) / value.fps &&
        (slot.endFrame - slot.startFrame) / value.fps - slot.speechDurationSec < 1 / value.fps + 1e-9, "speech_duration");
      hashes.add(slot.requestHash);
      check(value.mode === "segments" ? slot.audio === undefined : slot.audio !== undefined &&
        slot.audio.key === `runs/${value.runId}/narration/${slot.audio.sha256}.wav`, "actor_audio_binding");
    } else if (slot.kind === "hold") {
      check(value.mode === "script_inserts", "hold_mode");
      // An interview's hold with no take before it freezes the first frame of the take after it (#972).
      check((slot.sourcePosition === slot.position - 1 && ["actor", "live"].includes(value.slots[index - 1]?.kind ?? "")) ||
        (slot.sourcePosition === slot.position + 1 && !["actor", "live"].includes(value.slots[index - 1]?.kind ?? "") &&
          value.slots[index + 1]?.kind === "actor"), "hold_source");
    } else if (slot.kind === "live") {
      const next = value.slots[index + 1];
      check(value.mode === "script_inserts", "live_mode");
      check(slot.sourcePosition === slot.position - 1 && value.slots[index - 1]?.kind === "actor", "live_source");
      check(next?.kind === "hold" && next.sourcePosition === slot.position, "live_hold");
      check(!hashes.has(slot.requestHash), "duplicate_actor_request");
      hashes.add(slot.requestHash);
    } else {
      let frames = 0;
      try { frames = slot.mediaType === "image" ? secondsToFrames(slot.durationSec, value.fps) : completeFrames(slot.durationSec, value.fps); }
      catch { /* Invalid sub-frame video is reported as a schema issue below. */ }
      check(slot.key.startsWith(`runs/${value.runId}/`), "media_binding");
      check(slot.endFrame - slot.startFrame === frames, "media_frame_count");
      check(slot.mediaType === "video" ? slot.contentType === "video/mp4" : slot.contentType !== "video/mp4", "media_content_type");
      check(value.mode === "segments" ? slot.insertId === undefined : slot.insertId !== undefined, "insert_identity");
    }
    if (failures.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["slots", index], message: `invalid resolved interval or artifact: ${failures.join(", ")}` });
    cursor = slot.endFrame;
  }
  let validNarration = value.narration === undefined;
  if (value.mode === "script_inserts" && value.narration) {
    const ids = value.slots.flatMap(slot => slot.kind === "media" ? [slot.insertId] : []);
    const anchors = value.narration.semanticPlan.inserts;
    validNarration = value.narration.key === `runs/${value.runId}/narration/${value.narration.sha256}.wav` &&
      value.fullSpeechDurationSec <= value.outputFrames / value.fps &&
      value.outputFrames / value.fps - value.fullSpeechDurationSec < 1 / value.fps + 1e-9 &&
      ids.length === anchors.length && new Set(ids).size === ids.length &&
      anchors.every((anchor, index) => ids.includes(anchor.insertId) && anchor.startWord < anchor.endWord &&
        anchor.endWord <= coverWordOf(anchor) && coverWordOf(anchor) <= value.narration!.semanticPlan.sourceTokens.length &&
        (index === 0 || anchor.startWord >= coverWordOf(anchors[index - 1]!)));
  } else if (value.mode === "script_inserts") validNarration = false;
  if (!actors || cursor !== value.outputFrames || !validNarration ||
      (value.mode === "segments" && Math.abs(speech - value.fullSpeechDurationSec) > 1e-9)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "resolved coverage or speech duration mismatch" });
  }
});

export type ResolvedTimelineContent = z.infer<typeof contentSchema>;
export type ResolvedTimeline = ResolvedTimelineContent & { hash: string };
export type ResolvedTimelineLayer = NonNullable<ResolvedTimelineContent["layers"]>[number];
export type ResolvedTimelineTemplate = NonNullable<ResolvedTimelineContent["templates"]>[number];
export type ResolvedTimelineFraming = NonNullable<ResolvedTimelineContent["framing"]>[number];
export type ResolvedTimelineHold = Extract<ResolvedTimelineContent["slots"][number], { kind: "hold" }>;
export type ResolvedTimelineLive = Extract<ResolvedTimelineContent["slots"][number], { kind: "live" }>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("unserializable timeline value");
  return encoded;
}

export function timelineDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export function freezeResolvedTimeline(value: unknown): ResolvedTimeline {
  const content = contentSchema.parse(value);
  return immutable({ ...content, hash: timelineDigest(content) });
}

export function readResolvedTimeline(value: unknown): ResolvedTimeline {
  const envelope = z.object({ hash: digest }).passthrough().parse(value);
  const { hash, ...content } = envelope;
  const result = freezeResolvedTimeline(content);
  if (hash !== result.hash) throw new Error("resolved timeline hash mismatch");
  return result;
}

/** The face-billing units of a timeline: each actor slot is one unit whose face shows over its whole interval; a hold is none.
 *  A live slot is one too (S4d, C9), optional: a take that falls back (D8) is neither shown nor charged. */
export function faceBillingUnitsOf(timeline: ResolvedTimelineContent) {
  return timeline.slots.flatMap(slot => slot.kind === "actor" || slot.kind === "live" ? [{
    unitId: slot.kind === "live" ? `live:${slot.position}` : `segment:${slot.position}`,
    requestHash: slot.requestHash, audioDurationSec: (slot.endFrame - slot.startFrame) / timeline.fps,
    faceIntervals: [{ startFrame: slot.startFrame, endFrame: slot.endFrame }], ...(slot.kind === "live" ? { optional: true as const } : {}) }] : []);
}

/** Where a run's resolved timeline is stored, and the most bytes it may take there. */
export const resolvedTimelineKey = (runId: string): string => `runs/${runId}/resolved-timeline.v1.json`;
export const RESOLVED_TIMELINE_MAX_BYTES = 512_000;
