import { z } from "zod";
import { REFERENCE_BRING_KINDS, referenceBringItem } from "./reference-bring.js";
import { REFERENCE_GRAPHIC_KINDS, REFERENCE_SOURCE_KINDS, type REFERENCE_DESCRIBED_KINDS, type ReferenceGraphicKind, type ReferenceSourceKind } from "./reference-kinds.js";
import { pastTheSource, referenceStaging, stagingIssues, stagingRect } from "./reference-staging.js";
import { referenceVoice } from "./reference-voice.js";
import { CAPTION_EMPHASIS_LOOKS } from "./skills.js";
import { TEMPLATE_KIND_IDS, TEMPLATE_SOUND_BEATS } from "./templates/index.js";
import { PRESENTER_FRAMINGS } from "./ugc-layers.js";

export { REFERENCE_DESCRIBED_KINDS, REFERENCE_GRAPHIC_KINDS, REFERENCE_SOURCE_KINDS, type ReferenceGraphicKind, type ReferenceSourceKind } from "./reference-kinds.js";


export const REFERENCE_PROFILE_VERSION = "reference-profile-v1";
export const REFERENCE_FORMATS = ["talking_head_graphics", "faceless", "broll", "other"] as const;
export const REFERENCE_NO_PRESENTER_SHARE = 0.8;
export function referenceHasNoPresenter(profile: { format: string;
  beats: readonly { presenter_behaviour: string; start_frac: number; end_frac: number }[] }): boolean {
  const away = profile.beats.reduce((sum, beat) => sum + (beat.presenter_behaviour === "absent" ? beat.end_frac - beat.start_frac : 0), 0);
  return profile.format === "faceless" || away >= REFERENCE_NO_PRESENTER_SHARE - 1e-9;
}
export const REFERENCE_BEAT_ROLES = ["hook", "problem", "agitation", "solution", "demo", "proof", "before_after", "social_proof", "offer", "cta",
  "other"] as const;
export const REFERENCE_POSITIONS = ["full_screen", "top", "center", "bottom", "top_left", "top_right", "bottom_left", "bottom_right", "split_top",
  "split_bottom", "other"] as const;
export type ReferencePosition = (typeof REFERENCE_POSITIONS)[number];
export const REFERENCE_CAMERAS = ["static", "punch_in", "zoom_out", "shake", "other"] as const;
export const REFERENCE_TRANSITIONS = ["none", "cut", "wipe", "flash", "zoom", "other"] as const;
export const REFERENCE_SOUND_KINDS = [...TEMPLATE_SOUND_BEATS, "music", "recorded_audio", "other"] as const;
export const REFERENCE_PRESENTER_BEHAVIOURS = ["speaking", "listening", "reacting", "absent"] as const;
export const REFERENCE_SHOT_SIZES = ["close", "medium", "wide", "full"] as const;
export type ReferenceShotSize = (typeof REFERENCE_SHOT_SIZES)[number];
export const REFERENCE_CAPTION_POSITIONS = ["top", "middle", "lower", "bottom"] as const;
export const MAX_REFERENCE_SUMMARY_CHARS = 200;
export const REFERENCE_PROFILE_SUMMARY_MAX_CHARS = 1000;
export const MAX_REFERENCE_LABEL_CHARS = 120;
export const MAX_REFERENCE_TRANSCRIPT_WORDS = 1000;
export const REFERENCE_HOOK_SECONDS = 3;
export const REFERENCE_HOOK_MAX_SECONDS = 6;
export const REFERENCE_STATE_CHANGES = ["appears", "disappears", "toggles_on", "toggles_off", "checked", "value_changes", "highlighted", "other"] as const;
export type ReferenceStateChange = (typeof REFERENCE_STATE_CHANGES)[number];
export const REFERENCE_GRAPHIC_DEVICES = ["footage", "photo", "collage", "3d_object", "map", "chart", "icon", "emoji", "sticker", "arrow", "meme", "highlight",
  "text_effect", "particles", "confetti", "sparkles", "light_leak", "glitch", "flash", "other"] as const;
export const REFERENCE_CAMERA_DEVICES = ["shake", "whip_pan", "pan", "tilt", "zoom_in", "zoom_out", "rotate", "handheld", "dolly", "speed_ramp", "other"] as const;
export const REFERENCE_TRANSITION_DEVICES = ["whip", "slide", "push", "light_leak", "glitch", "blur", "spin", "dissolve", "zoom", "flash", "wipe", "shape_mask",
  "match_cut", "other"] as const;
export type ReferenceGraphicDevice = (typeof REFERENCE_GRAPHIC_DEVICES)[number];

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
  device: z.enum(REFERENCE_GRAPHIC_DEVICES).optional().describe("What a particles or unmapped graphic shows, such as a 3D object, a sticker or sparkles."),
});

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
  start_s: seconds, end_s: seconds, text: text(REFERENCE_PROFILE_SUMMARY_MAX_CHARS),
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
  spoken_summary: text(REFERENCE_PROFILE_SUMMARY_MAX_CHARS).describe("The words spoken in the beat, cut at 200 characters; empty when none were heard."),
  graphics: z.array(referenceGraphic).max(8),
  camera: z.enum(REFERENCE_CAMERAS),
  transition_in: z.enum(REFERENCE_TRANSITIONS),
  camera_device: z.enum(REFERENCE_CAMERA_DEVICES).optional().describe("The camera move by name when camera is other, such as a whip pan or a slow zoom in."),
  transition_device: z.enum(REFERENCE_TRANSITION_DEVICES).optional()
    .describe("The transition by name when transition_in is other, such as a whip, a glitch or a light leak."),
  sounds: z.array(z.strictObject({ at_frac: frac, kind: z.enum(REFERENCE_SOUND_KINDS) })).max(12),
  presenter_behaviour: z.enum(REFERENCE_PRESENTER_BEHAVIOURS),
  shot_size: z.enum(REFERENCE_SHOT_SIZES).optional()
    .describe("The presenter's shot size for most of the beat: close (head and shoulders), medium (waist-up), wide (knees up), full (head to feet)."),
  key_frame_s: frameSecond.optional().describe("The second whose frame shows the beat, nearest its middle."),
  frames_s: z.array(claimSecond).max(MAX_BEAT_FRAMES).optional().describe("The seconds of the frames inside the beat, at most 12, evenly spread."),
  speaker: speakerId.nullable().optional()
    .describe("The speakers[].id of the beat's last words: the answer in a question-and-answer beat; null when nobody speaks."),
  speakers: z.array(z.strictObject({ id: speakerId, seconds })).max(MAX_REFERENCE_SPEAKERS).optional()
    .describe("Everyone heard in the beat, in the order they first speak, with their seconds of speech."),
  gaze: z.strictObject({ direction: z.enum(REFERENCE_GAZES), frames_s: claimFrames }).optional()
    .describe("Where the presenter looks for most of the beat; off_left and off_right are toward that edge of the image; mixed when no direction holds 60%."),
  gestures: z.array(z.strictObject({ kind: z.enum(REFERENCE_GESTURES), at_s: seconds, label: text(80), frames_s: claimFrames })).max(4).optional()
    .describe("Notable gestures in the beat, such as both hands toward the viewer at the call to action."),
});

export const REFERENCE_CUT_KINDS = ["start", "jump_cut", "size_change", "to_insert", "from_insert", "other"] as const;
export const MAX_REFERENCE_SHOTS = 120;
export const REFERENCE_SHOT_SOURCES = ["live", "real_footage", "ai_video", "code_render", "screen_capture"] as const;
export type ReferenceShotSource = (typeof REFERENCE_SHOT_SOURCES)[number];
export const referenceShot = z.strictObject({
  start_s: seconds, end_s: seconds,
  beat_index: z.number().int().min(0).describe("The beat this shot overlaps most."),
  words: z.number().int().min(0).describe("Spoken words that start inside the shot."),
  silent: z.boolean().describe("true when no word is spoken in the shot: a visual beat with no words."),
  cut_in: z.enum(REFERENCE_CUT_KINDS),
  source: z.strictObject({
    kind: z.enum(REFERENCE_SHOT_SOURCES),
    confidence: frac.describe("How sure the reading is, from 0 to 1."),
    measured: z.boolean().describe("true when the picture's measured motion set the kind against what the picture looked like."),
  }).optional().describe("How the shot's picture was made: live, real_footage, ai_video, code_render or screen_capture."),
  same_clip_as: z.number().int().min(0).nullable().optional().describe("The index of an earlier shot that shows the same clip, such as a cold open repeated at the end."),
});
export type ReferenceShot = z.infer<typeof referenceShot>;

export const referenceTempo = z.strictObject({
  music_bed: z.boolean().describe("true when music plays under most of the reel."),
  bpm: z.number().positive().nullable().describe("The beat's tempo; null when there is no music bed or no clear beat, as under a drone or soft pads."),
  cuts_on_beat: frac.nullable().describe("The share of cuts that land on a beat; null without a beat or a measured cut."),
  cuts_on_beat_by_chance: frac.nullable().describe("The share of cuts a random edit would land on a beat at this tempo."),
  edit_on_beat: z.boolean().describe("true when the edit follows the beat: at least 4 cuts, well above chance."),
});
export type ReferenceTempo = z.infer<typeof referenceTempo>;
export const REFERENCE_SOUND_EVENT_KINDS = ["whoosh", "ding", "impact", "click", "pop", "hit", "typing"] as const;
export const MAX_REFERENCE_SOUND_EVENTS = 120;

export const referenceWord = z.strictObject({ text: z.string().min(1).max(64), start_s: seconds, end_s: seconds,
  speaker: z.string().min(1).max(40).optional().describe("The transcription's speaker label, such as speaker_0; absent when it gave none.") });
export const referenceLanguage = z.string().regex(/^[a-z]{2,3}$/).nullable()
  .describe("The spoken language the transcription detected, an ISO 639 code such as eng or ara; null when it named none.");
export const referenceHook = z.strictObject({
  text: text(REFERENCE_PROFILE_SUMMARY_MAX_CHARS).describe(`The words that start in the first ${REFERENCE_HOOK_SECONDS} s, through the end of their sentence `
    + `(no word starting past ${REFERENCE_HOOK_MAX_SECONDS} s); empty when none do.`),
  end_s: seconds.describe("Where the hook's last word ends, else where its window does."),
  caption: text(MAX_REFERENCE_LABEL_CHARS).optional().describe("The first on-screen caption line read inside the hook's window."),
});

const profileHead = {
  version: z.literal(REFERENCE_PROFILE_VERSION),
  source: z.strictObject({ digest: z.string().regex(/^sha256:[0-9a-f]{64}$/), duration_s: z.number().positive(), width: z.number().int().positive(),
    height: z.number().int().positive(), url: z.string().url().max(2048).optional() }),
  format: z.enum(REFERENCE_FORMATS),
  beats: z.array(referenceBeat).min(1).max(120),
  captions: z.strictObject({ present: z.boolean(), words_per_caption_max: z.number().int().min(1).max(12), position: z.enum(REFERENCE_CAPTION_POSITIONS),
    emphasis_style: z.enum([...CAPTION_EMPHASIS_LOOKS, "none"]), hidden_under_graphics: z.boolean(),
    box: stagingRect.optional().describe("The caption block's box, in shares of the frame.") }),
  pacing: z.strictObject({ layer_change_every_s: z.number().positive(), face_share: frac,
    effective_words_per_s: z.number().min(0).optional()
      .describe("Spoken words over the whole reel's length, pauses and silent shots included: the pace a word budget for this length needs.") }),
  palette: z.array(z.string().regex(/^#[0-9A-F]{6}$/)).max(8),
  music: text(200),
  unmapped: z.array(z.strictObject({ what: text(200), beat_index: z.number().int().min(0), suggested_substitute: text(200) })).max(40),
};
const analysisWarnings = { warnings: z.array(text(200)).max(8).optional().describe("What the analysis could not measure, such as the voice; also in warnings[].") };
const profileTail = {
  voice: referenceVoice.optional(),
  presenter_framing: z.enum(PRESENTER_FRAMINGS).optional()
    .describe("full: the presenter from head to feet; wide: the top of the presenter's head is below ~35% of the frame height, with visible " +
      "room above; close otherwise."),
  presenter_mic: z.boolean().optional()
    .describe("true when the presenter holds a small handheld or clip-on microphone in their hand while speaking (not clipped to clothing)."),
  staging: referenceStaging.optional(),
  transcript: z.array(referenceWord).max(MAX_REFERENCE_TRANSCRIPT_WORDS).optional().describe("The reference's speech as timed words, in order."),
  transcript_language: referenceLanguage.optional(),
  hook: referenceHook.optional(),
  speakers: z.array(referenceSpeaker).max(MAX_REFERENCE_SPEAKERS).optional(),
  segments: z.array(referenceSegment).max(MAX_REFERENCE_SEGMENTS).optional().describe("The transcript as timed segments, each with its speaker."),
  spellings: z.array(z.strictObject({ heard: text(MAX_REFERENCE_LABEL_CHARS), shown: text(MAX_REFERENCE_LABEL_CHARS), start_s: seconds, end_s: seconds }))
    .max(MAX_REFERENCE_SPELLINGS).optional()
    .describe("Names heard one way while the screen spells them another at the same time, such as heard Piggs Field, shown Higgsfield; " +
      "transcript and segments keep the heard words."),
  shots: z.array(referenceShot).max(MAX_REFERENCE_SHOTS).optional()
    .describe("The reel cut by cut, measured on its frames: each shot's times, its words, whether it is silent and how it is cut into."),
  tempo: referenceTempo.optional(),
  bring: z.array(referenceBringItem).max(REFERENCE_BRING_KINDS.length).optional()
    .describe("What a remake needs the user to bring, because the reel shows it and it is not generated: screen recordings, screenshots, product " +
      "photos and live clips, each with its seconds and where it starts."),
  sound_events: z.array(z.strictObject({ t_s: seconds, kind: z.enum(REFERENCE_SOUND_EVENT_KINDS) })).max(MAX_REFERENCE_SOUND_EVENTS).optional()
    .describe("Sharp sounds measured on the mix while nobody speaks, such as a whoosh on a cut, in time order; sounds under speech are not listed."),
};
type ProfileBody = z.infer<z.ZodObject<typeof profileHead & typeof profileTail>>;
function checkProfile(profile: ProfileBody, ctx: z.RefinementCtx): void {
  const issue =(path: (string | number)[], message: string) => ctx.addIssue({ code: customIssue, path, message });
  const duration = profile.source.duration_s;
  profile.transcript?.forEach((word, index) => {
    if (word.end_s < word.start_s) issue(["transcript", index, "end_s"], "ends before the word starts");
    else if (word.end_s > duration) issue(["transcript", index, "end_s"], pastTheSource(word.end_s, duration));
    if (index && word.start_s < profile.transcript![index - 1]!.start_s) issue(["transcript", index, "start_s"], "starts before the word before it: words are in order");
  });
  if (profile.hook && profile.hook.end_s > duration) issue(["hook", "end_s"], pastTheSource(profile.hook.end_s, duration));
  const ids = new Set(profile.speakers?.map(speaker => speaker.id) ?? []);
  profile.speakers?.forEach((speaker, index) => {
    if (profile.speakers!.findIndex(other => other.id === speaker.id) < index) issue(["speakers", index, "id"], "names a speaker twice");
    if (speaker.frames_s.some(t => t >= duration)) issue(["speakers", index, "frames_s"], `cites a second past the ${duration} s source`);
  });
  profile.segments?.forEach((segment, index) => {
    if (segment.end_s < segment.start_s) issue(["segments", index, "end_s"], "ends before it starts");
    else if (segment.end_s > duration) issue(["segments", index, "end_s"], pastTheSource(segment.end_s, duration));
    if (profile.speakers && !ids.has(segment.speaker)) issue(["segments", index, "speaker"], `${segment.speaker} is not in speakers`);
    if (segment.frames_s.some(t => t >= duration)) issue(["segments", index, "frames_s"], `cites a second past the ${duration} s source`);
  });
  if (profile.staging) {
    for (const found of stagingIssues(profile.staging, profile.beats, profile.source.duration_s)) issue(["staging", ...found.path], found.message);
  }
  profile.beats.forEach((beat, index) => {
    if (beat.end_frac <= beat.start_frac) issue(["beats", index, "end_frac"], "ends where or before the beat starts");
    else if (beat.end_s <= beat.start_s) issue(["beats", index, "end_s"], "ends where or before the beat starts");
    if (beat.end_s > duration) issue(["beats", index, "end_s"], pastTheSource(beat.end_s, duration));
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
  profile.shots?.forEach((shot, index) => {
    const before = profile.shots![index - 1];
    if (shot.end_s <= shot.start_s) issue(["shots", index, "end_s"], "ends where or before the shot starts");
    if (shot.end_s > duration) issue(["shots", index, "end_s"], pastTheSource(shot.end_s, duration));
    else if (index === profile.shots!.length - 1 && shot.end_s < duration - 1e-6) issue(["shots", index, "end_s"], "the last shot ends with the reel");
    if (before ? Math.abs(shot.start_s - before.end_s) > 1e-6 : shot.start_s !== 0) issue(["shots", index, "start_s"], before ? "does not start where the shot before ends" : "the first shot starts at 0");
    if ((shot.cut_in === "start") !== (index === 0)) issue(["shots", index, "cut_in"], index ? "only the first shot is the start" : "the first shot is the start");
    if (shot.beat_index >= profile.beats.length) issue(["shots", index, "beat_index"], `there are ${profile.beats.length} beats`);
    if (shot.silent !== (shot.words === 0)) issue(["shots", index, "silent"], "a shot is silent exactly when it has no words");
    if (shot.same_clip_as != null && shot.same_clip_as >= index) issue(["shots", index, "same_clip_as"], "names a shot that does not come before it");
  });
  profile.sound_events?.forEach((event, index) => {
    if (event.t_s > duration) issue(["sound_events", index, "t_s"], pastTheSource(event.t_s, duration));
    if (index && event.t_s < profile.sound_events![index - 1]!.t_s) issue(["sound_events", index, "t_s"], "comes before the event before it: events are in order");
  });
  if (profile.tempo && profile.tempo.bpm !== null && !profile.tempo.music_bed) issue(["tempo", "bpm"], "a tempo is measured only over a music bed");
}
export const referenceProfileShape = { ...profileHead, ...profileTail };
export const checkReferenceProfile = checkProfile;
export const referenceAnalysisWarningsField = analysisWarnings;
export const referenceProfileAnswer = z.strictObject({ ...profileHead, analysis: z.strictObject(analysisWarnings), ...profileTail }).superRefine(checkProfile);
export type ReferenceProfileAnswer = z.infer<typeof referenceProfileAnswer>;
export const referenceProfileInput = z.strictObject({ ...profileHead, analysis: z.object(analysisWarnings), ...profileTail }).superRefine(checkProfile);
export type ReferenceProfileInput = z.infer<typeof referenceProfileInput>;
export const referenceProfileRead = z.looseObject({ version: z.string(), beats: z.array(z.looseObject({ role: z.string() })).default([]),
  unmapped: z.array(z.looseObject({ what: z.string(), beat_index: z.number(), suggested_substitute: z.string() })).default([]) });

export function keyFrameSecond(start: number, end: number, duration: number): number {
  const lo = Math.ceil(start), hi = Math.floor(end - 1e-6), middle = Math.round((start + end) / 2);
  const t = lo <= hi ? Math.min(hi, Math.max(lo, middle)) : middle;
  return Math.max(0, Math.min(Math.ceil(duration - 1e-6) - 1, t));
}

export const END_FRAME_GAP_S = 0.3;
const END_FRAME_BEFORE_S = 0.1;
export function endFrameSecond(duration: number): number | null {
  const last = Math.max(0, Math.ceil(duration - 1e-6) - 1), end = Math.floor((duration - END_FRAME_BEFORE_S) * 10 + 1e-6) / 10;
  return end - last >= END_FRAME_GAP_S - 1e-6 ? end : null;
}

export function frameAtOrAfter(t: number, duration: number): number {
  const last = Math.max(0, Math.ceil(duration - 1e-6) - 1), next = Math.max(0, Math.ceil(t - 1e-6));
  return next <= last ? next : endFrameSecond(duration) ?? last;
}

export function spanFrameSeconds(start: number, end: number, duration: number, max = MAX_BEAT_FRAMES): number[] {
  const lo = Math.max(0, Math.ceil(start)), hi = Math.min(Math.floor(end - 1e-6), Math.ceil(duration - 1e-6) - 1), last = endFrameSecond(duration);
  const all = [...Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i), ...last !== null && last >= start && last < end ? [last] : []];
  if (!all.length) return [keyFrameSecond(start, end, duration)];
  if (all.length <= max) return all;
  return [...new Set(Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]!))];
}

const LINE_EDIT_SUBSTITUTE = "your line edit on ";

export function referenceProfileWarnings(profile: z.input<typeof referenceProfileRead> | undefined): string[] {
  if (!profile) return [];
  const beatOf = (index: number) => { const role = profile.beats?.[index]?.role; return `${index + 1}${role ? ` (${role})` : ""}`; };
  const lines: string[] = [], edited = new Map<number, string[]>(), entries = profile.unmapped ?? [];
  for (const entry of entries.filter(entry => entry.suggested_substitute.startsWith(LINE_EDIT_SUBSTITUTE))) {
    const whats = edited.get(entry.beat_index) ?? [];
    if (!whats.includes(entry.what)) whats.push(entry.what);
    edited.set(entry.beat_index, whats);
  }
  for (const entry of entries) {
    if (entry.suggested_substitute.startsWith(LINE_EDIT_SUBSTITUTE)) {
      if (!lines.includes(LINE_EDIT_SUBSTITUTE)) lines.push(LINE_EDIT_SUBSTITUTE);
      continue;
    }
    if (edited.get(entry.beat_index)?.includes(entry.what)) continue;
    const line = `Reference beat ${beatOf(entry.beat_index)}: ${entry.what} is not reproduced; instead: ${entry.suggested_substitute}.`;
    if (!lines.includes(line)) lines.push(line);
  }
  const replaced = [...edited.entries()].sort(([a], [b]) => a - b).map(([beat, whats]) => `${beatOf(beat)}: ${whats.join(", ")}`).join("; ");
  const said = `Your line edits replace what the reference draws on ${edited.size === 1 ? "beat" : "beats"} ${replaced}.`;
  return lines.map(line => line === LINE_EDIT_SUBSTITUTE ? said : line);
}

const DIRECT: Readonly<Record<string, ReferenceGraphicKind>> = {
  ...Object.fromEntries(TEMPLATE_KIND_IDS.map(kind => [kind, kind])),
  toggle_checklist: "checklist", before_after_split: "compare", split_screen: "layout_split", particles: "particles",
  banner: "tag", comment_box: "tag", logo_card: "title_card", price_card: "stat",
};
const SUBSTITUTES: Readonly<Record<string, string>> = {
  particles: "a stat or title_card on the same words; particles are not drawn",
};
const DESCRIBED: readonly (readonly [(typeof REFERENCE_DESCRIBED_KINDS)[number], RegExp])[] = [
  ["comment_box", /\bcomments?\b|\b(input|reply|text|message) (box|field|bar)\b/],
  ["logo_card", /\blogo\b/],
  ["price_card", /\bpric(e|es|ing)\b|\bdiscount\b|% off\b/],
  ["concept_card", /\bconcept\b|\bidea card\b|\bmood ?board\b/],
  ["banner", /\bbanner\b|\bplate\b|\bribbon\b|\bstrip\b/],
];
const QUOTED = /"[^"]*"|“[^”]*”|(?<![\p{L}\p{N}])['‘].*?['’](?![\p{L}\p{N}])/gu;

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

export function mapAnalyserSourceKind(text: string, description = ""): ReferenceSourceKind {
  const s = text.trim();
  if (s !== "other" && (REFERENCE_SOURCE_KINDS as readonly string[]).includes(s)) return s as ReferenceSourceKind;
  const plain = description.replace(QUOTED, " ").toLowerCase();
  return DESCRIBED.find(([, pattern]) => pattern.test(plain))?.[0] ?? "other";
}

const DEVICE_DESCRIBED: readonly (readonly [ReferenceGraphicDevice, RegExp])[] = [
  ["glitch", /\bglitch/], ["light_leak", /\blight leaks?\b|\blens flares?\b/], ["confetti", /\bconfetti\b/], ["sparkles", /\bsparkl|\bglitter|\bstars?\b/],
  ["particles", /\bparticles?\b|\bdust\b|\bbokeh\b|\bsnow\b/], ["emoji", /\bemojis?\b/], ["sticker", /\bstickers?\b/], ["arrow", /\barrows?\b/],
  ["meme", /\bmemes?\b/], ["map", /\bmaps?\b/], ["chart", /\bcharts?\b|\bgraphs?\b/], ["3d_object", /\b3d\b|\bglobe\b|\brotating\b|\bspinning\b/],
  ["collage", /\bstack(ed|s)?\b|\bcollage\b|\bgrid of\b|\bmosaic\b/], ["footage", /\bclips?\b|\bfootage\b|\bvideos?\b|\bb-?roll\b/],
  ["photo", /\bphotos?\b|\bpictures?\b|\bimages?\b/], ["icon", /\bicons?\b/], ["highlight", /\bhighlight|\bcircled\b|\bunderlin/],
  ["text_effect", /\b(animated|kinetic) (text|title|words)\b|\btext effect/], ["flash", /\bflash/],
];
const DEVICE_LISTS = { graphic: REFERENCE_GRAPHIC_DEVICES, camera: REFERENCE_CAMERA_DEVICES, transition: REFERENCE_TRANSITION_DEVICES } as const;

export function mapAnalyserDevice<K extends keyof typeof DEVICE_LISTS>(list: K, name: string, description = ""): (typeof DEVICE_LISTS)[K][number] | undefined {
  const said = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (said !== "other" && (DEVICE_LISTS[list] as readonly string[]).includes(said)) return said as (typeof DEVICE_LISTS)[K][number];
  if (list !== "graphic") return said === "other" ? "other" as (typeof DEVICE_LISTS)[K][number] : undefined;
  const plain = description.replace(QUOTED, " ").toLowerCase();
  return (DEVICE_DESCRIBED.find(([, pattern]) => pattern.test(plain))?.[0] ?? "other") as (typeof DEVICE_LISTS)[K][number];
}

export function mapAnalyserGraphic(kind: string, position?: ReferencePosition): { kind: ReferenceGraphicKind; unmapped?: string } {
  if (kind === "product_ui" || kind === "screenshot" || kind === "concept_card") return { kind: position === "full_screen" ? "insert_media" : "overlay_media" };
  const ours = Object.hasOwn(DIRECT, kind) ? DIRECT[kind]! : "unmapped";
  return ours === "particles" || ours === "unmapped"
    ? { kind: ours, unmapped: [ours, kind].filter(key => Object.hasOwn(SUBSTITUTES, key)).map(key => SUBSTITUTES[key]!)[0] ?? "a title_card with its label, or leave it out" }
    : { kind: ours };
}
