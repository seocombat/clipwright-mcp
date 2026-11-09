import { scriptLanguageOf } from "./caption-language.js";
import { namesThing, namingLanguageOf } from "./naming.js";

// Whether a script suits the explainer format: a chain of concrete actions told by one narrator, something to show on every phrase. Reasoning,
// a dialogue or a story about people fits poorly; the answer then says why and how to rewrite it into actions. Deterministic: quote and run agree.

export type ExplainerFitShape = "steps" | "list" | "walkthrough";
export type ExplainerMisfit = "reasoning" | "dialogue" | "story" | "too_long" | "too_short";
export interface ExplainerFit {
  fits: boolean;
  shape: ExplainerFitShape | null;
  misfit: ExplainerMisfit | null;
  /** One sentence for the customer: why it fits, or why not. */
  reason: string;
  /** Present when it does not fit: how to rewrite the text into actions. */
  rewrite?: string;
}

/** Narration words a second, the pace the length bounds assume. */
const WORDS_PER_SECOND = 2.5;
export const EXPLAINER_FIT_SECONDS = { min: 12, max: 60 } as const;

/** Word boundaries that hold for every script, not only ASCII. */
const word = (body: string, flags = "giu") => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, flags);
const ORDINALS = word("first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|fifth|then|next|after that|finally|last(?:ly)?|step \\d+|step (?:one|two|three|four|five)" +
  "|перв(?:ый|ое|ая|ым)|втор(?:ой|ое|ая)|трет(?:ий|ье|ья)|четв[её]рт\\p{L}*|пят(?:ый|ое)|затем|потом|дальше|наконец|шаг \\d+");
const NUMBERED = /(^|\n)\s*\d+[.)]\s/gu;
const LIST_HEAD = word("(?:\\d+|two|three|four|five|six|seven|ten|два|две|три|четыре|пять|шесть|семь|десять)\\s+" +
  "(?:mistakes?|ways?|tips?|steps?|tricks?|rules?|reasons?|things?|ошиб\\p{L}*|способ\\p{L}*|совет\\p{L}*|шаг\\p{L}*|правил\\p{L}*|при[её]м\\p{L}*)");
const HOW = word("how to|here'?s how|how it works|how (?:do|does|can) (?:you|i|it)|walk(?:ing)? (?:you )?through|как (?:сделать|это работает|собрать|настроить|начать)|вот как|покажу");
const IMPERATIVE = word("open|type|click|tap|paste|add|write|put|press|choose|select|drag|drop|run|install|upload|copy|save|keep|use|try|avoid|don'?t|never|make|check|" +
  "start|end|fix|create|turn|move|pick|send|ask|record|cut|sort|mark|name|enter|connect|plug|switch|replace|remove|delete|fill|follow|find|share|post|schedule|" +
  "открой|нажми|вставь|напиши|положи|добавь|выбери|сохрани|проверь|запусти|скопируй|перетащи|введи|поставь|сделай|возьми|включи|выключи|загрузи|отправь|" +
  "запиши|убери|удали|заполни|найди|начни|закончи|держи|используй|избегай|попробуй|подключи|замени|отметь|назови|спроси|открывай|пиши|ставь|делай|пробуй|не делай");
const DIALOGUE_LINE = /(^|\n)\s*([\p{Lu}][\p{L}'-]{1,20})\s*:\s*\S/gu;
const SAID = word("said|asked|replied|told (?:him|her|me)|сказал\\p{L}*|спросил\\p{L}*|ответил\\p{L}*");
const PEOPLE = word("he|she|they|my (?:friend|wife|husband|dad|mom|mother|father|boss|son|daughter)|он|она|они|мой друг|моя подруга|мама|папа");
const PAST = word("\\p{L}{3,}ed|was|were|had|went|came|saw|met|told|took|got|became|\\p{L}{3,}(?:л|ла|ли|ло)");

const count = (re: RegExp, text: string) => [...text.matchAll(re)].length;

export const EXPLAINER_REWRITE = "Rewrite it as actions: a hook (everyone does X, nobody shows how, here's how), three to five steps that each name " +
  "a thing to show (a screen, a button, a file, a number), and one result line; 20 to 45 seconds, one narrator.";

/** A list needs at least this many naming sentences, and this share of all sentences, so an essay with a few "that's a ..." stays an argument. */
const LIST_MIN_NAMING = 4, LIST_MIN_SHARE = 0.4;
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|\n+/u).filter(part => /\p{L}/u.test(part));

/** The sentences that each name a thing when the script reads as a list of things, else 0 (#1277): what an explainer's object pictures are
 * counted from, so steps through software name none. */
export function namedThings(script: string): number {
  // A sentence names a thing by its language's rules (#1284): "it's a heart", "it's cold brew", tr "bir servo motor var", "Soğutma fanı, …".
  const language = namingLanguageOf(script, scriptLanguageOf(script));
  const sentences = sentencesOf(script.trim()), naming = sentences.filter(part => namesThing(part, language)).length;
  return naming >= LIST_MIN_NAMING && naming >= LIST_MIN_SHARE * sentences.length ? naming : 0;
}

/** Whether `part` of a list `script` has a sentence naming a thing, so its scene shows its own item (#1280); false when the script is no list. */
export function namesListItem(script: string, part: string): boolean {
  if (namedThings(script) === 0) return false;
  const language = namingLanguageOf(script, scriptLanguageOf(script));
  return sentencesOf(part.trim()).some(sentence => namesThing(sentence, language));
}

/** The explainer format's fit for a script: the shape it takes when it fits, else the misfit and a rewrite into actions. `wordsPerSecond` is the pace
 *  of the voice that will speak it, default the format's flat 2.5. */
export function explainerFit(script: string, wordsPerSecond: number = WORDS_PER_SECOND): ExplainerFit {
  const text = script.trim(), words = text.split(/\s+/).filter(Boolean).length, seconds = words / wordsPerSecond;
  const named = namedThings(text) > 0;
  const ordinals = count(ORDINALS, text) + count(NUMBERED, text), list = count(LIST_HEAD, text), how = count(HOW, text), imperatives = count(IMPERATIVE, text);
  const speakers = new Set([...text.matchAll(DIALOGUE_LINE)].map(m => m[2]!.toLowerCase()));
  const actions = ordinals + 2 * list + 2 * how + imperatives;
  const no = (misfit: ExplainerMisfit, reason: string, rewrite = EXPLAINER_REWRITE): ExplainerFit => ({ fits: false, shape: null, misfit, reason, rewrite });
  if (speakers.size >= 2 || count(SAID, text) >= 2) return no("dialogue", "This script is a dialogue; the format needs one narrator walking through actions.");
  if (seconds > EXPLAINER_FIT_SECONDS.max) {
    return no("too_long", `This script runs about ${Math.round(seconds)} s; the format holds attention to about ${EXPLAINER_FIT_SECONDS.max} s.`,
      "Cut it to the hook, three to five steps and the result: 20 to 45 seconds.");
  }
  if (seconds < EXPLAINER_FIT_SECONDS.min) return no("too_short", "This script is too short to walk through actions; the format needs a hook, steps and a result.");
  if (count(PEOPLE, text) >= 2 && count(PAST, text) >= Math.max(4, words / 12) && actions < 4) {
    return no("story", "This script tells a story about people; the format shows actions with things on screen.");
  }
  if (named && actions < 3) {
    return { fits: true, shape: "list", misfit: null, reason: "A list of named things: each line names one thing to show, so each gets its own scene and mark." };
  }
  if (actions < 3) return no("reasoning", "This script reasons without concrete actions; the format needs something to show on every phrase.");
  const items = [...text.matchAll(LIST_HEAD)].filter(m => !/step|шаг/iu.test(m[0])).length;
  const shape: ExplainerFitShape = items > 0 ? "list" : ordinals >= 2 || list > 0 ? "steps" : "walkthrough";
  const reason = shape === "list" ? "A numbered list of concrete points: each point gets its own scene, step badge and mark."
    : shape === "steps" ? "A chain of steps one narrator walks through: each step gets its own scene, step badge and check."
      : "A walkthrough of concrete actions: each action gets a drawn screen, cursor or typed line on its words.";
  return { fits: true, shape, misfit: null, reason };
}
