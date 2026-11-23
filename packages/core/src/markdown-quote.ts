export function quoteThirdParty(text: string, max = 90): string {
  const chars = Array.from(text.replace(/\s+/g, " ").replace(/\|/g, "/").trim());
  if (chars.length === 0) return "—";
  const kept = chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
  return `“${kept.replace(/[\\`*_[\]()<>#!~@]|:(?=\/\/)/g, "\\$&").replace(/(www)\./gi, "$1\\.")}”`;
}
