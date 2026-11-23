import {
  AD_GUIDE_PATH,
  AD_PATH,
  ADS_PATH,
  adRecord,
  type AdRecord,
  createAdInput,
  type CreateAdInput,
  updateAdInput,
  type UpdateAdInput,
  CUT_PATH,
  CUT_PREVIEWS_PATH,
  CUT_PREVIEWS_QUOTE_PATH,
  CUTS_PATH,
  createCutInput,
  type CreateCutInput,
  cutRecord,
  type CutRecord,
  filmCutPreviewInput,
  type FilmCutPreviewRequest,
  updateCutInput,
  type UpdateCutInput,
  adGuide,
  adGuideQuery,
  type AdGuide,
  type AdGuideQuery,
  createFilmDraftInput,
  type CreateFilmDraftInput,
  checkFilmInput,
  type CheckFilmInput,
  filmCheck,
  type FilmCheck,
  FILM_CUT_CHECK_PATH,
  filmCutCheck,
  filmCutInput,
  filmCutRunInput,
  FILM_CUTS_PATH,
  FILM_CUTS_QUOTE_PATH,
  type FilmCutCheck,
  type FilmCutRequest,
  type FilmCutRunRequest,
  FILM_DRAFT_CHECK_PATH,
  FILM_DRAFT_FILES_PATH,
  FILM_DRAFT_PATH,
  FILM_DRAFTS_PATH,
  FILM_GUIDE_PATH,
  FILM_KIT_PATH,
  filmGuide,
  filmGuideQuery,
  filmKit,
  filmKitQuery,
  type FilmGuide,
  type FilmGuideQuery,
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
  FILM_EDITS_PATH,
  FILM_EDITS_QUOTE_PATH,
  filmEditInput,
  type FilmEditRequest,
  TAKE_CHECKS_PATH,
  TAKE_CHECKS_QUOTE_PATH,
  TAKE_FRAMES_PATH,
  TAKE_FRAMES_QUOTE_PATH,
  takeCheckInput,
  takeFramesInput,
  type TakeCheckRequest,
  type TakeFramesRequest,
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
  UPSCALE_QUOTE_PATH,
  UPSCALE_RUN_PATH,
  upscaleQuote,
  type UpscaleQuote,
  upscaleRequest,
  type UpscaleRequest,
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
  type FindTrendsArgs,
  findTrendsInput,
  type FindTrendsInput,
  TREND_NICHES_PATH,
  trendNichesRead,
  type TrendNichesRead,
  type TrendNichesInput,
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
  UPLOAD_PAGES_PATH,
  uploadPageRead,
  type UploadPageRead,
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
  upscaleIdempotencyKeyFor,
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

const DEFAULT_BASE_URL = PUBLIC_API_BASE_URL;
const workflowPath = (pattern: string, id: string): string => pattern.replace(':id', encodeURIComponent(id));

export interface ApiKeyRequest {
  method: string;
  path: string;
  body: string | Uint8Array;
  idempotencyKey: string;
}

export interface ClipwrightClientOptions {
  apiKey: string | ((request: ApiKeyRequest) => string);
  clientId?: string | undefined;
  baseUrl?: string | undefined;
  pollIntervalMs?: number | undefined;
  requestTimeoutMs?: number | undefined;
}

export interface StartUgcOptions {
  attempt?: number | undefined;
  idempotencyKey?: string | undefined;
}

export type GetRunOptions = RunQuery & { signal?: AbortSignal | undefined };

export interface MakeUgcOptions {
  attempt?: number | undefined;
  maxWaitMs?: number | undefined;
}

const DEFAULT_MAX_WAIT_MS = 600_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function positiveMs(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number of milliseconds, got ${String(value)}`);
  }
  return value;
}

export class ClipwrightResponseError extends Error {
  readonly path: string;
  readonly mayHaveTakenEffect: boolean;
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

  static #describe(
    path: string,
    mayHaveTakenEffect: boolean,
    deliveryConfirmed: boolean,
  ): string {
    if (!mayHaveTakenEffect) {
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

function attemptSuffix(attempt: number | undefined): number {
  if (attempt === undefined) return 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new TypeError(
      `attempt must be a positive integer (1, 2, 3, …), got ${String(attempt)}. ` +
        "It selects which paid run to deduplicate against, so a wrong value can start a second render.",
    );
  }
  return attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
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

export type VoiceCatalogEntry = CoreVoiceCatalogEntry;

export class ClipwrightApiError extends Error {
  readonly failure: ApiFailure;
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ClipwrightApiError";
    this.failure = failure;
    this.status = failure.status;
    const report = agentFailureReport(failure);
    this.code = report.code;
    this.retryAfterSeconds = report.retry_after_seconds;
  }

  get retryable(): boolean {
    return isRetryableFailure(this.failure);
  }

  report(): AgentFailureReport {
    return agentFailureReport(this.failure);
  }
}

export class ClipwrightClient {
  readonly #apiKey: string | ((request: ApiKeyRequest) => string);
  readonly #baseUrl: string;
  readonly #pollIntervalMs: number;
  readonly #requestTimeoutMs: number;
  #clientId?: string;

  constructor(opts: ClipwrightClientOptions) {
    this.#apiKey = opts.apiKey;
    if (opts.clientId !== undefined) {
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

  #getClientId(): string {
    if (this.#clientId === undefined) {
      this.#clientId = resolveClientId();
    }
    return this.#clientId;
  }

  async #request(
    path: string,
    mayHaveTakenEffect: boolean,
    init?: RequestInit,
    atLeastMs = 0,
  ): Promise<unknown> {
    let res: Response;
    const { signal: callerSignal, ...rest } = init ?? {};
    const timeout = AbortSignal.timeout(Math.max(this.#requestTimeoutMs, atLeastMs));
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
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
      if (!mayHaveTakenEffect) throw cause;
      throw new ClipwrightResponseError(path, true, cause, false);
    }

    const retryAfterHeader = res.headers.get(RETRY_AFTER_HEADER);

    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch (cause) {
      if (!res.ok) {
        throw new ClipwrightApiError(
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

    if (res.status === 204) return undefined;

    try {
      return JSON.parse(bodyText) as unknown;
    } catch (cause) {
      throw new ClipwrightResponseError(path, mayHaveTakenEffect, cause);
    }
  }

  async quoteUgc(input: MakeUgcInputArgs): Promise<QuoteResponse> {
    const body = await this.#request("/v1/skills/make_ugc/quote", false, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseResponse(quoteResponse, body, "/v1/skills/make_ugc/quote", false);
  }

  async startUgc(input: MakeUgcInputArgs, opts?: StartUgcOptions): Promise<Run> {
    return this.#startUgc(input, opts);
  }

  async #startUgc(
    input: MakeUgcInputArgs,
    opts?: StartUgcOptions,
    signal?: AbortSignal,
  ): Promise<Run> {
    const key = opts?.idempotencyKey ?? `${idempotencyKeyFor(input, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;

    const body = await this.#request("/v1/skills/make_ugc/run", true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": key },
      signal: signal ?? null,
    });
    return parseResponse(runSchema, body, "/v1/skills/make_ugc/run", true);
  }

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

  async listUploads(): Promise<UploadListRead> {
    return parseResponse(uploadListRead, await this.#request(UPLOADS_PATH, false), UPLOADS_PATH, false);
  }

  async importUpload(url: string): Promise<UploadResponse> {
    const input = { url };
    const body = await this.#request(UPLOAD_IMPORT_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": uploadRequestIdempotencyKeyFor("import", input, this.#getClientId()) },
    });
    return parseResponse(uploadResponse, body, UPLOAD_IMPORT_PATH, true);
  }

  async createUpload(input: UploadIntentRequest): Promise<UploadIntentResponse> {
    const body = await this.#request(UPLOAD_INTENTS_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": uploadRequestIdempotencyKeyFor("intent", input, this.#getClientId()) },
    });
    return parseResponse(uploadIntentResponse, body, UPLOAD_INTENTS_PATH, true);
  }

  async createUploadPage(): Promise<UploadPageRead> {
    const body = await this.#request(UPLOAD_PAGES_PATH, true, { method: "POST", body: "{}" });
    return parseResponse(uploadPageRead, body, UPLOAD_PAGES_PATH, true);
  }

  async getUpload(uploadIdValue: string): Promise<UploadItemRead> {
    const path = UPLOAD_ITEM_PATH.replace(":id", encodeURIComponent(uploadIdValue));
    return parseResponse(uploadItemRead, await this.#request(path, false), path, false);
  }

  async deleteUpload(uploadIdValue: string): Promise<void> {
    await this.#request(UPLOAD_ITEM_PATH.replace(":id", encodeURIComponent(uploadIdValue)), true, { method: "DELETE" });
  }

  async createAsset(input: CreateAssetRequest): Promise<AssetItemRead> {
    const body = await this.#request(ASSETS_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": assetRequestIdempotencyKeyFor(input, this.#getClientId()) },
    });
    return parseResponse(assetItemRead, body, ASSETS_PATH, true);
  }

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

  async listAssets(query: AssetListQuery = {}): Promise<AssetListRead> {
    const search = new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const path = search === "" ? ASSETS_PATH : `${ASSETS_PATH}?${search}`;
    return parseResponse(assetListRead, await this.#request(path, false), ASSETS_PATH, false);
  }

  async getAsset(assetIdValue: string): Promise<AssetItemRead> {
    const path = ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue));
    return parseResponse(assetItemRead, await this.#request(path, false), path, false);
  }

  async updateAsset(assetIdValue: string, patch: UpdateAssetRequest): Promise<AssetRead> {
    const path = ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue));
    return parseResponse(assetRead, await this.#request(path, true, { method: "POST", body: JSON.stringify(patch) }), path, true);
  }

  async deleteAsset(assetIdValue: string): Promise<void> {
    await this.#request(ASSET_ITEM_PATH.replace(":id", encodeURIComponent(assetIdValue)), true, { method: "DELETE" });
  }

  async deleteRunMedia(runIdValue: string): Promise<void> {
    await this.#request(runMediaPath(runIdValue), true, { method: "DELETE" });
  }

  async listVoices(filters: VoicesQuery = {}): Promise<VoiceCatalogEntry[]> {
    const query = new URLSearchParams(
      Object.entries(filters).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const body = await this.#request(query === "" ? "/v1/voices" : `/v1/voices?${query}`, false);
    return parseResponse(voicesResponse, body, "/v1/voices", false).voices;
  }

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

  async getBrandKit(): Promise<BrandKitWithStyles> {
    return parseResponse(brandKitWithStyles, await this.#request(BRAND_KIT_PATH, false), BRAND_KIT_PATH, false);
  }

  async setBrandKit(design: DesignInput | null): Promise<BrandKitWithStyles> {
    return this.saveBrandKit({ design });
  }

  async saveBrandKit(input: BrandKitInput): Promise<BrandKitWithStyles> {
    const body = await this.#request(BRAND_KIT_PATH, false, { method: "POST", body: JSON.stringify(input) });
    return parseResponse(brandKitWithStyles, body, BRAND_KIT_PATH, false);
  }

  async proposeBrandStyle(input: ProposeBrandStyleInput): Promise<BrandStyleProposal> {
    const body = await this.#request(BRAND_STYLE_PROPOSE_PATH, false, { method: "POST", body: JSON.stringify(proposeBrandStyleInput.parse(input)) });
    return parseResponse(brandStyleProposal, body, BRAND_STYLE_PROPOSE_PATH, false);
  }

  async saveBrandStyle(input: SaveBrandStyleInput): Promise<BrandStyle> {
    const body = await this.#request(BRAND_STYLES_PATH, false, { method: "POST", body: JSON.stringify(saveBrandStyleInput.parse(input)) });
    return parseResponse(brandStyle, body, BRAND_STYLES_PATH, false);
  }

  async extractBrand(url: string): Promise<ExtractBrandResponse> {
    const body = await this.#request(BRAND_EXTRACT_PATH, false, { method: "POST", body: JSON.stringify({ url }) });
    return parseResponse(extractBrandResponse, body, BRAND_EXTRACT_PATH, false);
  }

  async quoteActor(input: CreateActorInputArgs): Promise<CreateActorQuote> {
    const body = await this.#request(CREATE_ACTOR_QUOTE_PATH, false, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseResponse(createActorQuote, body, CREATE_ACTOR_QUOTE_PATH, false);
  }

  async createActor(input: CreateActorInputArgs, opts?: StartUgcOptions): Promise<Run> {
    const key =
      opts?.idempotencyKey ??
      `${actorIdempotencyKeyFor(input, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const body = await this.#request(CREATE_ACTOR_RUN_PATH, true, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": key },
    });
    return parseResponse(runSchema, body, CREATE_ACTOR_RUN_PATH, true);
  }

  async quoteFaceless(input: MakeFacelessInputArgs): Promise<FacelessQuoteResponse> {
    const parsed = makeFacelessInput.parse(input);
    const body = await this.#request(FACELESS_QUOTE_PATH, false, {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    return parseResponse(facelessQuoteResponse, body, FACELESS_QUOTE_PATH, false);
  }

  async startFaceless(input: MakeFacelessInputArgs, opts?: StartUgcOptions): Promise<Run> {
    const parsed = makeFacelessInput.parse(input);
    const key =
      opts?.idempotencyKey ??
      `${facelessIdempotencyKeyFor(parsed, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const body = await this.#request(FACELESS_RUN_PATH, true, {
      method: "POST",
      body: JSON.stringify(parsed),
      headers: { "Idempotency-Key": key },
    });
    return parseResponse(runSchema, body, FACELESS_RUN_PATH, true);
  }

  async quoteRevision(runId: string, request: RevisionRequest): Promise<RevisionQuoteRead> {
    const parsed = revisionRequest.parse(request);
    const path = runRevisionsQuotePath(runId);
    const body = await this.#request(path, false, { method: "POST", body: JSON.stringify(parsed) });
    return parseResponse(revisionQuoteRead, body, path, false);
  }

  async startRevision(runId: string, request: RevisionRequest, opts?: StartUgcOptions): Promise<RunRead> {
    const parsed = revisionRequest.parse(request);
    const key =
      opts?.idempotencyKey ??
      `${revisionIdempotencyKeyFor(runId, parsed, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const path = runRevisionsPath(runId);
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(parsed), headers: { "Idempotency-Key": key } });
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  async quoteCandidate(runId: string, request: CandidateRequest): Promise<CandidateQuoteRead> {
    const parsed = candidateRequest.parse(request);
    const path = runCandidatesQuotePath(runId);
    const body = await this.#request(path, false, { method: "POST", body: JSON.stringify(parsed) });
    return parseResponse(candidateQuoteRead, body, path, false);
  }

  async createCandidate(runId: string, request: CandidateRequest, opts?: { idempotencyKey?: string | undefined }): Promise<RunRead> {
    const parsed = candidateRequest.parse(request);
    const key = opts?.idempotencyKey ?? candidateIdempotencyKeyFor(runId, parsed, this.#getClientId());
    const path = runCandidatesPath(runId);
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(parsed), headers: { "Idempotency-Key": key } });
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  async listCandidates(runId: string): Promise<RunCandidatesRead> {
    const path = runCandidatesPath(runId);
    return parseResponse(runCandidatesRead, await this.#request(path, false), path, false);
  }

  async listGenerationModels(): Promise<GenerationModels> {
    return parseResponse(generationModels, await this.#request(GENERATION_MODELS_PATH, false), GENERATION_MODELS_PATH, false);
  }

  async listPrices(): Promise<PricesResponseRead> {
    return parseResponse(pricesResponseRead, await this.#request(PRICES_PATH, false), PRICES_PATH, false);
  }

  async listTemplateSounds(): Promise<TemplateSoundsList> {
    return parseResponse(templateSoundsList, await this.#request(TEMPLATE_SOUNDS_PATH, false), TEMPLATE_SOUNDS_PATH, false);
  }

  async listMoves(filters: MotionMovesQueryArgs = {}): Promise<MotionMovesList> {
    const query = new URLSearchParams(
      Object.entries(filters).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    ).toString();
    const path = query === "" ? MOVES_PATH : `${MOVES_PATH}?${query}`;
    return parseResponse(motionMovesList, await this.#request(path, false), MOVES_PATH, false);
  }

  async quoteAnalysis(request: AnalyzeReferenceRequest): Promise<AnalysisQuoteResponse> {
    const body = await this.#request(REFERENCE_ANALYSIS_QUOTE_PATH, false,
      { method: "POST", body: JSON.stringify(analyzeReferenceRequest.parse(request)) });
    return parseResponse(analysisQuoteResponse, body, REFERENCE_ANALYSIS_QUOTE_PATH, false);
  }

  async analyzeReference(request: AnalyzeReferenceRequest): Promise<ReferenceAnalysisRead> {
    const body = await this.#request(REFERENCE_ANALYSES_PATH, true,
      { method: "POST", body: JSON.stringify(analyzeReferenceRequest.parse(request)) });
    return parseResponse(referenceAnalysisRead, body, REFERENCE_ANALYSES_PATH, true);
  }

  async sendFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    const body = await this.#request(FEEDBACK_PATH, true, { method: "POST", body: JSON.stringify(feedbackRequest.parse(request)) });
    return parseResponse(feedbackResponse, body, FEEDBACK_PATH, true);
  }

  async getReferenceAnalysis(analysisIdValue: string, query: ReferenceAnalysisQuery = {}): Promise<ReferenceAnalysisRead> {
    const item = REFERENCE_ANALYSIS_PATH.replace(":id", encodeURIComponent(analysisIdValue)), parsed = referenceAnalysisQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(referenceAnalysisRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  async quoteCreatorProfile(request: AnalyzeCreatorRequest): Promise<CreatorProfileQuote> {
    const body = await this.#request(CREATOR_PROFILE_QUOTE_PATH, false, { method: "POST", body: JSON.stringify(analyzeCreatorRequest.parse(request)) });
    return parseResponse(creatorProfileQuote, body, CREATOR_PROFILE_QUOTE_PATH, false);
  }

  async analyzeCreator(request: AnalyzeCreatorRequest): Promise<CreatorProfileRead> {
    const body = await this.#request(CREATOR_PROFILES_PATH, true, { method: "POST", body: JSON.stringify(analyzeCreatorRequest.parse(request)) });
    return parseResponse(creatorProfileRead, body, CREATOR_PROFILES_PATH, true);
  }

  async getCreatorProfile(profileIdValue: string, query: CreatorProfileQuery = {}): Promise<CreatorProfileRead> {
    const item = CREATOR_PROFILE_PATH.replace(":id", encodeURIComponent(profileIdValue)), parsed = creatorProfileQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(creatorProfileRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  async deleteCreatorProfile(profileIdValue: string): Promise<void> {
    await this.#request(CREATOR_PROFILE_PATH.replace(":id", encodeURIComponent(profileIdValue)), true, { method: "DELETE" });
  }

  async quoteTrends(request: FindTrendsInput): Promise<TrendSearchQuote> {
    const body = await this.#request(TREND_SEARCH_QUOTE_PATH, false, { method: "POST", body: JSON.stringify(findTrendsInput.parse(request)) });
    return parseResponse(trendSearchQuote, body, TREND_SEARCH_QUOTE_PATH, false);
  }

  async findTrends(request: FindTrendsInput): Promise<TrendSearchRead> {
    const body = await this.#request(TREND_SEARCHES_PATH, true, { method: "POST", body: JSON.stringify(findTrendsInput.parse(request)) });
    return parseResponse(trendSearchRead, body, TREND_SEARCHES_PATH, true);
  }

  async getTrendNiches(): Promise<TrendNichesRead> {
    return parseResponse(trendNichesRead, await this.#request(TREND_NICHES_PATH, false), TREND_NICHES_PATH, false);
  }

  async setTrendNiches(input: TrendNichesInput): Promise<TrendNichesRead> {
    const body = await this.#request(TREND_NICHES_PATH, false, { method: "POST", body: JSON.stringify(input) });
    return parseResponse(trendNichesRead, body, TREND_NICHES_PATH, false);
  }

  async getTrendSearch(searchIdValue: string, query: TrendSearchQuery = {}): Promise<TrendSearchRead> {
    const item = TREND_SEARCH_PATH.replace(":id", encodeURIComponent(searchIdValue)), parsed = trendSearchQuery.parse(query);
    const search = new URLSearchParams(Object.entries(parsed)
      .flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))).toString();
    const path = search === "" ? item : `${item}?${search}`;
    return parseResponse(trendSearchRead, await this.#request(path, false, undefined, ((parsed.wait_seconds ?? 0) + 15) * 1000), item, false);
  }

  async createFilmDraft(request: Partial<CreateFilmDraftInput> = {}): Promise<FilmDraft> {
    const body = await this.#request(FILM_DRAFTS_PATH, true, { method: "POST", body: JSON.stringify(createFilmDraftInput.parse(request)) });
    return parseResponse(filmDraft, body, FILM_DRAFTS_PATH, true);
  }

  async getFilmDraft(draftIdValue: string): Promise<FilmDraft> {
    const path = FILM_DRAFT_PATH.replace(":id", encodeURIComponent(draftIdValue));
    return parseResponse(filmDraft, await this.#request(path, false), path, false);
  }

  async putFilmFiles(draftIdValue: string, request: PutFilmFilesInput): Promise<FilmDraft> {
    const path = FILM_DRAFT_FILES_PATH.replace(":id", encodeURIComponent(draftIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(putFilmFilesInput.parse(request)) });
    return parseResponse(filmDraft, body, path, true);
  }

  async checkFilm(draftIdValue: string, request: CheckFilmInput): Promise<FilmCheck> {
    const path = FILM_DRAFT_CHECK_PATH.replace(":id", encodeURIComponent(draftIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(checkFilmInput.parse(request)) });
    return parseResponse(filmCheck, body, path, true);
  }

  async checkCut(request: FilmCutRequest): Promise<FilmCutCheck> {
    const body = await this.#request(FILM_CUT_CHECK_PATH, true, { method: "POST", body: JSON.stringify(filmCutInput.parse(request)) });
    return parseResponse(filmCutCheck, body, FILM_CUT_CHECK_PATH, true);
  }

  async quoteCut(request: FilmCutRunRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_CUTS_QUOTE_PATH, filmCutRunInput.parse(request));
  }

  async renderCut(request: FilmCutRunRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_cut", FILM_CUTS_PATH, filmCutRunInput.parse(request), opts);
  }

  async quotePreviewCut(request: FilmCutPreviewRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(CUT_PREVIEWS_QUOTE_PATH, filmCutPreviewInput.parse(request));
  }

  async previewCut(request: FilmCutPreviewRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_cut_preview", CUT_PREVIEWS_PATH, filmCutPreviewInput.parse(request), opts);
  }

  async createCut(request: CreateCutInput): Promise<CutRecord> {
    const body = await this.#request(CUTS_PATH, true, { method: "POST", body: JSON.stringify(createCutInput.parse(request)) });
    return parseResponse(cutRecord, body, CUTS_PATH, true);
  }

  async updateCut(cutIdValue: string, request: UpdateCutInput): Promise<CutRecord> {
    const path = CUT_PATH.replace(":id", encodeURIComponent(cutIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(updateCutInput.parse(request)) });
    return parseResponse(cutRecord, body, path, true);
  }

  async getCut(cutIdValue: string): Promise<CutRecord> {
    const path = CUT_PATH.replace(":id", encodeURIComponent(cutIdValue));
    return parseResponse(cutRecord, await this.#request(path, false), path, false);
  }

  async quoteStills(request: FilmStillsRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_STILLS_QUOTE_PATH, filmStillsInput.parse(request));
  }

  async previewStills(request: FilmStillsRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_stills", FILM_STILLS_PATH, filmStillsInput.parse(request), opts);
  }

  async quoteVoice(request: FilmVoiceInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_VOICES_QUOTE_PATH, filmVoiceInput.parse(request));
  }

  async makeVoice(request: FilmVoiceInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_voice", FILM_VOICES_PATH, filmVoiceInput.parse(request), opts);
  }

  async quoteRender(request: FilmRenderInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_RENDERS_QUOTE_PATH, filmRenderInput.parse(request));
  }

  async renderFilm(request: FilmRenderInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_render", FILM_RENDERS_PATH, filmRenderInput.parse(request), opts);
  }

  async quoteFilmHero(request: FilmHeroInput): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_HEROES_QUOTE_PATH, filmHeroInput.parse(request));
  }

  async makeFilmHero(request: FilmHeroInput, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_hero", FILM_HEROES_PATH, filmHeroInput.parse(request), opts);
  }

  async quoteEdit(request: FilmEditRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(FILM_EDITS_QUOTE_PATH, filmEditInput.parse(request));
  }

  async renderEdit(request: FilmEditRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_edit", FILM_EDITS_PATH, filmEditInput.parse(request), opts);
  }

  async quoteTakeFrames(request: TakeFramesRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(TAKE_FRAMES_QUOTE_PATH, takeFramesInput.parse(request));
  }

  async takeFrames(request: TakeFramesRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_take_frames", TAKE_FRAMES_PATH, takeFramesInput.parse(request), opts);
  }

  async quoteTakeCheck(request: TakeCheckRequest): Promise<OwnAgentQuote> {
    return this.#quoteFilm(TAKE_CHECKS_QUOTE_PATH, takeCheckInput.parse(request));
  }

  async checkTake(request: TakeCheckRequest, opts?: StartUgcOptions): Promise<FilmRun> {
    return this.#startFilm("film_take_check", TAKE_CHECKS_PATH, takeCheckInput.parse(request), opts);
  }

  async getFilmGuide(query: FilmGuideQuery = {}): Promise<FilmGuide> {
    const { format, section } = filmGuideQuery.parse(query);
    const params = new URLSearchParams();
    if (format) params.set("format", format);
    if (section) params.set("section", section);
    const path = params.size ? `${FILM_GUIDE_PATH}?${params}` : FILM_GUIDE_PATH;
    return parseResponse(filmGuide, await this.#request(path, false), path, false);
  }

  async getAdGuide(query: AdGuideQuery = {}): Promise<AdGuide> {
    const { section } = adGuideQuery.parse(query);
    const path = section ? `${AD_GUIDE_PATH}?section=${encodeURIComponent(section)}` : AD_GUIDE_PATH;
    return parseResponse(adGuide, await this.#request(path, false), path, false);
  }

  async createAd(request: CreateAdInput): Promise<AdRecord> {
    const body = await this.#request(ADS_PATH, true, { method: "POST", body: JSON.stringify(createAdInput.parse(request)) });
    return parseResponse(adRecord, body, ADS_PATH, true);
  }

  async updateAd(adIdValue: string, request: UpdateAdInput): Promise<AdRecord> {
    const path = AD_PATH.replace(":id", encodeURIComponent(adIdValue));
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(updateAdInput.parse(request)) });
    return parseResponse(adRecord, body, path, true);
  }

  async getAd(adIdValue: string): Promise<AdRecord> {
    const path = AD_PATH.replace(":id", encodeURIComponent(adIdValue));
    return parseResponse(adRecord, await this.#request(path, false), path, false);
  }

  async getFilmKit(query: FilmKitQuery = {}): Promise<FilmKit> {
    const { path: file } = filmKitQuery.parse(query);
    const path = file ? `${FILM_KIT_PATH}?path=${encodeURIComponent(file)}` : FILM_KIT_PATH;
    return parseResponse(filmKit, await this.#request(path, false), path, false);
  }

  async getFilmRun(runIdValue: string): Promise<FilmRun> {
    const path = FILM_RUN_PATH.replace(":id", encodeURIComponent(runIdValue));
    return parseResponse(filmRun, await this.#request(path, false), path, false);
  }

  async #quoteFilm(path: string, request: unknown): Promise<OwnAgentQuote> {
    return parseResponse(ownAgentQuote, await this.#request(path, false, { method: "POST", body: JSON.stringify(request) }), path, false);
  }

  async #startFilm(skill: OwnAgentSkill, path: string, request: unknown, opts: StartUgcOptions | undefined): Promise<FilmRun> {
    const key = opts?.idempotencyKey ?? `${ownAgentIdempotencyKeyFor(skill, request, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(request), headers: { "Idempotency-Key": key } });
    return parseResponse(filmRun, body, path, true);
  }

  async quoteImage(request: GenerateImageRequest): Promise<GenerationQuote> {
    return this.#quoteGeneration(GENERATE_IMAGE_QUOTE_PATH, generateImageRequest.parse(request));
  }

  async generateImage(request: GenerateImageRequest, opts?: StartUgcOptions): Promise<RunRead> {
    return this.#startGeneration("generate_image", GENERATE_IMAGE_RUN_PATH, generateImageRequest.parse(request), opts);
  }

  async quoteVideo(request: GenerateVideoRequest): Promise<GenerationQuote> {
    return this.#quoteGeneration(GENERATE_VIDEO_QUOTE_PATH, generateVideoRequest.parse(request));
  }

  async generateVideo(request: GenerateVideoRequest, opts?: StartUgcOptions): Promise<RunRead> {
    return this.#startGeneration("generate_video", GENERATE_VIDEO_RUN_PATH, generateVideoRequest.parse(request), opts);
  }

  async quoteUpscale(request: UpscaleRequest): Promise<UpscaleQuote> {
    const parsed = upscaleRequest.parse(request);
    return parseResponse(upscaleQuote, await this.#request(UPSCALE_QUOTE_PATH, false, { method: "POST", body: JSON.stringify(parsed) }),
      UPSCALE_QUOTE_PATH, false);
  }

  async upscale(request: UpscaleRequest, opts?: StartUgcOptions): Promise<RunRead> {
    const parsed = upscaleRequest.parse(request);
    const key = opts?.idempotencyKey ?? `${upscaleIdempotencyKeyFor(parsed, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const body = await this.#request(UPSCALE_RUN_PATH, true, { method: "POST", body: JSON.stringify(parsed), headers: { "Idempotency-Key": key } });
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(UPSCALE_RUN_PATH, true, read.error);
    return body as RunRead;
  }

  async #quoteGeneration(path: string, request: GenerateImageRequest | GenerateVideoRequest): Promise<GenerationQuote> {
    return parseResponse(generationQuote, await this.#request(path, false, { method: "POST", body: JSON.stringify(request) }), path, false);
  }

  async #startGeneration(skill: "generate_image" | "generate_video", path: string, request: GenerateImageRequest | GenerateVideoRequest,
    opts: StartUgcOptions | undefined): Promise<RunRead> {
    const key = opts?.idempotencyKey ?? `${generationIdempotencyKeyFor(skill, request, this.#getClientId())}:${attemptSuffix(opts?.attempt)}`;
    const body = await this.#request(path, true, { method: "POST", body: JSON.stringify(request), headers: { "Idempotency-Key": key } });
    const read = tolerant(runReadSchema).safeParse(body);
    if (read.success) return read.data;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ClipwrightResponseError(path, true, read.error);
    return body as RunRead;
  }

  async deleteActor(id: string): Promise<void> {
    await this.#request(actorItemPath(id), true, { method: "DELETE" });
  }

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

  async getRunShots(runId: string): Promise<RunShotsRead> {
    const path = runShotsPath(runId);
    return parseResponse(runShotsRead, await this.#request(path, false), path, false);
  }

  async getRunEdit(runId: string): Promise<RunEditRead> {
    const path = runEditPath(runId);
    return parseResponse(runEditRead, await this.#request(path, false), path, false);
  }

  async saveRunEdit(runId: string, input: SaveRunEditArgs): Promise<RunEditRead> {
    const path = runEditPath(runId);
    const body = await this.#request(path, false, {
      method: "POST",
      body: JSON.stringify({ base_version: input.base_version, document: input.document }),
    });
    return parseResponse(runEditRead, body, path, false);
  }

  async makeUgc(
    input: MakeUgcInputArgs,
    opts?: MakeUgcOptions,
    onProgress?: (run: RunRead) => void,
  ): Promise<RunRead> {
    const maxWaitMs = positiveMs(opts?.maxWaitMs, DEFAULT_MAX_WAIT_MS, "maxWaitMs");
    const deadline = Date.now() + maxWaitMs;
    const callDeadline = AbortSignal.timeout(Math.min(maxWaitMs, MAX_TIMER_DELAY_MS));

    let current: RunRead = await this.#startUgc(input, { attempt: opts?.attempt }, callDeadline);

    let nextDelayMs = this.#pollIntervalMs;
    let lastRetried: ClipwrightApiError | undefined;

    const timedOut = (): Error =>
      new Error(
        `makeUgc timed out after ${maxWaitMs}ms; run ${current.run_id} is still ` +
          `${current.state}. Poll it later with getRun("${current.run_id}").` +
          (lastRetried === undefined
            ? ""
            : ` The last status check was refused with HTTP ${lastRetried.status}: ` +
              `${lastRetried.message}`),
      );

    while (!isTerminal(current.state)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timedOut();
      await sleep(Math.min(nextDelayMs, remaining));

      try {
        current = await this.#getRun(current.run_id, callDeadline) as RunRead;
        nextDelayMs = this.#pollIntervalMs;
        onProgress?.(current);
      } catch (error) {
        if (callDeadline.aborted && !(error instanceof ClipwrightApiError)) throw timedOut();
        if (!(error instanceof ClipwrightApiError) || !isRetryableFailure(error.failure)) {
          throw error;
        }
        lastRetried = error;
        nextDelayMs = retryDelayMs(error.failure, this.#pollIntervalMs);
      }
    }
    if (current.state === FAILED_STATE) {
      throw new Error(current.error ?? "run failed");
    }
    return current;
  }
}

export { resolveClientId } from "./client-id.js";
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
export type { FindTrendsArgs, FindTrendsInput, TrendNichesInput, TrendNichesRead, TrendSearchQuery, TrendSearchQuote, TrendSearchRead };
export type { UploadListRead };
export type { CreateWorkflowPlanArgs, SaveWorkflowPlanArgs, ApproveWorkflowPlanArgs, LaunchWorkflowArgs, PlanReferenceRemakeArgs,
  WorkflowCatalogRead, WorkflowMethodRead, WorkflowPlanRead, WorkflowQuoteRead, WorkflowLaunchRead, WorkflowRunRead };
