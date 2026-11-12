import { afterEach, describe, expect, it } from "vitest";
import { makeFacelessInput } from "../faceless-public.js";
import { lexicalTokens } from "../semantic-inserts.js";
import { makeUgcInput, mcpUgcTemplate } from "../skills.js";
import { offeredTemplateKinds, TEMPLATE_KINDS, templateDataText, templateMediaOf, templateMoments } from "./index.js";
import { SERIES_FRAME_DISABLED_MESSAGE, SERIES_ITEM_LOOKS, SERIES_LOOP_FRAMES, seriesFrame, seriesFrameMoments } from "./series-frame.js";

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

  it("is a make_ugc template: a faceless video, which has no presenter, refuses it", () => {
    switchOn();
    const parsed = makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, templates: [series({})] });
    expect(parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`))
      .toEqual(["templates.0.kind: series_frame is a make_ugc template; use another kind here"]);
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

  /** Mutant: squeeze the items to fit a short voice, and a chat item's prompt is cut mid-word, or every item flashes by. */
  it("keeps the floors when the voice is too short, and names what is cut", () => {
    const short = seriesFrameMoments(value(["card", "card", "ui", "card"]), [], 100, 25, "s");
    expect(short.moments).toEqual([0, 30, 60, 120]);
    expect(short.warnings).toEqual([`template "s": the series has 3.6 s and its 4 items need 6.0 s at the least (1.2 s each, 2.4 s for a ui item): ` +
      "each item keeps that time, so the last 1 item is not shown"]);
  });

  /** Mutant (Codex r2): warn only when an item is not shown at all, and a last item shown under its floor goes unnamed. */
  it("names a last item cut short of its floor, and says nothing when every item keeps its floor", () => {
    expect(seriesFrameMoments(value(["card", "card", "card"]), [], 90, 25, "s")).toEqual({ moments: [0, 30, 60], warnings: [
      `template "s": the series has 3.2 s and its 3 items need 3.6 s at the least (1.2 s each, 2.4 s for a ui item): each item keeps that time, ` +
      "so the last item is cut short"] });
    expect(seriesFrameMoments(value(["card", "card", "card"]), [], 100, 25, "s")).toEqual({ moments: [0, 30, 60], warnings: [] });
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
