import { afterEach, describe, expect, it } from "vitest";
import { dispositionWarnings } from "../contract-dispositions.js";
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

  /** Mutant: keep refusing it on a faceless video, which it needs no presenter for (#1438). */
  it("is drawn in 9:16 only, and on a faceless video too", () => {
    switchOn();
    expect(refusals({ templates: [cta()], aspect_ratio: "16:9" }))
      .toEqual(["aspect_ratio: comment_cta is drawn in 9:16 only: pass aspect_ratio 9:16, or use another template kind"]);
    const parsed = makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, templates: [cta()] });
    expect(parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`)).toEqual([]);
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

  /** #1457: before payment, a call to action that runs on is named with the time it adds. Mutants: drop the warning (the longer video unnamed);
   *  say the video runs on for one in the middle (it does not grow there). */
  it("names, before payment, a call to action whose acts outlast its sentence, with the video's new length at the end", () => {
    switchOn();
    const quoted = [{ text: "Comment \"LIST\"", at: "Comment" }, { text: "and I'll send", at: "send" },
      { text: "the full list", act: "dm" as const, at: "list straight" }, { text: "Follow", act: "follow" as const, at: "messages" }];
    const run = (data: Record<string, unknown>, extra: Record<string, unknown>, more: Record<string, unknown> = {}) =>
      dispositionWarnings(makeUgcInput.parse({ script, ...more, templates: [cta(data, extra)] })).filter(warning => warning.startsWith("template \"cta\""));
    // "follow" is word 21 of 24 at 2.6 a second: 7.7 s from "Comment" to the end, its tap settled and the loop at 8.2 s.
    expect(run({ loop: true }, {})).toEqual(["template \"cta\": its sentence gives about 7.7 s and its comment, message and follow need about " +
      "0.4 s more; the video runs 0.4 s past its last word so every act of template \"cta\" plays, the follow button tapped; " +
      "lengthen the sentence to keep the call to action on it"]);
    const middle = run({ lines: quoted }, { anchor: { quote: "Comment list below and I will send the full list straight to your messages." },
      cover_words: undefined });
    expect(middle).toEqual(["template \"cta\": its sentence gives about 5.4 s and its comment, message and follow need about 0.8 s more; " +
      "the call to action will run on past it and the next template starts later; lengthen the sentence to keep the call to action on it"]);
    expect(run({ lines: unquoted }, {})).toEqual([]);
  });

  /** #1462. Mutant: name the video's new length only for one on the last word, and one whose run-on passes the script's end is said to fit. */
  it("names, before payment, the video's new length for a call to action whose run-on passes the script's last word", () => {
    switchOn();
    const lastWords = [{ text: "Comment \"LIST\"", at: "Comment" }, { text: "Follow", act: "follow" as const, at: "follow" }];
    const warnings = dispositionWarnings(makeUgcInput.parse({ script, templates: [cta({ lines: lastWords },
      { anchor: { quote: "Comment list below and I will send the full list straight to your messages. Don't forget to follow" }, cover_words: undefined })] }))
      .filter(warning => warning.startsWith("template \"cta\""));
    // Its words end before "for more.", two words at 2.6 a second, 0.8 s; its acts run 1.1 s past them, 0.4 s past the script's end.
    expect(warnings).toEqual(["template \"cta\": its sentence gives about 7.0 s and its comment, message and follow need about 1.1 s more; " +
      "the video runs 0.4 s past its last word so every act of template \"cta\" plays, the follow button tapped; " +
      "lengthen the sentence to keep the call to action on it"]);
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

  /** Mutant: keep the gap when it runs past the template's end, and a line's frame lies outside the template, where the composition refuses
   *  the whole video (#1425). */
  it("starts a line the gap would push past the end on its own frame instead, and names the lines before it as cut short", () => {
    const late = commentCtaMoments(value(), [undefined, 80, undefined, 85], 90, 25, "c");
    expect(late.moments).toEqual([0, 80, 83, 85]);
    expect(late.warnings).toContain("template \"c\": lines.2 and lines.3 start less than 0.4 s after the line before, too near the template's end to wait: " +
      "the line before each is cut short");
    // Lines with no frame of their own left share the last one, still inside the template.
    expect(commentCtaMoments(value(), [undefined, 87, undefined, 89], 90, 25, "c").moments).toEqual([0, 87, 88, 89]);
    expect(commentCtaMoments(value(), [undefined, 89, undefined, 89], 90, 25, "c").moments).toEqual([0, 89, 89, 89]);
    // Codex r1: a line spoken before the one ahead of it has moved still starts after it, so every line becomes current in turn.
    expect(commentCtaMoments(value(), [undefined, 75, 76, 77], 90, 25, "c").moments).toEqual([0, 75, 85, 86]);
    // A word that rounds onto the template's end frame starts its line on the last frame, still inside.
    expect(commentCtaMoments(value(), [undefined, 90, undefined, 90], 90, 25, "c").moments).toEqual([0, 89, 89, 89]);
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

  /** #1457, owner 12.11: the tap is never dropped for lack of time. Mutants: keep the old `room` (no frames asked, the tap lost); ask frames
   *  past `most` (a beat outside the video); drop the run-on line (the longer video unnamed). */
  it("runs on past its words until the follow is tapped and settles, up to the frames it may reach, and names it", () => {
    const loop = value({ lines: [{ text: "a" }, { text: "b" }], loop: true });
    // Typing LIST ends on 18, the send on 24, the message on 32, the follow on 40, its tap on 58, settled on 70, the loop's 10 after.
    expect(commentCtaMoments(loop, [], 40, 25, "c", 200)).toEqual({ moments: [0, 10], frames: 80,
      warnings: ["template \"c\" runs 1.6 s past its words so that its comment, message and follow play to the end"] });
    // Up to the frames it may reach: 70 frames give the page 60, the tap cut short, and that is named.
    const capped = commentCtaMoments(loop, [], 40, 25, "c", 70);
    expect([capped.frames, capped.warnings[1]]).toEqual([70, "template \"c\": the call to action has 2.4 s and its comment, message and follow " +
      "need 2.8 s, so the tap on the follow button is cut short"]);
    // Words that give the funnel its time ask nothing more.
    expect(commentCtaMoments(loop, [], 80, 25, "c", 200)).toEqual({ moments: [0, 20], warnings: [] });
  });

  /** Mutant: give way to the template's end instead of the frames it may reach, and lines spoken late are cut short though the video runs on. */
  it("keeps each line's gap when it may run on, instead of cutting the line before short", () => {
    const late = commentCtaMoments(value(), [undefined, 80, undefined, 85], 90, 25, "c", 300);
    // "send" on 80, the message line 10 after, the follow 10 after that; its tap on 118 and settled on 130.
    expect([late.moments, late.frames]).toEqual([[0, 80, 90, 100], 130]);
    expect(late.warnings).toEqual(["template \"c\" lines.3.at \"follow\" is spoken too close after the line before it: the line starts 0.6 s later",
      "template \"c\" runs 1.6 s past its words so that its comment, message and follow play to the end"]);
  });

  /** Mutant: count only the tap, and a line after the follow's starts in the template's last frames, gone before its words build. */
  it("gives a line after the follow's its gap before the page ends", () => {
    const after = value({ lines: [{ text: "a" }, { text: "b", act: "follow" }, { text: "c", at: "c" }] });
    // The follow's tap settles on 70; the last line, spoken on 62, keeps its 10 frames to 72.
    expect(commentCtaMoments(after, [undefined, undefined, 62], 64, 25, "c", 200)).toMatchObject({ moments: [0, 31, 62], frames: 72 });
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
