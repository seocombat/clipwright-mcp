import {
  accountNotAdmittedError,
  apiError,
  debtOutstandingError,
  insufficientCreditsError,
} from "./errors.js";
import { rateLimitedError } from "./rate-limit.js";

// API failure parsing shared by the SDK, the MCP formatter and the CLI, so all three agree on
// whether to retry. Pure: input is status, body text and header, no network.

/** Rate-limit failure: a 429 from us or from a proxy or edge in between. */
export interface RateLimitedFailure {
  kind: "rate_limited";
  status: number;
  message: string;
  /** Seconds to wait before retrying; `undefined` when the server did not say. */
  retryAfterSeconds: number | undefined;
  /** Bucket size. Only our own body carries it; a proxy body does not. */
  limit: number | undefined;
  windowSeconds: number | undefined;
}

/** Fewer credits than the run weighs. Terminal: a retry does not change the balance. */
export interface InsufficientCreditsFailure {
  kind: "insufficient_credits";
  status: number;
  message: string;
  balanceCredits: number;
  requiredCredits: number;
}

/** Outstanding debt. Terminal; buying credits clears it, since incoming credits pay debt first. */
/** Kept apart from `insufficient_credits` because an indebted account may still hold a balance. */
export interface DebtOutstandingFailure {
  kind: "debt_outstanding";
  status: number;
  message: string;
  debtCredits: number;
}

/** Account not admitted to the beta. Terminal, and money does not fix it. */
/** Not a `client_error`: there is nothing in the call to fix, so the advice differs. */
export interface NotAdmittedFailure {
  kind: "not_admitted";
  status: number;
  message: string;
}

/** 5xx: the server says the fault is its own. Safe to retry. */
export interface ServerFailure {
  kind: "server_error";
  status: number;
  message: string;
  retryAfterSeconds: number | undefined;
}

/** Everything else (4xx): repeating the same request gives the same answer. */
export interface ClientFailure {
  kind: "client_error";
  status: number;
  message: string;
  /** Code from the body, if the body followed the contract at all. */
  code: string | undefined;
}

export type ApiFailure =
  | RateLimitedFailure
  | InsufficientCreditsFailure
  | DebtOutstandingFailure
  | NotAdmittedFailure
  | ServerFailure
  | ClientFailure;

/** Retry decision in one place. Not retrying a 429 aborts a paid run; retrying a 402 */
/** loops on a money refusal and burns the rate limit. */
export function isRetryableFailure(failure: ApiFailure): boolean {
  return failure.kind === "rate_limited" || failure.kind === "server_error";
}

/** Delay before a retry, ms. `fallbackMs` is also the floor: no `Retry-After` does not */
/** permit polling faster than usual. Meaningful only after `isRetryableFailure`. */
export function retryDelayMs(failure: ApiFailure, fallbackMs: number): number {
  const fromServer =
    failure.kind === "rate_limited" || failure.kind === "server_error"
      ? failure.retryAfterSeconds
      : undefined;
  return Math.max(fallbackMs, (fromServer ?? 0) * 1000);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH = MONTHS.join("|");
const DAY_SHORT = "Mon|Tue|Wed|Thu|Fri|Sat|Sun";
const DAY_LONG = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";

/** IMF-fixdate:  `Sun, 06 Nov 1994 08:49:37 GMT` — the form senders MUST use. */
const IMF_FIXDATE = new RegExp(
  `^(?:${DAY_SHORT}), (\\d{2}) (${MONTH}) (\\d{4}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`,
);

/** RFC 850:  `Sunday, 06-Nov-94 08:49:37 GMT` — obsolete, but recipients must accept it. */
const RFC850_DATE = new RegExp(
  `^(?:${DAY_LONG}), (\\d{2})-(${MONTH})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`,
);

/** asctime:  `Sun Nov  6 08:49:37 1994` — also obsolete and also mandatory. */
const ASCTIME_DATE = new RegExp(
  `^(?:${DAY_SHORT}) (${MONTH}) ([ \\d]\\d) (\\d{2}):(\\d{2}):(\\d{2}) (\\d{4})$`,
);

/** HTTP-date to epoch ms: the three RFC 9110 §5.6.7 forms, built via `Date.UTC`, not `Date.parse`, */
/** which misreads two-digit years and treats asctime as local time. Near-miss spellings are rejected. */
function httpDateToEpochMs(raw: string, now: Date): number | undefined {
  /** `Date.UTC` normalizes invalid fields (July 32 becomes August 1), so fields are range-checked. */
  /** Second 60 is allowed on purpose: RFC 9110 permits a leap second. */
  const utc = (
    year: number,
    month: string,
    day: string,
    h: string,
    m: string,
    s: string,
  ): number | undefined => {
    const monthIndex = MONTHS.indexOf(month);
    const dayNumber = Number.parseInt(day, 10);
    const hours = Number.parseInt(h, 10);
    const minutes = Number.parseInt(m, 10);
    const seconds = Number.parseInt(s, 10);

    if (hours > 23 || minutes > 59 || seconds > 60) return undefined;
    if (dayNumber < 1) return undefined;

    // `Date.UTC` maps years 0–99 to 1900+year, turning a garbage date into a zero wait.
    // HTTP dates never precede 1900.
    if (year < 1900) return undefined;

    // The calendar is checked at midnight, apart from the time of day, so a leap
    // second at 23:59:60 does not roll the day over and look invalid.
    const midnight = new Date(Date.UTC(year, monthIndex, dayNumber));
    if (midnight.getUTCDate() !== dayNumber || midnight.getUTCMonth() !== monthIndex) {
      return undefined;
    }
    return Date.UTC(year, monthIndex, dayNumber, hours, minutes, seconds);
  };

  const imf = IMF_FIXDATE.exec(raw);
  if (imf !== null) {
    const [, day, month, year, h, m, s] = imf as unknown as string[];
    return utc(Number.parseInt(year!, 10), month!, day!, h!, m!, s!);
  }

  const rfc850 = RFC850_DATE.exec(raw);
  if (rfc850 !== null) {
    const [, day, month, shortYear, h, m, s] = rfc850 as unknown as string[];
    // RFC 9110 century rule: use the current century, and step back a hundred years
    // only if that lands more than 50 years in the future.
    const nowYear = now.getUTCFullYear();
    let year = Math.floor(nowYear / 100) * 100 + Number.parseInt(shortYear!, 10);
    if (year - nowYear > 50) year -= 100;
    return utc(year, month!, day!, h!, m!, s!);
  }

  const asctime = ASCTIME_DATE.exec(raw);
  if (asctime !== null) {
    const [, month, day, h, m, s, year] = asctime as unknown as string[];
    return utc(Number.parseInt(year!, 10), month!, day!.trim(), h!, m!, s!);
  }

  return undefined;
}

/** `Retry-After` in seconds, both RFC 9110 forms: our middleware sends a delta, proxies */
/** often send an HTTP-date. `now` is a parameter so date parsing stays testable. */
export function parseRetryAfterSeconds(
  raw: string | null | undefined,
  now: Date,
): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }

  // A strict grammar, not `Date.parse`: V8's legacy parser turns garbage like "-5"
  // into a date, which would become a wait of decades.
  const at = httpDateToEpochMs(trimmed, now);
  if (at === undefined || Number.isNaN(at)) return undefined;
  // A past date means "now": zero, never negative.
  return Math.max(0, Math.ceil((at - now.getTime()) / 1000));
}

/** How many characters of a foreign body to carry into the message. */
const BODY_EXCERPT_LIMIT = 200;

/** One-line excerpt of an unreadable body, so "HTTP 429" carries a hint like "error code: 1015". */
/** Truncated because an HTML error page can run to tens of kilobytes. */
function excerpt(bodyText: string | undefined): string | undefined {
  if (bodyText === undefined) return undefined;
  const flat = bodyText.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return undefined;
  return flat.length > BODY_EXCERPT_LIMIT ? `${flat.slice(0, BODY_EXCERPT_LIMIT)}…` : flat;
}

/** `JSON.parse` that never throws: nothing promises a proxy body is JSON. */
function safeJson(bodyText: string | undefined): unknown {
  if (bodyText === undefined) return undefined;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

/** Codes that drive client behavior, not just text. Derived from the schema literals, */
/** so a rename in `errors.ts` or `rate-limit.ts` reaches here on its own. */
const BEHAVIOURAL_CODES = new Set<string>([
  rateLimitedError.shape.error.shape.code.value,
  insufficientCreditsError.shape.error.shape.code.value,
  debtOutstandingError.shape.error.shape.code.value,
  // Recognized only on its own status, like the three above, so a cached body on a
  // 402 cannot tell the agent that buying credits is pointless.
  accountNotAdmittedError.shape.error.shape.code.value,
]);

export interface ApiFailureInput {
  status: number;
  /** Raw body text; `res.json()` throws on HTML. `undefined` means the body could not */
  /** be read, which differs from an empty or foreign body. */
  bodyText: string | undefined;
  /** The `Retry-After` header value as the server sent it. */
  retryAfterHeader?: string | null | undefined;
  /** Reference time for the HTTP-date form. */
  now?: Date;
}

/** Status + body + header to an actionable failure. The body refines the status but never */
/** overrides it; on a mismatch the class comes from the status, the text from the body. */
export function parseApiFailure(input: ApiFailureInput): ApiFailure {
  const { status, bodyText } = input;
  const now = input.now ?? new Date();
  const headerSeconds = parseRetryAfterSeconds(input.retryAfterHeader, now);
  const body = safeJson(bodyText);

  const limited = status === 429 ? rateLimitedError.safeParse(body) : undefined;
  if (limited?.success === true) {
    const { error } = limited.data;
    return {
      kind: "rate_limited",
      status,
      message: error.message,
      retryAfterSeconds: error.retry_after_seconds,
      limit: error.limit,
      windowSeconds: error.window_seconds,
    };
  }

  const insufficient = status === 402 ? insufficientCreditsError.safeParse(body) : undefined;
  if (insufficient?.success === true) {
    const { error } = insufficient.data;
    return {
      kind: "insufficient_credits",
      status,
      message: error.message,
      balanceCredits: error.balance_credits,
      requiredCredits: error.required_credits,
    };
  }

  const debt = status === 402 ? debtOutstandingError.safeParse(body) : undefined;
  if (debt?.success === true) {
    const { error } = debt.data;
    return {
      kind: "debt_outstanding",
      status,
      message: error.message,
      debtCredits: error.debt_credits,
    };
  }

  // The admission gate is recognized on 403 only; without this branch the code,
  // being in `BEHAVIOURAL_CODES`, would be suppressed even on an honest 403.
  const notAdmitted = status === 403 ? accountNotAdmittedError.safeParse(body) : undefined;
  if (notAdmitted?.success === true) {
    return {
      kind: "not_admitted",
      status,
      message: notAdmitted.data.error.message,
    };
  }

  // From here the body is foreign or unparsed. The generic envelope still gives
  // text and code; otherwise the message is built from the status.
  const generic = apiError.safeParse(body);
  const message = generic.success
    ? generic.data.error.message
    : messageFromStatus(status, bodyText);

  // A behavioral code off its own status is dropped, or the report would pair
  // "rate_limited" with `retryable: false`. The body text still reaches `message`.
  const rawCode = generic.success ? generic.data.error.code : undefined;
  const code = rawCode !== undefined && BEHAVIOURAL_CODES.has(rawCode) ? undefined : rawCode;

  if (status === 429) {
    return {
      kind: "rate_limited",
      status,
      message,
      retryAfterSeconds: headerSeconds,
      limit: undefined,
      windowSeconds: undefined,
    };
  }
  if (status >= 500) {
    return { kind: "server_error", status, message, retryAfterSeconds: headerSeconds };
  }
  return { kind: "client_error", status, message, code };
}

/** Message when the body said nothing usable, instead of a parser `SyntaxError` */
/** that looks like a client bug where the server honestly answered 429. */
function messageFromStatus(status: number, bodyText: string | undefined): string {
  // An unread body says nothing about who answered, so no source is guessed.
  if (bodyText === undefined) {
    return `HTTP ${status}: the response body could not be read, so the reason is only known by status`;
  }
  // The source is not named here either: our server or any hop may send a foreign
  // body. The excerpt lets the reader see who answered.
  const tail = excerpt(bodyText);
  const head =
    status === 429
      ? "HTTP 429: too many requests, and the body did not carry a Clipwright error object"
      : `HTTP ${status}: the response body is not a Clipwright error object`;
  return tail === undefined ? head : `${head}. Body: ${tail}`;
}

/** Failure expanded for an agent: numbers, an imperative and a retry flag, in the same */
/** `next_action` shape as `make_ugc` and `get_run`. Built once for MCP, CLI and SDK. */
export interface AgentFailureReport {
  /** Imperative: repeat this same call later, or stop. */
  status: "RETRY_LATER" | "FAILED";
  /** Machine-readable reason; `http_<status>` for foreign bodies. */
  code: string;
  message: string;
  /** Duplicates `status` for code paths: a string is easy to compare wrongly. */
  retryable: boolean;
  next_action: string;
  retry_after_seconds?: number;
  limit?: number;
  window_seconds?: number;
  balance_credits?: number;
  required_credits?: number;
  debt_credits?: number;
}

export function agentFailureReport(failure: ApiFailure): AgentFailureReport {
  const base = { message: failure.message } as const;

  switch (failure.kind) {
    case "rate_limited": {
      const seconds = failure.retryAfterSeconds;
      return {
        ...base,
        status: "RETRY_LATER",
        code: "rate_limited",
        retryable: true,
        // No claim about money: a 429 can hit a status poll of an already charged run.
        // Only the server knows, and its wording arrives in `message`.
        next_action:
          seconds === undefined
            ? "Too many requests. Wait a few seconds, then repeat the SAME call — do not start a new one."
            : `Too many requests. Wait ${seconds} seconds, then repeat the SAME call — do not start a new one.`,
        ...(seconds !== undefined && { retry_after_seconds: seconds }),
        ...(failure.limit !== undefined && { limit: failure.limit }),
        ...(failure.windowSeconds !== undefined && { window_seconds: failure.windowSeconds }),
      };
    }

    case "insufficient_credits":
      return {
        ...base,
        status: "FAILED",
        code: "insufficient_credits",
        retryable: false,
        // Numbers repeat in the imperative: the agent shows one line, and the user
        // needs them to decide how much to buy.
        next_action:
          `STOP. Do NOT retry: this account has ${failure.balanceCredits} credits and the call ` +
          `needs ${failure.requiredCredits}. Retrying cannot change that. Tell the user to top up ` +
          "the balance, then call again. Nothing was charged and no run was created.",
        balance_credits: failure.balanceCredits,
        required_credits: failure.requiredCredits,
      };

    case "debt_outstanding":
      return {
        ...base,
        status: "FAILED",
        code: "debt_outstanding",
        retryable: false,
        // Buying credits is the fix: incoming credits clear debt first. The text differs
        // from `insufficient_credits` because an indebted account may hold a balance.
        next_action:
          `STOP. Do NOT retry: an outstanding debt of ${failure.debtCredits} credits blocks new ` +
          "paid runs. Tell the user to buy credits — incoming credits clear the debt before any " +
          "of them reach the balance. Clearing it lifts this block, but the run still needs " +
          `enough credits of its own: a purchase of exactly ${failure.debtCredits} clears the ` +
          "debt and adds nothing to the balance. Nothing was charged and no run was created.",
        debt_credits: failure.debtCredits,
      };

    case "server_error": {
      const seconds = failure.retryAfterSeconds;
      return {
        ...base,
        status: "RETRY_LATER",
        code: `http_${failure.status}`,
        retryable: true,
        // The source is not named: our server, a corporate gateway and a CDN all send 5xx.
        next_action:
          "The call failed with a server-side error. Repeat the SAME call in a few seconds. If it " +
          "keeps failing, stop and tell the user; do not start a new run with a different " +
          "idempotency key.",
        ...(seconds !== undefined && { retry_after_seconds: seconds }),
      };
    }

    case "not_admitted":
      return {
        ...base,
        status: "FAILED",
        code: "account_not_admitted",
        retryable: false,
        // Nothing in the call to fix and credits do not help. No promise of admission:
        // a deleted, anonymized account answers with the same code.
        next_action:
          "STOP. The account is not admitted to the beta. Do NOT retry and do NOT offer to buy " +
          "credits: neither changes the answer. Tell the user the account has no beta access and " +
          "to ask the operator about it.",
      };

    case "client_error":
      return {
        ...base,
        status: "FAILED",
        code: failure.code ?? `http_${failure.status}`,
        retryable: false,
        next_action:
          "STOP. Do NOT retry: the request itself was rejected, so repeating it unchanged gives " +
          "the same answer. Read the message, fix the call, or tell the user what is wrong.",
      };
  }
}
