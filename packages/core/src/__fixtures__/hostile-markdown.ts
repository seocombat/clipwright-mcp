import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/** Third-party text that GitHub-flavoured markdown would render as markup (#990): each must reach display_markdown as literal text. */
export const HOSTILE_TEXTS = ["[click](https://evil.example)", "![x](https://evil.example/i.png)", "<https://evil.example>",
  "go https://evil.example now", "see www.evil.example", "write mail@evil.example", "mailto:x@evil.example",
  "<img src=x onerror=alert(1)>", "ok\n# Head", "**b** _i_ ~~s~~ `c` \\", "a | b | c | d", "\\<b>bold</b>", "\\*x\\* and \\[l\\](https\\://e.example)"];

/** Every tag a GFM renderer makes of `markdown`, raw HTML let through: hostile text that stays text leaves the same tags as plain text. */
export const renderedTags = (markdown: string): string[] =>
  micromark(markdown, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] }).match(/<[^>]+>/g) ?? [];
