import { describe, expect, it } from "vitest";
import { fetchedProductWarnings, fetchesProduct, handsInsertShots, liveShotFetchesProduct, seedanceShotModels, shotNamesPrint, TALKING_ACTION_VOICE_OVER,
  talkingActionVoiceOver, voiceOverShotWarnings } from "./live-shot-kinds.js";

// Row 11c: a Seedance shot draws at 480P only when its words name no print, at a 720p video. Mutants: a print word or packshot dropped, a
// word matched inside another, the no-text mark read at 1080p or on a run stored without a resolution, a mark outside the Seedance shots kept.
describe("a Seedance shot's frame", () => {
  it("draws a shot at 720P when its words name the print, at 480P otherwise", () => {
    for (const words of ["the label to the camera", "her labels", "the printed name", "the print", "the printing", "the logo", "two logos",
      "the lettering", "the wordmark", "the brand name", "a packshot", "pack shot on the table", "Packshots"]) {
      expect(shotNamesPrint({ action: `She holds the jar, ${words}.` }), words).toBe(true);
      expect(shotNamesPrint({ start: `${words}.` }), words).toBe(true);
    }
    for (const words of ["She pours coffee.", "a blueprint on the desk", "she relabels nothing", "sprinting to the door"]) {
      expect(shotNamesPrint({ action: words }), words).toBe(false);
    }
    const run = { script: "One two three. Four five six. Seven eight nine.", omni_shots: true as const, seedance_shots: ["a", "b"],
      seedance_no_text_shots: ["a", "c"], shots: [{ id: "a", kind: "action" as const, anchor: { quote: "Four" } },
        { id: "b", kind: "action" as const, anchor: { quote: "Seven" } }] };
    expect(seedanceShotModels({ ...run, resolution: "720p" })).toEqual(new Map([["a", "seedance_no_text"], ["b", "seedance"]]));
    expect(seedanceShotModels({ ...run, resolution: "1080p" })).toEqual(new Map([["a", "seedance"], ["b", "seedance"]]));
    expect(seedanceShotModels(run)).toEqual(new Map([["a", "seedance"], ["b", "seedance"]]));
    expect(seedanceShotModels({ ...run, resolution: "720p", omni_shots: undefined })).toEqual(new Map());
  });
});
import { storedUgcInput } from "./skills.js";

/** #1524: an action that brings the product into the hand starts from empty hands, or the clip shows a second product. */
describe("an action that fetches the product", () => {
  // Mutants: a phrasing of any language dropped from the table, or a phrasing that only handles the held product read as a fetch.
  it.each([
    ["en", "0-1 s: her right hand reaches into the open laptop bag on the passenger seat and grips the mug around the cream band, lifting it out upright"],
    ["en", "She takes the bottle out of her tote and smiles"],
    ["en", "pulls the jar out of the drawer"],
    ["en", "lifts the mug from the shelf"],
    ["en", "grabs it from the counter"],
    ["en", "unboxes the headphones"],
    ["en", "unwraps the soap bar"],
    ["en", "picks the bottle up and shows it"],
    ["en", "reaches inside the box"],
    ["es", "saca la taza de la bolsa"],
    ["es", "desempaqueta los auriculares"],
    ["es", "mete la mano en la mochila"],
    ["fr", "elle sort la tasse du sac"],
    ["fr", "déballe le casque"],
    ["it", "tira fuori la tazza dalla borsa"],
    ["it", "prende la bottiglia dalla borsa"],
    ["pt", "tira a garrafa da mochila"],
    ["pt", "desembrulha o sabonete"],
    ["ru", "достаёт кружку из сумки"],
    ["ru", "вынимает банку из ящика"],
    ["ru", "распаковывает наушники"],
    ["tr", "kupayı çantadan çıkarır"],
    ["tr", "şişeyi masadan alır"],
  ])("%s: %s", (_language, action) => {
    expect(fetchesProduct(action)).toBe(true);
  });

  it.each([
    ["en", "She turns the mug upright, slides the lock on the cream flip lid and flips it open with one thumb, then snaps it shut."],
    ["en", "0-1 s: her right hand grips the mug body around the cream band, holding it upright just above the open laptop bag on the passenger seat; " +
      "3-4 s: she turns it upright again, still gripped in her right hand, and lifts it beside her face. The mug never leaves her right hand."],
    ["en", "She lifts the bottle."],
    ["en", "takes a sip from the mug"],
    ["en", "takes the cap off the bottle"],
    ["en", "pulls the lid open"],
    ["en", "raises the mug and smiles"],
    ["es", "levanta la taza y sonríe"],
    ["fr", "il sort du café en souriant"],
    ["ru", "достаточно одного глотка"],
    ["ru", "поднимает кружку"],
    ["tr", "kapağı açar"],
    ["en", ""],
  ])("%s, not a fetch: %s", (_language, action) => {
    expect(fetchesProduct(action)).toBe(false);
  });

  // Mutants: a beside or product-less shot, or a talking shot, counted as a fetch; a warning that names no shot or a vendor.
  it("fetches only a hand-placed acting shot, and names each such shot in warnings[] in customer words", () => {
    const action = "reaches into the bag and lifts the mug out";
    expect(liveShotFetchesProduct({ kind: "action", action, product: true })).toBe(true);
    expect(liveShotFetchesProduct({ kind: "talking_action", action, product: { placement: "hand" } })).toBe(true);
    expect(liveShotFetchesProduct({ kind: "action", action, product: { placement: "beside" } })).toBe(false);
    expect(liveShotFetchesProduct({ kind: "action", action })).toBe(false);
    expect(liveShotFetchesProduct({ kind: "talking", action, product: true })).toBe(false);
    expect(fetchedProductWarnings([
      { id: "hook", kind: "talking_action", action: "turns the mug upright", product: true },
      { id: "fetch", kind: "action", action, product: { placement: "hand" } },
      { id: "side", kind: "action", action, product: { placement: "beside" } },
    ])).toEqual(["shot \"fetch\": starts with empty hands and the product beside them, because its action takes the product out"]);
  });
});

/** #1521: the run's mark says its talking_action shots act under the voice-over; warnings[] says so per shot, in the customer's words. */
describe("a talking_action shot under the voice-over", () => {
  // Mutants: the mark read from any truthy value, or lost when the worker reads the stored input back.
  it("reads the mark only as admission writes it, and the stored input keeps it", () => {
    expect([talkingActionVoiceOver({ talking_action_take: "voice_over" }), talkingActionVoiceOver({ talking_action_take: "speaks" }),
      talkingActionVoiceOver({}), talkingActionVoiceOver(null), talkingActionVoiceOver("voice_over")]).toEqual([true, false, false, false, false]);
    const stored = storedUgcInput.parse({ script: "Hello there.", talking_action_take: TALKING_ACTION_VOICE_OVER });
    expect(talkingActionVoiceOver(stored)).toBe(true);
    expect(storedUgcInput.safeParse({ script: "Hello there.", talking_action_take: "speaks" }).success).toBe(false);
  });

  const S3 = "One two three. Four five six. Seven eight nine.";
  const held = { placement: "hand" as const };
  const act = (id: string, quote: string, extra: Record<string, unknown> = {}) => ({ id, kind: "talking_action" as const, anchor: { quote },
    product: held, ...extra });

  /** Owner 14.11 (pilots 3, 4): a silent face reads worse than a talking head, so only the hands become an insert. Mutants: an edge read from */
  /** the shot's first word only, the last sentence missed, a close-up of empty hands or of a cast, an action or talking shot taken for one. */
  it("makes only a held-product talking_action shot between the first and last sentence a hands insert", () => {
    expect([...handsInsertShots(S3, [act("into_last", "six seven"), act("out_of_first", "three four")])]).toEqual([]);
    expect([...handsInsertShots(S3, [act("hook", "two three"), act("close", "nine")])]).toEqual([]);
    expect([...handsInsertShots(S3, [act("middle", "four five six")])]).toEqual(["middle"]);
    // S1c Codex r1: the range is the anchor with its cover_words, as the worker cuts the take; "six" covering two words reaches "seven".
    expect([...handsInsertShots(S3, [act("covers", "six", { cover_words: 2 })])]).toEqual([]);
    expect([...handsInsertShots(S3, [act("covers", "four", { cover_words: 3 })])]).toEqual(["covers"]);
    // S1c Codex r2: a question, an exclamation or an ellipsis ends a sentence as a full stop does.
    for (const script of ["One two three? Four five six! Seven eight nine.", "One two three… Four five six? Seven eight nine!"]) {
      expect([...handsInsertShots(script, [act("middle", "four five six")])]).toEqual(["middle"]);
    }
    expect([...handsInsertShots(S3, [act("beside", "four", { product: { placement: "beside" } }), act("none", "five", { product: undefined }),
      act("cast", "six", { cast: [{ asset_id: "ast_x", role: "the friend" }] })])]).toEqual([]);
    expect([...handsInsertShots(S3, [{ id: "a", kind: "action", anchor: { quote: "five" }, product: held },
      { id: "t", kind: "talking", anchor: { quote: "six" } }])]).toEqual([]);
    // One sentence, or none closed by punctuation: every word is the hook's.
    expect([...handsInsertShots("one two three four five", [act("only", "three")])]).toEqual([]);
  });

  // Mutants: the line said for a talking face, or a hands shot left unsaid (rule 3).
  it("says one line per hands insert and none for the others, with no vendor in it", () => {
    const lines = voiceOverShotWarnings(S3, [act("hook", "two three"), act("middle", "five"), { id: "a", kind: "action", anchor: { quote: "six" } }]);
    expect(lines).toEqual(["shot \"middle\": shows the presenter's hands with the product up close while its words play as voice-over"]);
    expect(lines.join(" ")).not.toMatch(/wan|heygen|alibaba|kie|fal\b/i);
  });
});
