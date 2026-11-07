import { z } from "zod";

// The account's script voice (#1203): who speaks to whom, the tone, a closing line, banned phrases, a preferred format and a second
// language. It sits in the brand kit beside the design; a call's own value wins, and every change it makes to a script is named.

export const SCRIPT_TONES = ["friendly", "expert", "bold", "calm"] as const;
export const SCRIPT_FORMATS = ["presenter", "presenter_visuals", "faceless", "screencast"] as const;
export type ScriptFormat = (typeof SCRIPT_FORMATS)[number];
export const MAX_BANNED_PHRASES = 50;
const LANGUAGE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

const text = (max: number) => z.string().trim().min(1).max(max);
const voiceShape = {
  about: text(1000).optional().describe("Who speaks and who watches, in plain words; a call's own audience wins."),
  tone: text(200).optional().describe(`${SCRIPT_TONES.join(", ")}, or your own words.`),
  sign_off: text(200).optional().describe("The closing line every script ends on; added when a script lacks it."),
  caption_cta: text(200).optional().describe("The call to action every post caption you write ends on."),
  banned_phrases: z.array(text(80)).max(MAX_BANNED_PHRASES).optional()
    .describe("Words no script may say; one in a script is taken out and named in warnings[]."),
  default_format: z.enum(SCRIPT_FORMATS).optional()
    .describe("presenter: the presenter fills the frame; presenter_visuals: presenter with visuals; faceless; screencast."),
  second_language: z.string().regex(LANGUAGE, "a language code such as es or pt-BR").optional()
    .describe("Each script also gets a version in this language, written beside it."),
};

export const scriptVoice = z.strictObject(voiceShape).superRefine((voice, context) => {
  if (Object.values(voice).every(value => value === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "voice needs at least one field; null clears it" });
  }
  const banned = voice.banned_phrases ?? [];
  if (voice.sign_off !== undefined) for (const phrase of banned) {
    if (phrasePattern(phrase).test(voice.sign_off)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sign_off"], message: `the sign-off says "${phrase}", a banned phrase` });
    }
  }
});
export type ScriptVoice = z.infer<typeof scriptVoice>;

/** The same object for tools/list, where every byte counts: its field names alone; the API checks the full `scriptVoice`. */
export const mcpScriptVoice = z.record(z.string(), z.unknown())
  .describe(`The script voice to save: ${Object.keys(voiceShape).join(", ")}; {} clears it.`);

const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A phrase as whole words, any case, any run of spaces between its words. */
function phrasePattern(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/u).map(literal).join("\\s+");
  const head = /^[\p{L}\p{N}]/u.test(phrase.trim()) ? "(?<![\\p{L}\\p{N}_])" : "";
  const tail = /[\p{L}\p{N}]$/u.test(phrase.trim()) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${head}${words}${tail}`, "iu");
}

const SENTENCE_START = /(?:^|[.!?…]["'”’)\]]*\s+|\n)\s*$/u;
/** Takes every whole-word occurrence of the phrase out of the text and tidies the gap: a phrase that opened a sentence hands the */
/** capital to the next word, one mid-sentence leaves a single space before the next word or mark. */
function cut(source: string, phrase: string): { text: string; count: number } {
  const pattern = phrasePattern(phrase);
  let text = source, from = 0, count = 0;
  for (;;) {
    const match = pattern.exec(text.slice(from));
    if (!match) break;
    const start = from + match.index, end = start + match[0].length;
    let head = text.slice(0, start), tail = text.slice(end);
    // A mark counts as the gap's punctuation only before a space or the end: "-20" and ".5" keep their sign and point.
    if (SENTENCE_START.test(head)) {
      tail = tail.replace(/^[^\S\n]*(?:[,;:–—-](?=\s|$))?[^\S\n]*/u, "");
      tail = tail.replace(/^[.!?…]+(?=\s|$)[^\S\n]*/u, "");
      tail = tail.replace(/^\p{Ll}/u, letter => letter.toUpperCase());
      if (tail === "") head = head.trimEnd();
    } else {
      head = head.replace(/[^\S\n]+$/u, "");
      tail = tail.replace(/^[^\S\n]+/u, "");
      if (/^[,;:](?=\s|$)/u.test(tail) && /[,;:]$/u.test(head)) tail = tail.slice(1).replace(/^[^\S\n]+/u, "");
      if (/^[.!?…]+(?=\s|$)/u.test(tail) && /(?:[,;:]|\s[–—-])$/u.test(head)) head = head.slice(0, -1).trimEnd();
      if (tail !== "" && !/^(?:[,.;:!?…]+(?=\s|$)|\n)/u.test(tail)) tail = ` ${tail}`;
    }
    text = head + tail;
    from = head.length;
    count += 1;
  }
  return { text: text.trim(), count };
}

const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** True when the script already ends on the sign-off, whatever its case and punctuation. */
export const endsOnSignOff = (script: string, signOff: string) => {
  const end = normalized(signOff);
  return end === "" || ` ${normalized(script)}`.endsWith(` ${end}`);
};

/** One line for every phrase taken out, held under 400 characters so a plan keeps it whole beside the sign-off line. */
function bannedLine(removed: readonly [string, number][]): string {
  const named = (entries: readonly [string, number][]) => entries.map(([phrase, count]) => `"${phrase}"${count > 1 ? ` ${count} times` : ""}`).join(", ");
  let shown = removed.length;
  const line = (count: number) => `the script said ${named(removed.slice(0, count))}${count < removed.length ? ` and ${removed.length - count} more` : ""}, ` +
    `banned by the saved script voice: ${removed.length > 1 ? "they were" : "it was"} taken out; rewrite a line if it now reads wrong`;
  while (shown > 1 && line(shown).length > 400) shown -= 1;
  return line(shown);
}

export interface VoicedScript { script: string; warnings: string[]; changed: boolean; removedWords: boolean }

/** The script under the account's voice: each banned phrase taken out, then the sign-off added when the script lacks it. Pure, so the */
/** quote and the run say the same words; a script left empty gets no sign-off, and its caller refuses it. */
export function applyScriptVoice(script: string, voice: Pick<ScriptVoice, "banned_phrases" | "sign_off"> | null | undefined,
  options: { signOff?: boolean } = {}): VoicedScript {
  const warnings: string[] = [];
  const counts = new Map<string, number>();
  let text = script;
  // Again until none is left: taking one phrase out can join the words around it into another.
  for (let pass = 0; pass <= MAX_BANNED_PHRASES; pass += 1) {
    let changed = false;
    for (const phrase of voice?.banned_phrases ?? []) {
      const result = cut(text, phrase);
      if (result.count === 0) continue;
      text = result.text;
      changed = true;
      counts.set(phrase, (counts.get(phrase) ?? 0) + result.count);
    }
    if (!changed) break;
  }
  if (counts.size) warnings.push(bannedLine([...counts]));
  const removedWords = text !== script;
  const signOff = voice?.sign_off;
  if (signOff !== undefined && options.signOff !== false && text.trim() !== "" && !endsOnSignOff(text, signOff)) {
    const body = text.trimEnd();
    text = `${body}${/[.!?…"'”’)]$/u.test(body) ? "" : "."} ${signOff}`;
    warnings.push(`the saved sign-off "${signOff}" was added as the script's last line`);
  }
  return { script: text, warnings, changed: text !== script, removedWords };
}

/** The banned phrases a text says, each once, in the voice's order. */
export const bannedPhrasesIn = (value: string, voice: Pick<ScriptVoice, "banned_phrases"> | null | undefined): string[] =>
  (voice?.banned_phrases ?? []).filter(phrase => phrasePattern(phrase).test(value));

/** The line a plan or run says about the second-language version: the client writes it, free; its video is quoted on its own. */
export const secondLanguageLine = (language: string) => `the saved script voice asks for a second language (${language}): write the ` +
  `${language} version of this script for the user beside it, free; a video of it is its own plan or run, quoted on its own`;

/** The voice as words for a writer that drafts the narration from a brief; undefined when the voice says nothing a writer uses. */
export function voiceBriefNote(voice: ScriptVoice): string | undefined {
  const parts = [
    voice.about === undefined ? undefined : `Speaker and audience: ${voice.about}.`,
    voice.tone === undefined ? undefined : `Tone: ${voice.tone}.`,
    voice.sign_off === undefined ? undefined : `End the narration with exactly: "${voice.sign_off}".`,
    voice.banned_phrases?.length ? `Never use these words or phrases: ${voice.banned_phrases.map(phrase => `"${phrase}"`).join(", ")}.` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length ? `Script voice of this account: ${parts.join(" ")}` : undefined;
}
