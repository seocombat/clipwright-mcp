import { describe, expect, it } from "vitest";
import { EXPLAINER_OWN_FIELDS, EXPLAINER_PRODUCT_PICTURES_REFUSAL, explainerFieldRefusals, FACELESS_EXPLAINER_BRIEF_REFUSAL, makeFacelessInput,
  offeredFacelessInput, quoteFacelessInput } from "./faceless-public.js";
import { EXPLAINER_BEAT_CREDITS, EXPLAINER_MAX_AUTHORED_BEATS, EXPLAINER_MAX_OBJECT_PICTURES, explainerBeatsEnabled, explainerObjectCeiling, FACELESS_IMAGE_CREDITS,
  FACELESS_OPENER_CREDITS, quoteFaceless } from "./faceless-price.js";
import { namedThings } from "./explainer-fit.js";

const LATTE_ART = ["Did you know that if you pour steamed milk into espresso and it blooms into a white circle, that's a monk's head?",
  "Pull a line through that circle, and it's a heart.", "Stack two or three little hearts, and it's a tulip.",
  "Wiggle the jug side to side as you pull back, and it's a rosetta.", "Fold the layers around a tulip from the side, and it's a wing tulip.",
  "A rosetta as the wing, plus a curved neck and a small head? That's a swan.", "Two rosettas side by side, joined at the top, make a double rosetta.",
  "A long slow rosetta with fine, tight lines is a slow rosetta.", "Draw in the foam with a thin pin, and it's etching.",
  "Dust cocoa through a cut-out, and it's a stencil.", "So that's every latte art pattern in one minute. How many can you pour, and which one's yours?"].join("\n");
const ESPRESSO = "Did you know that if you force hot water through finely ground coffee for about thirty seconds, that's an espresso? " +
  "Stop it early, with less water, and it's a ristretto. Let it run long, and it's a lungo. Two shots in one cup? That's a doppio. " +
  "Top a shot with hot water, and it's an americano. Water first, then the shot on top? That's a long black. Just a spoonful of milk foam, and it's a macchiato. " +
  "Equal parts espresso and warm milk is a cortado. A double shot with thin, velvety milk is a flat white. One shot, hot milk and a thick cap of foam is a cappuccino. " +
  "More milk, less foam, and it's a latte. Add chocolate to that latte, and it's a mocha. And a shot poured over vanilla ice cream? That's an affogato. " +
  "So that's every espresso drink in one minute. How many did you know, and which one's yours?";
const STEPS = "Everyone says AI can write your summaries, but nobody shows you how. Here are three steps. First: open the chat and paste your call notes. " +
  "Second: type one line: summarize this in five bullets. Third: it reads, sorts, and checks every point. That's it. Try it on your next meeting. " +
  "Open it, paste, type, and press enter. Then share the summary in your team channel, so everyone reads the same five points before the next call starts.";

const script = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
const base = { input_mode: "script" as const, script, duration_seconds: 30, format: "explainer" as const };

describe("make_faceless format explainer (#1216)", () => {
  /** Mutant: accept a field that places pictures, clips or graphics, and the run takes a request it cannot draw. */
  it("refuses the fields an explainer draws itself, and a brief", () => {
    const anchor = { startWord: 2, endWord: 4 };
    // Every field by the rule itself, then three of them through the parse, which runs it.
    for (const field of EXPLAINER_OWN_FIELDS) {
      expect(explainerFieldRefusals({ ...base, [field]: {} })).toEqual([{ path: [field], message: `format explainer draws its own scenes; omit ${field}` }]);
      expect(explainerFieldRefusals({ ...base, format: "standard", [field]: {} })).toEqual([]);
    }
    expect(EXPLAINER_OWN_FIELDS).toEqual(["style_reference", "transitions", "templates", "shots", "scenes", "moves", "motion_style", "music"]);
    for (const [field, value] of [
      ["style_reference", "https://x.example/a.png"], ["transitions", false], ["shots", [{ id: "s1", anchor, action: "The figure waves" }]],
      ["music", "auto"]] as const) {
      const parsed = makeFacelessInput.safeParse({ ...base, [field]: value });
      expect({ field, ok: parsed.success, message: parsed.error?.issues.find(i => i.path[0] === field)?.message }).toEqual({ field, ok: false,
        message: `format explainer draws its own scenes; omit ${field}` });
    }
    const brief = makeFacelessInput.safeParse({ input_mode: "brief", brief: "How to share a sheet", duration_seconds: 30, format: "explainer" });
    expect(brief.error?.issues.map(i => i.message)).toContain(FACELESS_EXPLAINER_BRIEF_REFUSAL);
    expect(makeFacelessInput.safeParse({ ...base, character_details: "A round mint cactus" }).success).toBe(true);
    expect(offeredFacelessInput.safeParse({ ...base }).success).toBe(true);
  });

  /** #1322. Mutants: keep scene_images among the explainer's own fields; take a fourth picture, an anchor naming no words or one said twice;
   *  price the customer's pictures. */
  it("takes up to three product pictures on words of the script, priced as without them", () => {
    const image = (anchor: object) => ({ image_url: "https://x.example/jar.png", anchor });
    const ok = makeFacelessInput.safeParse({ ...base, scene_images: [image({ quote: "word12 word13" }), image({ startWord: 40, endWord: 42 })] });
    expect(ok.success).toBe(true);
    expect(quoteFacelessInput(ok.data!, { explainerFilm: "skill-agent-opus-v1" }))
      .toEqual(quoteFacelessInput(makeFacelessInput.parse(base), { explainerFilm: "skill-agent-opus-v1" }));
    const refused = (images: object[], extra: object = {}) =>
      makeFacelessInput.safeParse({ ...base, ...extra, scene_images: images }).error?.issues.filter(i => i.path[0] === "scene_images").map(i => i.message);
    expect(refused([1, 2, 3, 4].map(n => image({ startWord: n * 5, endWord: n * 5 + 1 })))).toEqual([EXPLAINER_PRODUCT_PICTURES_REFUSAL]);
    expect(refused([1, 2, 3].map(n => image({ startWord: n * 5, endWord: n * 5 + 1 })))).toBeUndefined();
    expect(refused([image({ quote: "not in the script" })])).toEqual(["the anchor names no words of the script"]);
    expect(refused([image({ quote: "twice" })], { script: `${script} twice and twice` }))
      .toEqual(["the quote is said more than once in the script; add occurrence (0 is the first)"]);
    expect(refused([image({ startWord: 2, endWord: 6 }), image({ startWord: 4, endWord: 8 })])).toEqual(["two of your pictures name the same words; give each its own"]);
    // A picture video keeps its own rules: sixty pictures and no anchor check here.
    expect(refused([1, 2, 3, 4].map(n => image({ startWord: n * 5, endWord: n * 5 + 1 })), { format: "standard" })).toBeUndefined();
  });

  /** Mutant: keep the opening clip, or price the hero's pictures without a character, and the quote misstates the run. */
  it("quotes no opening clip, and nine pose pictures only when a character is named", () => {
    const standard = quoteFaceless({ outputFrames: 750, captions: true });
    const withHero = quoteFaceless({ outputFrames: 750, captions: true, explainer: { character: true } });
    const ourHero = quoteFaceless({ outputFrames: 750, captions: true, explainer: { character: false } });
    expect([standard.openerCredits, standard.posePictures]).toEqual([FACELESS_OPENER_CREDITS, undefined]);
    expect([withHero.openerCredits, withHero.posePictures]).toEqual([0, 9]);
    expect([ourHero.openerCredits, ourHero.posePictures]).toEqual([0, 0]);
  });

  /** Live 2026-11-08 (journey test): a 40 s explainer with a character quoted 728, holding a picture video's 24 pictures and showing an opening
   * clip but not its scenes. Mutants: hold the picture video's ceiling on an explainer, or price our drawn hero's poses. */
  it("holds only the hero's poses as an explainer's pictures: 623 with a character, 570 with our hero, at 40 s with scenes on", () => {
    const at40 = (character: boolean) => quoteFaceless({ outputFrames: 1000, captions: true, explainer: { character, beats: true } });
    expect([at40(true).images, at40(true).baseCredits, at40(true).totalCredits]).toEqual([9, 40 + 9 * 7, 40 + 9 * 7 + 8 * 65]);
    expect(at40(true).totalCredits).toBe(623);
    // Our hero: the 40 seconds fall under the delivered minimum of 50, which settlement charges, so the most is 50 + 520.
    expect([at40(false).images, at40(false).baseCredits, at40(false).totalCredits]).toEqual([0, 40, 570]);
    expect(quoteFaceless({ outputFrames: 1500, captions: true, explainer: { character: false } }).totalCredits).toBe(60);
    // A picture video keeps its ceiling: one picture per two seconds plus four, the opening clip.
    expect(quoteFaceless({ outputFrames: 1000, captions: true })).toMatchObject({ images: 24, baseCredits: 24 * 7 + 40, totalCredits: 24 * 7 + 40 + 49 });
  });

  /** Mutant: let the quote and admission read different fields, and the reserve differs from the quoted total. */
  it("quotes a request from its own fields, the explainer and its character included", () => {
    const input = makeFacelessInput.parse({ ...base, character_reference: "https://x.example/hero.png" });
    expect(quoteFacelessInput(input)).toEqual(quoteFaceless({ outputFrames: 750, captions: true,
      explainer: { character: true, objects: explainerObjectCeiling(input.input_mode === "script" ? input.script : "") } }));
    expect(quoteFacelessInput({ ...input, format: undefined })).toEqual(quoteFaceless({ outputFrames: 750, captions: true }));
  });

  /** Mutants: the authored scenes quoted with their switch off, on a run that is not an explainer, or left out of the total. */
  it("quotes the most authored scenes inside the total only on an explainer with their switch on", () => {
    const input = makeFacelessInput.parse(base), off = quoteFacelessInput(input), on = quoteFacelessInput(input, { explainerBeats: true });
    expect(off).not.toHaveProperty("authoredScenes");
    expect(on).toMatchObject({ authoredScenes: EXPLAINER_MAX_AUTHORED_BEATS, authoredSceneCredits: EXPLAINER_MAX_AUTHORED_BEATS * EXPLAINER_BEAT_CREDITS,
      totalCredits: off.totalCredits + EXPLAINER_MAX_AUTHORED_BEATS * EXPLAINER_BEAT_CREDITS });
    expect(quoteFacelessInput({ ...input, format: undefined }, { explainerBeats: true })).not.toHaveProperty("authoredScenes");
    expect([explainerBeatsEnabled({ CLIPWRIGHT_EXPLAINER_BEATS: "1" }), explainerBeatsEnabled({ CLIPWRIGHT_EXPLAINER_BEATS: "true" })]).toEqual([true, false]);
  });

  /** #1277 (owner 2026-11-08). Mutants: quote pictures for steps through software (the journey's inflated quote), count sentences instead of
   * named things, pass the 12 cap, drop the line from the total, or quote pictures on a picture video. */
  it("quotes one object picture for each thing a list script names, at most 12, and none for steps", () => {
    const quoted = (text: string) => quoteFacelessInput(makeFacelessInput.parse({ ...base, script: text, duration_seconds: 60 }));
    const off = quoteFaceless({ outputFrames: 1500, captions: true, explainer: { character: false } });
    // The latte-art list (#1276) names ten patterns, "it's etching" without an article among them (#1284).
    expect([namedThings(LATTE_ART), quoted(LATTE_ART)]).toMatchObject([10, { objectPictures: 10, objectPictureCredits: 10 * FACELESS_IMAGE_CREDITS, images: 0,
      posePictures: 0, totalCredits: off.totalCredits + 10 * FACELESS_IMAGE_CREDITS }]);
    // The espresso hit (live run_cd7d515f) names thirteen drinks: the quote stops at twelve.
    expect([namedThings(ESPRESSO), quoted(ESPRESSO).objectPictures]).toEqual([13, EXPLAINER_MAX_OBJECT_PICTURES]);
    // Steps through software name no thing: no line, the quote as before.
    expect([namedThings(STEPS), quoted(STEPS)]).toMatchObject([0, { totalCredits: off.totalCredits }]);
    expect(quoted(STEPS)).not.toHaveProperty("objectPictures");
    expect(quoteFacelessInput(makeFacelessInput.parse({ ...base, script: LATTE_ART, duration_seconds: 60, format: undefined }))).not.toHaveProperty("objectPictures");
    // Codex r1: the share of naming sentences counts too, not only their number: four in ten is a list, four in eleven is not.
    const naming = Array.from({ length: 4 }, (_, i) => `Add foam to cup ${i}, and it's a latte.`), plain = (n: number) => Array.from({ length: n }, (_, i) => `Wait for step ${i}.`);
    expect([namedThings([...naming, ...plain(6)].join(" ")), namedThings([...naming, ...plain(7)].join(" "))]).toEqual([4, 0]);
  });
});
