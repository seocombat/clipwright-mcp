import type { FacelessCustomerSceneImage } from "./faceless-public.js";
import { facelessSpeechLexicalWords } from "./faceless-public-plan.js";

/** Lexical ranges only; measured speech still decides the frames and supported shot placement. */
export function resolveFacelessCustomerAnchors(script: string, images: readonly FacelessCustomerSceneImage[]):
  Array<{ first: number; end: number; url: string }> {
  const words = facelessSpeechLexicalWords(script);
  const resolved = images.map(image => {
    let first: number, end: number;
    if ("startWord" in image.anchor) { first = image.anchor.startWord; end = image.anchor.endWord; }
    else {
      const quote = facelessSpeechLexicalWords(image.anchor.quote);
      const starts = words.flatMap((_, i) => quote.every((word, offset) => words[i + offset] === word) ? [i] : []);
      if (image.anchor.occurrence === undefined && starts.length > 1) throw new Error("ambiguous_customer_anchor");
      const occurrence = image.anchor.occurrence ?? 0;
      if (!Number.isSafeInteger(occurrence) || occurrence < 0 || occurrence >= starts.length) throw new Error("invalid_customer_anchor");
      first = starts[occurrence]!; end = first + quote.length;
    }
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(end) || first < 0 || end <= first || end > words.length)
      throw new Error("invalid_customer_anchor");
    return { first, end, url: image.image_url };
  });
  const ordered = [...resolved].sort((a, b) => a.first - b.first);
  if (ordered.some((range, i) => i > 0 && range.first < ordered[i - 1]!.end)) throw new Error("overlapping_customer_anchors");
  return resolved;
}
