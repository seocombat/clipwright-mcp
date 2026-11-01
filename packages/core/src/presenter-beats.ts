import type { GenerateVideoRequest, GenerationReference } from "./generations.js";
import { WORDS_PER_SECOND_MIN } from "./pacing.js";
import type { ReferenceProfileAnswer as ReferenceProfile } from "./reference-profile.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import type { UgcInsert, UgcTemplate } from "./skills.js";
import { TEMPLATE_KINDS, templateFieldValues } from "./templates/index.js";

/** Silent presenter beats of a reference (#857 S3): the presenter listens or reacts while the narration goes on. */
/** A beat is a seedance-2.0 clip whose first frame is the actor portrait, placed as a video insert on its words. */

export const PRESENTER_BEAT_BEHAVIOURS = ["listening", "reacting"] as const;
export type PresenterBeatBehaviour = (typeof PRESENTER_BEAT_BEHAVIOURS)[number];

/** The seedance-2.0 row measured live: 720p 9:16, 4–15 s (`GENERATION_CAPABILITIES`). */
export const PRESENTER_BEAT_MODEL = "seedance-2.0";
export const PRESENTER_BEAT_MIN_SEC = 4;
const PRESENTER_BEAT_MAX_SEC = 15;

const KEEP = "Same person, same face, hair, clothes, props and room as the first frame. Locked-off camera, vertical UGC video, " +
  "natural light, realistic skin.";
/** An open-mouth surprise under a voiceover reads as broken lip-sync: every action is asked closed-mouthed. */
const SILENT = "The person never speaks: the mouth stays closed or in a closed-lip smile the whole time, even when surprised. " +
  "No talking, no lip movement, no captions, no text overlays.";
const ACTIONS: Readonly<Record<PresenterBeatBehaviour, string>> = {
  listening: "The person lifts a smartphone to the ear with one hand and listens silently to a caller, giving a few small nods, " +
    "eyes alive and attentive, brows reacting slightly to what they hear.",
  reacting: "The person glances to the side, the eyebrows rise in quiet closed-mouth surprise, then the face relaxes into a pleased " +
    "closed-lip smile; they look straight at the camera and give a small thumbs-up.",
};

export function presenterBeatPrompt(behaviour: PresenterBeatBehaviour): string {
  return `${KEEP} ${ACTIONS[behaviour]} ${SILENT}`;
}

/** Long enough for the words at the slowest speech the admission assumes; the insert cuts the rest where its words end. */
export function presenterBeatSeconds(words: number): number {
  return Math.min(PRESENTER_BEAT_MAX_SEC, Math.max(PRESENTER_BEAT_MIN_SEC, Math.ceil(words / WORDS_PER_SECOND_MIN)));
}

export interface PresenterBeat {
  id: string;
  beatIndex: number;
  behaviour: PresenterBeatBehaviour;
  /** Script words as make_ugc counts them; `endWord` is exclusive. */
  startWord: number;
  endWord: number;
  durationS: number;
  prompt: string;
}

/** The profile's listening and reacting beats on their script spans, one span per profile beat (null: no words). */
export function planPresenterBeats(input: { script: string; profile: Pick<ReferenceProfile, "beats">;
  spans: readonly ({ start: number; end: number } | null)[] }): { beats: PresenterBeat[]; warnings: string[] } {
  const words = lexicalTokens(input.script).length;
  if (input.spans.length !== input.profile.beats.length) throw new Error("presenter beats need one span per profile beat");
  const beats: PresenterBeat[] = [];
  const warnings: string[] = [];
  input.profile.beats.forEach((beat, beatIndex) => {
    const behaviour = beat.presenter_behaviour;
    if (!(PRESENTER_BEAT_BEHAVIOURS as readonly string[]).includes(behaviour)) return;
    const span = input.spans[beatIndex];
    if (!span) { warnings.push(`beat ${beatIndex} (${behaviour}) has no words in the script, so the presenter does not ${behaviour === "listening" ? "listen" : "react"} there`); return; }
    if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > words) {
      throw new Error(`beat ${beatIndex} span ${span.start}..${span.end} is outside the ${words} script words`);
    }
    const previous = beats.at(-1);
    if (previous && span.start < previous.endWord) throw new Error(`beat ${beatIndex} overlaps the beat before it`);
    const count = span.end - span.start;
    if (count / WORDS_PER_SECOND_MIN > PRESENTER_BEAT_MAX_SEC) {
      warnings.push(`beat ${beatIndex} (${behaviour}) may outlast a ${PRESENTER_BEAT_MAX_SEC} s clip; its last frame holds to the end of its words`);
    }
    beats.push({ id: `beat-${beatIndex}`, beatIndex, behaviour: behaviour as PresenterBeatBehaviour, startWord: span.start, endWord: span.end,
      durationS: presenterBeatSeconds(count), prompt: presenterBeatPrompt(behaviour as PresenterBeatBehaviour) });
  });
  if (beats.length && beats[0]!.startWord === 0 && beats.at(-1)!.endWord === words && beats.every((beat, i) => i === 0 || beat.startWord === beats[i - 1]!.endWord)) {
    throw new Error("presenter beats cover every word and leave the speaking presenter no shot");
  }
  return { beats, warnings };
}

/** A beat's insert is a cutaway: an over-presenter template under it would be refused, so it moves next to the beat. */
const MIN_TEMPLATE_WORDS = 2;

function templateSpan(tokens: readonly string[], template: UgcTemplate): { start: number; end: number } | null {
  const anchor = template.anchor;
  const range = "startWord" in anchor ? anchor : quoteOccurrences(tokens, anchor.quote)[anchor.occurrence ?? 0];
  if (!range) return null;
  return { start: range.startWord, end: template.cover_words === undefined ? range.endWord : range.startWord + template.cover_words };
}

/** The template moved onto `span`: anchored on those words, its inner quotes spread over them in order. */
function moved(template: UgcTemplate, tokens: readonly string[], span: { start: number; end: number }): UgcTemplate {
  const { cover_words: _cover, ...rest } = template;
  let data = structuredClone(template.data) as Record<string, unknown>;
  const fields = TEMPLATE_KINDS.find(kind => kind.kind === template.kind)?.quotes ?? [];
  const values = fields.flatMap(field => templateFieldValues(data, field));
  let from = span.start;
  values.forEach(({ path }, index) => {
    const target = Math.max(from, span.start + Math.floor(((index + 0.5) * (span.end - span.start)) / values.length));
    // The shortest phrase from `target` whose first match inside the span, after the previous one, is `target` itself.
    let length = 1;
    while (target + length < span.end && quoteOccurrences(tokens.slice(from, span.end), tokens.slice(target, target + length).join(" "))[0]!
      .startWord + from !== target) length += 1;
    data = setAt(data, path, tokens.slice(target, target + length).join(" "));
    from = target + length;
  });
  return { ...rest, anchor: { startWord: span.start, endWord: span.end }, data } as UgcTemplate;
}

function setAt(data: Record<string, unknown>, path: readonly (string | number)[], value: string): Record<string, unknown> {
  const [head, ...tail] = path;
  if (head === undefined) return data;
  const copy: Record<string, unknown> | unknown[] = Array.isArray(data) ? [...data] : { ...data };
  (copy as Record<string | number, unknown>)[head] = tail.length ? setAt((data as Record<string | number, unknown>)[head] as Record<string, unknown>, tail, value) : value;
  return copy as Record<string, unknown>;
}

/** Over-presenter templates that meet a beat move to the free words right before it, else right after, else are dropped and named. */
/** A full-frame template stays: it is drawn over inserts. */
export function fitTemplatesAroundBeats(script: string, templates: readonly UgcTemplate[], beats: readonly PresenterBeat[]):
  { templates: UgcTemplate[]; warnings: string[] } {
  const tokens = lexicalTokens(script);
  const spans = templates.map(template => templateSpan(tokens, template));
  const busy = (word: number, self: number) => beats.some(beat => word >= beat.startWord && word < beat.endWord) ||
    spans.some((span, index) => index !== self && span !== null && word >= span.start && word < span.end);
  const warnings: string[] = [];
  const out: UgcTemplate[] = [];
  templates.forEach((template, index) => {
    const span = spans[index];
    const placement = template.placement ?? TEMPLATE_KINDS.find(kind => kind.kind === template.kind)?.placements[0];
    const beat = span && placement !== "full" && beats.find(one => span.start < one.endWord && span.end > one.startWord);
    if (!span || !beat) { out.push(template); return; }
    const want = Math.max(MIN_TEMPLATE_WORDS, span.end - span.start);
    let before = beat.startWord;
    while (before > 0 && beat.startWord - before < want && !busy(before - 1, index)) before -= 1;
    let after = beat.endWord;
    while (after < tokens.length && after - beat.endWord < want && !busy(after, index)) after += 1;
    const room = beat.startWord - before >= MIN_TEMPLATE_WORDS ? { start: before, end: beat.startWord }
      : after - beat.endWord >= MIN_TEMPLATE_WORDS ? { start: beat.endWord, end: after } : null;
    if (!room) { warnings.push(`template "${template.id}" lies under the ${beat.behaviour} beat and has no free words beside it; it is left out`); return; }
    spans[index] = room;
    out.push(moved(template, tokens, room));
    warnings.push(`template "${template.id}" moved to the words ${room.end === beat.startWord ? "right before" : "right after"} the ${beat.behaviour} beat, which covers its own`);
  });
  return { templates: out, warnings };
}

/** The generate_video request of one beat: frame 0 is the actor portrait, so the identity is the portrait's. */
export function presenterBeatGeneration(beat: PresenterBeat, portrait: GenerationReference): GenerateVideoRequest {
  return { prompt: beat.prompt, model: PRESENTER_BEAT_MODEL, mode: "first_frame", aspect_ratio: "9:16", resolution: "720p",
    duration_s: beat.durationS, first_frame: portrait };
}

/** The beat as a video insert over the narration: it starts on its first word and ends where its last word ends. */
export function presenterBeatInsert(beat: PresenterBeat, assetId: string): UgcInsert {
  return { id: beat.id, asset_id: assetId, media_type: "video", anchor: { startWord: beat.startWord, endWord: beat.endWord } };
}
