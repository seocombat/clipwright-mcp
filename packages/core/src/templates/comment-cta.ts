import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const CTA_LINES = { min: 2, max: 6 } as const;
export const CTA_ITEMS = { min: 3, max: 17 } as const;
/** The one format the page is drawn in. */
export const CTA_ASPECT = "9:16";
/** Frames the page takes to dissolve into the video's first frame when it loops. */
export const CTA_LOOP_FRAMES = 10;
/** The funnel's own pace, in frames at 25 fps: the code word starts typing after the first line enters, one letter at a time, is sent, then the
 *  message arrives, the follow button pops and is tapped, and the tap settles. */
export const CTA_FUNNEL = { typeDelay: 6, letter: 3, send: 6, arrive: 8, tap: 18, settle: 12 } as const;
/** The least gap between two lines of the header, so each builds its words before the next replaces it. */
export const CTA_LINE_GAP = 10;
/** The labels a viewer's app shows, in English when absent. */
export const CTA_LABELS = { comment: "Add a comment…", follow: "Follow", following: "Following" } as const;
/** Script languages whose letters are Latin: the English labels may stand in them, as their own words. */
const LATIN_LANGUAGES = ["en", "pl", "vi"];

/** On only where the flag says so; off, a comment_cta template is refused before any reserve. */
export function isCommentCtaEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_COMMENT_CTA === "1";
}
export const COMMENT_CTA_DISABLED_MESSAGE = "comment_cta is not available right now; use another template kind";

const line = z.object({
  text: z.string().min(1).max(32),
  accent: z.string().min(1).max(24).optional(),
  act: z.enum(["dm", "follow"]).optional(),
  at: z.string().min(1).max(200).optional(),
}).strict();

const data = z.object({
  title: z.string().min(1).max(40),
  accent: z.string().min(1).max(24).optional(),
  list_title: z.string().min(1).max(32),
  items: z.array(z.string().min(1).max(24)).min(CTA_ITEMS.min).max(CTA_ITEMS.max),
  code: z.string().min(1).max(16),
  handle: z.string().min(1).max(30),
  dm: z.string().min(1).max(40),
  lines: z.array(line).min(CTA_LINES.min).max(CTA_LINES.max),
  avatar: templateMedia.optional(),
  labels: z.object({ comment: z.string().min(1).max(24).optional(), follow: z.string().min(1).max(12).optional(),
    following: z.string().min(1).max(12).optional() }).strict().optional(),
  loop: z.boolean().optional(),
  size: templateSize,
}).strict().superRefine((value, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (value.accent !== undefined && !value.title.includes(value.accent)) issue(["accent"], "accent names words of the title, as written there");
  value.lines.forEach((entry, index) => {
    if (entry.accent !== undefined && !entry.text.includes(entry.accent)) issue(["lines", index, "accent"], "accent names words of the line, as written there");
  });
  for (const act of ["dm", "follow"] as const) {
    const named = value.lines.flatMap((entry, index) => (entry.act === act ? [index] : []));
    if (named.length > 1) issue(["lines", named[1]!, "act"], `act ${act} names one line`);
  }
  const dm = value.lines.findIndex(entry => entry.act === "dm"), follow = value.lines.findIndex(entry => entry.act === "follow");
  if (dm >= 0 && follow >= 0 && follow < dm) issue(["lines", follow, "act"], "the follow comes after the message: put act follow on the dm line or a later one");
});
type Data = z.infer<typeof data>;

/** The lines the message and the follow arrive on: the ones that name them, else the middle line and the last. */
export function commentCtaActLines(lines: readonly { act?: "dm" | "follow" | undefined }[]): { dm: number; follow: number } {
  const follow = lines.findIndex(entry => entry.act === "follow"), dm = lines.findIndex(entry => entry.act === "dm");
  const followLine = follow >= 0 ? follow : lines.length - 1;
  return { dm: dm >= 0 ? dm : Math.min(Math.floor(lines.length / 2), followLine), follow: followLine };
}

/** The funnel's frames from the template's start, from the lines' frames: typing, its end, the send, the message, the follow and its tap. */
export function commentCtaSchedule(moments: readonly number[], code: string, acts: { dm: number; follow: number }) {
  const type = moments[0]! + CTA_FUNNEL.typeDelay, typed = type + Array.from(code).length * CTA_FUNNEL.letter, sent = typed + CTA_FUNNEL.send;
  const dm = Math.max(moments[acts.dm]!, sent + CTA_FUNNEL.arrive), follow = Math.max(moments[acts.follow]!, dm + CTA_FUNNEL.arrive);
  return { type, typed, sent, dm, follow, tap: follow + CTA_FUNNEL.tap };
}

const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(1)} s`;

/** Each line's first frame from the template's start: the first on frame 0, a quoted line on its words, the rest spread evenly before the
 *  follow's tap; a line keeps `CTA_LINE_GAP` after the one before, and what that moves or what the funnel loses is named. */
export function commentCtaMoments(value: Data, beats: readonly (number | undefined)[], duration: number, fps: number, id: string):
  { moments: number[]; warnings: string[] } {
  const count = value.lines.length, warnings: string[] = [], room = duration - (value.loop ? CTA_LOOP_FRAMES : 0);
  const spread = Math.max(0, room - CTA_FUNNEL.tap - CTA_FUNNEL.settle);
  const anchors = Array.from({ length: count + 1 }, (_, index) => (index === 0 ? 0 : index === count ? spread : beats[index]));
  const targets: number[] = [0];
  for (let from = 0; from < count;) {
    let to = from + 1;
    while (to < count && anchors[to] === undefined) to++;
    const start = targets[from]!, end = Math.max(start, anchors[to]!);
    for (let at = from + 1; at < to; at++) targets[at] = Math.round(start + ((end - start) * (at - from)) / (to - from));
    if (to < count) targets[to] = anchors[to]!;
    from = to;
  }
  const moments: number[] = [];
  for (const [index, target] of targets.entries()) {
    const earliest = index === 0 ? 0 : moments[index - 1]! + CTA_LINE_GAP;
    moments.push(Math.max(target, earliest));
    if (target < earliest && beats[index] !== undefined) {
      warnings.push(`template "${id}" lines.${index}.at "${value.lines[index]!.at}" is spoken too close after the line before it: the line starts ` +
        `${seconds(earliest - target, fps)} later`);
    }
  }
  const { tap } = commentCtaSchedule(moments, value.code, commentCtaActLines(value.lines)), need = tap + CTA_FUNNEL.settle;
  if (need > room) {
    warnings.push(`template "${id}": the call to action has ${seconds(room, fps)} and its comment, message and follow need ${seconds(need, fps)}, ` +
      `so ${tap >= room ? "the follow button is not tapped on screen" : "the tap on the follow button is cut short"}`);
  }
  return { moments, warnings };
}

/** Why the data cannot stand in this run, beyond its schema: labels the script's language needs, a loop that would not end the video. */
export function commentCtaRefusals(value: Data, context: { language: string; endsScript: boolean }): { path: (string | number)[]; message: string }[] {
  const refusals: { path: (string | number)[]; message: string }[] = [];
  if (!LATIN_LANGUAGES.includes(context.language)) {
    const missing = (Object.keys(CTA_LABELS) as (keyof typeof CTA_LABELS)[]).filter(key => value.labels?.[key] === undefined);
    if (missing.length) refusals.push({ path: ["labels"], message: `comment_cta labels ${missing.join(", ")} are needed in the script's language: ` +
      "the comment field and the follow button would read English otherwise" });
  }
  if (value.loop && !context.endsScript) refusals.push({ path: ["loop"], message: "comment_cta loop ends the video on its first frame: " +
    "the template must cover the script's last words, or drop loop" });
  return refusals;
}

/** A full-frame comment funnel: the title, the avatar, a header line built word by word, the full list's card, the code word typed and sent,
 *  the handle's message, a follow button tapped; optionally ending on the video's first frame so it loops. */
export const commentCta: TemplateKind<typeof data> = {
  kind: "comment_cta",
  kindVersion: 1,
  description: "a full-frame closing call to action in 9:16 that acts out a comment-keyword funnel: the title and an avatar (the avatar image, " +
    "else the handle's initial) over a card with the full list (list_title, 3–17 items, ticked); a header line of 2–6 lines, each building " +
    "word by word on its at quote (the rest spread evenly), the accent words marked; a comment field types code letter by letter and sends it " +
    "with a tick; the handle's message dm arrives on the line with act dm (else the middle line), and a follow pill with the avatar pops on " +
    "the line with act follow (else the last) and is tapped to following; labels set the field's hint and the button's two words, needed when " +
    "the script is not in Latin letters (English otherwise); loop true dissolves the last frames into the video's first frame, so the video " +
    "loops, and needs the template to cover the script's last words",
  placements: ["full"],
  aspects: [CTA_ASPECT],
  data,
  text: { title: 40, accent: 24, list_title: 32, items: 24, code: 16, handle: 30, dm: 40, "lines.text": 32, "lines.accent": 24,
    "labels.comment": 24, "labels.follow": 12, "labels.following": 12 },
  quotes: ["lines.at"],
  spreads: "lines",
  firstBeatAtStart: true,
  fillsFrame: true,
  slots: { avatar: { type: "image", cover: 1 } },
  timing: (value, beats, duration, fps, id) => commentCtaMoments(value, beats, duration, fps, id),
  check: (value, context) => commentCtaRefusals(value, context),
  hidesCaptions: () => true,
  onInserts: false,
  // The page fills the frame at medium; small draws it a quarter smaller on the theme's ground.
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), step = fillingStep(value.size);
    return centredArea(canvas, step * canvas.width, step * canvas.height);
  },
  sample: { title: "5 AI tools for faster edits", accent: "AI tools", list_title: "5 AI tools", items: ["Auto captions", "Orbit intro", "Chat edits",
    "Phone preview", "Timeline view"], code: "TOOLS", handle: "studio.daily", dm: "sent you the full list",
    lines: [{ text: "Comment \"TOOLS\"", accent: "TOOLS", at: "comment" }, { text: "and I'll send", at: "send" },
      { text: "the full list", accent: "list", act: "dm", at: "list" }, { text: "Don't forget to follow", accent: "follow", act: "follow", at: "follow" }],
    avatar: { asset_id: `ast_${"7".repeat(32)}` }, labels: { comment: "Add a comment…", follow: "Follow", following: "Following" }, loop: true },
};
