import { z } from "zod";

// Imported only for the 429 codes in the registry below: the names come from their
// schemas, not literals (`rate-limit.ts` is the only home of the 429 shape).
import { actorCreationLimitedError, rateLimitedError } from "./rate-limit.js";

// Refusal bodies are built through schemas, not handler literals: a 402 carries numbers the
// agent acts on. Numbers sit INSIDE `error`, since an error response has one envelope.

/** The generic error envelope. Tolerates extra fields inside `error`: the typed refusals */
/** below extend it, and generic parsing must not break when a code brings numbers. */
export const apiError = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
export type ApiError = z.infer<typeof apiError>;

/** Fewer credits on the balance than the run weighs: "top up". */
export const insufficientCreditsError = z.object({
  error: z.object({
    code: z.literal("insufficient_credits"),
    message: z.string().min(1),
    /** What the balance holds NOW. Zero is a legal value. */
    balance_credits: z.number().int().nonnegative(),
    /** What this run needs: the same estimate `quote` returned. */
    required_credits: z.number().int().positive(),
  }),
});
export type InsufficientCreditsError = z.infer<typeof insufficientCreditsError>;

/** The account carries an unpaid debt. A separate code because an indebted account may */
/** still hold a balance, so "insufficient credits" would be false. Buying credits clears it. */
export const debtOutstandingError = z.object({
  error: z.object({
    code: z.literal("debt_outstanding"),
    message: z.string().min(1),
    debt_credits: z.number().int().positive(),
  }),
});
export type DebtOutstandingError = z.infer<typeof debtOutstandingError>;

/** Account not admitted to the beta; money does not change that, so it has its own code. */
/** Terminal; the body names no timeline, since a revoked account answers the same way. */
export const accountNotAdmittedError = z.object({
  error: z.object({
    code: z.literal("account_not_admitted"),
    message: z.string().min(1),
  }),
});
export type AccountNotAdmittedError = z.infer<typeof accountNotAdmittedError>;

/** Builds the "not enough credits" body. The wording lives here so every place that */
/** answers 402 explains the refusal the same way. */
export function insufficientCreditsBody(args: {
  balanceCredits: number;
  requiredCredits: number;
}): InsufficientCreditsError {
  return insufficientCreditsError.parse({
    error: {
      code: "insufficient_credits",
      message:
        `${creditsNeededSentence(args)} ` +
        "Top up the balance and retry; nothing was charged and no run was created.",
      balance_credits: args.balanceCredits,
      required_credits: args.requiredCredits,
    },
  });
}

/** One "needs / has / short" sentence for the 402 refusal and the `quote` warning. */
export function creditsNeededSentence(args: {
  balanceCredits: number;
  requiredCredits: number;
}): string {
  const short = args.requiredCredits - args.balanceCredits;
  return (
    `This run needs ${args.requiredCredits} credits, the account has ${args.balanceCredits}` +
    (short > 0 ? ` (${short} short).` : ".")
  );
}

/** `quote` warning: `make_ugc` with the same input will get this refusal. */
export function insufficientCreditsWarning(args: {
  balanceCredits: number;
  requiredCredits: number;
}): string {
  return (
    `${creditsNeededSentence(args)} make_ugc will be refused with insufficient_credits ` +
    "until the account buys credits."
  );
}

export function debtOutstandingWarning(args: { debtCredits: number }): string {
  return (
    `An outstanding debt of ${args.debtCredits} credits blocks new paid runs; make_ugc will ` +
    "be refused with debt_outstanding until the account buys credits to clear it."
  );
}

export function accountNotAdmittedWarning(): string {
  return (
    "This account is not admitted to the beta; make_ugc will be refused with " +
    "account_not_admitted, and buying credits does not change that."
  );
}

/** Builds the "not admitted to the beta" body; see the wording rule above. */
export function accountNotAdmittedBody(): AccountNotAdmittedError {
  return accountNotAdmittedError.parse({
    error: {
      code: "account_not_admitted",
      message:
        "This account is not admitted to the beta. Nothing was charged and no run was created. " +
        "Ask the operator about this account; retrying will not change the answer.",
    },
  });
}

/** Builds the "outstanding debt" body; see the wording rule above. */
export function debtOutstandingBody(args: {
  debtCredits: number;
}): DebtOutstandingError {
  return debtOutstandingError.parse({
    error: {
      code: "debt_outstanding",
      message:
        `An outstanding debt of ${args.debtCredits} credits blocks new paid runs. ` +
        "Buy credits to clear it: incoming credits pay the debt down before any of them " +
        "reach the balance. Clearing it lifts this block; a run still needs enough " +
        "credits of its own, so a purchase equal to the debt adds nothing to the balance.",
      debt_credits: args.debtCredits,
    },
  });
}

/** The input holds a field the product rejects. `fields` names them: the agent cannot */
/** fix anything until it knows which one to drop. */
export const rejectedFieldError = z.object({
  error: z.object({
    code: z.literal("rejected_field"),
    message: z.string().min(1),
    fields: z.array(z.string().min(1)).min(1),
  }),
});
export type RejectedFieldError = z.infer<typeof rejectedFieldError>;

/** Builds the "field rejected" body. The reason comes from the disposition registry. */
export function rejectedFieldBody(
  hits: readonly { field: string; message: string }[],
): RejectedFieldError {
  return rejectedFieldError.parse({
    error: {
      code: "rejected_field",
      message: hits.map((hit) => hit.message).join("; "),
      fields: hits.map((hit) => hit.field),
    },
  });
}

/** A key outside the contract. The schema strips such keys silently, so a misspelled */
/** `aspectRatio` became the 9:16 default without a trace; hence a refusal. */
export const unknownFieldError = z.object({
  error: z.object({
    code: z.literal("unknown_field"),
    message: z.string().min(1),
    fields: z.array(z.string()).min(1),
  }),
});
export type UnknownFieldError = z.infer<typeof unknownFieldError>;

/** Builds the "unknown key" body: each name, a suggestion and the accepted fields. */
export function unknownFieldBody(
  hits: readonly { field: string; suggestion?: string | undefined }[],
  acceptedFields: readonly string[],
): UnknownFieldError {
  const named = hits.map((hit) =>
    hit.suggestion === undefined
      ? `unknown field "${hit.field}"`
      : `unknown field "${hit.field}" (did you mean "${hit.suggestion}"?)`,
  );
  return unknownFieldError.parse({
    error: {
      code: "unknown_field",
      message:
        `${named.join("; ")}. Nothing was charged and no run was created. ` +
        `Accepted fields: ${acceptedFields.join(", ")}.`,
      fields: hits.map((hit) => hit.field),
    },
  });
}

/** Text arrived with lost bytes: a replacement character in a string leaf of the input. */
export const scriptEncodingLostError = z.object({
  error: z.object({
    code: z.literal("script_encoding_lost"),
    message: z.string().min(1),
    fields: z.array(z.string().min(1)).min(1),
  }),
});
export type ScriptEncodingLostError = z.infer<typeof scriptEncodingLostError>;

/** As many paths as `invalid_request` shows: a long list is unreadable, a silently */
/** shortened one lies, so the rest is given as a number. */
const MAX_LISTED_PATHS = 12;

/** An empty path means the root itself is corrupt (a string instead of an object). The */
/** schema requires a non-empty name, so the root gets a label. */
const ROOT_PATH_LABEL = "(root)";

/** Builds the "encoding lost" body. Takes BOTH numbers of the predicate, so the caller */
/** does not choose where the character count comes from. */
export function scriptEncodingLostBody(args: {
  paths: readonly string[];
  charCount: number;
}): ScriptEncodingLostError {
  const named = args.paths.map((path) => (path === "" ? ROOT_PATH_LABEL : path));
  const listed = named.slice(0, MAX_LISTED_PATHS);
  const hidden = named.length - listed.length;
  const where = hidden > 0 ? `${listed.join(", ")} (+${hidden} more)` : listed.join(", ");
  const noun =
    args.charCount === 1 ? "1 Unicode replacement character" : `${args.charCount} Unicode replacement characters`;

  return scriptEncodingLostError.parse({
    error: {
      code: "script_encoding_lost",
      message:
        `the text arrived with ${noun} (U+FFFD) in: ${where}. ` +
        "The original bytes were lost before the request reached us, most often by " +
        "reading single-byte Cyrillic as UTF-8. We cannot restore them. " +
        "Re-send the text decoded as UTF-8. Nothing was charged and no run was created.",
      fields: listed,
    },
  });
}

/** Keeps the tool description's promise ("refused before any charge"): an unusable */
/** source is refused, not estimated. */
export function unusableSourceMessage(errorClass: string, detail: string): string {
  return (
    `image cannot be used: ${detail} (${errorClass}). It is refused before any charge, so ` +
    "no credits were reserved and no run was created. Fix the url, or send the file through " +
    "upload_image (POST /v1/uploads) and pass the url it returns."
  );
}

/** Says both "fix the input" and "a retry will not help": on a 500 agents re-sent bytes */
/** that would never parse. */
export const MALFORMED_BODY_MESSAGE =
  "the request body is not valid JSON, so no field of it was read. Send a JSON object as the body " +
  "and check the quoting of whatever built it. The same bytes will fail the same way on a retry.";

/** Codes with a bare envelope, in one registry: the published list of error codes is */
/** declared exhaustive. */
const BARE_ERROR_CODES = [
  "aspect_conflict",
  "actor_unavailable",
  "actor_format_unavailable",
  "actor_storage_unavailable",
  "actor_generation_disabled",
  "actor_in_use",
  "idempotency_key_required",
  "idempotency_key_reused",
  "internal_error",
  "invalid_image",
  "invalid_request",
  "malformed_body",
  "not_found",
  "paid_render_disabled",
  "payload_too_large",
  "unauthorized",
  "unsupported_media_type",
  "unusable_source",
  "upload_cap_exceeded",
  "upstream_error",
] as const;

/** A refusal code whose body carries only `code` and `message`. */
export type BareApiErrorCode = (typeof BARE_ERROR_CODES)[number];

/** EVERY code the API can return: bare plus typed. Typed values come from their schemas, */
/** so a rename reaches here on its own. */
export const API_ERROR_CODES: readonly string[] = [
  ...BARE_ERROR_CODES,
  rejectedFieldError.shape.error.shape.code.value,
  unknownFieldError.shape.error.shape.code.value,
  scriptEncodingLostError.shape.error.shape.code.value,
  insufficientCreditsError.shape.error.shape.code.value,
  debtOutstandingError.shape.error.shape.code.value,
  accountNotAdmittedError.shape.error.shape.code.value,
  rateLimitedError.shape.error.shape.code.value,
  actorCreationLimitedError.shape.error.shape.code.value,
];

/** A bare refusal body. The only path to one: a code outside the registry does not */
/** compile, and an envelope built around this function fails the envelope guard test. */
export function apiErrorBody(args: { code: BareApiErrorCode; message: string }): ApiError {
  return apiError.parse({ error: { code: args.code, message: args.message } });
}
