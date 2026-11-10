import { z } from "zod";

/** A clip described as a shot: framing, subject, start, timed beats, camera, light and continuity, in place of a free prompt. */

export const SHOT_SIZES = ["extreme_close_up", "close_up", "medium_close_up", "medium", "full", "wide"] as const;
export const SHOT_ANGLES = ["eye_level", "low", "high", "overhead"] as const;
export const SHOT_DEPTHS = ["shallow", "deep"] as const;
export const SHOT_CAMERA_MOVES = ["static", "push_in", "pull_back", "pan", "handheld"] as const;
export const SHOT_CAMERA_SPEEDS = ["slow", "medium"] as const;
export const SHOT_BEAT_MIN_S = 1;
export const SHOT_BEAT_MAX_S = 5;
export const SHOT_MAX_BEATS = 10;
export const SHOT_MAX_OBJECTS = 6;
/** All the shot's words together, so the written clip stays inside the prompt's length. */
export const SHOT_TEXT_MAX_CHARS = 3000;

export type ShotSize = (typeof SHOT_SIZES)[number];
export type ShotAngle = (typeof SHOT_ANGLES)[number];
export type ShotCameraMove = (typeof SHOT_CAMERA_MOVES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

const BEATS_DESCRIPTION = "The action, second by second: contiguous beats from 0 to duration_s, each 1 to 5 seconds, every second " +
  "owned by one beat. A beat holds one action done once, written as cause, contact and result (her fingertip dips into the jar once " +
  "and lifts a pea-sized dab), and its end_state says what the frame shows when the beat ends (a dab of cream sits on her " +
  "fingertip). After the main action, a still beat (she holds the jar beside her face and smiles) keeps the clip from repeating it.";
const SUBJECT_DESCRIPTION = "Who or what the clip follows: label is the name every beat uses (the woman), fixed holds 1 to 3 traits " +
  "that stay the same (hair, clothes, the product's shape and print), objects lists every object the clip shows with its exact " +
  "count and where it is in the first frame (one open jar of cream, in her left hand at chest height).";

export const shotObject = z.strictObject({
  name: text(40).describe("The object's name as the beats write it: jar, cream."),
  count: z.number().int().min(1).max(10).describe("How many of it the frame shows throughout."),
  at_start: text(200).describe("Where it is and how it looks in the first frame."),
});

export const shotBeat = z.strictObject({
  from_s: z.number().int().min(0),
  to_s: z.number().int().positive(),
  action: text(300).describe("One action, done once, as cause, contact and result."),
  end_state: text(200).describe("What the frame shows at to_s."),
  objects: z.array(text(40)).max(SHOT_MAX_OBJECTS).optional()
    .describe("The objects this beat handles, by their names in subject.objects; each name also appears in action."),
});

/** Validated against duration_s by `shotIssues`, which the clip request and later callers run. */
export const generationShot = z.strictObject({
  framing: z.strictObject({
    size: z.enum(SHOT_SIZES),
    angle: z.enum(SHOT_ANGLES).optional(),
    lens_mm: z.number().int().min(12).max(200).optional(),
    depth: z.enum(SHOT_DEPTHS).optional(),
  }),
  subject: z.strictObject({
    label: text(60),
    fixed: z.array(text(200)).min(1).max(3),
    objects: z.array(shotObject).max(SHOT_MAX_OBJECTS).optional(),
  }).describe(SUBJECT_DESCRIPTION),
  start_state: text(300).describe("What the first frame already shows, in one sentence."),
  beats: z.array(shotBeat).min(1).max(SHOT_MAX_BEATS).describe(BEATS_DESCRIPTION),
  camera: z.strictObject({ move: z.enum(SHOT_CAMERA_MOVES), speed: z.enum(SHOT_CAMERA_SPEEDS).optional() })
    .describe("One camera move for the whole clip."),
  light: z.strictObject({ key: text(160), direction: text(120).optional() })
    .describe("The light, worded the same in every clip of a sequence."),
  continuity: z.strictObject({
    persistent: z.array(text(160)).max(5).describe("What holds for the whole clip: exactly one jar, the same bathroom."),
    end_state: text(300).describe("The last frame; the next clip of a sequence starts from it."),
    continues_from: text(300).optional().describe("The previous clip's end_state, word for word, when this clip continues it."),
  }),
});
export type GenerationShot = z.infer<typeof generationShot>;

export interface ShotIssue {
  path: (string | number)[];
  message: string;
}

/** Negation and its contractions: a model reads the named thing as something to draw. */
const NEGATION = /\b(?:no|not|never|none|nothing|nobody|nowhere|neither|nor|without|avoid(?:s|ed|ing)?|\w+n['’]t|cannot)\b/i;

/** The first negating word of `text`, or null; the one lint for a shot's words and any text written from them. */
export function negationIn(text: string): string | null {
  return NEGATION.exec(text)?.[0] ?? null;
}

const negationMessage = (word: string) =>
  `"${word}" describes what is absent; describe what is visible instead (her fingertips are clean, the counter is bare)`;

function freeText(shot: GenerationShot): [(string | number)[], string][] {
  return [
    [["subject", "label"], shot.subject.label],
    ...shot.subject.fixed.map((one, at): [(string | number)[], string] => [["subject", "fixed", at], one]),
    ...(shot.subject.objects ?? []).flatMap((one, at): [(string | number)[], string][] => [
      [["subject", "objects", at, "name"], one.name], [["subject", "objects", at, "at_start"], one.at_start]]),
    [["start_state"], shot.start_state],
    ...shot.beats.flatMap((beat, at): [(string | number)[], string][] => [
      [["beats", at, "action"], beat.action], [["beats", at, "end_state"], beat.end_state]]),
    [["light", "key"], shot.light.key],
    ...(shot.light.direction === undefined ? [] : [[["light", "direction"], shot.light.direction] as [(string | number)[], string]]),
    ...shot.continuity.persistent.map((one, at): [(string | number)[], string] => [["continuity", "persistent", at], one]),
    [["continuity", "end_state"], shot.continuity.end_state],
    ...(shot.continuity.continues_from === undefined ? []
      : [[["continuity", "continues_from"], shot.continuity.continues_from] as [(string | number)[], string]]),
  ];
}

/** The name as a whole word, read literally: no word character on either side, so "c++" and "jar.box" match as written. */
const mentions = (haystack: string, name: string) =>
  new RegExp(`(?<!\\w)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i").test(haystack);

/** Everything a shot must satisfy for a clip of `durationS` seconds; empty means the shot is sound. Paths are relative to the shot. */
export function shotIssues(shot: GenerationShot, durationS: number): ShotIssue[] {
  const issues: ShotIssue[] = [];
  let at = 0;
  shot.beats.forEach((beat, index) => {
    if (beat.from_s !== at) {
      issues.push({ path: ["beats", index, "from_s"], message: `starts at ${beat.from_s} s; beats are contiguous, so this one starts at ${at} s` });
    }
    const length = beat.to_s - beat.from_s;
    if (length < SHOT_BEAT_MIN_S || length > SHOT_BEAT_MAX_S) {
      issues.push({ path: ["beats", index, "to_s"], message: `lasts ${length} s; a beat lasts ${SHOT_BEAT_MIN_S} to ${SHOT_BEAT_MAX_S} seconds` });
    }
    at = beat.to_s;
  });
  if (at !== durationS) {
    issues.push({ path: ["beats"], message: `end at ${at} s; the beats cover exactly duration_s, ${durationS} s` });
  }

  const declared = new Set((shot.subject.objects ?? []).map((one) => one.name.toLowerCase()));
  if (declared.size !== (shot.subject.objects ?? []).length) issues.push({ path: ["subject", "objects"], message: "names each object once" });
  shot.beats.forEach((beat, index) => {
    (beat.objects ?? []).forEach((name, slot) => {
      if (!declared.has(name.toLowerCase())) {
        issues.push({ path: ["beats", index, "objects", slot], message: `"${name}" is not in subject.objects; declare it with its count and where it is at the start` });
      } else if (!mentions(beat.action, name)) {
        issues.push({ path: ["beats", index, "objects", slot], message: `"${name}" is not named in this beat's action` });
      }
    });
  });

  const words = freeText(shot);
  for (const [path, value] of words) {
    const found = negationIn(value);
    if (found !== null) issues.push({ path, message: negationMessage(found) });
  }
  const total = words.reduce((sum, [, value]) => sum + value.length, 0);
  if (total > SHOT_TEXT_MAX_CHARS) issues.push({ path: [], message: `holds ${total} characters of text; a shot holds at most ${SHOT_TEXT_MAX_CHARS}` });
  return issues;
}
