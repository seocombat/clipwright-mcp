import { lexicalTokens } from "./semantic-inserts.js";
import { layerWordRange, type AnchoredItem } from "./ugc-layers.js";

export const LIVE_SHOT_KINDS = ["talking", "talking_action", "action"] as const;
export type LiveShotKind = (typeof LIVE_SHOT_KINDS)[number];
export const LIVE_SHOT_TRANSITIONS = ["cut", "flash", "light_leak", "whoosh"] as const;
export type LiveShotTransition = (typeof LIVE_SHOT_TRANSITIONS)[number];
export const LIVE_SHOT_PRODUCT_PLACEMENTS = ["hand", "beside"] as const;
export type LiveShotProductPlacement = (typeof LIVE_SHOT_PRODUCT_PLACEMENTS)[number];
export const LIVE_SHOT_FRAMINGS = ["wide", "full"] as const;
export type LiveShotFraming = (typeof LIVE_SHOT_FRAMINGS)[number];
export function liveShotProductPlacement(shot: { product?: boolean | { placement: LiveShotProductPlacement } | undefined }):
  LiveShotProductPlacement | undefined {
  return shot.product === true ? "hand" : shot.product ? shot.product.placement : undefined;
}
export function talkingPose(shot: { kind: LiveShotKind; start?: string | undefined; setup?: string | undefined;
  product?: boolean | { placement: LiveShotProductPlacement } | undefined }): boolean {
  return shot.kind === "talking" && (shot.start !== undefined || shot.setup !== undefined || liveShotProductPlacement(shot) !== undefined);
}
const LETTER_BEFORE = "(?<![\\p{L}\\p{N}])", LETTER_AFTER = "(?![\\p{L}\\p{N}])", WORDS = (most: number) => `(?:\\s+[\\p{L}'’-]+){0,${most}}?`;
const phrase = (source: string) => new RegExp(source, "iu");
const either = (words: readonly string[]) => `${LETTER_BEFORE}(?:${words.join("|")})${LETTER_AFTER}`;
const EN_HOLDERS = "(?:bag|backpack|tote|purse|pocket|box|case|package|packaging|carton|pouch|sleeve|drawer|shelf|cupboard|cabinet|fridge|basket|" +
  "counter|table|desk|tray|holder|stand)s?";
const FETCH_PHRASES: Readonly<Record<string, readonly RegExp[]>> = Object.freeze({
  en: [
    phrase(`${either(["take", "takes", "taking", "took", "pull", "pulls", "pulling", "pulled", "lift", "lifts", "lifting", "lifted", "grab", "grabs",
      "grabbing", "grabbed", "draw", "draws", "drawing", "drew", "fish", "fishes", "fishing", "fished"])}${WORDS(6)}\\s+out${LETTER_AFTER}`),
    phrase(`${either(["take", "takes", "taking", "took", "pull", "pulls", "pulling", "pulled", "lift", "lifts", "lifting", "lifted", "grab", "grabs",
      "grabbing", "grabbed", "pick", "picks", "picking", "picked"])}${WORDS(6)}\\s+(?:from|off)${WORDS(2)}\\s+${EN_HOLDERS}${LETTER_AFTER}`),
    phrase(`${either(["reach", "reaches", "reaching", "reached"])}\\s+(?:in|into|inside)${LETTER_AFTER}`),
    phrase(`${either(["pick", "picks", "picking", "picked"])}${WORDS(3)}\\s+up${LETTER_AFTER}`),
    phrase(`${LETTER_BEFORE}(?:un-?box|unpack|unwrap|fetch|retriev)\\p{L}*`),
  ],
  es: [
    phrase(either(["saca", "sacan", "sacar", "sacando", "sacó"])),
    phrase(`${LETTER_BEFORE}(?:desempaquet|desenvuelv|desenvolv|desembal)\\p{L}*`),
    phrase(`${either(["mete", "meten", "metiendo"])}\\s+la\\s+mano\\s+en`),
  ],
  fr: [
    phrase(`${either(["sort", "sortent", "sortir", "sortant"])}\\s+(?:le|la|les|l'|un|une|son|sa|ses)${LETTER_AFTER}`),
    phrase(`${LETTER_BEFORE}déball\\p{L}*`),
    phrase(`${LETTER_BEFORE}plong\\p{L}*\\s+la\\s+main\\s+dans`),
  ],
  it: [
    phrase(`${either(["tira", "tirano", "tirare", "tirando"])}\\s+fuori${LETTER_AFTER}`),
    phrase(either(["estrae", "estraggono", "estrarre", "estraendo"])),
    phrase(`${LETTER_BEFORE}spacchett\\p{L}*`),
    phrase(`${either(["prende", "prendono", "afferra", "afferrano"])}${WORDS(6)}\\s+(?:dalla|dallo|dal|dall'|dai|dagli|dalle)\\s*` +
      "(?:borsa|scatola|tasca|zaino|cassetto|mensola|tavolo|confezione)"),
  ],
  pt: [
    phrase(`${either(["tira", "tiram", "tirar", "tirando", "retira", "retiram", "retirar", "retirando", "pega", "pegam", "pegar", "pegando"])}${WORDS(6)}` +
      "\\s+(?:da|do|de\\s+(?:uma|um|sua|seu))\\s+(?:bolsa|caixa|bolso|mochila|gaveta|prateleira|sacola|mesa|embalagem)"),
    phrase(`${LETTER_BEFORE}(?:desembal|desembrulh|desempacot)\\p{L}*`),
  ],
  ru: [
    phrase(either(["достаёт", "достает", "достают", "достать", "достала", "достал", "достали", "вынимает", "вынимают", "вынимать", "вынула", "вынул",
      "вынуть", "вытаскивает", "вытаскивают", "вытащила", "вытащил", "вытащить"])),
    phrase(`${LETTER_BEFORE}распаков\\p{L}*`),
    phrase(`${either(["берёт", "берет", "взяла", "взял", "взять"])}${WORDS(4)}\\s+(?:из|со?)\\s+(?:сумки|коробки|кармана|рюкзака|ящика|полки|стола|упаковки)`),
  ],
  tr: [
    phrase(`\\p{L}+(?:dan|den|tan|ten)\\s+(?:\\p{L}+\\s+)?(?:çıkar|çıkarır|çıkarıyor|çıkardı|alır|alıyor|aldı)${LETTER_AFTER}`),
  ],
});
export function fetchesProduct(action: string): boolean {
  return Object.values(FETCH_PHRASES).some(phrases => phrases.some(pattern => pattern.test(action)));
}
type FetchShot = { kind: LiveShotKind; action?: string | undefined; shot?: unknown; product?: boolean | { placement: LiveShotProductPlacement } | undefined };
export function liveShotFetchesProduct(shot: FetchShot): boolean {
  return shot.kind !== "talking" && shot.shot === undefined && liveShotProductPlacement(shot) === "hand" && fetchesProduct(shot.action ?? "");
}
export function fetchedProductWarnings(shots: readonly (FetchShot & { id: string })[]): string[] {
  return shots.filter(liveShotFetchesProduct)
    .map(shot => `shot "${shot.id}": starts with empty hands and the product beside them, because its action takes the product out`);
}
export const TALKING_ACTION_VOICE_OVER = "voice_over" as const;
export function talkingActionVoiceOver(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" &&
    (storedInput as { talking_action_take?: unknown }).talking_action_take === TALKING_ACTION_VOICE_OVER;
}
export function productSheetMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { product_sheet?: unknown }).product_sheet === true;
}
export function lipsyncMotionMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { lipsync_motion?: unknown }).lipsync_motion === true;
}
export function lipsyncMotionShot(shot: { kind: LiveShotKind; start?: string | undefined; setup?: string | undefined;
  product?: boolean | { placement: LiveShotProductPlacement } | undefined }): boolean {
  return shot.kind === "talking_action" || talkingPose(shot);
}
type InsertShot = AnchoredItem &{ kind: LiveShotKind; product?: boolean | { placement: LiveShotProductPlacement } | undefined;
  cast?: readonly unknown[] | undefined };
export function handsInsertShots(script: string, shots: readonly InsertShot[]): Set<string> {
  const tokens = lexicalTokens(script), sentences = script.trim().split(/(?<=[.!?…])\s+/u);
  const first = lexicalTokens(sentences[0] ?? "").length, last = lexicalTokens(sentences.at(-1) ?? "").length;
  return new Set(shots.filter(shot => {
    if (shot.kind !== "talking_action" || shot.cast?.length || liveShotProductPlacement(shot) !== "hand") return false;
    const range = layerWordRange(tokens, shot);
    return typeof range !== "string" && range.startWord >= first && range.coverWord <= tokens.length - last;
  }).map(shot => shot.id));
}
export function omniShotIds(script: string, shots: readonly (InsertShot & { id: string })[]): Set<string> {
  return new Set([...shots.filter(shot => shot.kind === "action").map(shot => shot.id), ...handsInsertShots(script, shots)]);
}
export function omniShotsMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { omni_shots?: unknown }).omni_shots === true;
}
export function seedanceShotIds(input: { script?: string | undefined; shots?: readonly (InsertShot & { id: string })[] | undefined;
  omni_shots?: true | undefined; seedance_shots?: readonly string[] | undefined }): Set<string> {
  if (!input.seedance_shots?.length || !omniShotsMarked(input) || !input.script || !input.shots?.length) return new Set();
  const silent = omniShotIds(input.script, input.shots);
  return new Set(input.seedance_shots.filter(id => silent.has(id)));
}
const PRINT_WORDS = /\b(?:labels?|print(?:ed|ing)?|logos?|lettering|wordmark|brand name|pack ?shots?)\b/iu;
export const shotNamesPrint = (shot: { start?: string | undefined; action?: string | undefined }): boolean =>
  PRINT_WORDS.test(`${shot.start ?? ""} ${shot.action ?? ""}`);
export function seedanceShotModels(input: Parameters<typeof seedanceShotIds>[0] & { seedance_no_text_shots?: readonly string[] | undefined;
  resolution?: string | undefined }): Map<string, "seedance" | "seedance_no_text"> {
  const low = new Set(input.resolution === "720p" ? input.seedance_no_text_shots ?? [] : []);
  return new Map([...seedanceShotIds(input)].map(id => [id, low.has(id) ? "seedance_no_text" : "seedance"]));
}
export function voiceOverShotWarnings(script: string, shots: readonly InsertShot[]): string[] {
  return [...handsInsertShots(script, shots)].map(id => `shot "${id}": shows the presenter's hands with the product up close while its words ` +
    "play as voice-over");
}
export const MAX_SHOT_CAST = 3;
export const CAST_INSERT_ID = "cast";
export function castSlotOf(assetId: string): string {
  return `c${BigInt(`0x${assetId.replace(/^ast_/, "")}`).toString(36)}`;
}
export function liveShotCastKey(shot: { cast?: readonly { asset_id: string; role: string }[] | undefined }): string {
  return JSON.stringify((shot.cast ?? []).map(person => [person.asset_id, person.role.trim().replace(/\s+/g, " ")]));
}
export function liveShotSetupKey(shot: { setup?: string | undefined }): string {
  return shot.setup?.trim().replace(/\s+/g, " ") ?? "";
}
