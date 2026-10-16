import {
  account as accountSchema,
  type Account,
  ACTORS_PATH,
  actorDefaults,
  actorDefaultsPath,
  type ActorDefaults,
  type ActorDefaultsInput,
  actorItemPath,
  actorsResponse,
  type ActorCatalogEntry,
  CREATE_ACTOR_QUOTE_PATH,
  CREATE_ACTOR_RUN_PATH,
  createActorQuote,
  type CreateActorInputArgs,
  type CreateActorQuote,
  FACELESS_QUOTE_PATH,
  FACELESS_RUN_PATH,
  facelessQuoteResponse,
  type FacelessQuoteResponse,
  makeFacelessInput,
  type MakeFacelessInputArgs,
  agentFailureReport,
  isRetryableFailure,
  parseApiFailure,
  PUBLIC_API_BASE_URL,
  retryDelayMs,
  run as runSchema,
  runRead as runReadSchema,
  runEditPath,
  runEditRead,
  type RunEditRead,
  PUBLIC_WORKFLOWS_PATH,
  PUBLIC_WORKFLOW_PATH,
  WORKFLOW_PLANS_PATH,
  WORKFLOW_PLAN_PATH,
  WORKFLOW_REVISIONS_PATH,
  WORKFLOW_APPROVE_PATH,
  WORKFLOW_QUOTE_PATH,
  WORKFLOW_RUN_PATH,
  runShotsPath,
  runShotsRead,
  type RunShotsRead,
  revisionQuoteRead,
  type RevisionQuoteRead,
  revisionRequest,
  type RevisionRequest,
  runRevisionsPath,
  runRevisionsQuotePath,
  candidateQuoteRead,
  type CandidateQuoteRead,
  candidateRequest,
  type CandidateRequest,
  runCandidatesPath,
  runCandidatesQuotePath,
  runCandidatesRead,
  type RunCandidatesRead,
  type SaveRunEditArgs,
  isTerminal,
  FAILED_STATE,
  quoteResponse,
  RETRY_AFTER_HEADER,
  UPLOADS_PATH,
  uploadResponse,
  type UploadMediaType,
  type UploadResponse,
  voicesResponse,
  type VoicesQuery,
  type VoiceCatalogEntry as CoreVoiceCatalogEntry,
  type AgentFailureReport,
  type ApiFailure,
  type MakeUgcInput,
  type MakeUgcInputArgs,
  type QuoteResponse,
  type Run,
  type RunRead,
} from "@clipwright/core";
import {
  actorIdempotencyKeyFor,
  candidateIdempotencyKeyFor,
  facelessIdempotencyKeyFor,
  idempotencyKeyFor,
  revisionIdempotencyKeyFor,
} from "@clipwright/core/idempotency";
import { createWorkflowPlan, saveWorkflowPlan, approveWorkflowPlan, launchWorkflow,
  workflowCatalogResponseRead, workflowMethodResponseRead, workflowPlanRead, workflowQuoteBindingRead,
  workflowLaunchResponseRead, workflowRunRead, workflowRunIdentityRead, type CreateWorkflowPlanArgs, type SaveWorkflowPlanArgs,
  type ApproveWorkflowPlanArgs, type LaunchWorkflowArgs, type WorkflowCatalogRead, type WorkflowMethodRead,
  type WorkflowPlanRead, type WorkflowQuoteRead, type WorkflowLaunchRead, type WorkflowRunRead } from '@clipwright/core/workflows';

import { resolveClientId } from "./client-id.js";

/** Production API by default; shared with core so every surface names one address. */
const DEFAULT_BASE_URL = PUBLIC_API_BASE_URL;
const workflowPath = (pattern: string, id: string): string => pattern.replace(':id', encodeURIComponent(id));

export interface ClipwrightClientOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  /** Run status polling interval, ms. */
  pollIntervalMs?: number | undefined;
  /** Timeout of ONE request, ms (default 30_000). `maxWaitMs` bounds the */
  /** whole `makeUgc`; this bounds each call separately. */
  requestTimeoutMs?: number | undefined;
}

/** Run start options. `attempt` sets the `:N` suffix; an explicit key overrides it. */
export interface StartUgcOptions {
  /** Attempt number (default 1) → `:N` suffix of the idempotency key. */
  attempt?: number | undefined;
  /** Explicit key for an intentionally new run; overrides the computed one. */
  idempotencyKey?: string | undefined;
}

/** Options of the blocking `makeUgc`: `attempt` plus a polling deadline. */
export interface MakeUgcOptions {
  attempt?: number | undefined;
  /** Deadline for reaching a terminal state, ms (default 10 min). */
  maxWaitMs?: number | undefined;
}

/** Default polling deadline: several times the expected render time. */
const DEFAULT_MAX_WAIT_MS = 600_000;

/** Default per-request timeout. Node's `fetch` has none, so a silent */
/** accepted connection would hang forever. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Max delay of ONE `setTimeout` (2^31−1 ms); a larger value fires after 0 ms. */
/** A platform limit, so it lives here and not in core. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Milliseconds, or a loud rejection: silently defaulting a `NaN` would hide */
/** a misconfiguration. `undefined` means "not set" and takes the fallback. */
function positiveMs(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number of milliseconds, got ${String(value)}`);
  }
  return value;
}

/** An unparseable server response, distinct from rejected input: after */
/** `POST /run` the run may already exist and be charged. */
export class ClipwrightResponseError extends Error {
  /** Path whose response failed to parse. */
  readonly path: string;
  /** Whether the request may already have changed state (created a run, spent credits). */
  readonly mayHaveTakenEffect: boolean;
  /** `false` means delivery is unconfirmed, not that it failed: HTTP cannot */
  /** tell a lost request from a lost response. */
  readonly deliveryConfirmed: boolean;

  constructor(
    path: string,
    mayHaveTakenEffect: boolean,
    cause: unknown,
    deliveryConfirmed = true,
  ) {
    super(ClipwrightResponseError.#describe(path, mayHaveTakenEffect, deliveryConfirmed), { cause });
    this.name = "ClipwrightResponseError";
    this.path = path;
    this.mayHaveTakenEffect = mayHaveTakenEffect;
    this.deliveryConfirmed = deliveryConfirmed;
  }

  /** Three messages because the money differs; none blames the server, since a */
  /** gateway or CDN may have sent the off-contract response. */
  static #describe(
    path: string,
    mayHaveTakenEffect: boolean,
    deliveryConfirmed: boolean,
  ): string {
    if (!mayHaveTakenEffect) {
      // About money only: a call on this branch may still have stored something, a draft for one.
      const free = "No run was created and no credits were spent, and a retry creates no run and spends none.";
      return deliveryConfirmed
        ? `The response to ${path} did not match the Clipwright contract. ${free}`
        : `The request to ${path} failed before an answer arrived. ${free}`;
    }
    const tail =
      "Check your recent runs before retrying: a retry with a new idempotency key would pay twice.";
    return deliveryConfirmed
      ? `The response to ${path} did not match the Clipwright contract. ` +
          `The request was already sent, so a run may have been created and charged. ${tail}`
      : `The request to ${path} failed before an answer arrived, so it is unknown whether it was ` +
          `delivered — a run may have been created and charged. ${tail}`;
  }
}

function parseResponse<T>(
  schema: { parse: (value: unknown) => T },
  body: unknown,
  path: string,
  mayHaveTakenEffect: boolean,
): T {
  try {
    return schema.parse(body);
  } catch (cause) {
    throw new ClipwrightResponseError(path, mayHaveTakenEffect, cause);
  }
}

/** Attempt number → idempotency key suffix. A different key is a different paid */
/** render, so garbage such as `NaN` is rejected instead of passed through. */
function attemptSuffix(attempt: number | undefined): number {
  if (attempt === undefined) return 1;
  // `isSafeInteger`: beyond the safe range distinct numbers collapse into one,
  // and a requested new render would silently return the old run.
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new TypeError(
      `attempt must be a positive integer (1, 2, 3, …), got ${String(attempt)}. ` +
        "It selects which paid run to deduplicate against, so a wrong value can start a second render.",
    );
  }
  return attempt;
}

/** Sleep of any length as a CHAIN of timers: clamping would send the next */
/** request earlier than the server allowed. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // A non-number must end the sleep: with `NaN` the loop would schedule
    // timers forever and keep the process alive.
    let left = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
    const tick = (): void => {
      if (left <= 0) {
        resolve();
        return;
      }
      const step = Math.min(left, MAX_TIMER_DELAY_MS);
      left -= step;
      setTimeout(tick, step);
    };
    tick();
  });
}

/** One `/v1/voices` preset, derived from the response schema so the two */
/** shapes cannot drift apart. */
export type VoiceCatalogEntry = CoreVoiceCatalogEntry;

/** An API refusal with status, code and server-set pause intact. The shape */
/** comes from core, so SDK, CLI and MCP answer "retry or not" identically. */
export class ClipwrightApiError extends Error {
  /** Parsed refusal: kind, numbers, pause. Shape comes from core. */
  readonly failure: ApiFailure;
  readonly status: number;
  /** Refusal code; `http_<status>` for foreign bodies without one. */
  readonly code: string;
  /** Server-set pause in seconds; `undefined` if the server named none. */
  readonly retryAfterSeconds: number | undefined;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ClipwrightApiError";
    this.failure = failure;
    this.status = failure.status;
    // Code and pause come from the shared report, so CLI and MCP name one
    // refusal with the same words.
    const report = agentFailureReport(failure);
    this.code = report.code;
    this.retryAfterSeconds = report.retry_after_seconds;
  }

  /** Whether repeating the same call makes sense. Core decides, not this surface. */
  get retryable(): boolean {
    return isRetryableFailure(this.failure);
  }

  /** The refusal expanded for an agent: numbers, instruction, retry flag. */
  report(): AgentFailureReport {
    return agentFailureReport(this.failure);
  }
}

export class ClipwrightClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #pollIntervalMs: number;
  readonly #requestTimeoutMs: number;
  /** Resolved lazily on first run start: the MCP server builds the client at */
  /** import, and a read-only HOME must not break tools that never need it. */
  #clientId?: string;

  constructor(opts: ClipwrightClientOptions) {
    this.#apiKey = opts.apiKey;
    this.#baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.#pollIntervalMs = positiveMs(opts.pollIntervalMs, 5_000, "pollIntervalMs");
    this.#requestTimeoutMs = positiveMs(
      opts.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
    );
  }

  /** Lazy resolve and cache of the install identity (see `#clientId`). */
  #getClientId(): string {
    if (this.#clientId === undefined) {
      this.#clientId = resolveClientId();
    }
    return this.#clientId;
  }

  /** One API request. The body is read as text, not `res.json()`: a proxy may */
  /** return HTML, and the status must decide before the body is parsed. */
  async #request(
    path: string,
    /** Whether THIS call could change server state; only the caller knows. */
    mayHaveTakenEffect: boolean,
    init?: RequestInit,
  ): Promise<unknown> {
    // Anything failing after send is reported alike: a failed `fetch` does not
    // disprove delivery, so a paid path says "unknown".
    let res: Response;
    // Cancellation reaches the network: a per-request timeout plus the caller's
    // signal, pulled out of `init` so it cannot bypass the timeout.
    const { signal: callerSignal, ...rest } = init ?? {};
    const timeout = AbortSignal.timeout(this.#requestTimeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    try {
      res = await fetch(`${this.#baseUrl}${path}`, {
        ...rest,
        signal,
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          ...rest.headers,
        },
      });
    } catch (cause) {
      // On free paths the network error stays itself: its own message (DNS,
      // refused connection) is more useful than our wrapper.
      if (!mayHaveTakenEffect) throw cause;
      throw new ClipwrightResponseError(path, true, cause, false);
    }

    // Headers are read before the body, which may never finish arriving.
    const retryAfterHeader = res.headers.get(RETRY_AFTER_HEADER);

    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch (cause) {
      // A broken body read must not erase a known status: a 429 while polling
      // stays retryable instead of abandoning a paid run.
      if (!res.ok) {
        throw new ClipwrightApiError(
          // `undefined`, not an empty string: the body is unavailable, not empty.
          parseApiFailure({ status: res.status, bodyText: undefined, retryAfterHeader }),
        );
      }
      throw new ClipwrightResponseError(path, mayHaveTakenEffect, cause);
    }

    if (!res.ok) {
      throw new ClipwrightApiError(
        parseApiFailure({
          status: res.status,
          bodyText,
          retryAfterHeader,
        }),
      );
    }

    // 204 means "no body" (actor deletion answers so); parsing the empty string
    // would report a contract violation that never happened.
    if (res.status === 204) return undefined;

    try {
      return JSON.parse(bodyText) as unknown;
    } catch (cause) {
      // Same class as a schema failure: a non-JSON body is also an off-contract
      // response and must carry the "may have been charged" warning.
      throw new ClipwrightResponseError(path, mayHaveTakenEffect, cause);
    }
  }

  /** Cost estimate; spends no credits. */
  async quoteUgc(input: MakeUgcInputArgs): Promise<QuoteResponse> {
    const body = await this.#request("/v1/skills/make_ugc/quote", false, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseResponse(quoteResponse, body, "/v1/skills/make_ugc/quote", false);
  }

  /** Starts a render and returns the run at once (state=queued). The key is built */
  /** here with an always-present `:N` suffix, so MCP and CLI dedupe alike. */
  async startUgc(input: MakeUgcInputArgs, opts?: StartUgcOptions): Promise<Run> {
    return this.#startUgc(input, opts);
  }

  /** `signal` is internal only: the `makeUgc` deadline also aborts the start. */
  async #startUgc(
    input: MakeUgcInputArgs,
    opts?: StartUgcOptions,
    signal?: AbortSignal,
  ): Promise<Run> {
    const key = opts?.idempotencyKey ?? `${idempotencyKeyFor(input, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;

    // `true`: once sent, the run may have been created and charged.
    const body = await this.#request("/v1/skills/make_ugc/run", true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": key },
      signal: signal ?? null,
    });
    return parseResponse(runSchema, body, "/v1/skills/make_ugc/run", true);
  }

  /** Uploads an image; returns its reference for later runs. */
  async uploadImage(
    bytes: Uint8Array<ArrayBuffer>,
    mediaType: UploadMediaType,
  ): Promise<UploadResponse> {
    const body = await this.#request(UPLOADS_PATH, true, {
      method: "POST",
      body: bytes,
      headers: { "Content-Type": mediaType },
    });
    return parseResponse(uploadResponse, body, UPLOADS_PATH, true);
  }

  /** Curated voice catalog for `voice`/`voice_id`; other voices stay reachable by raw `voice_id`. */
  async listVoices(filters: VoicesQuery = {}): Promise<VoiceCatalogEntry[]> {
    // Keys pass as is: the server rejects an unknown one (`unknown_field`); the client does not strip it.
    const query = new URLSearchParams(
      Object.entries(filters).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const body = await this.#request(query === "" ? "/v1/voices" : `/v1/voices?${query}`, false);
    // Parsed with the server's own schema, so a malformed body fails here and
    // not later in the caller.
    return parseResponse(voicesResponse, body, "/v1/voices", false).voices;
  }

  /** Account state via `GET /v1/account`. Free. */
  async getAccount(): Promise<Account> {
    const body = await this.#request("/v1/account", false);
    return parseResponse(accountSchema, body, "/v1/account", false);
  }

  async listActors(): Promise<ActorCatalogEntry[]> {
    const body = await this.#request(ACTORS_PATH, false);
    return parseResponse(actorsResponse, body, ACTORS_PATH, false).actors;
  }

  async getActorDefaults(id: string): Promise<ActorDefaults> {
    const path = actorDefaultsPath(id);
    return parseResponse(actorDefaults, await this.#request(path, false), path, false);
  }

  async setActorDefaults(id: string, input: ActorDefaultsInput): Promise<ActorDefaults> {
    const path = actorDefaultsPath(id);
    const body = await this.#request(path, false, { method: "POST", body: JSON.stringify(input) });
    return parseResponse(actorDefaults, body, path, false);
  }

  /** `create_actor` estimate; spends no credits. */
  async quoteActor(input: CreateActorInputArgs): Promise<CreateActorQuote> {
    const body = await this.#request(CREATE_ACTOR_QUOTE_PATH, false, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseResponse(createActorQuote, body, CREATE_ACTOR_QUOTE_PATH, false);
  }

  /** Starts `create_actor`; returns the run at once (state=queued), like `startUgc`. */
  /** The key uses its own schema: the `make_ugc` one would strip actor fields. */
  async createActor(input: CreateActorInputArgs, opts?: StartUgcOptions): Promise<Run> {
    const key =
      opts?.idempotencyKey ??
      `${actorIdempotencyKeyFor(input, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    // `true`: once sent, the run may have been created and charged.
    const body = await this.#request(CREATE_ACTOR_RUN_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": key },
    });
    return parseResponse(runSchema, body, CREATE_ACTOR_RUN_PATH, true);
  }

  /** `make_faceless` estimate; spends no credits. Mismatched script/brief is refused before sending. */
  async quoteFaceless(input: MakeFacelessInputArgs): Promise<FacelessQuoteResponse> {
    const parsed = makeFacelessInput.parse(input);
    const body = await this.#request(FACELESS_QUOTE_PATH, false, {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    return parseResponse(facelessQuoteResponse, body, FACELESS_QUOTE_PATH, false);
  }

  /** Starts `make_faceless`; returns the run at once (state=queued), keyed like `createActor`. */
  async startFaceless(input: MakeFacelessInputArgs, opts?: StartUgcOptions): Promise<Run> {
    const parsed = makeFacelessInput.parse(input);
    const key =
      opts?.idempotencyKey ??
      `${facelessIdempotencyKeyFor(parsed, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    // `true`: once sent, the run may have been created and charged.
    const body = await this.#request(FACELESS_RUN_PATH, true, {
      method: "POST",
      body: JSON.stringify(parsed),
      headers: { "Idempotency-Key": key },
    });
    return parseResponse(runSchema, body, FACELESS_RUN_PATH, true);
  }

  /** What a revision of a run would change and cost; spends no credits. Read tolerantly, as the shots are. */
  async quoteRevision(runId: string, request: RevisionRequest): Promise<RevisionQuoteRead> {
    const parsed = revisionRequest.parse(request);
    const path = runRevisionsQuotePath(runId);
    const body = await this.#request(path, false, { method: "POST", body: JSON.stringify(parsed) });
    return parseResponse(revisionQuoteRead, body, path, false);
  }

  /** Starts a revision: a new run, returned at once (state=queued). The same request and attempt send the same key, */
  /** so a resend returns the first run; `attempt: 2` starts a deliberate second one. */
  async startRevision(runId: string, request: RevisionRequest, opts?: StartUgcOptions): Promise<RunRead> {
    const parsed = revisionRequest.parse(request);
    const key =
      opts?.idempotencyKey ??
      `${revisionIdempotencyKeyFor(runId, parsed, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const path = runRevisionsPath(runId);
    // `true`: once sent, the run may have been created and its credits held.
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(parsed), headers: { "Idempotency-Key": key } });
    // Read as `#getRun` reads: a billing unit of a newer server must not throw after the credits are held.
    const read = runReadSchema.safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  /** What one shot candidate would cost; spends no credits. Read tolerantly, as a revision quote is. */
  async quoteCandidate(runId: string, request: CandidateRequest): Promise<CandidateQuoteRead> {
    const parsed = candidateRequest.parse(request);
    const path = runCandidatesQuotePath(runId);
    const body = await this.#request(path, false, { method: "POST", body: JSON.stringify(parsed) });
    return parseResponse(candidateQuoteRead, body, path, false);
  }

  /** Starts a shot candidate: a new run, returned at once (state=queued). The key is the run and the request with */
  /** its `take`, so a resend returns the first run; `take: 2` makes a deliberate second candidate. */
  async createCandidate(runId: string, request: CandidateRequest, opts?: { idempotencyKey?: string | undefined }): Promise<RunRead> {
    const parsed = candidateRequest.parse(request);
    const key = opts?.idempotencyKey ?? candidateIdempotencyKeyFor(runId, parsed, this.#getClientId());
    const path = runCandidatesPath(runId);
    // `true`: once sent, the run may have been created and its unit held.
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(parsed), headers: { "Idempotency-Key": key } });
    const read = runReadSchema.safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  /** The shot candidates of a run's family, oldest first, each with its state, charge and preview. Free. */
  async listCandidates(runId: string): Promise<RunCandidatesRead> {
    const path = runCandidatesPath(runId);
    return parseResponse(runCandidatesRead, await this.#request(path, false), path, false);
  }

  /** Deletes a personal actor. The answer is 204 with no body. */
  async deleteActor(id: string): Promise<void> {
    await this.#request(actorItemPath(id), true, { method: "DELETE" });
  }

  /** Reads a run tolerantly (`state: string`): a newer server stage must not */
  /** break installed clients, so parsing falls back to the raw body. */
  async getRun(runId: string): Promise<WorkflowRunRead> {
    return this.#getRun(runId);
  }

  /** `signal` is internal only: the `makeUgc` deadline also aborts the poll. */
  async #getRun(runId: string, signal?: AbortSignal): Promise<WorkflowRunRead> {
    const path = `/v1/runs/${runId}`, body = await this.#request(path, false, { signal: signal ?? null });
    const parsed = workflowRunRead.safeParse(body);
    if (parsed.success) return parsed.data;
    if (body !== null && typeof body === 'object' && 'workflow' in body) parseResponse(workflowRunIdentityRead, body, path, false);
    return body as WorkflowRunRead;
  }

  async listWorkflows(): Promise<WorkflowCatalogRead> {
    return parseResponse(workflowCatalogResponseRead, await this.#request(PUBLIC_WORKFLOWS_PATH, false), PUBLIC_WORKFLOWS_PATH, false);
  }
  async getWorkflow(methodId: string): Promise<WorkflowMethodRead> {
    const path = workflowPath(PUBLIC_WORKFLOW_PATH, methodId);
    return parseResponse(workflowMethodResponseRead, await this.#request(path, false), path, false);
  }
  async createWorkflowPlan(input: CreateWorkflowPlanArgs): Promise<WorkflowPlanRead> {
    const parsed = createWorkflowPlan.parse(input), path = WORKFLOW_PLANS_PATH;
    return parseResponse(workflowPlanRead, await this.#request(path, false, { method: 'POST', body: JSON.stringify(parsed) }), path, false);
  }
  async getWorkflowPlan(planId: string): Promise<WorkflowPlanRead> {
    const path = workflowPath(WORKFLOW_PLAN_PATH, planId);
    return parseResponse(workflowPlanRead, await this.#request(path, false), path, false);
  }
  async saveWorkflowPlan(planId: string, input: SaveWorkflowPlanArgs): Promise<WorkflowPlanRead> {
    const parsed = saveWorkflowPlan.parse(input), path = workflowPath(WORKFLOW_REVISIONS_PATH, planId);
    return parseResponse(workflowPlanRead, await this.#request(path, false, { method: 'POST', body: JSON.stringify(parsed) }), path, false);
  }
  async approveWorkflowPlan(planId: string, input: ApproveWorkflowPlanArgs): Promise<WorkflowPlanRead> {
    const parsed = approveWorkflowPlan.parse(input), path = workflowPath(WORKFLOW_APPROVE_PATH, planId);
    return parseResponse(workflowPlanRead, await this.#request(path, false, { method: 'POST', body: JSON.stringify(parsed) }), path, false);
  }
  async quoteWorkflowPlan(planId: string): Promise<WorkflowQuoteRead> {
    const path = workflowPath(WORKFLOW_QUOTE_PATH, planId);
    return parseResponse(workflowQuoteBindingRead, await this.#request(path, false, { method: 'POST' }), path, false);
  }
  async runWorkflowPlan(planId: string, input: LaunchWorkflowArgs): Promise<WorkflowLaunchRead> {
    const parsed = launchWorkflow.parse(input), path = workflowPath(WORKFLOW_RUN_PATH, planId);
    const headers = new Headers({ 'Idempotency-Key': parsed.idempotency_key });
    if (headers.get('Idempotency-Key') !== parsed.idempotency_key) throw new TypeError('Idempotency key must survive HTTP header encoding unchanged');
    const result = parseResponse(workflowLaunchResponseRead, await this.#request(path, true, {
      method: 'POST', body: JSON.stringify(parsed), headers: Object.fromEntries(headers.entries()),
    }), path, true);
    if (result.receipt.plan_id !== planId || result.receipt.revision !== parsed.revision ||
      result.receipt.content_digest !== parsed.content_digest || result.receipt.semantic_input_digest !== parsed.semantic_input_digest)
      throw new ClipwrightResponseError(path, true, new Error('Workflow receipt must identify the requested purchase'));
    return result;
  }

  /** The shots of a run, read tolerantly: a kind, action or line of a newer server still parses. Free. */
  async getRunShots(runId: string): Promise<RunShotsRead> {
    const path = runShotsPath(runId);
    return parseResponse(runShotsRead, await this.#request(path, false), path, false);
  }

  /** The draft of a run's edit, read as tolerantly. Version 0 is a run with nothing stored. Free. */
  async getRunEdit(runId: string): Promise<RunEditRead> {
    const path = runEditPath(runId);
    return parseResponse(runEditRead, await this.#request(path, false), path, false);
  }

  /** Saves the draft against the version it was read at; charges nothing. One request, never repeated */
  /** here: after a lost answer the same save answers `edit_conflict`, and a read of the draft tells why. */
  async saveRunEdit(runId: string, input: SaveRunEditArgs): Promise<RunEditRead> {
    const path = runEditPath(runId);
    // `false`: a save creates no run and reserves no credits, which is what that flag warns about.
    const body = await this.#request(path, false, {
      method: "POST",
      body: JSON.stringify({ base_version: input.base_version, document: input.document }),
    });
    return parseResponse(runEditRead, body, path, false);
  }

  /** Start plus polling to a terminal state. `maxWaitMs` is one deadline that */
  /** aborts both the pause and the request itself. */
  async makeUgc(
    input: MakeUgcInputArgs,
    opts?: MakeUgcOptions,
    onProgress?: (run: RunRead) => void,
  ): Promise<RunRead> {
    const maxWaitMs = positiveMs(opts?.maxWaitMs, DEFAULT_MAX_WAIT_MS, "maxWaitMs");
    const deadline = Date.now() + maxWaitMs;
    // The deadline as an abort signal, capped like `sleep`.
    const callDeadline = AbortSignal.timeout(Math.min(maxWaitMs, MAX_TIMER_DELAY_MS));

    // Widened to `RunRead` for the tolerant `getRun`. A start aborted by the
    // deadline propagates as is: the run may have been charged.
    let current: RunRead = await this.#startUgc(input, { attempt: opts?.attempt }, callDeadline);

    // Pause before the NEXT poll; a refused poll replaces it with the server's.
    let nextDelayMs = this.#pollIntervalMs;
    // Kept only to explain a timeout: throttled and merely slow runs differ.
    let lastRetried: ClipwrightApiError | undefined;

    /** One timeout message for both places the deadline fires. */
    const timedOut = (): Error =>
      new Error(
        `makeUgc timed out after ${maxWaitMs}ms; run ${current.run_id} is still ` +
          `${current.state}. Poll it later with getRun("${current.run_id}").` +
          (lastRetried === undefined
            ? ""
            : ` The last status check was refused with HTTP ${lastRetried.status}: ` +
              `${lastRetried.message}`),
      );

    // Shared `isTerminal`: an unknown server state is polled until `maxWaitMs`
    // and ends in a clean timeout with `run_id`, not an endless loop.
    while (!isTerminal(current.state)) {
      // One deadline per call, never reset by a retry; otherwise a chain of 429s
      // would extend the wait forever.
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timedOut();
      await sleep(Math.min(nextDelayMs, remaining));

      try {
        // Preserve makeUgc's legacy result type and its existing permissive native read fallback.
        current = await this.#getRun(current.run_id, callDeadline) as RunRead;
        nextDelayMs = this.#pollIntervalMs;
        onProgress?.(current);
      } catch (error) {
        // A deadline that aborts the poll itself is the same timeout.
        if (callDeadline.aborted && !(error instanceof ClipwrightApiError)) throw timedOut();
        // A refused poll is not a failed run: retry only what core calls
        // retryable; 402 and other 4xx propagate at once.
        if (!(error instanceof ClipwrightApiError) || !isRetryableFailure(error.failure)) {
          throw error;
        }
        lastRetried = error;
        nextDelayMs = retryDelayMs(error.failure, this.#pollIntervalMs);
      }
    }
    // Outcome by core's named constant, not an array index that reordering
    // could silently invert.
    if (current.state === FAILED_STATE) {
      throw new Error(current.error ?? "run failed");
    }
    return current;
  }
}

export { resolveClientId } from "./client-id.js";
// Re-exported so an SDK-only consumer can type `ClipwrightApiError` fully
// without depending on core.
export type { AgentFailureReport, ApiFailure };
export type { MakeUgcInput, MakeUgcInputArgs, QuoteResponse, Run, RunRead };
export type { FacelessQuoteResponse, MakeFacelessInputArgs };
export type { RunEditRead, RunShotsRead, SaveRunEditArgs };
export type { RevisionQuoteRead, RevisionRequest };
export type { CandidateQuoteRead, CandidateRequest, RunCandidatesRead };
export type { CreateWorkflowPlanArgs, SaveWorkflowPlanArgs, ApproveWorkflowPlanArgs, LaunchWorkflowArgs,
  WorkflowCatalogRead, WorkflowMethodRead, WorkflowPlanRead, WorkflowQuoteRead, WorkflowLaunchRead, WorkflowRunRead };
