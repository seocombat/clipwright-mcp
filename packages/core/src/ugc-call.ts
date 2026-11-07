import { lexicalTokens } from "./semantic-inserts.js";
import { type AnchoredItem, type LayerRefusal, layerWordRange } from "./ugc-layers.js";

// A phone call over a hold (#857 S5): two voices after a quote, the presenter listening, then frozen, until the call ends.
// Numbers are the reference's, as measured on it.

export const CALL_SPEAKERS = ["agent", "caller"] as const;
export type CallSpeaker = (typeof CALL_SPEAKERS)[number];
export const MAX_CALL_LINES = 30;
export const MAX_CALL_LINE_CHARS = 1000;
export const MAX_CALL_CHARS = 5000;
/** A call's length before synthesis, at the reference's 19 characters a second (D10). */
export const CALL_CHARS_PER_SEC = 19;
export const MAX_CALL_SEC = 120;
/** Past this the presenter holds still long enough to name it (D1). */
export const CALL_WARN_SEC = 20;
/** The bake-off's pair (S5-0): agent Cassidy, caller Mark; the agent is never the narration's voice. */
export const DEFAULT_CALL_VOICES: Readonly<Record<CallSpeaker, string>> = Object.freeze({ agent: "en_female_cassidy", caller: "en_male_mark" });
export const SECOND_CALL_AGENT = "sarah";
/** The reference's in-call screen (D8): a US number shown only to its area code and the hold banner, generic phone UI. */
export const CALL_PHONE_DEFAULTS = Object.freeze({ caller: "+1 (305) 555-0147", banner: "Hold This Call?", banner_note: "You'll be notified to pick up.",
  mask_number: true });
/** The phone the run draws over a call: an id no client template can spell, so it never meets one. */
export const CALL_PHONE_ID = "call.phone";

/** The ring starts this long after the phone enters, rings for CALL_RING_SEC (the `ring_double` file) and the first word follows it. */
export const CALL_RING_LEAD_SEC = 0.07;
export const CALL_RING_SEC = 1.35;
export const CALL_RING_TO_VOICE_SEC = 0.1;
/** From the call's last word to the end of the freeze. */
export const CALL_TAIL_SEC = 0.4;
/** The presenter's live listening before the freeze (S4d), and how far before the freeze the phone enters behind it. */
export const CALL_LIVE_SEC = 3.58;
export const CALL_PHONE_LEAD_SEC = 3.96;
/** A staged phone (#914 D1e) rises from one of these sides, within these bounds; the composition draws no other entry for it. */
export const CALL_STAGE_SIDES = ["bottom", "lower_left", "lower_right"] as const;
export const CALL_STAGE_MAX_ENTER_SEC = 5;
export const CALL_STAGE_MAX_LEAD_SEC = 10;

export interface CallLine { speaker: CallSpeaker; text: string }
export interface CallInput { after: AnchoredItem["anchor"]; lines: readonly CallLine[]; voices?: { agent?: string | undefined; caller?: string | undefined } | undefined;
  phone?: { caller?: string | undefined; banner?: string | undefined; banner_note?: string | undefined; mask_number?: boolean | undefined } | undefined }

export const callChars = (call: Pick<CallInput, "lines">): number => call.lines.reduce((sum, line) => sum + line.text.length, 0);
export const callEstimateSec = (call: Pick<CallInput, "lines">): number => Math.ceil(callChars(call) / CALL_CHARS_PER_SEC);
/** The seconds a call adds to the video: its lines, the ring before them and the tail after (D10). */
export const callGapEstimateSec = (call: Pick<CallInput, "lines">): number =>
  callEstimateSec(call) + Math.ceil(CALL_RING_LEAD_SEC + CALL_RING_SEC + CALL_RING_TO_VOICE_SEC + CALL_TAIL_SEC);

/** The lexical word the presenter resumes on: the one after the quote's last word, or why there is none. */
export function callResumeWord(script: string, after: CallInput["after"]): number | string {
  const tokens = lexicalTokens(script), range = layerWordRange(tokens, { id: "call", anchor: after });
  if (typeof range === "string") return range;
  return range.coverWord < tokens.length ? range.coverWord : "the call needs words after it: the presenter resumes on the word after its quote";
}

/** The agent and caller voices: the named ones, else the defaults, the agent kept off the narration's voice. */
export function callVoices(call: Pick<CallInput, "voices">, narrationVoice: string | undefined): Record<CallSpeaker, string> {
  const agent = call.voices?.agent ?? (narrationVoice === DEFAULT_CALL_VOICES.agent ? SECOND_CALL_AGENT : DEFAULT_CALL_VOICES.agent);
  return { agent, caller: call.voices?.caller ?? DEFAULT_CALL_VOICES.caller };
}

export interface CallCheckInput {
  script?: string | undefined; segments?: unknown; aspect_ratio?: string | undefined; voice?: string | undefined;
  inserts?: readonly AnchoredItem[] | undefined; call?: CallInput | undefined;
}

/** Every refusal of `call` before money, named by path (C1); the schema already bounds each line and the count. */
export function callRefusals(input: CallCheckInput): LayerRefusal[] {
  const call = input.call;
  if (call === undefined) return [];
  if (input.script === undefined || input.segments !== undefined) return [{ path: ["call"], message: "call requires script and cannot be combined with segments" }];
  const refusals: LayerRefusal[] = [];
  if (input.aspect_ratio !== undefined && input.aspect_ratio !== "9:16") {
    refusals.push({ path: ["call"], message: `call needs a 9:16 frame: the phone and the listening presenter are staged for it, not ${input.aspect_ratio}` });
  }
  const resume = callResumeWord(input.script, call.after);
  if (typeof resume === "string") refusals.push({ path: ["call", "after"], message: resume });
  else {
    const tokens = lexicalTokens(input.script);
    const cover = (input.inserts ?? []).find(item => {
      const range = layerWordRange(tokens, item);
      return typeof range !== "string" && range.startWord < resume && resume - 1 < range.coverWord;
    });
    if (cover) refusals.push({ path: ["call", "after"], message: `the call opens after words insert "${cover.id}" covers: the presenter must be on screen to listen` });
  }
  if (call.lines.length >= 2 && new Set(call.lines.map(line => line.speaker)).size < 2) {
    refusals.push({ path: ["call", "lines"], message: "a call needs lines from both the agent and the caller" });
  }
  const chars = callChars(call);
  if (chars > MAX_CALL_CHARS) refusals.push({ path: ["call", "lines"], message: `the call's lines hold ${chars} characters, more than ${MAX_CALL_CHARS}` });
  else if (callEstimateSec(call) > MAX_CALL_SEC) {
    refusals.push({ path: ["call", "lines"], message: `the call runs about ${callEstimateSec(call)} s, longer than ${MAX_CALL_SEC} s: shorten its lines` });
  }
  if (call.voices?.agent !== undefined && call.voices.agent === input.voice) {
    refusals.push({ path: ["call", "voices", "agent"], message: "the call's agent needs a voice other than the narration's, or the presenter seems to answer in their own voice" });
  }
  return refusals;
}

/** A long call is delivered, and named (rule 3). */
export function callWarnings(input: { call?: unknown }): string[] {
  const call = input.call as Partial<CallInput> | undefined;
  if (!Array.isArray(call?.lines)) return [];
  const seconds = callEstimateSec({ lines: call.lines });
  return seconds > CALL_WARN_SEC ? [`the call runs about ${seconds} s, longer than ${CALL_WARN_SEC} s: the presenter holds still through all of it`] : [];
}

/** Where a call sits in its gap, in frames from the presenter's last word before it (D2): the phone enters, the ring starts, the first word,
 *  and the gap and hold lengths. Gap = ring lead + ring + call + tail after the phone; hold = gap − live. */
export function callGapFrames(args: { callFrames: number; liveFrames: number; fps: number }) {
  const { callFrames, liveFrames, fps } = args;
  if (![callFrames, liveFrames, fps].every(Number.isSafeInteger) || callFrames < 1 || liveFrames < 0 || fps < 1) {
    throw new Error("a call's gap needs whole frames");
  }
  // Never before the gap: over the talking take the phone is not drawn, and a ring there plays over the last word (#924).
  const phoneEntry = Math.max(0, liveFrames - Math.round(CALL_PHONE_LEAD_SEC * fps));
  const ringFrom = phoneEntry + Math.round(CALL_RING_LEAD_SEC * fps);
  const voiceFrom = phoneEntry + Math.round((CALL_RING_LEAD_SEC + CALL_RING_SEC + CALL_RING_TO_VOICE_SEC) * fps);
  // A call too short to outlast the listening keeps a hold of one tail.
  const gapFrames = Math.max(voiceFrom + callFrames + Math.round(CALL_TAIL_SEC * fps), liveFrames + Math.round(CALL_TAIL_SEC * fps));
  return { phoneEntry, ringFrom, voiceFrom, gapFrames, holdFrames: gapFrames - liveFrames };
}
