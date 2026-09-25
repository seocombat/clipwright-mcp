// Queue promises forbidden on an `account_not_admitted` refusal: a 403 says only that access is
// missing, possibly revoked. A regression guard against known phrasings, not a proof of the rule.

/** One list for every guard, in both corpus languages; stems, not word forms. Substring */
/** matching also flags negations, which is accepted: the guard fails loudly, not silently. */
export const QUEUE_PROMISES = [
  "in waves",
  "in the queue",
  "next wave",
  "yet",
  "волн",
  "очеред",
  "пока что",
  "подожди",
] as const;

/** The subject in normalized form: `_` removed and lowercased, so every spelling of the */
/** refusal (`account_not_admitted`, `NotAdmittedFailure`) matches; `already_admitted` does not. */
export const NOT_ADMITTED_ANCHOR = "notadmitted";

/** Removes spelling differences: `account_not_admitted` and `NotAdmittedFailure` are one. */
export function normalizeForAnchor(text: string): string {
  return text.replaceAll("_", "").toLowerCase();
}
