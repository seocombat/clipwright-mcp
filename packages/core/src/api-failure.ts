import { z } from "zod";
import {
  accountNotAdmittedError,
  apiError,
  debtOutstandingError,
  editCeilingReachedError,
  editConflictError,
  editingDisabledError,
  editingNotPricedError,
  editInvalidError,
  insufficientCreditsError,
  maxCreditsExceededError,
  runNotEditableError,
  type BareApiErrorCode,
} from "./errors.js";
import type { DiyNext } from "./diy-next.js";
import { PUBLIC_APP_BASE_URL } from "./public-endpoints.js";
import { rateLimitedError } from "./rate-limit.js";
import { workflowCommandErrorRead } from "./contracts/v1/workflow-execution.js";

export interface RateLimitedFailure extends WorkflowDiagnostics {
  kind: "rate_limited";
  status: number;
  message: string;
  retryAfterSeconds: number | undefined;
  limit: number | undefined;
  windowSeconds: number | undefined;
}

export interface InsufficientCreditsFailure {
  kind: "insufficient_credits";
  status: number;
  message: string;
  balanceCredits: number;
  requiredCredits: number;
}

export interface MaxCreditsExceededFailure {
  kind: "max_credits_exceeded";
  status: number;
  message: string;
  holdCredits: number;
  maxCredits: number;
}

export interface DebtOutstandingFailure {
  kind: "debt_outstanding";
  status: number;
  message: string;
  debtCredits: number;
}

export interface NotAdmittedFailure {
  kind: "not_admitted";
  status: number;
  message: string;
}

export interface EditConflictFailure {
  kind: "edit_conflict";
  status: number;
  message: string;
  version: number;
}

export interface RunNotEditableFailure {
  kind: "run_not_editable";
  status: number;
  message: string;
  state: string;
  reason: string | null;
}

export interface EditingClosedFailure {
  kind: "editing_closed";
  status: number;
  message: string;
  code: string;
  reason: string | null;
  seams: string[] | null;
}

export interface EditCeilingReachedFailure {
  kind: "edit_ceiling_reached";
  status: number;
  message: string;
  limit: string;
  rootRunId: string;
  allowed: number;
  counted: number;
  runIds: string[];
}

export interface EditIssueRead {
  code: string;
  message: string;
  shot_id?: string | undefined;
  from_frame?: number | undefined;
  to_frame?: number | undefined;
}

export interface EditInvalidFailure {
  kind: "edit_invalid";
  status: number;
  message: string;
  issues: EditIssueRead[];
}

type WorkflowFailureKind = z.infer<typeof workflowCommandErrorRead>["error"]["code"];
interface WorkflowDiagnostics {
  issues?: z.infer<typeof workflowCommandErrorRead>["error"]["issues"];
  warnings?: string[];
}
export type WorkflowFailure = { [Kind in WorkflowFailureKind]: {
  kind: Kind;
  status: number;
  message: string;
  issues: z.infer<typeof workflowCommandErrorRead>["error"]["issues"];
  warnings: string[];
} }[WorkflowFailureKind];

export interface ServerFailure extends WorkflowDiagnostics {
  kind: "server_error";
  status: number;
  message: string;
  retryAfterSeconds: number | undefined;
}

export interface ClientFailure extends WorkflowDiagnostics {
  kind: "client_error";
  status: number;
  message: string;
  code: string | undefined;
  next?: DiyNext;
}

export type ApiFailure =
  | RateLimitedFailure
  | InsufficientCreditsFailure
  | MaxCreditsExceededFailure
  | DebtOutstandingFailure
  | NotAdmittedFailure
  | EditConflictFailure
  | RunNotEditableFailure
  | EditingClosedFailure
  | EditCeilingReachedFailure
  | EditInvalidFailure
  | WorkflowFailure
  | ServerFailure
  | ClientFailure;

export function isRetryableFailure(failure: ApiFailure): boolean {
  return failure.kind === "rate_limited" || failure.kind === "server_error";
}

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

const IMF_FIXDATE = new RegExp(
  `^(?:${DAY_SHORT}), (\\d{2}) (${MONTH}) (\\d{4}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`,
);

const RFC850_DATE = new RegExp(
  `^(?:${DAY_LONG}), (\\d{2})-(${MONTH})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`,
);

const ASCTIME_DATE = new RegExp(
  `^(?:${DAY_SHORT}) (${MONTH}) ([ \\d]\\d) (\\d{2}):(\\d{2}):(\\d{2}) (\\d{4})$`,
);

function httpDateToEpochMs(raw: string, now: Date): number | undefined {
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

    if (year < 1900) return undefined;

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

  const at = httpDateToEpochMs(trimmed, now);
  if (at === undefined || Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now.getTime()) / 1000));
}

const BODY_EXCERPT_LIMIT = 200;

function excerpt(bodyText: string | undefined): string | undefined {
  if (bodyText === undefined) return undefined;
  const flat = bodyText.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return undefined;
  return flat.length > BODY_EXCERPT_LIMIT ? `${flat.slice(0, BODY_EXCERPT_LIMIT)}…` : flat;
}

function safeJson(bodyText: string | undefined): unknown {
  if (bodyText === undefined) return undefined;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

const BEHAVIOURAL_CODES = new Set<string>([
  rateLimitedError.shape.error.shape.code.value,
  insufficientCreditsError.shape.error.shape.code.value,
  maxCreditsExceededError.shape.error.shape.code.value,
  debtOutstandingError.shape.error.shape.code.value,
  accountNotAdmittedError.shape.error.shape.code.value,
  editConflictError.shape.error.shape.code.value,
  runNotEditableError.shape.error.shape.code.value,
  editingDisabledError.shape.error.shape.code.value,
  editingNotPricedError.shape.error.shape.code.value,
  "editing_window_not_set" satisfies BareApiErrorCode,
  editCeilingReachedError.shape.error.shape.code.value,
  editInvalidError.shape.error.shape.code.value,
  ...workflowCommandErrorRead.shape.error.shape.code.options,
]);

const editingClosedRead = z.union([
  z.object({ error: editingDisabledError.shape.error.extend({ reason: z.string().min(1) }) }),
  z.object({ error: editingNotPricedError.shape.error.extend({ seams: z.array(z.string().min(1)) }) }),
  z.object({ error: apiError.shape.error.extend({ code: z.literal("editing_window_not_set" satisfies BareApiErrorCode) }) }),
]);
const editCeilingReachedRead = z.object({ error: editCeilingReachedError.shape.error.extend({ limit: z.string().min(1) }) });
const editInvalidRead = z.object({
  error: editInvalidError.shape.error.extend({
    issues: z.array(editInvalidError.shape.error.shape.issues.element.extend({ code: z.string().min(1) })).min(1),
  }),
});

export interface ApiFailureInput {
  status: number;
  bodyText: string | undefined;
  retryAfterHeader?: string | null | undefined;
  now?: Date;
}

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

  const overMax = status === 402 ? maxCreditsExceededError.safeParse(body) : undefined;
  if (overMax?.success === true) {
    const { error } = overMax.data;
    return { kind: "max_credits_exceeded", status, message: error.message, holdCredits: error.hold_credits, maxCredits: error.max_credits };
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

  const notAdmitted = status === 403 ? accountNotAdmittedError.safeParse(body) : undefined;
  if (notAdmitted?.success === true) {
    return {
      kind: "not_admitted",
      status,
      message: notAdmitted.data.error.message,
    };
  }

  const conflict = status === 409 ? editConflictError.safeParse(body) : undefined;
  if (conflict?.success === true) {
    const { error } = conflict.data;
    return { kind: "edit_conflict", status, message: error.message, version: error.version };
  }

  const notEditable = status === 409 ? runNotEditableError.safeParse(body) : undefined;
  if (notEditable?.success === true) {
    const { error } = notEditable.data;
    return { kind: "run_not_editable", status, message: error.message, state: error.state, reason: error.reason };
  }

  const closed = status === 503 ? editingClosedRead.safeParse(body) : undefined;
  if (closed?.success === true) {
    const { error } = closed.data;
    return { kind: "editing_closed", status, message: error.message, code: error.code,
      reason: "reason" in error ? error.reason : null, seams: "seams" in error ? error.seams : null };
  }

  const ceiling = status === 409 ? editCeilingReachedRead.safeParse(body) : undefined;
  if (ceiling?.success === true) {
    const { error } = ceiling.data;
    return { kind: "edit_ceiling_reached", status, message: error.message, limit: error.limit,
      rootRunId: error.root_run_id, allowed: error.allowed, counted: error.counted, runIds: error.run_ids };
  }

  const invalid = status === 422 ? editInvalidRead.safeParse(body) : undefined;
  if (invalid?.success === true) {
    const { error } = invalid.data;
    return { kind: "edit_invalid", status, message: error.message, issues: error.issues };
  }

  const workflow = workflowCommandErrorRead.safeParse(body);
  if (workflow?.success && status === (workflow.data.error.code === "workflow_invalid" ? 400 : 409)) {
    const { error } = workflow.data;
    return { kind: error.code, status, message: error.message, issues: error.issues, warnings: error.warnings };
  }

  const generic = apiError.safeParse(body);
  const message = generic.success
    ? generic.data.error.message
    : messageFromStatus(status, bodyText);

  const rawCode = generic.success ? generic.data.error.code : undefined;
  const code = rawCode !== undefined && BEHAVIOURAL_CODES.has(rawCode) ? undefined : rawCode;
  const diagnostics = workflow.success ? { issues: workflow.data.error.issues, warnings: workflow.data.error.warnings } : {};

  if (status === 429) {
    return {
      kind: "rate_limited",
      ...diagnostics,
      status,
      message,
      retryAfterSeconds: headerSeconds,
      limit: undefined,
      windowSeconds: undefined,
    };
  }
  if (status === 503 && (code === "generations_disabled" || code === "generations_marking_pending" || code === "assets_disabled"
    || code === "url_import_disabled")) {
    return { kind: "client_error", ...diagnostics, status, message, code };
  }
  if (status >= 500) {
    return { kind: "server_error", ...diagnostics, status, message, retryAfterSeconds: headerSeconds };
  }
  const next = generic.success ? generic.data.error.next : undefined;
  return { kind: "client_error", ...diagnostics, status, message, code, ...(next && { next }) };
}

function messageFromStatus(status: number, bodyText: string | undefined): string {
  if (bodyText === undefined) {
    return `HTTP ${status}: the response body could not be read, so the reason is only known by status`;
  }
  const tail = excerpt(bodyText);
  const head =
    status === 429
      ? "HTTP 429: too many requests, and the body did not carry a Clipwright error object"
      : `HTTP ${status}: the response body is not a Clipwright error object`;
  return tail === undefined ? head : `${head}. Body: ${tail}`;
}

export interface AgentFailureReport {
  status: "RETRY_LATER" | "FAILED";
  code: string;
  message: string;
  retryable: boolean;
  next_action: string;
  retry_after_seconds?: number;
  limit?: number;
  window_seconds?: number;
  balance_credits?: number;
  required_credits?: number;
  debt_credits?: number;
  hold_credits?: number;
  max_credits?: number;
  version?: number;
  state?: string;
  reason?: string | null;
  seams?: string[] | null;
  ceiling?: string;
  root_run_id?: string;
  allowed?: number;
  counted?: number;
  run_ids?: string[];
  issues?: EditIssueRead[] | WorkflowFailure["issues"];
  warnings?: string[];
  next?: DiyNext;
}

export const UPLOAD_NOT_FINISHED_NEXT_ACTION =
  "Finish the upload first: PUT the file to the put_url from create_upload with the given put_headers, confirm it " +
  "with get_upload, then repeat this call. If the message says the upload is finishing, the file is already there: " +
  "wait a few seconds and repeat. If the upload came from an upload page link, the photo has not been dropped yet; " +
  "get_upload returns it once the user has dropped it. Nothing was charged and no run was created.";

export const ASSET_NOT_READY_NEXT_ACTION =
  "Wait for the asset the message names: call get_asset with its id until its state is ready, then repeat this same call unchanged. " +
  "If get_asset says it failed, create the asset again. Nothing was charged and no run was created.";

export const UNAUTHORIZED_NEXT_ACTION =
  "STOP. Clipwright did not accept this connection's key or sign-in: it is missing, mistyped or revoked. Nothing was " +
  `charged. With a key, the human creates a new one at ${PUBLIC_APP_BASE_URL}/api-keys (a new account at ` +
  `${PUBLIC_APP_BASE_URL}/auth/sign-up comes with trial credits), puts it in the MCP server's environment as ` +
  "CLIPWRIGHT_API_KEY, never in the chat, and restarts the host. With the hosted connector, the human reconnects it and " +
  "signs in again. Then call get_account, which is free, to confirm.";

export function refusalNextAction(next: DiyNext): string {
  const fields = next.add.length ? ` Change ${next.add.join(", ")} first.` : "";
  return `STOP. Do NOT retry unchanged: ${next.note}${fields} Then call ${next.action} (next has its route and arguments). ` +
    "Nothing was charged and no run was created.";
}

export function agentFailureReport(failure: ApiFailure): AgentFailureReport {
  const base = { message: failure.message,
    ...('issues' in failure && failure.issues !== undefined && { issues: failure.issues }),
    ...('warnings' in failure && failure.warnings !== undefined && { warnings: failure.warnings }) } as const;

  switch (failure.kind) {
    case "rate_limited": {
      const seconds = failure.retryAfterSeconds;
      return {
        ...base,
        status: "RETRY_LATER",
        code: "rate_limited",
        retryable: true,
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
        next_action:
          `STOP. Do NOT retry: this account has ${failure.balanceCredits} credits and the call ` +
          `needs ${failure.requiredCredits}. Retrying cannot change that. Tell the user to top up ` +
          "the balance, then call again. Nothing was charged and no run was created.",
        balance_credits: failure.balanceCredits,
        required_credits: failure.requiredCredits,
      };

    case "max_credits_exceeded":
      return {
        ...base,
        status: "FAILED",
        code: "max_credits_exceeded",
        retryable: false,
        next_action:
          `STOP. Do NOT retry unchanged: this call reserves ${failure.holdCredits} credits, above its max_credits of ` +
          `${failure.maxCredits}. Ask the user to approve ${failure.holdCredits} credits, then repeat the call with max_credits ` +
          "of at least that, or change the request to cost less. Nothing was charged and no run was created.",
        hold_credits: failure.holdCredits,
        max_credits: failure.maxCredits,
      };

    case "debt_outstanding":
      return {
        ...base,
        status: "FAILED",
        code: "debt_outstanding",
        retryable: false,
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
        next_action:
          "STOP. The account is not admitted to the beta. Do NOT retry and do NOT offer to buy " +
          "credits: neither changes the answer. Tell the user the account has no beta access and " +
          "to contact support about it.",
      };

    case "edit_conflict":
      return {
        ...base,
        status: "FAILED",
        code: "edit_conflict",
        retryable: false,
        next_action:
          `STOP. Do NOT repeat this save unchanged: the draft is at version ${failure.version}, and this call ` +
          "stored nothing. Read the draft. If it already holds your document, an earlier save of it went " +
          "through; otherwise apply your change to the draft you read and save it with that draft's version.",
        version: failure.version,
      };

    case "run_not_editable":
      return {
        ...base,
        status: "FAILED",
        code: "run_not_editable",
        retryable: false,
        next_action:
          `STOP. This run has no draft to read or to save: its state is ${failure.state}` +
          `${failure.reason === null ? "" : ` (${failure.reason})`}. Nothing was stored, and the same call ` +
          "gives the same answer while that state stands. The shots of the run state the same state and reason.",
        state: failure.state,
        reason: failure.reason,
      };

    case "editing_closed": {
      const why = failure.seams !== null ? failure.seams.join(", ") : failure.reason;
      return {
        ...base,
        status: "FAILED",
        code: failure.code,
        retryable: false,
        next_action:
          `STOP. Paid edits are not open (${failure.code}${why === null || why === "" ? "" : `: ${why}`}). Nothing was ` +
          "charged and no run was created. Do NOT retry: `paid_edits` on the run's shots says when they open.",
        reason: failure.reason,
        seams: failure.seams,
      };
    }

    case "edit_ceiling_reached": {
      const runs = failure.runIds.join(", ");
      return {
        ...base,
        status: "FAILED",
        code: "edit_ceiling_reached",
        retryable: false,
        next_action: failure.limit === "in_flight"
          ? `STOP. A paid edit of ${failure.rootRunId} is still running (${runs}); follow it with get_run and start the ` +
            "next one after it finishes. If get_run says it is held for review, contact support: only support " +
            "closes it, and it charges nothing."
          : `STOP. ${failure.rootRunId} has ${failure.counted} of ${failure.allowed} ${failure.limit === "failed_or_unfinished"
            ? "failed or unfinished paid edits" : `paid edits counted against its ${failure.limit} limit`}${runs === "" ? "" : ` (${runs})`}; ` +
            "revisions and shot candidates are counted apart, and support can raise the revision limit after a failure " +
            "that was ours. Nothing was charged and no run was created.",
        ceiling: failure.limit,
        root_run_id: failure.rootRunId,
        allowed: failure.allowed,
        counted: failure.counted,
        run_ids: failure.runIds,
      };
    }

    case "edit_invalid":
      return {
        ...base,
        status: "FAILED",
        code: "edit_invalid",
        retryable: false,
        next_action:
          `STOP. Do NOT retry unchanged. Fix the request: ${failure.issues[0]?.message ?? failure.message}. The rules are ` +
          "in the run's shots. Nothing was charged and no run was created.",
        issues: failure.issues,
      };

    case "workflow_invalid":
    case "workflow_conflict":
    case "workflow_not_ready":
      return {
        ...base, status: "FAILED", code: failure.kind, retryable: false,
        issues: failure.issues, warnings: failure.warnings,
        next_action: failure.kind === "workflow_conflict"
          ? "STOP. Read the current plan and compare its revision and quote with the original request. Recover an uncertain purchase with its ORIGINAL request and idempotency key; do not change the key to retry."
          : "STOP. Read the plan and address every issue before purchase. Save the corrected document, obtain approval of its exact revision, then quote it. Approval and a paid launch are separate explicit actions; do not perform them automatically.",
      };

    case "client_error":
      if (failure.status === 409 && (failure.code === "film_asset_not_ready" || failure.code === "asset_not_ready")) return {
        ...base,
        status: "RETRY_LATER",
        code: failure.code,
        retryable: true,
        ...(failure.next && { next: failure.next }),
        next_action: ASSET_NOT_READY_NEXT_ACTION,
      };
      return {
        ...base,
        status: "FAILED",
        code: failure.code ?? `http_${failure.status}`,
        retryable: false,
        ...(failure.next && { next: failure.next }),
        next_action: failure.code === "upload_not_finished" ? UPLOAD_NOT_FINISHED_NEXT_ACTION :
          failure.code === "unauthorized" ? UNAUTHORIZED_NEXT_ACTION :
          failure.next ? refusalNextAction(failure.next) :
          "STOP. Do NOT retry: the request itself was rejected, so repeating it unchanged gives " +
          "the same answer. Read the message, fix the call, or tell the user what is wrong.",
      };
  }
}
