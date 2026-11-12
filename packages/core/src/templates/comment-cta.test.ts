import { afterEach, describe, expect, it } from "vitest";
import { makeFacelessInput } from "../faceless-public.js";
import { lexicalTokens } from "../semantic-inserts.js";
import { makeUgcInput, mcpUgcTemplate } from "../skills.js";
import { offeredTemplateKinds, TEMPLATE_KINDS, templateCatalogText, templateDataText, templateMediaOf, templateMoments } from "./index.js";
import { COMMENT_CTA_DISABLED_MESSAGE, commentCta, commentCtaActLines, commentCtaMoments, commentCtaSchedule, CTA_FUNNEL, CTA_LOOP_FRAMES } from "./comment-cta.js";

const script = "Want the full list? Comment list below and I will send the full list straight to your messages. Don't forget to follow for more.";
const lines = [{ text: "Comment \"LIST\"", accent: "LIST", at: "Comment" }, { text: "and I'll send", at: "send" },
  { text: "the full list", accent: "list", act: "dm" as const }, { text: "Don't forget to follow", accent: "follow", act: "follow" as const, at: "follow" }];
const base = { title: "17 effects you can make", accent: "effects", list_title: "17 effects", items: ["Orbit", "Couch wall", "UI world"], code: "LIST",
  handle: "studio.daily", dm: "sent you the full list", lines };
const cta = (data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id: "cta", kind: "comment_cta", anchor: { quote: "Comment list" },
  cover_words: 20, data: { ...base, ...data }, ...extra });
/** The lines without their quotes, for a template that ends before "follow" is spoken. */
const unquoted = lines.map(({ at: _at, ...rest }) => rest);
function refusals(body: Record<string, unknown>, words = script): string[] {
  const parsed = makeUgcInput.safeParse({ script: words, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}
const switchOn = () => { process.env.CLIPWRIGHT_COMMENT_CTA = "1"; };
afterEach(() => { delete process.env.CLIPWRIGHT_COMMENT_CTA; });

describe("comment call to action contract", () => {
  it("takes its sample and any code word, and refuses an accent outside its text, two lines on one act, or the follow before the message", () => {
    expect(commentCta.data.safeParse(commentCta.sample).success).toBe(true);
    expect(commentCta.data.safeParse({ ...base, code: "ГАЙД", handle: "мастерская", dm: "отправил вам гайд" }).success).toBe(true);
    const paths = (data: Record<string, unknown>) => { const parsed = commentCta.data.safeParse({ ...base, ...data });
      return parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join(".")); };
    expect(paths({ accent: "tools" })).toEqual(["accent"]);
    expect(paths({ lines: [{ text: "Comment", accent: "LIST" }, { text: "now" }] })).toEqual(["lines.0.accent"]);
    expect(paths({ lines: [{ text: "a", act: "dm" }, { text: "b", act: "dm" }] })).toEqual(["lines.1.act"]);
    expect(paths({ lines: [{ text: "a", act: "follow" }, { text: "b", act: "dm" }] })).toEqual(["lines.0.act"]);
    expect([1, 2, 6, 7].map(count => paths({ lines: Array.from({ length: count }, (_, at) => ({ text: `line ${at}` })) }).length)).toEqual([1, 0, 0, 1]);
  });

  /** Mutant: drop the switch, and the catalog, the MCP kind list and admission offer a kind the render side may not draw yet. */
  it("is offered only behind its switch: off, the catalog and the tool's kinds leave it out and a request is refused before any hold", () => {
    expect(offeredTemplateKinds().map(kind => kind.kind)).not.toContain("comment_cta");
    expect(offeredTemplateKinds({ CLIPWRIGHT_COMMENT_CTA: "1" }).map(kind => kind.kind)).toContain("comment_cta");
    expect(templateCatalogText()).not.toContain("comment_cta");
    expect(mcpUgcTemplate.shape.kind.options).not.toContain("comment_cta");
    expect(TEMPLATE_KINDS.map(kind => kind.kind)).toContain("comment_cta");
    expect(refusals({ templates: [cta()] })).toEqual([`templates.0.kind: ${COMMENT_CTA_DISABLED_MESSAGE}`]);
    switchOn();
    expect(refusals({ templates: [cta()] })).toEqual([]);
    expect(templateDataText(commentCta)).toContain("lines 2–6 of {text ≤ 32, accent? ≤ 24, act? dm|follow, at? inner quote}");
  });

  it("is drawn in 9:16 only, and a faceless video refuses it", () => {
    switchOn();
    expect(refusals({ templates: [cta()], aspect_ratio: "16:9" }))
      .toEqual(["aspect_ratio: comment_cta is drawn in 9:16 only: pass aspect_ratio 9:16, or use another template kind"]);
    const parsed = makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, templates: [cta()] });
    expect(parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`))
      .toEqual(["templates.0.kind: comment_cta is a make_ugc template; use another kind here"]);
  });

  /** Mutant: drop the label check, and a Russian video's comment field and follow button read English. */
  it("needs labels for a script not in Latin letters, and takes English ones in a Latin script", () => {
    switchOn();
    const ru = "Напишите гайд в комментариях, и я пришлю вам полный список. Не забудьте подписаться.";
    const ruLines = [{ text: "Напишите «ГАЙД»", at: "Напишите" }, { text: "и я пришлю список", act: "dm" }, { text: "Подпишитесь", act: "follow" }];
    const ruCta = (labels?: Record<string, string>) => cta({ code: "ГАЙД", handle: "мастерская", dm: "прислал вам гайд", lines: ruLines,
      ...(labels ? { labels } : {}) }, { anchor: { quote: "Напишите гайд" }, cover_words: 13 });
    expect(refusals({ templates: [ruCta()] }, ru)).toEqual(["templates.0.data.labels: comment_cta labels comment, follow, following are needed in " +
      "the script's language: the comment field and the follow button would read English otherwise"]);
    expect(refusals({ templates: [ruCta({ comment: "Комментарий…", follow: "Подписаться", following: "Вы подписаны" })] }, ru)).toEqual([]);
    // Codex r1: one label given still leaves the other two to read English, so each missing one is named.
    expect(refusals({ templates: [ruCta({ comment: "Комментарий…" })] }, ru)).toEqual(["templates.0.data.labels: comment_cta labels follow, following " +
      "are needed in the script's language: the comment field and the follow button would read English otherwise"]);
    expect(refusals({ templates: [ruCta({ comment: "Комментарий…", follow: "Подписаться" })] }, ru)[0]).toMatch(/labels following are needed/);
    expect(refusals({ templates: [cta({ labels: { follow: "Seguir" } })] })).toEqual([]);
  });

  /** Mutant: let loop through on a template that ends mid-script, and the video jumps to its first frame and then plays on. */
  it("loops only when it covers the script's last words", () => {
    switchOn();
    expect(refusals({ templates: [cta({ loop: true })] })).toEqual([]);
    expect(refusals({ templates: [cta({ loop: true, lines: unquoted }, { cover_words: 12 })] })).toEqual(["templates.0.data.loop: comment_cta loop " +
      "ends the video on its first frame: the template must cover the script's last words, or drop loop"]);
    expect(refusals({ templates: [cta({ lines: unquoted }, { cover_words: 12 })] })).toEqual([]);
  });

  it("pins its avatar as an image slot", () => {
    expect(templateMediaOf([{ id: "cta", kind: "comment_cta", data: { ...base, avatar: { asset_id: `ast_${"7".repeat(32)}` } } }]))
      .toEqual([{ index: 0, id: "cta", slot: "avatar", asset_id: `ast_${"7".repeat(32)}`, media_type: "image", cover: 1 }]);
  });
});

describe("comment call to action pace", () => {
  const value = (extra: Record<string, unknown> = {}) => commentCta.data.parse({ ...base, ...extra });

  it("puts the message on the line naming it, else the middle line, and the follow on its line, else the last", () => {
    expect(commentCtaActLines(lines)).toEqual({ dm: 2, follow: 3 });
    expect(commentCtaActLines([{}, {}, {}, {}, {}, {}])).toEqual({ dm: 3, follow: 5 });
    expect(commentCtaActLines([{}, {}])).toEqual({ dm: 1, follow: 1 });
    expect(commentCtaActLines([{ act: "follow" }, {}, {}])).toEqual({ dm: 0, follow: 0 });
  });

  /** Mutants: the send before the last letter is typed, or the follow on the message's frame, and the steps play on top of each other. */
  it("types the code a letter at a time, sends it, then the message and the follow arrive in turn", () => {
    expect(commentCtaSchedule([0, 40, 80, 120], "LIST", { dm: 2, follow: 3 })).toEqual({ type: 6, typed: 18, sent: 24, dm: 80, follow: 120, tap: 138 });
    expect(commentCtaSchedule([0, 12, 20, 24], "ГАЙД!", { dm: 1, follow: 1 })).toEqual({ type: 6, typed: 21, sent: 27, dm: 35, follow: 43, tap: 61 });
  });

  it("spreads unquoted lines before the follow's tap, starts a quoted line on its words, and keeps the loop's tail", () => {
    const plain = value({ lines: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] });
    expect(commentCtaMoments(plain, [], 150, 25, "c")).toEqual({ moments: [0, 30, 60, 90], warnings: [] });
    expect(commentCtaMoments(value({ ...plain, loop: true }), [], 160, 25, "c")).toEqual({ moments: [0, 30, 60, 90], warnings: [] });
    expect(commentCtaMoments(plain, [undefined, undefined, 100, undefined], 160, 25, "c").moments).toEqual([0, 50, 100, 115]);
  });

  /** Mutant: drop the gap, and a line spoken right after another replaces it before its words have built. */
  it("moves a quoted line spoken too close after the one before, and names it", () => {
    const crowded = commentCtaMoments(value(), [undefined, 4, undefined, 30], 200, 25, "c");
    expect(crowded.moments).toEqual([0, 10, 20, 30]);
    expect(crowded.warnings).toEqual(["template \"c\" lines.1.at \"send\" is spoken too close after the line before it: the line starts 0.2 s later"]);
  });

  /** Mutant: drop the warning, and a voice too short for the funnel silently loses the tap on the follow button. */
  it("names a follow tap the template's time does not reach", () => {
    const two = value({ lines: [{ text: "a" }, { text: "b" }] });
    expect(commentCtaMoments(two, [], 64, 25, "c")).toEqual({ moments: [0, 17], warnings: ["template \"c\": the call to action has 2.6 s and its " +
      "comment, message and follow need 2.8 s, so the tap on the follow button is cut short"] });
    expect(commentCtaMoments(two, [], 70, 25, "c").warnings).toEqual([]);
    const lost = commentCtaMoments(value({ lines: [{ text: "a" }, { text: "b" }], loop: true }), [], 40, 25, "c");
    expect(lost.moments).toEqual([0, 10]);
    expect(lost.warnings[0]).toMatch(/has 1\.2 s .* so the follow button is not tapped on screen$/);
  });

  it("freezes its moments from the words through templateMoments, the first line on frame 0", () => {
    const tokens = lexicalTokens(script), words = tokens.map((word, at) => ({ word, startSec: at * 0.4 }));
    const span = { startFrame: 40, endFrame: 290 }, range = { startWord: 4, coverWord: tokens.length };
    const { moments } = templateMoments(commentCta as never, base, tokens, range, words, 25, span, "cta");
    // "Comment" is word 4 (frame 40, the template's first), "send" word 10 (frame 100), "follow" word 21 (frame 210); the message line between.
    expect(moments).toEqual([0, 60, 115, 170]);
    expect(CTA_LOOP_FRAMES + CTA_FUNNEL.tap + CTA_FUNNEL.settle).toBe(40);
  });
});
