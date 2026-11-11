import {
  createFilmDraftInput,
  type CreateFilmDraftInput,
  checkFilmInput,
  type CheckFilmInput,
  filmCheck,
  type FilmCheck,
  FILM_DRAFT_CHECK_PATH,
  FILM_DRAFT_FILES_PATH,
  FILM_DRAFT_PATH,
  FILM_DRAFTS_PATH,
  FILM_GUIDE_PATH,
  FILM_KIT_PATH,
  filmGuide,
  filmKit,
  filmKitQuery,
  type FilmGuide,
  type FilmKit,
  type FilmKitQuery,
  filmDraft,
  type FilmDraft,
  putFilmFilesInput,
  type PutFilmFilesInput,
  FILM_HEROES_PATH,
  FILM_HEROES_QUOTE_PATH,
  filmHeroInput,
  type FilmHeroInput,
  FILM_RENDERS_PATH,
  FILM_RENDERS_QUOTE_PATH,
  FILM_RUN_PATH,
  type OwnAgentSkill,
  FILM_STILLS_PATH,
  FILM_STILLS_QUOTE_PATH,
  FILM_VOICES_PATH,
  FILM_VOICES_QUOTE_PATH,
  filmRenderInput,
  type FilmRenderInput,
  filmRun,
  type FilmRun,
  filmStillsInput,
  type FilmStillsRequest,
  filmVoiceInput,
  type FilmVoiceInput,
  ownAgentQuote,
  type OwnAgentQuote,
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
  BRAND_EXTRACT_PATH,
  BRAND_KIT_PATH,
  BRAND_STYLE_PROPOSE_PATH,
  BRAND_STYLES_PATH,
  brandKitWithStyles,
  type BrandKitWithStyles,
  type BrandKitInput,
  brandStyle,
  type BrandStyle,
  brandStyleProposal,
  type BrandStyleProposal,
  proposeBrandStyleInput,
  type ProposeBrandStyleInput,
  saveBrandStyleInput,
  type SaveBrandStyleInput,
  type DesignInput,
  extractBrandResponse,
  type ExtractBrandResponse,
  CREATE_ACTOR_QUOTE_PATH,
  CREATE_ACTOR_RUN_PATH,
  createActorQuote,
  type CreateActorInputArgs,
  type CreateActorQuote,
  FACELESS_QUOTE_PATH,
  FACELESS_RUN_PATH,
  facelessQuoteResponse,
  type FacelessQuoteResponse,
  GENERATION_MODELS_PATH,
  GENERATE_IMAGE_QUOTE_PATH,
  GENERATE_IMAGE_RUN_PATH,
  GENERATE_VIDEO_QUOTE_PATH,
  GENERATE_VIDEO_RUN_PATH,
  generateImageRequest,
  type GenerateImageRequest,
  generateVideoRequest,
  type GenerateVideoRequest,
  generationModels,
  type GenerationModels,
  generationQuote,
  type GenerationQuote,
  FEEDBACK_PATH,
  feedbackRequest,
  type FeedbackRequest,
  feedbackResponse,
  type FeedbackResponse,
  PRICES_PATH,
  pricesResponseRead,
  type PricesResponseRead,
  TEMPLATE_SOUNDS_PATH,
  templateSoundsList,
  type TemplateSoundsList,
  MOVES_PATH,
  motionMovesList,
  type MotionMovesList,
  type MotionMovesQueryArgs,
  REFERENCE_ANALYSES_PATH,
  REFERENCE_ANALYSIS_PATH,
  REFERENCE_ANALYSIS_QUOTE_PATH,
  analysisQuoteResponse,
  type AnalysisQuoteResponse,
  analyzeReferenceRequest,
  type AnalyzeReferenceRequest,
  referenceAnalysisRead,
  type ReferenceAnalysisRead,
  referenceAnalysisQuery,
  type ReferenceAnalysisQuery,
  runQuery,
  type RunQuery,
  CREATOR_PROFILES_PATH,
  CREATOR_PROFILE_PATH,
  CREATOR_PROFILE_QUOTE_PATH,
  analyzeCreatorRequest,
  type AnalyzeCreatorRequest,
  creatorProfileQuote,
  type CreatorProfileQuote,
  creatorProfileRead,
  type CreatorProfileRead,
  creatorProfileQuery,
  type CreatorProfileQuery,
  TREND_SEARCHES_PATH,
  TREND_SEARCH_PATH,
  TREND_SEARCH_QUOTE_PATH,
  findTrendsRequest,
  type FindTrendsArgs,
  trendSearchQuote,
  type TrendSearchQuote,
  trendSearchRead,
  type TrendSearchRead,
  trendSearchQuery,
  type TrendSearchQuery,
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
  WORKFLOW_REFERENCE_REMAKE_PATH,
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
  UPLOAD_IMPORT_PATH,
  UPLOAD_INTENTS_PATH,
  UPLOAD_ITEM_PATH,
  uploadIntentResponse,
  type UploadIntentRequest,
  type UploadIntentResponse,
  uploadItemRead,
  type UploadItemRead,
  uploadListRead,
  type UploadListRead,
  uploadResponse,
  type UploadMediaType,
  type UploadResponse,
  ASSET_BYTES_PATH,
  ASSET_ITEM_PATH,
  ASSETS_PATH,
  runMediaPath,
  assetItemRead,
  type AssetItemRead,
  assetListRead,
  type AssetListQuery,
  type AssetListRead,
  type AssetPutMediaType,
  assetRead,
  type AssetRead,
  type AssetRole,
  type CreateAssetRequest,
  type UpdateAssetRequest,
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
  generationIdempotencyKeyFor,
  idempotencyKeyFor,
  ownAgentIdempotencyKeyFor,
  revisionIdempotencyKeyFor,
  uploadRequestIdempotencyKeyFor,
  assetBytesIdempotencyKeyFor,
  assetRequestIdempotencyKeyFor,
} from "@clipwright/core/idempotency";
import { createWorkflowPlan, saveWorkflowPlan, approveWorkflowPlan, launchWorkflow, planReferenceRemakeRequest, type PlanReferenceRemakeArgs,
  workflowCatalogResponseRead, workflowMethodResponseRead, workflowPlanRead, workflowQuoteBindingRead,
  workflowLaunchResponseRead, workflowRunRead, workflowRunIdentityRead, type CreateWorkflowPlanArgs, type SaveWorkflowPlanArgs,
  type ApproveWorkflowPlanArgs, type LaunchWorkflowArgs, type WorkflowCatalogRead, type WorkflowMethodRead,
  type WorkflowPlanRead, type WorkflowQuoteRead, type WorkflowLaunchRead, type WorkflowRunRead } from '@clipwright/core/workflows';
import type { z } from "zod";

import { resolveClientId } from "./client-id.js";
import { tolerant } from "./tolerant.js";

/** Production API by default; shared with core so every surface names one address. */
const DEFAULT_BASE_URL = PUBLIC_API_BASE_URL;
const workflowPath = (pattern: string, id: string): string => pattern.replace(':id', encodeURIComponent(id));

/** What a credential callback is asked to cover: one request exactly as it is sent. */
export interface ApiKeyRequest {
  /** The method in upper case. */
  method: string;
  /** The path with its query string. */
  path: string;
  /** The body as sent; the empty string when there is none. */
  body: string | Uint8Array;
  /** The `Idempotency-Key` header, or the empty string. */
  idempotencyKey: string;
}

export interface ClipwrightClientOptions {
  /** A key, or a callback that makes a credential for each request (a per-request signature). */
  apiKey: string | ((request: ApiKeyRequest) => string);
  /** The install identity of idempotency keys. When set, neither the environment nor `~/.clipwright` is read. */
  clientId?: string | undefined;
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

/** Options of `getRun`: the server-side wait (#1036) and a signal that cancels the read. */
export type GetRunOptions = RunQuery & { signal?: AbortSignal | undefined };

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
  schema: z.ZodType<T>,
  body: unknown,
  path: string,
  mayHaveTakenEffect: boolean,
): T {
  try {
    return tolerant(schema).parse(body);
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
  readonly #apiKey: string | ((request: ApiKeyRequest) => string);
  readonly #baseUrl: string;
  readonly #pollIntervalMs: number;
  readonly #requestTimeoutMs: number;
  /** Resolved lazily on first run start: the MCP server builds the client at */
  /** import, and a read-only HOME must not break tools that never need it. */
  #clientId?: string;

  constructor(opts: ClipwrightClientOptions) {
    this.#apiKey = opts.apiKey;
    if (opts.clientId !== undefined) {
      // A blank id would key every caller's runs alike; refused here rather than resolved from disk.
      if (opts.clientId.trim().length === 0) throw new TypeError("clientId must be a non-empty string");
      this.#clientId = opts.clientId;
    }
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
    /** A request the server holds on purpose (a waiting read) gets at least this long. */
    atLeastMs = 0,
  ): Promise<unknown> {
    // Anything failing after send is reported alike: a failed `fetch` does not
    // disprove delivery, so a paid path says "unknown".
    let res: Response;
    // Cancellation reaches the network: a per-request timeout plus the caller's
    // signal, pulled out of `init` so it cannot bypass the timeout.
    const { signal: callerSignal, ...rest } = init ?? {};
    const timeout = AbortSignal.timeout(Math.max(this.#requestTimeoutMs, atLeastMs));
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    // Every caller passes a body as a string or bytes; the key is read as `fetch` sends it, in any letter case.
    const credential = typeof this.#apiKey === "string" ? this.#apiKey : this.#apiKey({
      method: (rest.method ?? "GET").toUpperCase(),
      path,
      body: (rest.body as string | Uint8Array | null | undefined) ?? "",
      idempotencyKey: new Headers(rest.headers).get("Idempotency-Key") ?? "",
    });
    try {
      res = await fetch(`${this.#baseUrl}${path}`, {
        ...rest,
        signal,
        headers: {
          Authorization: `Bearer ${credential}`,
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

  /** The account's uploads a revision still takes, newest first, each with a link signed now and its `usable_until`. Free. */
  async listUploads(): Promise<UploadListRead> {
    return parseResponse(uploadListRead, await this.#request(UPLOADS_PATH, false), UPLOADS_PATH, false);
  }

  /** The server downloads a public https PNG or JPEG into an upload. Free; a repeat within a day answers the same upload. */
  async importUpload(url: string): Promise<UploadResponse> {
    const input = { url };
    const body = await this.#request(UPLOAD_IMPORT_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": uploadRequestIdempotencyKeyFor("import", input, this.#getClientId()) },
    });
    return parseResponse(uploadResponse, body, UPLOAD_IMPORT_PATH, true);
  }

  /** A presigned PUT for a local file of the declared type, size and sha256; the upload is usable once the PUT lands. Free. */
  async createUpload(input: UploadIntentRequest): Promise<UploadIntentResponse> {
    const body = await this.#request(UPLOAD_INTENTS_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": uploadRequestIdempotencyKeyFor("intent", input, this.#getClientId()) },
    });
    return parseResponse(uploadIntentResponse, body, UPLOAD_INTENTS_PATH, true);
  }

  /** One upload with a fresh link; after `createUpload` it also confirms the PUT. Free. */
  async getUpload(uploadIdValue: string): Promise<UploadItemRead> {
    const path = UPLOAD_ITEM_PATH.replace(":id", encodeURIComponent(uploadIdValue));
    return parseResponse(uploadItemRead, await this.#request(path, false), path, false);
  }

  /** Deletes an upload: unusable at once, its file erased later. The answer is 204 with no body, a repeat too. Free. */
  async deleteUpload(uploadIdValue: string): Promise<void> {
    await this.#request(UPLOAD_ITEM_PATH.replace(":id", encodeURIComponent(uploadIdValue)), true, { method: "DELETE" });
  }

  /** Saves an asset of the account from a generation, an upload, a url, base64 or a PUT. Free; a repeat within a day answers the */
  /** same asset. A clip by url and a PUT answer a pending asset: read it with `getAsset` until its state is ready or failed. */
  async createAsset(input: CreateAssetRequest): Promise<AssetItemRead> {
    const body = await this.#request(ASSETS_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": assetRequestIdempotencyKeyFor(input, this.#getClientId()) },
    });
    return parseResponse(assetItemRead, body, ASSETS_PATH, true);
  }

  /** Saves a local PNG or JPEG (10 MB) or MP4 (32 MB) as an asset; `rights_confirmed` states you may use the people and works in it, */
  /** `analysis_only` keeps it for analyzeReference alone. A clip answers a pending asset that is checked before use. Free. */
  async createAssetFromBytes(
    bytes: Uint8Array<ArrayBuffer>,
    mediaType: AssetPutMediaType,
    meta: { role: AssetRole; name: string } & ({ rights_confirmed: true } | { analysis_only: true }),
  ): Promise<AssetItemRead> {
    const analysis = "analysis_only" in meta && meta.analysis_only === true;
    const query = new URLSearchParams({ role: meta.role, name: meta.name, ...(analysis ? { analysis_only: "true" } : { rights_confirmed: "true" }) })
      .toString();
    const key = assetBytesIdempotencyKeyFor({ role: meta.role, name: meta.name, bytes, ...(analysis ? { analysis_only: true } : {}) },
      this.#getClientId());
    const path = `${ASSET_BYTES_PATH}?${query}`;
    const body = await this.#request(path, true, { method: "POST", body: bytes, headers: { "Content-Type": mediaType, "Idempotency-Key": key } });
    return parseResponse(assetItemRead, body, ASSET_BYTES_PATH, true);
  }

  /** The account's live assets, newest first, with its usage of the caps. Free. */
  async listAssets(query: AssetListQuery = {}): Promise<AssetListRead> {
    const search = new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const path = search === "" ? ASSETS_PATH : `${ASSETS_PATH}?${search}`;
    return parseResponse(assetListRead, await this.#request(path, false), ASSETS_PATH, false);
  }

  /** One asset with a link signed now, or its pending state; after a PUT this read hands the file to processing. Free. */
  async getAsset(assetIdValue: string): Promise<AssetItemRead> {
    const path = ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue));
    return parseResponse(assetItemRead, await this.#request(path, false), path, false);
  }

  /** A new name or role for an asset. Free. */
  async updateAsset(assetIdValue: string, patch: UpdateAssetRequest): Promise<AssetRead> {
    const path = ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue));
    return parseResponse(assetRead, await this.#request(path, true, { method: "POST", body: JSON.stringify(patch) }), path, true);
  }

  /** Deletes an asset; the answer is 204 with no body. Free. */
  async deleteAsset(assetIdValue: string): Promise<void> {
    await this.#request(ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue)), true, { method: "DELETE" });
  }

  /** Deletes the files of a finished run; the run and its charge stay. The answer is 204 with no body, a repeat too. Free. */
  async deleteRunMedia(runIdValue: string): Promise<void> {
    await this.#request(runMediaPath(runIdValue), true, { method: "DELETE" });
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

  /** The account's saved design DNA (#1122), `null` when none is saved, and its saved styles (#1364). */
  async getBrandKit(): Promise<BrandKitWithStyles> {
    return parseResponse(brandKitWithStyles, await this.#request(BRAND_KIT_PATH, false), BRAND_KIT_PATH, false);
  }

  /** Saves the account's design DNA, or clears it with `null`; spends no credits. The saved script voice stays as it is. */
  async setBrandKit(design: DesignInput | null): Promise<BrandKitWithStyles> {
    return this.saveBrandKit({ design });
  }

  /** Saves each part of the brand kit given: design DNA, script voice or both; `null` clears a part, an omitted one stays. Free. */
  async saveBrandKit(input: BrandKitInput): Promise<BrandKitWithStyles> {
    const body = await this.#request(BRAND_KIT_PATH, false, { method: "POST", body: JSON.stringify(input) });
    return parseResponse(brandKitWithStyles, body, BRAND_KIT_PATH, false);
  }

  /** A style proposed from a finished analysis of a video you like, for the customer to confirm; spends no credits. */
  async proposeBrandStyle(input: ProposeBrandStyleInput): Promise<BrandStyleProposal> {
    const body = await this.#request(BRAND_STYLE_PROPOSE_PATH, false, { method: "POST", body: JSON.stringify(proposeBrandStyleInput.parse(input)) });
    return parseResponse(brandStyleProposal, body, BRAND_STYLE_PROPOSE_PATH, false);
  }

  /** Saves a confirmed style by name beside the brand kit, replacing one of that name; spends no credits. */
  async saveBrandStyle(input: SaveBrandStyleInput): Promise<BrandStyle> {
    const body = await this.#request(BRAND_STYLES_PATH, false, { method: "POST", body: JSON.stringify(saveBrandStyleInput.parse(input)) });
    return parseResponse(brandStyle, body, BRAND_STYLES_PATH, false);
  }

  /** A proposed design DNA read from a public site, for the customer to confirm; spends no credits. */
  async extractBrand(url: string): Promise<ExtractBrandResponse> {
    const body = await this.#request(BRAND_EXTRACT_PATH, false, { method: "POST", body: JSON.stringify({ url }) });
    return parseResponse(extractBrandResponse, body, BRAND_EXTRACT_PATH, false);
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
    const read = tolerant(runReadSchema).safeParse(body);
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
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  /** The shot candidates of a run's family, oldest first, each with its state, charge and preview. Free. */
  async listCandidates(runId: string): Promise<RunCandidatesRead> {
    const path = runCandidatesPath(runId);
    return parseResponse(runCandidatesRead, await this.#request(path, false), path, false);
  }

  /** The generation models with their measured shapes and prices. Free. */
  async listGenerationModels(): Promise<GenerationModels> {
    return parseResponse(generationModels, await this.#request(GENERATION_MODELS_PATH, false), GENERATION_MODELS_PATH, false);
  }

  /** The price of every action in credits, a fixed number per unit or a formula. Free, and answered without a key. */
  async listPrices(): Promise<PricesResponseRead> {
    return parseResponse(pricesResponseRead, await this.#request(PRICES_PATH, false), PRICES_PATH, false);
  }

  /** The template sounds a make_ugc run may name per beat, with each beat's default. Free. */
  async listTemplateSounds(): Promise<TemplateSoundsList> {
    return parseResponse(templateSoundsList, await this.#request(TEMPLATE_SOUNDS_PATH, false), TEMPLATE_SOUNDS_PATH, false);
  }

  /** The catalogue of moves to put on lines of a script (#1175), filtered and paged; short lines unless detail full or names. Free. */
  async listMoves(filters: MotionMovesQueryArgs = {}): Promise<MotionMovesList> {
    const query = new URLSearchParams(
      Object.entries(filters).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const path = query === "" ? MOVES_PATH : `${MOVES_PATH}?${query}`;
    return parseResponse(motionMovesList, await this.#request(path, false), MOVES_PATH, false);
  }

  /** What analyzeReference would hold and charge for this asset now: 0 when a live analysis of it would answer. Free. */
  async quoteAnalysis(request: AnalyzeReferenceRequest): Promise<AnalysisQuoteResponse> {
    const body = await this.#request(REFERENCE_ANALYSIS_QUOTE_PATH, false,
      { method: "POST", body: JSON.stringify(analyzeReferenceRequest.parse(request)) });
    return parseResponse(analysisQuoteResponse, body, REFERENCE_ANALYSIS_QUOTE_PATH, false);
  }

  /** Starts reading an MP4 asset into a reference profile, answered at once (state=queued); the same asset answers the */
  /** same analysis unless it failed, so a retry needs no key. Paid: the price is held now and charged once it succeeds. */
  async analyzeReference(request: AnalyzeReferenceRequest): Promise<ReferenceAnalysisRead> {
    const body = await this.#request(REFERENCE_ANALYSES_PATH, true,
      { method: "POST", body: JSON.stringify(analyzeReferenceRequest.parse(request)) });
    return parseResponse(referenceAnalysisRead, body, REFERENCE_ANALYSES_PATH, true);
  }

  /** Tells Clipwright what is missing, confusing, wrong or slow; we read every one. Free; the same feedback within 24 h */
  /** answers the same feedback_id, so a retry files nothing twice. */
  async sendFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    const body = await this.#request(FEEDBACK_PATH, true, { method: "POST", body: JSON.stringify(feedbackRequest.parse(request)) });
    return parseResponse(feedbackResponse, body, FEEDBACK_PATH, true);
  }

  /** One reference analysis: queued, analyzing, succeeded with its profile and warnings, or failed with its error. Free. */
  /** `frames_from`/`frames_to` page its one-a-second frames; `wait_seconds` (≤ 50) lets the server hold the read until it finishes. */
  async getReferenceAnalysis(analysisIdValue: string, query: ReferenceAnalysisQuery = {}): Promise<ReferenceAnalysisRead> {
    const item = REFERENCE_ANALYSIS_PATH.replace(":id", encodeURIComponent(analysisIdValue)), parsed = referenceAnalysisQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(referenceAnalysisRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  /** What analyzeCreator would hold and charge for this link now: 0 when a recent profile of the same creator would answer. Free. */
  async quoteCreatorProfile(request: AnalyzeCreatorRequest): Promise<CreatorProfileQuote> {
    const body = await this.#request(CREATOR_PROFILE_QUOTE_PATH, false, { method: "POST", body: JSON.stringify(analyzeCreatorRequest.parse(request)) });
    return parseResponse(creatorProfileQuote, body, CREATOR_PROFILE_QUOTE_PATH, false);
  }

  /** Starts a creator's profile from a profile or video link, answered at once (state=queued); the same creator within an hour */
  /** answers the same profile, so a retry needs no key. Paid: the price is held now and charged once it succeeds. */
  async analyzeCreator(request: AnalyzeCreatorRequest): Promise<CreatorProfileRead> {
    const body = await this.#request(CREATOR_PROFILES_PATH, true, { method: "POST", body: JSON.stringify(analyzeCreatorRequest.parse(request)) });
    return parseResponse(creatorProfileRead, body, CREATOR_PROFILES_PATH, true);
  }

  /** One creator profile; `wait_seconds` (≤ 50) lets the server hold the read until it finishes. Free. */
  async getCreatorProfile(profileIdValue: string, query: CreatorProfileQuery = {}): Promise<CreatorProfileRead> {
    const item = CREATOR_PROFILE_PATH.replace(":id", encodeURIComponent(profileIdValue)), parsed = creatorProfileQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(creatorProfileRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  /** Deletes a finished creator profile; its run and charge stay. The answer is 204 with no body, a repeat too. Free. */
  async deleteCreatorProfile(profileIdValue: string): Promise<void> {
    await this.#request(CREATOR_PROFILE_PATH.replace(":id", encodeURIComponent(profileIdValue)), true, { method: "DELETE" });
  }

  /** What findTrends would hold and charge for this query now: 0 when a search of the same query from the last hour would answer. Free. */
  async quoteTrends(request: FindTrendsArgs): Promise<TrendSearchQuote> {
    const body = await this.#request(TREND_SEARCH_QUOTE_PATH, false, { method: "POST", body: JSON.stringify(findTrendsRequest.parse(request)) });
    return parseResponse(trendSearchQuote, body, TREND_SEARCH_QUOTE_PATH, false);
  }

  /** Starts a search for reels on a topic, answered at once (state=queued); the same query within an hour answers the same */
  /** search, so a retry needs no key. Paid: the price is held now and charged once it succeeds. */
  async findTrends(request: FindTrendsArgs): Promise<TrendSearchRead> {
    const body = await this.#request(TREND_SEARCHES_PATH, true, { method: "POST", body: JSON.stringify(findTrendsRequest.parse(request)) });
    return parseResponse(trendSearchRead, body, TREND_SEARCHES_PATH, true);
  }

  /** One topic search; `wait_seconds` (≤ 50) lets the server hold the read until it finishes. Free. */
  async getTrendSearch(searchIdValue: string, query: TrendSearchQuery = {}): Promise<TrendSearchRead> {
    const item = TREND_SEARCH_PATH.replace(":id", encodeURIComponent(searchIdValue)), parsed = trendSearchQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(trendSearchRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  /** A new film draft for your own agent's scene code, under the account's brand theme frozen now. Free. */
  async createFilmDraft(request: Partial<CreateFilmDraftInput> = {}): Promise<FilmDraft> {
    const body = await this.#request(FILM_DRAFTS_PATH, true, { method: "POST", body: JSON.stringify(createFilmDraftInput.parse(request)) });
    return parseResponse(filmDraft, body, FILM_DRAFTS_PATH, true);
  }

  /** One live film draft of the account. Free. */
  async getFilmDraft(draftIdValue: string): Promise<FilmDraft> {
    const path = FILM_DRAFT_PATH.replace(":id", encodeURIComponent(draftIdValue));
    return parseResponse(filmDraft, await this.#request(path, false), path, false);
  }

  /** A change to a draft's files, anchors, sounds or captions on the revision you read; a stale revision is refused with 409. Free. */
  async putFilmFiles(draftIdValue: string, request: PutFilmFilesInput): Promise<FilmDraft> {
    const path = FILM_DRAFT_FILES_PATH.replace(":id", encodeURIComponent(draftIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(putFilmFilesInput.parse(request)) });
    return parseResponse(filmDraft, body, path, true);
  }

  /** The checks stills and the render run before money, on a draft revision (with unsaved changes laid over it) and a delivered voice: refusals
   *  as `file:line`, warnings, each anchor's second and the voice's end. Free; a stale revision is refused with 409. */
  async checkFilm(draftIdValue: string, request: CheckFilmInput): Promise<FilmCheck> {
    const path = FILM_DRAFT_CHECK_PATH.replace(":id", encodeURIComponent(draftIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(checkFilmInput.parse(request)) });
    return parseResponse(filmCheck, body, path, true);
  }

  /** What stills of a draft revision would hold; spends no credits. */
  async quoteStills(request: FilmStillsRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_STILLS_QUOTE_PATH, filmStillsInput.parse(request));
  }

  /** Stills of a draft revision on a delivered voice, gated first; charged per still drawn. Returns at once; read it with getFilmRun. */
  async previewStills(request: FilmStillsRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_stills", FILM_STILLS_PATH, filmStillsInput.parse(request), opts);
  }

  /** What a voice for this text would hold; spends no credits. */
  async quoteVoice(request: FilmVoiceInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_VOICES_QUOTE_PATH, filmVoiceInput.parse(request));
  }

  /** A voice with word timings, charged per second delivered. Returns at once; read it with getFilmRun. */
  async makeVoice(request: FilmVoiceInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_voice", FILM_VOICES_PATH, filmVoiceInput.parse(request), opts);
  }

  /** What rendering a draft revision on a voice would hold; spends no credits. */
  async quoteRender(request: FilmRenderInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_RENDERS_QUOTE_PATH, filmRenderInput.parse(request));
  }

  /** The film rendered from a draft revision on a delivered voice, charged by its length only when delivered. Returns at once. */
  async renderFilm(request: FilmRenderInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_render", FILM_RENDERS_PATH, filmRenderInput.parse(request), opts);
  }

  /** What making a hero would hold: every pose; spends no credits. */
  async quoteFilmHero(request: FilmHeroInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_HEROES_QUOTE_PATH, filmHeroInput.parse(request));
  }

  /** A hero's poses, saved as the account's mascot, charged per pose published. Returns at once; read it with getFilmRun. */
  async makeFilmHero(request: FilmHeroInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_hero", FILM_HEROES_PATH, filmHeroInput.parse(request), opts);
  }

  /** The explainer guide, its method appendix and the scene kit's file list. Free. */
  async getFilmGuide(): Promise<FilmGuide> {
    return parseResponse(filmGuide, await this.#request(FILM_GUIDE_PATH, false), FILM_GUIDE_PATH, false);
  }

  /** The scene kit's files with its reference film, or one of them. Free. */
  async getFilmKit(query: FilmKitQuery = {}): Promise<FilmKit> {
    const { path: file } = filmKitQuery.parse(query);
    const path = file ? `${FILM_KIT_PATH}?path=${encodeURIComponent(file)}` : FILM_KIT_PATH;
    return parseResponse(filmKit, await this.#request(path, false), path, false);
  }

  /** One own-agent run of the account and what it delivered. Free. */
  async getFilmRun(runIdValue: string): Promise<FilmRun> {
    const path = FILM_RUN_PATH.replace(":id", encodeURIComponent(runIdValue));
    return parseResponse(filmRun, await this.#request(path, false), path, false);
  }

  async #quoteFilm(path: string, request: unknown): Promise<OwnAgentQuote> {
    return parseResponse(ownAgentQuote, await this.#request(path, false, { method: "POST", body: JSON.stringify(request) }), path, false);
  }

  async #startFilm(skill: OwnAgentSkill, path: string, request: unknown, opts: StartUgcOptions | undefined): Promise<FilmRun> {
    const key = opts?.idempotencyKey ?? `${ownAgentIdempotencyKeyFor(skill, request, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    // `true`: once sent, the run may have been created and its credits held.
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(request), headers: { "Idempotency-Key": key } });
    return parseResponse(filmRun, body, path, true);
  }

  /** What one image would cost and its size; spends no credits. */
  async quoteImage(request: GenerateImageRequest): Promise<GenerationQuote> {
    return this.#quoteGeneration(GENERATE_IMAGE_QUOTE_PATH, generateImageRequest.parse(request));
  }

  /** Starts an image generation, returned at once (state=queued); the same request and attempt return the same run. */
  async generateImage(request: GenerateImageRequest, opts?: StartUgcOptions): Promise<RunRead> {
    return this.#startGeneration("generate_image", GENERATE_IMAGE_RUN_PATH, generateImageRequest.parse(request), opts);
  }

  /** What one clip would cost and its size; spends no credits. */
  async quoteVideo(request: GenerateVideoRequest): Promise<GenerationQuote> {
    return this.#quoteGeneration(GENERATE_VIDEO_QUOTE_PATH, generateVideoRequest.parse(request));
  }

  /** Starts a clip generation, returned at once (state=queued); the same request and attempt return the same run. */
  async generateVideo(request: GenerateVideoRequest, opts?: StartUgcOptions): Promise<RunRead> {
    return this.#startGeneration("generate_video", GENERATE_VIDEO_RUN_PATH, generateVideoRequest.parse(request), opts);
  }

  async #quoteGeneration(path: string, request: GenerateImageRequest | GenerateVideoRequest): Promise<GenerationQuote> {
    return parseResponse(generationQuote, await this.#request(path, false, { method: "POST", body: JSON.stringify(request) }), path, false);
  }

  async #startGeneration(skill: "generate_image" | "generate_video", path: string, request: GenerateImageRequest | GenerateVideoRequest,
    opts: StartUgcOptions | undefined): Promise<RunRead> {
    const key = opts?.idempotencyKey ?? `${generationIdempotencyKeyFor(skill, request, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    // `true`: once sent, the run may have been created and its credits held.
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(request), headers: { "Idempotency-Key": key } });
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  /** Deletes a personal actor. The answer is 204 with no body. */
  async deleteActor(id: string): Promise<void> {
    await this.#request(actorItemPath(id), true, { method: "DELETE" });
  }

  /** Reads a run tolerantly, falling back to the raw body for a newer server stage. */
  /** `wait_seconds` (≤ 50) lets the server hold the read until the run ends; `signal` cancels it. */
  async getRun(runId: string, opts: GetRunOptions = {}): Promise<WorkflowRunRead> {
    const { signal, ...query } = opts;
    return this.#getRun(runId, signal, runQuery.parse(query).wait_seconds);
  }

  async #getRun(runId: string, signal?: AbortSignal, waitSeconds?: number): Promise<WorkflowRunRead> {
    const path = `/v1/runs/${runId}`, url = waitSeconds === undefined ? path : `${path}?wait_seconds=${waitSeconds}`;
    const body = await this.#request(url, false, { signal: signal ?? null }, waitSeconds === undefined ? 0 : (waitSeconds + 15) * 1000);
    const parsed = tolerant(workflowRunRead).safeParse(body);
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
  /** Free: the server compiles a reference profile, or the analysis_id that holds one, and the accepted script into a new plan, or with plan_id and base_version into a draft revision of it; warnings name what it does not reproduce. */
  async planReferenceRemake(input: PlanReferenceRemakeArgs): Promise<WorkflowPlanRead> {
    const parsed = planReferenceRemakeRequest.parse(input), path = WORKFLOW_REFERENCE_REMAKE_PATH;
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
export type { GenerateImageRequest, GenerateVideoRequest, GenerationModels, GenerationQuote };
export type { TemplateSoundsList };
export type { PricesResponseRead };
export type { FeedbackRequest, FeedbackResponse };
export type { AnalyzeReferenceRequest, ReferenceAnalysisQuery, ReferenceAnalysisRead };
export type { AnalyzeCreatorRequest, CreatorProfileQuery, CreatorProfileQuote, CreatorProfileRead };
export type { FindTrendsArgs, TrendSearchQuery, TrendSearchQuote, TrendSearchRead };
export type { UploadListRead };
export type { CreateWorkflowPlanArgs, SaveWorkflowPlanArgs, ApproveWorkflowPlanArgs, LaunchWorkflowArgs, PlanReferenceRemakeArgs,
  WorkflowCatalogRead, WorkflowMethodRead, WorkflowPlanRead, WorkflowQuoteRead, WorkflowLaunchRead, WorkflowRunRead };
