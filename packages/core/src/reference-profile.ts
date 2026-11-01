import { z } from "zod";
import { REFERENCE_GRAPHIC_KINDS, REFERENCE_SOURCE_KINDS, type REFERENCE_DESCRIBED_KINDS, type ReferenceGraphicKind, type ReferenceSourceKind } from "./reference-kinds.js";
import { referenceStaging, stagingIssues, stagingRect } from "./reference-staging.js";
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
const frameSecond = z.number().int().min(0);
export const MAX_BEAT_FRAMES = 12;

const referenceGraphic = z.strictObject({
  kind: z.enum(REFERENCE_GRAPHIC_KINDS),
  source_kind: z.enum(REFERENCE_SOURCE_KINDS).describe("The analyser's own word for it, or other."),
  position: z.enum(REFERENCE_POSITIONS),
  state_changes: z.array(z.strictObject({ at_frac: frac.describe("Share of the beat."), change: z.enum(REFERENCE_STATE_CHANGES) })).max(12),
  label_hint: text(MAX_REFERENCE_LABEL_CHARS).describe("What it shows, read off the screen, such as \"Blue banner 'DEVELOP THE STORY'\"; empty when it gave none."),
});

/** Who speaks, where they look and what their hands do (#978): closed lists, each claim with the seconds of the frames that show it. */
export const REFERENCE_SPEAKER_ROLES = ["presenter", "interviewer", "guest", "narrator", "other"] as const;
export const REFERENCE_MOUTHS = ["moving", "closed", "not_visible"] as const;
export const REFERENCE_MOUTH_MEASURES = ["moving", "still", "not_measured"] as const;
export const REFERENCE_GAZES = ["camera", "off_left", "off_right", "up", "down", "closed", "mixed", "not_visible"] as const;
export const REFERENCE_GESTURES = ["both_hands_to_viewer", "point_at_viewer", "point_at_element", "count_on_fingers", "hold_object", "open_palms", "wave",
  "shrug", "thumbs_up", "other"] as const;
export const MAX_REFERENCE_SPEAKERS = 6;
export const MAX_REFERENCE_SEGMENTS = 200;
export const MAX_CLAIM_FRAMES = 6;
export const MAX_REFERENCE_SPELLINGS = 40;
export const speakerId = z.string().regex(/^[a-z0-9_]{1,24}$/);
/** A frame's time: a whole second, or the end frame's (#989), which lies between the last second and the reel's end. */
const claimSecond = z.number().min(0);
const claimFrames = z.array(claimSecond).max(MAX_CLAIM_FRAMES);
const unitRect = z.strictObject({ left: frac, top: frac, width: frac, height: frac });

export const referenceSpeaker = z.strictObject({
  id: speakerId.describe("presenter for the person on camera; off_screen_1, on_screen_2… for the others."),
  on_screen: z.boolean().describe("false for a voice whose speaker the reel never shows, such as an interviewer behind the camera."),
  role: z.enum(REFERENCE_SPEAKER_ROLES),
  word_count: z.number().int().min(0),
  caption: z.strictObject({
    colour: z.string().regex(/^#[0-9A-F]{6}$/).nullable(), style: text(80), position: z.enum(REFERENCE_CAPTION_POSITIONS).nullable(),
    box: unitRect.optional().describe("Where this speaker's caption sits, in shares of the frame, as seen in the picture."),
  }).nullable().describe("This speaker's caption look; null when their words have no caption."),
  frames_s: claimFrames.describe("Seconds of frames where this speaker talks."),
});
export type ReferenceSpeaker = z.infer<typeof referenceSpeaker>;

export const referenceSegment = z.strictObject({
  start_s: seconds, end_s: seconds, text: text(MAX_REFERENCE_SUMMARY_CHARS),
  speaker: z.string().min(1).max(40).describe("A speakers[].id in a full analysis; the transcription's label in a data one."),
  mouth: z.strictObject({
    vision: z.enum(REFERENCE_MOUTHS).nullable().describe("The presenter's mouth as seen in the picture while these words play."),
    measured: z.enum(REFERENCE_MOUTH_MEASURES).describe("The presenter's mouth motion measured on the frames, against the reel's other segments."),
    score: z.number().min(0).nullable().describe("Mouth-region motion over eye-region motion; higher moves more."),
  }).optional(),
  frames_s: claimFrames,
});
export type ReferenceSegment = z.infer<typeof referenceSegment>;

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
  /** Optional since #979: the frames that show the beat, as seconds of the analysis's one-a-second frames. */
  key_frame_s: frameSecond.optional().describe("The second whose frame shows the beat, nearest its middle."),
  frames_s: z.array(claimSecond).max(MAX_BEAT_FRAMES).optional().describe("The seconds of the frames inside the beat, at most 12, evenly spread."),
  /** Optional since #978; since #989 the beat's last words, not its longest speaker. */
  speaker: speakerId.nullable().optional()
    .describe("The speakers[].id of the beat's last words: the answer in a question-and-answer beat; null when nobody speaks."),
  /** Optional since #989. */
  speakers: z.array(z.strictObject({ id: speakerId, seconds })).max(MAX_REFERENCE_SPEAKERS).optional()
    .describe("Everyone heard in the beat, in the order they first speak, with their seconds of speech."),
  gaze: z.strictObject({ direction: z.enum(REFERENCE_GAZES), frames_s: claimFrames }).optional()
    .describe("Where the presenter looks for most of the beat; off_left and off_right are toward that edge of the image; mixed when no direction holds 60%."),
  gestures: z.array(z.strictObject({ kind: z.enum(REFERENCE_GESTURES), at_s: seconds, label: text(80), frames_s: claimFrames })).max(4).optional()
    .describe("Notable gestures in the beat, such as both hands toward the viewer at the call to action."),
});

export const referenceWord = z.strictObject({ text: z.string().min(1).max(64), start_s: seconds, end_s: seconds,
  speaker: z.string().min(1).max(40).optional().describe("The transcription's speaker label, such as speaker_0; absent when it gave none.") });
export const referenceLanguage = z.string().regex(/^[a-z]{2,3}$/).nullable()
  .describe("The spoken language the transcription detected, an ISO 639 code such as eng or ara; null when it named none.");
export const referenceHook = z.strictObject({
  text: text(MAX_REFERENCE_SUMMARY_CHARS).describe(`The words that start in the first ${REFERENCE_HOOK_SECONDS} s, through the end of their sentence `
    + `(no word starting past ${REFERENCE_HOOK_MAX_SECONDS} s); empty when none do.`),
  end_s: seconds.describe("Where the hook's last word ends, else where its window does."),
  caption: text(MAX_REFERENCE_LABEL_CHARS).optional().describe("The first on-screen caption line read inside the hook's window."),
});

const profileHead = {
  version: z.literal(REFERENCE_PROFILE_VERSION),
  source: z.strictObject({ digest: z.string().regex(/^sha256:[0-9a-f]{64}$/), duration_s: z.number().positive(), width: z.number().int().positive(),
    height: z.number().int().positive(), url: z.string().url().max(2048).optional() }),
  format: z.enum(REFERENCE_FORMATS),
  beats: z.array(referenceBeat).min(1).max(40),
  captions: z.strictObject({ present: z.boolean(), words_per_caption_max: z.number().int().min(1).max(12), position: z.enum(REFERENCE_CAPTION_POSITIONS),
    emphasis_style: z.enum([...CAPTION_EMPHASIS_LOOKS, "none"]), hidden_under_graphics: z.boolean(),
    /** Optional since #973 S5: a profile without it parses, and the remake infers a layer under the captions from position. */
    box: stagingRect.optional().describe("The caption block's box, in shares of the frame.") }),
  pacing: z.strictObject({ layer_change_every_s: z.number().positive(), face_share: frac }),
  palette: z.array(z.string().regex(/^#[0-9A-F]{6}$/)).max(8),
  music: text(200),
  unmapped: z.array(z.strictObject({ what: text(200), beat_index: z.number().int().min(0), suggested_substitute: text(200) })).max(40),
};
const analysisWarnings = { warnings: z.array(text(200)).max(8).optional().describe("What the analysis could not measure, such as the voice; also in warnings[].") };
const profileTail = {
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
  /** Optional since #990. */
  transcript_language: referenceLanguage.optional(),
  hook: referenceHook.optional(),
  /** Optional since #978: who speaks, on or off screen, with each one's caption look; segments are the transcript as turns. */
  speakers: z.array(referenceSpeaker).max(MAX_REFERENCE_SPEAKERS).optional(),
  segments: z.array(referenceSegment).max(MAX_REFERENCE_SEGMENTS).optional().describe("The transcript as timed segments, each with its speaker."),
  /** Optional since #989. */
  spellings: z.array(z.strictObject({ heard: text(MAX_REFERENCE_LABEL_CHARS), shown: text(MAX_REFERENCE_LABEL_CHARS), start_s: seconds, end_s: seconds }))
    .max(MAX_REFERENCE_SPELLINGS).optional()
    .describe("Names heard one way while the screen spells them another at the same time, such as heard Piggs Field, shown Higgsfield; " +
      "transcript and segments keep the heard words."),
};
type ProfileBody = z.infer<z.ZodObject<typeof profileHead & typeof profileTail>>;
function checkProfile(profile: ProfileBody, ctx: z.RefinementCtx): void {
  const issue =(path: (string | number)[], message: string) => ctx.addIssue({ code: customIssue, path, message });
  const duration = profile.source.duration_s;
  profile.transcript?.forEach((word, index) => {
    if (word.end_s < word.start_s) issue(["transcript", index, "end_s"], "ends before the word starts");
    else if (word.end_s > duration) issue(["transcript", index, "end_s"], `lies past the source's ${duration} s`);
    if (index && word.start_s < profile.transcript![index - 1]!.start_s) issue(["transcript", index, "start_s"], "starts before the word before it: words are in order");
  });
  if (profile.hook && profile.hook.end_s > duration) issue(["hook", "end_s"], `lies past the source's ${duration} s`);
  const ids = new Set(profile.speakers?.map(speaker => speaker.id) ?? []);
  profile.speakers?.forEach((speaker, index) => {
    if (profile.speakers!.findIndex(other => other.id === speaker.id) < index) issue(["speakers", index, "id"], "names a speaker twice");
    if (speaker.frames_s.some(t => t >= duration)) issue(["speakers", index, "frames_s"], `cites a second past the ${duration} s source`);
  });
  profile.segments?.forEach((segment, index) => {
    if (segment.end_s < segment.start_s || segment.end_s > duration) issue(["segments", index, "end_s"], "ends before it starts or past the source");
    if (profile.speakers && !ids.has(segment.speaker)) issue(["segments", index, "speaker"], `${segment.speaker} is not in speakers`);
    if (segment.frames_s.some(t => t >= duration)) issue(["segments", index, "frames_s"], `cites a second past the ${duration} s source`);
  });
  if (profile.staging) {
    for (const found of stagingIssues(profile.staging, profile.beats, profile.source.duration_s)) issue(["staging", ...found.path], found.message);
  }
  profile.beats.forEach((beat, index) => {
    if (beat.end_frac <= beat.start_frac) issue(["beats", index, "end_frac"], "ends where or before the beat starts");
    else if (beat.end_s <= beat.start_s) issue(["beats", index, "end_s"], "ends where or before the beat starts");
    if (beat.end_s > profile.source.duration_s) issue(["beats", index, "end_s"], `lies past the source's ${profile.source.duration_s} s`);
    for (const t of [...beat.key_frame_s === undefined ? [] : [beat.key_frame_s], ...beat.frames_s ?? [], ...beat.gaze?.frames_s ?? [],
      ...(beat.gestures ?? []).flatMap(gesture => gesture.frames_s)]) {
      if (t >= duration) issue(["beats", index, "frames_s"], `second ${t} has no frame in the ${duration} s source`);
    }
    if (beat.speaker && !ids.has(beat.speaker)) issue(["beats", index, "speaker"], `${beat.speaker} is not in speakers`);
    beat.speakers?.forEach((heard, at) => { if (!ids.has(heard.id)) issue(["beats", index, "speakers", at, "id"], `${heard.id} is not in speakers`); });
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
}
/** The profile's fields but `analysis`, and its checks: the profile as kept with an analysis is built from them where it is written. */
export const referenceProfileShape = { ...profileHead, ...profileTail };
export const checkReferenceProfile = checkProfile;
export const referenceAnalysisWarningsField = analysisWarnings;
/** The profile an answer carries: `analysis` holds only its warnings. */
export const referenceProfileAnswer = z.strictObject({ ...profileHead, analysis: z.strictObject(analysisWarnings), ...profileTail }).superRefine(checkProfile);
export type ReferenceProfileAnswer = z.infer<typeof referenceProfileAnswer>;
/** The profile a client passes back: any other `analysis` field is dropped, so one read before the answer shed them still compiles. */
export const referenceProfileInput = z.strictObject({ ...profileHead, analysis: z.object(analysisWarnings), ...profileTail }).superRefine(checkProfile);
export type ReferenceProfileInput = z.infer<typeof referenceProfileInput>;
/** Readers keep a newer profile whole and need only the gaps it names. */
export const referenceProfileRead = z.looseObject({ version: z.string(), beats: z.array(z.looseObject({ role: z.string() })).default([]),
  unmapped: z.array(z.looseObject({ what: z.string(), beat_index: z.number(), suggested_substitute: z.string() })).default([]) });

/** The second of the one-a-second frames that shows a span: the one nearest its middle inside it, else the nearest, within the reel. */
export function keyFrameSecond(start: number, end: number, duration: number): number {
  const lo = Math.ceil(start), hi = Math.floor(end - 1e-6), middle = Math.round((start + end) / 2);
  const t = lo <= hi ? Math.min(hi, Math.max(lo, middle)) : middle;
  return Math.max(0, Math.min(Math.ceil(duration - 1e-6) - 1, t));
}

/** The end frame (#989): one frame just before the reel's end, when the last second's frame leaves at least this long unseen after it. */
export const END_FRAME_GAP_S = 0.3;
const END_FRAME_BEFORE_S = 0.1;
/** The end frame's time, a tenth of a second, or null when the last second's frame is close enough to the end. */
export function endFrameSecond(duration: number): number | null {
  const last = Math.max(0, Math.ceil(duration - 1e-6) - 1), end = Math.floor((duration - END_FRAME_BEFORE_S) * 10 + 1e-6) / 10;
  return end - last >= END_FRAME_GAP_S - 1e-6 ? end : null;
}

/** The first frame at or after `t`: a moment's proof shows it happening, not the second before it; past the last frame, the last. */
export function frameAtOrAfter(t: number, duration: number): number {
  const last = Math.max(0, Math.ceil(duration - 1e-6) - 1), next = Math.max(0, Math.ceil(t - 1e-6));
  return next <= last ? next : endFrameSecond(duration) ?? last;
}

/** The seconds whose frames lie inside a span, the end frame among them, at most `max`, evenly spread with both ends kept. */
export function spanFrameSeconds(start: number, end: number, duration: number, max = MAX_BEAT_FRAMES): number[] {
  const lo = Math.max(0, Math.ceil(start)), hi = Math.min(Math.floor(end - 1e-6), Math.ceil(duration - 1e-6) - 1), last = endFrameSecond(duration);
  const all = [...Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i), ...last !== null && last >= start && last < end ? [last] : []];
  if (!all.length) return [keyFrameSecond(start, end, duration)];
  if (all.length <= max) return all;
  return [...new Set(Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]!))];
}

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
