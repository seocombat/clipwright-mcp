import type { Gender } from "./default-actor.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import { defaultVoiceOf } from "./voices.js";
import { type AnchoredItem, type LayerRefusal, layerWordRange, type WordRange } from "./ugc-layers.js";

// An interview (#972): an off-screen speaker's words inside the script, the presenter answering on screen and holding still while they speak.

export const INTERVIEW_GAZES = ["camera", "left", "right"] as const;
export type InterviewGaze = (typeof INTERVIEW_GAZES)[number];
export const INTERVIEW_LISTENING = ["freeze", "live"] as const;
export const MAX_INTERVIEW_TURNS = 30;
/** The presenter's takes in one interview: one per answer, and one more at each change of gaze. */
export const MAX_INTERVIEW_TAKES = 16;
export const MAX_PRESENTER_GAZE = 20;
/** Past this the presenter holds still long enough to name it. */
export const INTERVIEW_FREEZE_WARN_SEC = 6;
/** An off-screen line's length before synthesis, at a conversation's 19 characters a second. */
export const INTERVIEW_CHARS_PER_SEC = 19;
/** The conversation's pauses, cut down to a tenth of a second unless pause_trim names others: an interview answers without waiting. */
export const INTERVIEW_PAUSE_TRIM = Object.freeze({ sentence_end_s: 0.1, comma_s: 0.1, mid_phrase_s: 0.1 });
/** The off-screen voice when none is named, never the presenter's own. */
export const DEFAULT_INTERVIEW_VOICE = "en_male_mark";
export const SECOND_INTERVIEW_VOICE = "en_female_cassidy";

type Anchor = AnchoredItem["anchor"];
export interface InterviewTurn { anchor: Anchor; cover_words?: number | undefined }
export interface InterviewInput {
  turns: readonly InterviewTurn[];
  off_screen?: { voice?: string | undefined; caption?: { style?: string | undefined; place?: unknown } | undefined } | undefined;
  gaze?: InterviewGaze | undefined;
  listening?: (typeof INTERVIEW_LISTENING)[number] | undefined;
}
export interface PresenterGazeItem { anchor: Anchor; cover_words?: number | undefined; gaze: InterviewGaze }

/** The off-screen speaker's word ranges in script order, adjacent turns joined; a string names the first turn that does not resolve or overlaps. */
export function interviewTurnRanges(script: string, turns: readonly InterviewTurn[]): WordRange[] | { index: number; message: string } {
  const tokens = lexicalTokens(script), ranges: (WordRange & { index: number })[] = [];
  for (const [index, turn] of turns.entries()) {
    const range = layerWordRange(tokens, { id: "turn", anchor: turn.anchor, cover_words: turn.cover_words });
    if (typeof range === "string") return { index, message: range };
    const other = ranges.find(item => item.startWord < range.coverWord && range.startWord < item.coverWord);
    if (other) return { index, message: `overlaps turn ${other.index}` };
    ranges.push({ ...range, index });
  }
  const sorted = ranges.sort((a, b) => a.startWord - b.startWord), joined: WordRange[] = [];
  for (const { startWord, coverWord } of sorted) {
    const last = joined.at(-1);
    if (last && last.coverWord === startWord) last.coverWord = coverWord;
    else joined.push({ startWord, coverWord });
  }
  return joined;
}

export type InterviewSpeaker = "presenter" | "off_screen";
export interface InterviewLine { speaker: InterviewSpeaker; text: string; startWord: number; coverWord: number }

/** The script cut into the lines of the conversation, at word boundaries with each word's punctuation kept, in order. */
export function interviewTexts(script: string, turns: readonly WordRange[]): InterviewLine[] {
  const total = lexicalTokens(script).length, cuts = new Set<number>();
  for (const turn of turns) { cuts.add(turn.startWord); cuts.add(turn.coverWord); }
  const boundaries = [...cuts].filter(word => word > 0 && word < total).sort((a, b) => a - b);
  const pieces = splitAtWords(script, boundaries);
  let at = 0;
  return pieces.map((text, index) => {
    const startWord = at, coverWord = boundaries[index] ?? total;
    at = coverWord;
    const speaker: InterviewSpeaker = turns.some(turn => turn.startWord <= startWord && startWord < turn.coverWord) ? "off_screen" : "presenter";
    return { speaker, text, startWord, coverWord };
  });
}

/** A conversation's pace before synthesis (#991): each line takes a start and a time per word, a short answer reading slower than narration. */
export const INTERVIEW_LINE_SEC = 0.43;
export const INTERVIEW_WORD_SEC = 0.39;

/** An interview's estimated length and the presenter's share of it, line by line. */
export function interviewSecondsEstimate(script: string, turns: readonly WordRange[]): { totalSec: number; presenterSec: number } {
  let totalSec = 0, presenterSec = 0;
  for (const line of interviewTexts(script, turns)) {
    const seconds = INTERVIEW_LINE_SEC + INTERVIEW_WORD_SEC * (line.coverWord - line.startWord);
    totalSec += seconds;
    if (line.speaker === "presenter") presenterSec += seconds;
  }
  return { totalSec, presenterSec };
}

/** The script split before each lexical word in `boundaries`: whole whitespace chunks where possible, else inside one at the shortest prefix
 *  that holds exactly the words before the cut. */
function splitAtWords(script: string, boundaries: readonly number[]): string[] {
  const chunks = script.split(/(\s+)/u), pieces: string[] = [];
  let current = "", words = 0, next = 0;
  for (const chunk of chunks) {
    if (/^\s*$/u.test(chunk)) { current += chunk; continue; }
    let rest = chunk;
    let count = lexicalTokens(rest).length;
    while (next < boundaries.length && words + count > boundaries[next]!) {
      const need = boundaries[next]! - words;
      if (need <= 0) { pieces.push(current); current = ""; }
      else {
        // The longest such prefix, so the punctuation after the last word stays with it.
        const cut = [...Array(rest.length).keys()].map(i => i + 1).findLast(p => lexicalTokens(rest.slice(0, p)).length === need &&
          lexicalTokens(rest.slice(p)).length === count - need)!;
        pieces.push(current + rest.slice(0, cut)); current = ""; rest = rest.slice(cut); words += need; count -= need;
      }
      next++;
    }
    current += rest; words += count;
  }
  pieces.push(current);
  return pieces.map(piece => piece.trim());
}

/** Each lexical word's speaker. */
export function wordSpeakers(total: number, turns: readonly WordRange[]): InterviewSpeaker[] {
  return Array.from({ length: total }, (_, word) => turns.some(turn => turn.startWord <= word && word < turn.coverWord) ? "off_screen" : "presenter");
}

/** The presenter's gaze on each lexical word: the interview's own, else camera, then each presenter_gaze item on its words. */
export function wordGazes(script: string, input: { interview?: Pick<InterviewInput, "gaze"> | undefined; presenter_gaze?: readonly PresenterGazeItem[] | undefined }):
  InterviewGaze[] {
  const tokens = lexicalTokens(script), gazes: InterviewGaze[] = tokens.map(() => input.interview?.gaze ?? "camera");
  for (const item of input.presenter_gaze ?? []) {
    const range = layerWordRange(tokens, { id: "gaze", anchor: item.anchor, cover_words: item.cover_words });
    if (typeof range === "string") continue;
    for (let word = range.startWord; word < range.coverWord; word++) gazes[word] = item.gaze;
  }
  return gazes;
}

/** Every view of the actor the run needs, the main one first. */
export function gazesNeeded(input: { interview?: Pick<InterviewInput, "gaze"> | undefined; presenter_gaze?: readonly Pick<PresenterGazeItem, "gaze">[] | undefined }):
  InterviewGaze[] {
  return [...new Set([input.interview?.gaze ?? "camera", ...(input.presenter_gaze ?? []).map(item => item.gaze)])];
}

/** The presenter's takes before timing: each run of words on screen is one, and a change of gaze inside a run starts another. */
export function presenterTakeCount(script: string, input: { interview?: InterviewInput | undefined; presenter_gaze?: readonly PresenterGazeItem[] | undefined;
  inserts?: readonly AnchoredItem[] | undefined }): number {
  const tokens = lexicalTokens(script), turns = input.interview ? interviewTurnRanges(script, input.interview.turns) : [];
  if (!Array.isArray(turns)) return 0;
  const covered = new Set<number>();
  for (const insert of input.inserts ?? []) {
    const range = layerWordRange(tokens, insert);
    if (typeof range !== "string") for (let word = range.startWord; word < range.coverWord; word++) covered.add(word);
  }
  const speakers = wordSpeakers(tokens.length, turns), gazes = wordGazes(script, input);
  let takes = 0;
  for (let word = 0; word < tokens.length; word++) {
    const shown = speakers[word] === "presenter" && !covered.has(word);
    const before = word > 0 && speakers[word - 1] === "presenter" && !covered.has(word - 1);
    if (shown && (!before || gazes[word] !== gazes[word - 1])) takes++;
  }
  return takes;
}

export interface InterviewCheckInput {
  script?: string | undefined; segments?: unknown; call?: unknown; voice?: string | undefined; tts_model?: string | undefined;
  voice_id?: string | undefined; image?: string | undefined; actor_gender?: Gender | undefined;
  actor_id?: string | undefined; captions?: boolean | undefined; inserts?: readonly AnchoredItem[] | undefined;
  caption_emphasis?: readonly (string | { quote: string })[] | undefined;
  interview?: InterviewInput | undefined; presenter_gaze?: readonly PresenterGazeItem[] | undefined;
}

/** The one model that speaks a conversation in one request. */
export const INTERVIEW_TTS_MODEL = "eleven_v4";

/** Every refusal of `interview` and `presenter_gaze` before money, named by path. */
export function interviewRefusals(input: InterviewCheckInput): LayerRefusal[] {
  const { interview } = input;
  if (interview === undefined && input.presenter_gaze === undefined) return [];
  if (input.script === undefined || input.segments !== undefined || input.call !== undefined) {
    const field = interview ? "interview" : "presenter_gaze";
    return [{ path: [field], message: `${field} needs script and cannot be combined with segments or call` }];
  }
  const refusals: LayerRefusal[] = [], tokens = lexicalTokens(input.script);
  let turns: WordRange[] = [];
  if (interview) {
    const ranges = interviewTurnRanges(input.script, interview.turns);
    if (!Array.isArray(ranges)) refusals.push({ path: ["interview", "turns", ranges.index, "anchor"], message: ranges.message });
    else {
      turns = ranges;
      if (turns.reduce((sum, turn) => sum + turn.coverWord - turn.startWord, 0) === tokens.length) {
        refusals.push({ path: ["interview", "turns"], message: "every word is the off-screen speaker's: the presenter needs words" });
      }
    }
    // An actor_id's gender is the pin's, so admission checks its default voice (#972 I2); an unknown gender speaks the default actor's voice.
    const presenter = input.actor_id === undefined || input.voice !== undefined
      ? interviewPresenterVoice(input, input.image === undefined ? undefined : input.actor_gender) : undefined;
    if (interview.off_screen?.voice !== undefined && interview.off_screen.voice === presenter) {
      refusals.push({ path: ["interview", "off_screen", "voice"], message: INTERVIEW_SHARED_VOICE_REFUSAL });
    }
    if (input.tts_model !== undefined && input.tts_model !== INTERVIEW_TTS_MODEL) {
      refusals.push({ path: ["tts_model"], message: `an interview speaks both voices as one conversation on ${INTERVIEW_TTS_MODEL}: omit tts_model or pass ${INTERVIEW_TTS_MODEL}` });
    }
    if (interview.listening === "live") {
      refusals.push({ path: ["interview", "listening"], message: "listening live is not offered yet: omit listening, and the presenter holds still while the off-screen speaker talks" });
    }
    if (interview.off_screen?.caption !== undefined && input.captions !== true) {
      refusals.push({ path: ["interview", "off_screen", "caption"], message: "interview.off_screen.caption requires captions=true: it styles the off-screen speaker's captions" });
    }
    if (interview.gaze !== undefined && interview.gaze !== "camera" && input.actor_id === undefined) {
      refusals.push({ path: ["interview", "gaze"], message: "interview.gaze needs actor_id; list_actors shows each actor's views" });
    }
  }
  const off = wordSpeakers(tokens.length, turns), gazed: WordRange[] = [];
  for (const [index, item] of (input.presenter_gaze ?? []).entries()) {
    if (input.actor_id === undefined) { refusals.push({ path: ["presenter_gaze", index], message: `presenter_gaze[${index}]: needs actor_id; list_actors shows each actor's views` }); continue; }
    const range = layerWordRange(tokens, { id: "gaze", anchor: item.anchor, cover_words: item.cover_words });
    if (typeof range === "string") { refusals.push({ path: ["presenter_gaze", index, "anchor"], message: range }); continue; }
    if (off.slice(range.startWord, range.coverWord).includes("off_screen")) {
      refusals.push({ path: ["presenter_gaze", index, "anchor"], message: "the presenter looks where they speak: these words are the off-screen speaker's" });
    }
    if (gazed.some(other => other.startWord < range.coverWord && range.startWord < other.coverWord)) {
      refusals.push({ path: ["presenter_gaze", index, "anchor"], message: "overlaps an earlier presenter_gaze item: one gaze holds a word" });
    }
    gazed.push(range);
  }
  if (interview && input.captions === true) {
    for (const [index, item] of (input.caption_emphasis ?? []).entries()) {
      const quote = typeof item === "string" ? item : item.quote;
      if (quoteOccurrences(tokens, quote).some(match => off.slice(match.startWord, match.endWord).includes("off_screen"))) {
        refusals.push({ path: ["caption_emphasis", index], message: `"${quote}" is spoken off screen; emphasis marks the presenter's words` });
      }
    }
  }
  if (!refusals.length) {
    const takes = presenterTakeCount(input.script, input), cap = interview ? MAX_INTERVIEW_TAKES : undefined;
    if (cap !== undefined && takes > cap) {
      refusals.push({ path: ["interview"], message: `the presenter appears in ${takes} takes, more than ${cap}; merge answers or drop a change of gaze` });
    }
  }
  return refusals;
}

/** What an interview does differently from what was asked, named before money (rule 3). */
export function interviewWarnings(input: { script?: unknown; interview?: unknown; voice_pace?: unknown }): string[] {
  const interview = input.interview as InterviewInput | undefined;
  if (typeof input.script !== "string" || !interview || !Array.isArray(interview.turns)) return [];
  const turns = interviewTurnRanges(input.script, interview.turns);
  if (!Array.isArray(turns)) return [];
  const warnings: string[] = [];
  const lines = interviewTexts(input.script, turns).filter(line => line.speaker === "off_screen");
  const longest = Math.max(0, ...lines.map(line => line.text.length / INTERVIEW_CHARS_PER_SEC));
  if (longest > INTERVIEW_FREEZE_WARN_SEC) {
    warnings.push(`the presenter holds still for about ${longest.toFixed(1)} s while the off-screen speaker talks`);
  }
  if (turns[0]?.startWord === 0) warnings.push("the opening question freezes the presenter on the first frame of their first answer");
  if (input.voice_pace !== undefined) {
    warnings.push("voice_pace does not change an interview: both voices speak as one conversation at their own pace; list_voices names each voice's words_per_second");
  }
  return warnings;
}

export const INTERVIEW_SHARED_VOICE_REFUSAL = "the off-screen speaker needs a voice other than the presenter's";

/** The presenter's voice by name: the named one, else its model's default for the gender; a raw voice_id has no name. */
export function interviewPresenterVoice(input: { voice?: string | undefined; voice_id?: string | undefined; tts_model?: string | undefined },
  gender: Gender | undefined): string | undefined {
  if (input.voice_id !== undefined) return undefined;
  return input.voice ?? defaultVoiceOf(input.tts_model, gender).name;
}

/** The off-screen voice: the named one, else the default, kept off the presenter's voice; the server compares by vendor id (#987). */
export function interviewOffScreenVoice(interview: Pick<InterviewInput, "off_screen">, speaksPresenterVoice: (voice: string) => boolean): string {
  return interview.off_screen?.voice ?? (speaksPresenterVoice(DEFAULT_INTERVIEW_VOICE) ? SECOND_INTERVIEW_VOICE : DEFAULT_INTERVIEW_VOICE);
}
