/** Third-party text in a display_markdown line or table cell (#990): one line, cut, quoted, a pipe as "/" so the table keeps its columns, every */
/** character CommonMark gives a meaning backslash-escaped, and GFM's bare links (scheme://, www., an @) broken by an escape, so it shows as typed. */
export function quoteThirdParty(text: string, max = 90): string {
  const chars = Array.from(text.replace(/\s+/g, " ").replace(/\|/g, "/").trim());
  if (chars.length === 0) return "—";
  const kept = chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
  return `“${kept.replace(/[\\`*_[\]()<>#!~@]|:(?=\/\/)/g, "\\$&").replace(/(www)\./gi, "$1\\.")}”`;
}
