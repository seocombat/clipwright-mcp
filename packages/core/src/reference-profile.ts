import { z } from "zod";
import { REFERENCE_GRAPHIC_KINDS, REFERENCE_SOURCE_KINDS, type REFERENCE_DESCRIBED_KINDS, type ReferenceGraphicKind, type ReferenceSourceKind } from "./reference-kinds.js";
import { referenceStaging, stagingIssues } from "./reference-staging.js";
import { referenceVoice } from "./reference-voice.js";
import { CAPTION_EMPHASIS_LOOKS } from "./skills.js";
import { TEMPLATE_KIND_IDS, TEMPLATE_SOUND_BEATS } from "./templates/index.js";
import { PRESENTER_FRAMINGS } from "./ugc-layers.js";

export { REFERENCE_DESCRIBED_KINDS, REFERENCE_GRAPHIC_KINDS, REFERENCE_SOURCE_KINDS, type ReferenceGraphicKind, type ReferenceSourceKind } from "./reference-kinds.js";

// Reference profile (reference-to-video S1): a reference ad's style in our vocabulary, beats in shares of its length, never its media.

export const REFERENCE_PROFILE_VERSION = "reference-profile-v1";
export const REFERENCE_FORMATS = ["talking_head_graphics", "faceless", "broll", "other"] as const;
export const REFERENCE_BEAT_ROLES = ["hook", "problem", "agitation", "solution", "demo", "proof", "before_after", "social_proof", "offer", "cta",
  "other"] as const;
export const REFERENCE_POSITIONS = ["full_screen", "top", "center", "bottom", "top_left", "top_right", "bottom_left", "bottom_right", "split_top",
  "split_bottom", "other"] as const;
export type ReferencePosition = (typeof REFERENCE_POSITIONS)[number];
export const REFERENCE_CAMERAS = ["static", "punch_in", "zoom_out", "shake", "other"] as const;
export const REFERENCE_TRANSITIONS = ["none", "cut", "wipe", "flash", "zoom", "other"] as const;
export const REFERENCE_SOUND_KINDS = [...TEMPLATE_SOUND_BEATS, "music", "recorded_audio", "other"] as const;
export const REFERENCE_PRESENTER_BEHAVIOURS = ["speaking", "listening", "reacting", "absent"] as const;
export const REFERENCE_CAPTION_POSITIONS = ["top", "middle", "lower", "bottom"] as const;
export const MAX_REFERENCE_SUMMARY_CHARS = 200;
export const MAX_REFERENCE_LABEL_CHARS = 120;
/** The transcribed words of a 120 s reference stay well under this (Ana, 69 s: 147 words). */
export const MAX_REFERENCE_TRANSCRIPT_WORDS = 1000;
/** The hook is the reference's first 3 s, carried to the end of its sentence but never past 6 s. */
export const REFERENCE_HOOK_SECONDS = 3;
export const REFERENCE_HOOK_MAX_SECONDS = 6;
/** What a graphic does at a state change, in a closed set. The reference's words live in transcript, hook, spoken_summary and label_hint. */
export const REFERENCE_STATE_CHANGES = ["appears", "disappears", "toggles_on", "toggles_off", "checked", "value_changes", "highlighted", "other"] as const;
export type ReferenceStateChange = (typeof REFERENCE_STATE_CHANGES)[number];

const customIssue = "custom" as const;
const frac = z.number().min(0).max(1);
const seconds = z.number().min(0);
const text = (max: number) => z.string().max(max);

const referenceGraphic = z.strictObject({
  kind: z.enum(REFERENCE_GRAPHIC_KINDS),
  source_kind: z.enum(REFERENCE_SOURCE_KINDS).describe("The analyser's own word for it, or other."),
  position: z.enum(REFERENCE_POSITIONS),
  state_changes: z.array(z.strictObject({ at_frac: frac.describe("Share of the beat."), change: z.enum(REFERENCE_STATE_CHANGES) })).max(12),
  label_hint: text(MAX_REFERENCE_LABEL_CHARS).describe("What the vision pass saw on it, in its words, such as \"Blue banner 'DEVELOP THE STORY'\"; empty when it gave none."),
});

const referenceBeat = z.strictObject({
  start_frac: frac, end_frac: frac,
  start_s: seconds.describe("Seconds of the reference, kept as evidence only."), end_s: seconds,
  role: z.enum(REFERENCE_BEAT_ROLES),
  spoken_summary: text(MAX_REFERENCE_SUMMARY_CHARS).describe("The words spoken in the beat, cut at 200 characters; empty when none were heard."),
  graphics: z.array(referenceGraphic).max(8),
  camera: z.enum(REFERENCE_CAMERAS),
  transition_in: z.enum(REFERENCE_TRANSITIONS),
  sounds: z.array(z.strictObject({ at_frac: frac, kind: z.enum(REFERENCE_SOUND_KINDS) })).max(12),
  presenter_behaviour: z.enum(REFERENCE_PRESENTER_BEHAVIOURS),
});

export const referenceWord = z.strictObject({ text: z.string().min(1).max(64), start_s: seconds, end_s: seconds,
  speaker: z.string().min(1).max(40).optional().describe("The transcription's speaker label, such as speaker_0; absent when it gave none.") });
export const referenceHook = z.strictObject({
  text: text(MAX_REFERENCE_SUMMARY_CHARS).describe(`The words that start in the first ${REFERENCE_HOOK_SECONDS} s, through the end of their sentence `
    + `(no word starting past ${REFERENCE_HOOK_MAX_SECONDS} s); empty when none do.`),
  end_s: seconds.describe("Where the hook's last word ends, else where its window does."),
  caption: text(MAX_REFERENCE_LABEL_CHARS).optional().describe("The first on-screen caption line the vision pass read inside the hook's window."),
});

export const referenceProfile = z.strictObject({
  version: z.literal(REFERENCE_PROFILE_VERSION),
  source: z.strictObject({ digest: z.string().regex(/^sha256:[0-9a-f]{64}$/), duration_s: z.number().positive(), width: z.number().int().positive(),
    height: z.number().int().positive(), url: z.string().url().max(2048).optional() }),
  format: z.enum(REFERENCE_FORMATS),
  beats: z.array(referenceBeat).min(1).max(40),
  captions: z.strictObject({ present: z.boolean(), words_per_caption_max: z.number().int().min(1).max(12), position: z.enum(REFERENCE_CAPTION_POSITIONS),
    emphasis_style: z.enum([...CAPTION_EMPHASIS_LOOKS, "none"]), hidden_under_graphics: z.boolean() }),
  pacing: z.strictObject({ layer_change_every_s: z.number().positive(), face_share: frac }),
  palette: z.array(z.string().regex(/^#[0-9A-F]{6}$/)).max(8),
  music: text(200),
  unmapped: z.array(z.strictObject({ what: text(200), beat_index: z.number().int().min(0), suggested_substitute: text(200) })).max(40),
  analysis: z.strictObject({ models: z.array(z.string().min(1).max(60)).min(1), cost_usd: z.number().min(0).optional(),
    latency_ms: z.number().int().min(0),
    warnings: z.array(text(200)).max(8).optional().describe("What the analysis could not measure, such as the voice pass; also in warnings[].") }),
  /** Optional since S7: a profile written before it has none and still parses. */
  voice: referenceVoice.optional(),
  /** Optional since #884 S5d; absent reads as close. */
  presenter_framing: z.enum(PRESENTER_FRAMINGS).optional()
    .describe("wide: the top of the presenter's head is below ~35% of the frame height, with visible room above; close otherwise."),
  /** Optional since #884 S5d; absent reads as false. */
  presenter_mic: z.boolean().optional()
    .describe("true when the presenter holds a small handheld or clip-on microphone in their hand while speaking (not clipped to clothing)."),
  /** Optional since #914 D1: a profile without it parses, and every field inside it is absent when not measured. */
  staging: referenceStaging.optional(),
  /** Optional since #930 S1, as is hook: a profile written before them parses. */
  transcript: z.array(referenceWord).max(MAX_REFERENCE_TRANSCRIPT_WORDS).optional().describe("The reference's speech as timed words, in order."),
  hook: referenceHook.optional(),
}).superRefine((profile, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: customIssue, path, message });
  const duration = profile.source.duration_s;
  profile.transcript?.forEach((word, index) => {
    if (word.end_s < word.start_s) issue(["transcript", index, "end_s"], "ends before the word starts");
    else if (word.end_s > duration) issue(["transcript", index, "end_s"], `lies past the source's ${duration} s`);
    if (index && word.start_s < profile.transcript![index - 1]!.start_s) issue(["transcript", index, "start_s"], "starts before the word before it: words are in order");
  });
  if (profile.hook && profile.hook.end_s > duration) issue(["hook", "end_s"], `lies past the source's ${duration} s`);
  if (profile.staging) {
    for (const found of stagingIssues(profile.staging, profile.beats, profile.source.duration_s)) issue(["staging", ...found.path], found.message);
  }
  profile.beats.forEach((beat, index) => {
    if (beat.end_frac <= beat.start_frac) issue(["beats", index, "end_frac"], "ends where or before the beat starts");
    else if (beat.end_s <= beat.start_s) issue(["beats", index, "end_s"], "ends where or before the beat starts");
    if (beat.end_s > profile.source.duration_s) issue(["beats", index, "end_s"], `lies past the source's ${profile.source.duration_s} s`);
    const before = profile.beats[index - 1];
    if (before && beat.start_frac < before.end_frac) issue(["beats", index, "start_frac"], "overlaps the beat before it: beats are ordered and apart");
    beat.graphics.forEach((graphic, at) => {
      if ((graphic.kind === "particles" || graphic.kind === "unmapped") && !profile.unmapped.some(entry => entry.beat_index === index)) {
        issue(["beats", index, "graphics", at, "kind"], `${graphic.kind} is not drawn: name it in unmapped with a substitute (rule 3)`);
      }
    });
  });
  profile.unmapped.forEach((entry, index) => {
    if (entry.beat_index >= profile.beats.length) issue(["unmapped", index, "beat_index"], `there are ${profile.beats.length} beats`);
  });
});
export type ReferenceProfile = z.infer<typeof referenceProfile>;
/** Readers keep a newer profile whole and need only the gaps it names. */
export const referenceProfileRead = z.looseObject({ version: z.string(), beats: z.array(z.looseObject({ role: z.string() })).default([]),
  unmapped: z.array(z.looseObject({ what: z.string(), beat_index: z.number(), suggested_substitute: z.string() })).default([]) });

/** What the plan does not reproduce from its reference, one warning per unmapped entry (rule 3, C5). */
export function referenceProfileWarnings(profile: z.input<typeof referenceProfileRead> | undefined): string[] {
  if (!profile) return [];
  return (profile.unmapped ?? []).map(entry => {
    const role = profile.beats?.[entry.beat_index]?.role;
    return `Reference beat ${entry.beat_index + 1}${role ? ` (${role})` : ""}: ${entry.what} is not reproduced; instead: ${entry.suggested_substitute}.`;
  });
}

const DIRECT: Readonly<Record<string, ReferenceGraphicKind>> = {
  ...Object.fromEntries(TEMPLATE_KIND_IDS.map(kind => [kind, kind])),
  toggle_checklist: "checklist", before_after_split: "compare", split_screen: "layout_split", particles: "particles",
  // A banner or a comment box (its word to comment) is a short line on a strip, as our tag; a logo card is a brand on a card, as
  // title_card; a price card is a number, as stat. A concept card is a picture with a label, so it maps as product_ui does.
  banner: "tag", comment_box: "tag", logo_card: "title_card", price_card: "stat",
};
const SUBSTITUTES: Readonly<Record<string, string>> = {
  particles: "a stat or title_card on the same words; particles are not drawn",
};
/** The analyser's description of an element it called other, read for a kind; quoted on-screen text is left out, so a banner reading
 *  'NEW LOGO' stays a banner. */
const DESCRIBED: readonly (readonly [(typeof REFERENCE_DESCRIBED_KINDS)[number], RegExp])[] = [
  ["comment_box", /\bcomments?\b|\b(input|reply|text|message) (box|field|bar)\b/],
  ["logo_card", /\blogo\b/],
  ["price_card", /\bpric(e|es|ing)\b|\bdiscount\b|% off\b/],
  ["concept_card", /\bconcept\b|\bidea card\b|\bmood ?board\b/],
  ["banner", /\bbanner\b|\bplate\b|\bribbon\b|\bstrip\b/],
];
// A single quote closes only before a non-letter, so an apostrophe inside the quote ('DON'T COMMENT') does not end it.
const QUOTED = /"[^"]*"|“[^”]*”|(?<![\p{L}\p{N}])['‘].*?['’](?![\p{L}\p{N}])/gu;

/** An analyser's free-text state change as one of our categories; an unrecognised one is other, never kept as text. */
export function mapAnalyserStateChange(text: string): ReferenceStateChange {
  const s = text.trim().toLowerCase();
  if ((REFERENCE_STATE_CHANGES as readonly string[]).includes(s)) return s as ReferenceStateChange;
  if (/disappear|vanish|hide|hidden|remov|dismiss|fade[sd]? out|slide[sd]? out/.test(s)) return "disappears";
  if (/appear|show|pop|slide[sd]? in|fade[sd]? in|enter|reveal/.test(s)) return "appears";
  if (/\boff\b|uncheck|untick|disabl|deselect/.test(s)) return "toggles_off";
  if (/check|tick|complet|done/.test(s)) return "checked";
  if (/\bon\b|enabl|activat|select/.test(s)) return "toggles_on";
  if (/highlight|glow|pulse|flash|circl|emphasi/.test(s)) return "highlighted";
  if (/chang|updat|increas|decreas|count|grow|rise|fall|\d/.test(s)) return "value_changes";
  return "other";
}

/** The analyser's name for a graphic when it is one we know, else the kind its description names, else other. */
export function mapAnalyserSourceKind(text: string, description = ""): ReferenceSourceKind {
  const s = text.trim();
  if (s !== "other" && (REFERENCE_SOURCE_KINDS as readonly string[]).includes(s)) return s as ReferenceSourceKind;
  const plain = description.replace(QUOTED, " ").toLowerCase();
  return DESCRIBED.find(([, pattern]) => pattern.test(plain))?.[0] ?? "other";
}

/** Our kind for an analyser's graphic: product UI and screenshots fill the frame as an insert, or sit over the presenter; what we cannot draw
 * carries its substitute. */
export function mapAnalyserGraphic(kind: string, position?: ReferencePosition): { kind: ReferenceGraphicKind; unmapped?: string } {
  if (kind === "product_ui" || kind === "screenshot" || kind === "concept_card") return { kind: position === "full_screen" ? "insert_media" : "overlay_media" };
  const ours = Object.hasOwn(DIRECT, kind) ? DIRECT[kind]! : "unmapped";
  return ours === "particles" || ours === "unmapped"
    ? { kind: ours, unmapped: [ours, kind].filter(key => Object.hasOwn(SUBSTITUTES, key)).map(key => SUBSTITUTES[key]!)[0] ?? "a title_card with its label, or leave it out" }
    : { kind: ours };
}
