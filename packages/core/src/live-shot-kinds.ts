import { lexicalTokens } from "./semantic-inserts.js";
import { layerWordRange, type AnchoredItem } from "./ugc-layers.js";

/** Live shots (#1103): what the actor does on some words of the script, drawn by the engine of the shot's kind. */
export const LIVE_SHOT_KINDS = ["talking", "talking_action", "action"] as const;
export type LiveShotKind = (typeof LIVE_SHOT_KINDS)[number];
/** The look of the cuts into and out of a live shot (#1129); whoosh is a cut with the whoosh sound. */
export const LIVE_SHOT_TRANSITIONS = ["cut", "flash", "light_leak", "whoosh"] as const;
export type LiveShotTransition = (typeof LIVE_SHOT_TRANSITIONS)[number];
/** Where a live shot's product sits (#1146): in the actor's hand or beside them. */
export const LIVE_SHOT_PRODUCT_PLACEMENTS = ["hand", "beside"] as const;
export type LiveShotProductPlacement = (typeof LIVE_SHOT_PRODUCT_PLACEMENTS)[number];
/** How much wider than the actor's view a shot's first frame is drawn (#1175 S7): waist-up with the hands, or head to feet. */
export const LIVE_SHOT_FRAMINGS = ["wide", "full"] as const;
export type LiveShotFraming = (typeof LIVE_SHOT_FRAMINGS)[number];
/** A shot's product placement: `true` is the hand, as before #1146; absent or `false` shows no product. */
export function liveShotProductPlacement(shot: { product?: boolean | { placement: LiveShotProductPlacement } | undefined }):
  LiveShotProductPlacement | undefined {
  return shot.product === true ? "hand" : shot.product ? shot.product.placement : undefined;
}
/** A talking shot with a pose (#1536): it names its first frame, its place or the product, and starts from its own picture as a talking_action */
/** shot does. A talking shot that names none of them is the presenter as before. */
export function talkingPose(shot: { kind: LiveShotKind; start?: string | undefined; setup?: string | undefined;
  product?: boolean | { placement: LiveShotProductPlacement } | undefined }): boolean {
  return shot.kind === "talking" && (shot.start !== undefined || shot.setup !== undefined || liveShotProductPlacement(shot) !== undefined);
}
/** Ways an action brings the product into the hand (#1524), in each language a script may be written in: a verb and, a few words on, where the */
/** product comes from. Such a shot starts with empty hands, or the clip shows a second product. */
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
/** Whether an action's words take the product out of somewhere: a bag, a box, a shelf, its packaging. */
export function fetchesProduct(action: string): boolean {
  return Object.values(FETCH_PHRASES).some(phrases => phrases.some(pattern => pattern.test(action)));
}
type FetchShot = { kind: LiveShotKind; action?: string | undefined; shot?: unknown; product?: boolean | { placement: LiveShotProductPlacement } | undefined };
/** A shot whose product goes in the hand by its own free action: it starts with empty hands. A shot written beat by beat says its own start. */
export function liveShotFetchesProduct(shot: FetchShot): boolean {
  return shot.kind !== "talking" && shot.shot === undefined && liveShotProductPlacement(shot) === "hand" && fetchesProduct(shot.action ?? "");
}
/** One `warnings[]` line per such shot, as the quote and the run say it. */
export function fetchedProductWarnings(shots: readonly (FetchShot & { id: string })[]): string[] {
  return shots.filter(liveShotFetchesProduct)
    .map(shot => `shot "${shot.id}": starts with empty hands and the product beside them, because its action takes the product out`);
}
/** A run admitted from #1521 on stores this beside its input: its talking_action shots between the edges may be hands under the voice-over. */
export const TALKING_ACTION_VOICE_OVER = "voice_over" as const;
/** Whether a stored run's talking_action shots follow that rule; a run stored without the mark keeps the take it was admitted with. */
export function talkingActionVoiceOver(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" &&
    (storedInput as { talking_action_take?: unknown }).talking_action_take === TALKING_ACTION_VOICE_OVER;
}
/** Whether a stored run's edited first frames take the product from one product sheet (#1536 S2); a run stored without the mark keeps the photo. */
export function productSheetMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { product_sheet?: unknown }).product_sheet === true;
}
/** Whether a stored run's posed talking and talking_action takes lip-sync our audio from their first frame and follow its motion prompt */
/** (#1543); a run stored without the mark keeps the takes it was admitted with. */
export function lipsyncMotionMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { lipsync_motion?: unknown }).lipsync_motion === true;
}
/** The shots that mark asks for: a talking shot with a pose (#1536) or a talking_action shot. A plain talking shot stays the presenter. */
export function lipsyncMotionShot(shot: { kind: LiveShotKind; start?: string | undefined; setup?: string | undefined;
  product?: boolean | { placement: LiveShotProductPlacement } | undefined }): boolean {
  return shot.kind === "talking_action" || talkingPose(shot);
}
type InsertShot = AnchoredItem &{ kind: LiveShotKind; product?: boolean | { placement: LiveShotProductPlacement } | undefined;
  cast?: readonly unknown[] | undefined };
/** The talking_action shots drawn as a close-up of the hands with the product while their words play as voice-over (#1521): those between the */
/** script's first and last sentence that hold the product, with nobody beside the presenter. The others keep the presenter talking. */
export function handsInsertShots(script: string, shots: readonly InsertShot[]): Set<string> {
  const tokens = lexicalTokens(script), sentences = script.trim().split(/(?<=[.!?…])\s+/u);
  const first = lexicalTokens(sentences[0] ?? "").length, last = lexicalTokens(sentences.at(-1) ?? "").length;
  return new Set(shots.filter(shot => {
    if (shot.kind !== "talking_action" || shot.cast?.length || liveShotProductPlacement(shot) !== "hand") return false;
    const range = layerWordRange(tokens, shot);
    return typeof range !== "string" && range.startWord >= first && range.coverWord <= tokens.length - last;
  }).map(shot => shot.id));
}
/** The silent shots a run draws on Gemini Omni 1.2 (#1535): every action shot, and every talking_action hands insert. */
export function omniShotIds(script: string, shots: readonly (InsertShot & { id: string })[]): Set<string> {
  return new Set([...shots.filter(shot => shot.kind === "action").map(shot => shot.id), ...handsInsertShots(script, shots)]);
}
/** Whether a stored run draws those shots on Gemini Omni 1.2 (#1535); a run stored without the mark keeps the takes it was admitted with. */
export function omniShotsMarked(storedInput: unknown): boolean {
  return storedInput !== null && typeof storedInput === "object" && (storedInput as { omni_shots?: unknown }).omni_shots === true;
}
/** The silent shots a run draws on Seedance 2.5: those frozen as `seedance_shots` among the Omni shots of a marked run, priced at its */
/** second in the estimate; no other shot is drawn there. */
export function seedanceShotIds(input: { script?: string | undefined; shots?: readonly (InsertShot & { id: string })[] | undefined;
  omni_shots?: true | undefined; seedance_shots?: readonly string[] | undefined }): Set<string> {
  if (!input.seedance_shots?.length || !omniShotsMarked(input) || !input.script || !input.shots?.length) return new Set();
  const silent = omniShotIds(input.script, input.shots);
  return new Set(input.seedance_shots.filter(id => silent.has(id)));
}
/** A shot whose own words name the product's print or a packshot: its print must read, so it is drawn at 720p, never 480p (row 11c). */
const PRINT_WORDS = /\b(?:labels?|print(?:ed|ing)?|logos?|lettering|wordmark|brand name|pack ?shots?)\b/iu;
export const shotNamesPrint = (shot: { start?: string | undefined; action?: string | undefined }): boolean =>
  PRINT_WORDS.test(`${shot.start ?? ""} ${shot.action ?? ""}`);
/** Each Seedance shot's priced model: at a 720p video those frozen in `seedance_no_text_shots` are drawn at 480P and lifted to 720p, at their */
/** lower second; any other, and every one at 1080p or on a run stored without a resolution (rule 4: read as 1080p), at 720P. */
export function seedanceShotModels(input: Parameters<typeof seedanceShotIds>[0] & { seedance_no_text_shots?: readonly string[] | undefined;
  resolution?: string | undefined }): Map<string, "seedance" | "seedance_no_text"> {
  const low = new Set(input.resolution === "720p" ? input.seedance_no_text_shots ?? [] : []);
  return new Map([...seedanceShotIds(input)].map(id => [id, low.has(id) ? "seedance_no_text" : "seedance"]));
}
/** One `warnings[]` line per such shot, as the quote and the run say it. */
export function voiceOverShotWarnings(script: string, shots: readonly InsertShot[]): string[] {
  return [...handsInsertShots(script, shots)].map(id => `shot "${id}": shows the presenter's hands with the product up close while its words ` +
    "play as voice-over");
}
/** The most people a live shot's cast adds beside the actor (#1192). */
export const MAX_SHOT_CAST = 3;
export const CAST_INSERT_ID = "cast";
/** A cast picture's key in a run: one per picture. */
export function castSlotOf(assetId: string): string {
  return `c${BigInt(`0x${assetId.replace(/^ast_/, "")}`).toString(36)}`;
}
/** Who a shot's cast is, in order: shots of one setup share one first frame, so they name one cast. */
export function liveShotCastKey(shot: { cast?: readonly { asset_id: string; role: string }[] | undefined }): string {
  return JSON.stringify((shot.cast ?? []).map(person => [person.asset_id, person.role.trim().replace(/\s+/g, " ")]));
}
/** The place a shot is drawn in, one per distinct setup; shots without one share the actor's own photo setting (""). */
export function liveShotSetupKey(shot: { setup?: string | undefined }): string {
  return shot.setup?.trim().replace(/\s+/g, " ") ?? "";
}
