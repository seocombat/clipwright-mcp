/** The caption language as the font table reads it, from the letters the script is written in (in core for template text, #778 S3). */
export function captionLanguageOf(script: string): string {
  const count = (pattern: RegExp) => script.match(pattern)?.length ?? 0;
  const scripts: Array<[string, number]> = [
    ["ru", count(/\p{Script=Cyrillic}/gu)], ["el", count(/\p{Script=Greek}/gu)], ["ja", count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)],
    ["zh", count(/\p{Script=Han}/gu)], ["ko", count(/\p{Script=Hangul}/gu)], ["ar", count(/\p{Script=Arabic}/gu)],
    ["hi", count(/\p{Script=Devanagari}/gu)], ["ta", count(/\p{Script=Tamil}/gu)], ["latin", count(/\p{Script=Latin}/gu)],
  ];
  const [top] = scripts.sort((a, b) => b[1] - a[1]);
  if (top![0] !== "latin" && top![1] > 0) return top![0];
  if (/[ăâđêôơưạ-ỹ]/iu.test(script)) return "vi";
  // A Latin letter outside ASCII needs latin-ext; Polish stands for every such language in the table.
  return /[^a-z]/iu.test(script.replace(/[^\p{Script=Latin}]/gu, "")) ? "pl" : "en";
}
