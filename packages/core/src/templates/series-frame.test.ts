import { afterEach, describe, expect, it } from "vitest";
import { dispositionWarnings } from "../contract-dispositions.js";
import { makeFacelessInput } from "../faceless-public.js";
import { lexicalTokens } from "../semantic-inserts.js";
import { makeUgcInput, mcpUgcTemplate } from "../skills.js";
import { offeredTemplateKinds, TEMPLATE_KINDS, templateDataText, templateMediaOf, templateMoments } from "./index.js";
import { SERIES_FRAME_DISABLED_MESSAGE, SERIES_ITEM_LOOKS, SERIES_LOOP_FRAMES, seriesFrame, seriesFrameMoments, seriesLeastFrames } from "./series-frame.js";

const clip = (digit: number) => ({ asset_id: `ast_${String(digit).repeat(32)}` });
const items = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Item ${index + 1}` }));
const script = "Five tools edit for you. Captions write themselves. The hook is found. Chat edits the cut. The phone shows it. The timeline renders.";
const series = (data: Record<string, unknown>) => ({ id: "list", kind: "series_frame", anchor: { quote: "Five tools" }, cover_words: 23,
  data: { title: "5 tools that edit", items: items(5), ...data } });
function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}
const switchOn = () => { process.env.CLIPWRIGHT_SERIES_FRAME = "1"; };
afterEach(() => { delete process.env.CLIPWRIGHT_SERIES_FRAME; });

describe("series frame contract (S3, #1425)", () => {
  it("takes its sample, every look, 3 to 17 items, items without a clip, and refuses an accent outside the title or a prompt off a chat", () => {
    expect(seriesFrame.data.safeParse(seriesFrame.sample).success).toBe(true);
    expect(SERIES_ITEM_LOOKS.map(look => seriesFrame.data.safeParse({ title: "t", items: items(3).map(entry => ({ ...entry, look, clip: clip(1) })) }).success))
      .toEqual(SERIES_ITEM_LOOKS.map(() => true));
    expect([2, 3, 17, 18].map(count => seriesFrame.data.safeParse({ title: "t", items: items(count) }).success)).toEqual([false, true, true, false]);
    const accent = seriesFrame.data.safeParse({ title: "4 mistakes", accent: "errors", items: items(4) });
    expect(accent.success ? [] : accent.error.issues.map(issue => issue.path.join("."))).toEqual(["accent"]);
    const prompt = seriesFrame.data.safeParse({ title: "4 mistakes", items: items(4).map((entry, index) => (index === 1 ? { ...entry, prompt: "hi" } : entry)) });
    expect(prompt.success ? [] : prompt.error.issues.map(issue => issue.path.join("."))).toEqual(["items.1.prompt"]);
  });

  /** Mutant: drop the switch, and the catalog, the MCP kind list and admission offer a kind the render side may not draw yet. */
  it("is offered only behind its switch: off, the catalog and the tool's kinds leave it out and a request is refused before any hold", () => {
    expect(offeredTemplateKinds().map(kind => kind.kind)).not.toContain("series_frame");
    expect(offeredTemplateKinds({ CLIPWRIGHT_SERIES_FRAME: "1" }).map(kind => kind.kind)).toContain("series_frame");
    expect(mcpUgcTemplate.shape.kind.options).not.toContain("series_frame");
    expect(TEMPLATE_KINDS.map(kind => kind.kind)).toContain("series_frame");
    expect(refusals({ templates: [series({})] })).toEqual([`templates.0.kind: ${SERIES_FRAME_DISABLED_MESSAGE}`]);
    switchOn();
    expect(refusals({ templates: [series({})] })).toEqual([]);
    expect(templateDataText(seriesFrame)).toContain("items 3–17 of {name ≤ 24, clip? {asset_id} video (cut to fill), look? card|orbit|ui|phone|editor");
  });

  /** Mutant: let a 1:1 request through, and the page drawn for 9:16 is squeezed or the format changed silently (rule 4). */
  it("is drawn in 9:16 only: another format, or an image with no format named, is refused before any hold", () => {
    switchOn();
    expect(refusals({ templates: [series({})], aspect_ratio: "9:16" })).toEqual([]);
    expect(refusals({ templates: [series({})], aspect_ratio: "1:1" }))
      .toEqual(["aspect_ratio: series_frame is drawn in 9:16 only: pass aspect_ratio 9:16, or use another template kind"]);
    expect(refusals({ templates: [series({})], image: "https://example.com/face.png" }))
      .toContain("templates.0.kind: series_frame is drawn in 9:16 only: pass aspect_ratio 9:16 with image, or use another template kind");
  });

  /** Mutant: keep refusing it on a faceless video, whose items show the pictures under their words (#1438). */
  it("draws on a faceless video too", () => {
    switchOn();
    const parsed = makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, templates: [series({})] });
    expect(parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`)).toEqual([]);
  });

  /** Mutant: read only top-level slots, and an item's clip is never pinned, so the item silently plays the presenter instead. */
  it("pins each item's clip under its own slot, and none for an item that plays the presenter's take", () => {
    const data = { title: "t", items: [{ name: "a" }, { name: "b", clip: clip(2) }, { name: "c" }, { name: "d", clip: clip(4) }] };
    expect(templateMediaOf([{ id: "tag", kind: "tag", data: { text: "x" } }, { id: "list", kind: "series_frame", data }])).toEqual([
      { index: 1, id: "list", slot: "items_1_clip", path: "items.1.clip", asset_id: clip(2).asset_id, media_type: "video", cover: 9 / 16 },
      { index: 1, id: "list", slot: "items_3_clip", path: "items.3.clip", asset_id: clip(4).asset_id, media_type: "video", cover: 9 / 16 }]);
  });
});

describe("series pace (S3, #1425)", () => {
  const value = (looks: (string | undefined)[], extra: Record<string, unknown> = {}) =>
    seriesFrame.data.parse({ title: "t", items: looks.map((look, index) => ({ name: `i${index}`, ...(look ? { look } : {}) })), ...extra });

  it("shares the time evenly, a chat item twice the share, and keeps the loop's tail", () => {
    expect(seriesFrameMoments(value([undefined, undefined, undefined, undefined]), [], 210, 25, "s"))
      .toEqual({ moments: [0, 50, 100, 150], warnings: [] });
    expect(seriesFrameMoments(value(["card", "ui", "card"]), [], 210, 25, "s")).toEqual({ moments: [0, 50, 150], warnings: [] });
    expect(seriesFrameMoments(value(["card", "card", "card"], { loop: false }), [], 150, 25, "s").moments).toEqual([0, 50, 100]);
  });

  it("starts a quoted item on its words, spreads the rest between, and moves a quote that leaves the item before it under its floor", () => {
    expect(seriesFrameMoments(value([undefined, undefined, undefined, undefined]), [undefined, undefined, 120, undefined], 210, 25, "s").moments)
      .toEqual([0, 60, 120, 160]);
    const crowded = seriesFrameMoments(value(["card", "ui", "card"]), [undefined, 40, 70], 210, 25, "s");
    expect(crowded.moments).toEqual([0, 40, 100]);
    expect(crowded.warnings).toEqual([expect.stringMatching(/^template "s" items\.2\.at .* the item starts 1\.2 s later$/)]);
  });

  /** Mutant: keep a word that comes too late for the items after it, and the last item starts past the loop and is never shown. */
  it("starts an item before its word when the items after it need their floors before the loop, and names the move", () => {
    const late = seriesFrameMoments(value(["card", "card", "card"]), [undefined, undefined, 190], 210, 25, "s");
    expect(late).toEqual({ moments: [0, 95, 170], warnings: [expect.stringMatching(/^template "s" items\.2\.at .* is spoken 0\.8 s after the item starts/)] });
  });

  /** Mutants: shrink a chat item with the others, and its prompt is cut mid-word; shrink below 0.8 s, and an item never rests on screen. */
  it("shrinks the items other than ui to 0.8 s when the floors do not fit, keeping a chat item's 2.4 s, and names it", () => {
    const short = seriesFrameMoments(value(["card", "card", "ui", "card"]), [], 140, 25, "s");
    expect(short.moments).toEqual([0, 22, 43, 108]);
    expect(short.warnings).toEqual([`template "s": its 4 items need 6.0 s at 1.2 s each (2.4 s for a ui item) and its words give 5.2 s, so items ` +
      "other than ui show for as little as 0.8 s"]);
    expect(seriesFrameMoments(value(["card", "card", "card"]), [], 100, 25, "s")).toEqual({ moments: [0, 30, 60], warnings: [] });
  });

  /** The showcase run of 2026-11-12 (#1425): its words put the items on frames 51, 72, 95, 117 and 145 of a 167-frame series. Mutant: keep
   *  the 1.2 s floor of the others, and the chat item's 2.4 s push the phone and the timeline out of the list (as before). */
  it("shows all five items of the showcase run: the chat item keeps 2.4 s, the others at least 0.8 s, and the moves are named", () => {
    const incident = seriesFrame.data.parse({ title: "5 tools", items: (["card", "orbit", "ui", "phone", "editor"] as const)
      .map((look, index) => ({ name: `i${index}`, look, at: ["captions", "orbit intros", "chat edits", "phone previews", "the timeline"][index] })) });
    const { moments, warnings, frames } = seriesFrameMoments(incident, [51, 72, 95, 117, 145], 167, 25, "series");
    // "phone previews" stays on its word; the chat needs 60 frames before it, the timeline 20 before the loop (frame 157).
    expect([moments, frames]).toEqual([[0, 37, 57, 117, 137], undefined]);
    expect(warnings).toEqual([
      "template \"series\": its 5 items need 7.2 s at 1.2 s each (2.4 s for a ui item) and its words give 6.3 s, so items other than ui show for as little as 0.8 s",
      "template \"series\" items.1.at \"orbit intros\" is spoken 1.4 s after the item starts: the items from it on need their time before the series ends",
      "template \"series\" items.2.at \"chat edits\" is spoken 1.5 s after the item starts: the items from it on need their time before the series ends",
      "template \"series\" items.4.at \"the timeline\" is spoken 0.3 s after the item starts: the items from it on need their time before the series ends"]);
  });

  /** Mutants: refuse instead of running on, and a list over a short sentence loses its items; run on past `most`, and the series covers the
   *  footage that follows it. */
  it("runs on past its words, up to the frames it may reach, so every item keeps its least time, and names by how much", () => {
    const tight = value(["card", "ui", "card", "ui", "card"]);
    expect(seriesFrameMoments(tight, [], 150, 25, "s", 300)).toEqual({ moments: [0, 20, 80, 100, 160], frames: 190, warnings: [
      "template \"s\": its 5 items need 8.4 s at 1.2 s each (2.4 s for a ui item) and its words give 5.6 s, so items other than ui show for as little as 0.8 s",
      "template \"s\" runs 1.6 s past its words so that more of its 5 items show (0.8 s each, 2.4 s for a ui item)"] });
    // Stopped at frame 170, it runs on 0.8 s and still leaves its last item out, as a video that ends there must.
    const stopped = seriesFrameMoments(tight, [], 150, 25, "s", 170);
    expect([stopped.moments, stopped.frames, stopped.warnings.at(-1)]).toEqual([[0, 20, 80, 100], 170, "template \"s\": the series has 6.4 s and its 5 items " +
      "need 7.2 s at the least (0.8 s each, 2.4 s for a ui item), and the video has no more room for it, so the last 1 item is not shown"]);
  });

  /** Mutant: freeze a series whose window shows fewer items than the page draws, and the render refuses it after the take is paid for. */
  it("refuses a window that shows fewer than three items where it may not run on, so the freeze drops it with its reason", () => {
    expect(() => seriesFrameMoments(value(["ui", "ui", "ui"]), [], 100, 25, "s"))
      .toThrow(/^its 3\.6 s show 2 of its 3 items, and a series shows at least 3$/);
    expect(seriesFrameMoments(value(["ui", "card", "card"]), [], 100, 25, "s").moments).toEqual([0, 60, 80]);
    expect(seriesFrameMoments(value(["ui", "ui", "ui"]), [], 100, 25, "s", 400)).toMatchObject({ moments: [0, 60, 120], frames: 190 });
  });

  /** Mutant: trust a kind's own timing, and a beat it places past its window reaches the composition, which refuses every template (#1425). */
  it("refuses any kind's beat outside the template's frames at the freeze", () => {
    const tokens = lexicalTokens(script), words = tokens.map((word, at) => ({ word, startSec: at * 0.4 }));
    const data = { title: "t", items: items(3) }, range = { startWord: 0, coverWord: tokens.length };
    for (const moments of [[0, 30, 250], [-1, 30, 60], [0, 30.5, 60]]) {
      const wrong = { ...seriesFrame, timing: () => ({ moments, warnings: [] }) };
      expect(() => templateMoments(wrong as never, data, tokens, range, words, 25, { startFrame: 0, endFrame: 250 }, "list"))
        .toThrow(/^a beat lies outside the template's frames$/);
    }
    // Codex r1: a kind that runs on stays at or under the frame the freeze lets it reach, and never shorter than its words.
    const runOn = (frames: number, moments = [0, 30, 60]) => () => templateMoments({ ...seriesFrame, timing: () => ({ moments, warnings: [], frames }) } as never,
      data, tokens, range, words, 25, { startFrame: 100, endFrame: 250 }, "list", 350);
    expect(runOn(250)().frames).toBe(250);
    for (const wrong of [runOn(300), runOn(251), runOn(140), runOn(250, [0, 30, 250])]) expect(wrong).toThrow(/^a beat lies outside the template's frames$/);
  });

  /** Mutants: drop the line from the quote and run, and the client's agent learns of the run-on only from the video; count a ui item at 0.8 s,
   *  and a list of chats is said to fit a sentence it outruns. */
  it("names, before payment, a list whose least time is longer than its sentence, and nothing for one that fits", () => {
    switchOn();
    const run = (anchor: Record<string, unknown>, looks: (string | undefined)[], extra: Record<string, unknown> = {}) =>
      dispositionWarnings(makeUgcInput.parse({ script, ...extra, templates: [{ id: "list", kind: "series_frame", anchor,
        data: { title: "5 tools", items: looks.map((look, index) => ({ name: `i${index}`, ...(look ? { look } : {}) })) } }] }))
        .filter(warning => warning.startsWith("template \"list\""));
    // "Five tools edit for you." is 5 words at 2.6 a second: 1.9 s, against 5 × 0.8 s and the loop's 0.4 s.
    expect(run({ quote: "Five tools edit for you." }, items(5).map(() => undefined))).toEqual(["template \"list\": the list of 5 items needs at least " +
      "4.4 s of speech; its sentence gives about 1.9 s; the list will run on past it and the next template starts later; lengthen the sentence to keep the list on it"]);
    // #1452, owner 12.11: a list that ends the script has the video run on past its last word, by 4.4 − 1.2 s, and hides no item.
    expect(run({ quote: "The timeline renders." }, ["ui", "card", "card"])).toEqual(["template \"list\": the list of 3 items needs at least 4.4 s " +
      "of speech; its sentence gives about 1.2 s; the video runs 3.2 s past its last word so all 3 items of template \"list\" show; lengthen the " +
      "sentence to keep the list on it"]);
    expect(run({ quote: "The timeline renders." }, ["ui", "card", "card"]).join(" ")).not.toMatch(/not shown/);
    // The whole script, 23 words (8.8 s), holds three chats (7.6 s); pause_trim reads 9% faster (8.1 s), still enough.
    expect(run({ quote: "Five tools" }, ["ui", "ui", "ui"], {}).length).toBe(1);
    expect([run({ startWord: 0, endWord: 23 }, ["ui", "ui", "ui"]), run({ startWord: 0, endWord: 23 }, ["ui", "ui", "ui"], { pause_trim: { sentence_end_s: 0.15, comma_s: 0.08 } })])
      .toEqual([[], []]);
    expect(run({ startWord: 0, endWord: 23 }, ["ui", "ui", "ui", "ui"])).toHaveLength(1);
    // Codex r1: 20 words hold three chats at the usual pace (7.7 s) but not trimmed (7.1 s), so the trim is named.
    const trim = { pause_trim: { sentence_end_s: 0.15, comma_s: 0.08 } };
    expect([run({ startWord: 0, endWord: 20 }, ["ui", "ui", "ui"]), run({ startWord: 0, endWord: 20 }, ["ui", "ui", "ui"], trim)[0]])
      .toEqual([[], expect.stringContaining("needs at least 7.6 s of speech; its sentence gives about 7.1 s")]);
    // #1453: a Russian script reads at its own pace, 2.3 words a second: its 19 words give 8.3 s, room for three chats; at 2.6, 7.3 s would not.
    const russian = "Мы покажем три приёма монтажа которые экономят время каждому автору коротких роликов и помогают удержать зрителя до самого конца";
    const chats = dispositionWarnings(makeUgcInput.parse({ script: russian, templates: [{ id: "list", kind: "series_frame", anchor: { startWord: 0, endWord: 19 },
      data: { title: "Три приёма", items: ["один", "два", "три"].map(name => ({ name, look: "ui" })) } }] }));
    expect([lexicalTokens(russian).length, chats.filter(warning => warning.startsWith("template \"list\""))]).toEqual([19, []]);
  });

  /** Codex r2 (#1452): the frames an end series asks drive a narrated run's end hold. Mutant: add the loop's 10 frames when loop is false,
   *  and the video holds 0.4 s longer than the list needs, billed as production. */
  it("asks for each item's least time and the loop only when the list loops", () => {
    const list = { title: "3 tools", items: [{ name: "a", look: "ui" }, { name: "b" }, { name: "c", look: "phone" }] };
    expect([seriesLeastFrames(list, 25), seriesLeastFrames({ ...list, loop: false }, 25), seriesLeastFrames({ title: "t" }, 25)])
      .toEqual([60 + 20 + 20 + SERIES_LOOP_FRAMES, 60 + 20 + 20, undefined]);
  });

  it("freezes its moments from the words through templateMoments, the first item on frame 0", () => {
    const tokens = lexicalTokens(script), words = tokens.map((word, at) => ({ word, startSec: at * 0.4 }));
    const data = { title: "t", items: [{ name: "a" }, { name: "b", at: "Captions" }, { name: "c" }, { name: "d", at: "phone" }] };
    const span = { startFrame: 0, endFrame: tokens.length * 10 + SERIES_LOOP_FRAMES };
    const { moments } = templateMoments(seriesFrame as never, data, tokens, { startWord: 0, coverWord: tokens.length }, words, 25, span, "list");
    // "Captions" is the sixth word (frame 50), "phone" the eighteenth (frame 170); the third item takes the middle between them.
    expect(moments).toEqual([0, 50, 110, 170]);
  });
});
