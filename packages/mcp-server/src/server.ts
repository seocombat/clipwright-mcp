import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClipwrightClient } from "@clipwright/sdk";
import {
  adGuideQuery,
  MCP_SERVER_ICONS,
  MCP_SERVER_TITLE,
  mcpUgcInputShape,
  type MakeUgcInputArgs,
  actorDefaultsInput,
  type BrandKitInput,
  type BrandLook,
  type DesignInput,
  extractBrandInput,
  proposeBrandStyleInput,
  type SaveBrandStyleInput,
  mcpDesign,
  mcpScriptVoice,
  type ScriptVoice,
  CANDIDATE_CHARGE_TEXT,
  candidateRequest,
  type CandidateRequest,
  CATALOG_LANGUAGES,
  CREATE_ACTOR_DESCRIPTION,
  createActorInputShape,
  DEFAULT_FACELESS_VOICE,
  FACELESS_VOICE_NAMES,
  generateImageRequest,
  generateVideoRequest,
  upscaleRequest,
  MODEL_VOICE_MODEL,
  MODEL_VOICE_NAMES,
  voicesQueryShape,
  motionMovesQuery,
  agentRetryShape,
  maxCreditsField,
  runId,
  MAKE_UGC_DESCRIPTION,
  MAKE_UGC_AGENT_PROTOCOL,
  MAKE_FACELESS_DESCRIPTION,
  MAKE_FACELESS_AGENT_PROTOCOL,
  mcpServerInstructions,
  makeFacelessInput,
  offeredFacelessInput,
  REVISION_CHARGE_TEXT,
  revisionRequest,
  type RevisionRequest,
  UPLOAD_IMAGE_DESCRIPTION,
  UPLOAD_MAX_BYTES,
  UPLOAD_MEDIA_TYPES,
  CREATE_UPLOAD_DESCRIPTION,
  GET_UPLOAD_DESCRIPTION,
  uploadId,
  sniffUploadMediaType,
  ASSET_KINDS,
  ASSET_LIST_MAX_LIMIT,
  ASSET_VIDEO_MAX_BYTES,
  pendingAssetRead,
  ASSET_ROLES,
  assetId,
  assetSource,
  CREATE_ASSET_DESCRIPTION,
  createAssetRequest,
  DELETE_ASSET_DESCRIPTION,
  DELETE_RUN_MEDIA_DESCRIPTION,
  DELETE_UPLOAD_DESCRIPTION,
  DELETE_CREATOR_PROFILE_DESCRIPTION,
  GET_ASSET_DESCRIPTION,
  LIST_ASSETS_DESCRIPTION,
  ASSET_BASE64_MAX_BYTES,
  ASSET_TOOL_ANSWER_CHARS,
  ASSET_TOOL_PAGE,
  type AssetItemRead,
  UPDATE_ASSET_DESCRIPTION,
  ANALYZE_REFERENCE_DESCRIPTION,
  QUOTE_ANALYSIS_DESCRIPTION,
  analyzeReferenceRequest,
  type ReferenceAnalysisRead,
  ANALYZE_CREATOR_DESCRIPTION,
  GET_CREATOR_PROFILE_DESCRIPTION,
  QUOTE_CREATOR_PROFILE_DESCRIPTION,
  FIND_TRENDS_DESCRIPTION,
  GET_TREND_SEARCH_DESCRIPTION,
  QUOTE_TRENDS_DESCRIPTION,
  findTrendsInput,
  trendSearchId,
  trendSearchQuery,
  type TrendSort,
  TREND_NICHES_DESCRIPTION,
  thirdPartyData,
  trendNichesInput,
  trendSort,
  analyzeCreatorRequest,
  creatorProfileId,
  creatorProfileQuery,
  GET_REFERENCE_ANALYSIS_DESCRIPTION,
  referenceAnalysisId,
  referenceAnalysisQuery,
  NO_SCRIPT_LINE_HEAD,
  noScriptLine,
  REFERENCE_WAIT_MAX_SECONDS,
  withPriceLine,
  type PriceEntry,
  feedbackRequest,
  SEND_FEEDBACK_DESCRIPTION,
  ACCEPTED_UGC_FIELDS,
  rejectedFields,
  unknownFields,
  FAILED_STATE,
} from "@clipwright/core";
import { failedRepeatNote, formatGetRun, type McpToolResponse, RUN_WAIT_MAX_SECONDS, withFailureReport } from "./format.js";
import { facelessQuoteMarkdown, RUN_DISPLAY_HINT, ugcQuoteMarkdown } from "./run-display.js";
import { registerWorkflowTools } from './workflow-tools.js';
import { registerFilmDraftTools } from "./film-tools.js";
import { BASE_PRICES } from "./offer.js";
import { fetchImage } from "./images.js";
import { advertiseSlimTools, describeTool } from "./advertised-schema.js";
import { adMethodPointer, generateVideoRoute, ugcRouteLine, withRoute } from "./listed-texts.js";
import { answerInvalidArguments } from "./invalid-arguments.js";

function ugcKeyRefusal(key: string): string {
  const rejected = rejectedFields({ [key]: true })[0]?.message;
  if (rejected) return rejected;
  const suggestion = unknownFields({ [key]: true }, ACCEPTED_UGC_FIELDS)[0]?.suggestion;
  return `"${key}" is not a field of this tool${suggestion ? ` (did you mean "${suggestion}"?)` : ""}`;
}
const ugcTool = z.strictObject(mcpUgcInputShape, {
  error: (issue) => issue.code === "unrecognized_keys" ? issue.keys.map(ugcKeyRefusal).join("; ") : undefined,
});

const packageVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;

export interface CreateServerOptions {
  fileAccess: "local" | "refuse";
  ownAgent?: boolean;
  explainer?: boolean;
  prices?: readonly PriceEntry[];
  adGuide?: boolean;
  facelessDiy?: boolean;
}

export const GET_AD_GUIDE_DESCRIPTION = "Free. Read this first for an ad, a product video, a UGC video or a testimonial: section workflow " +
  "(also the answer with no section) picks the format, by default a multi-shot ad from generated clips, make_ugc for a person talking to " +
  "camera, and lists its questions with their defaults, then names the other sections. section ugc: the rules of an ad made with make_ugc: the " +
  "word → device catalogue (which list_moves names fit which words), the hook, poses, live shots by action, captions, hands and timeline, " +
  "and density. The other sections are the method for making the multi-shot ad yourself shot by shot: " +
  "product and hero sheets, location, state stills, a motion test, the shot list, takes, a frame audit, repair, and the edit with " +
  "render_edit; order holds their order. section reads one part whole. version changes whenever the guide does; read it again when it " +
  "differs from the one your ad record (get_ad) notes.";

export const REMOTE_UPLOAD_REFUSAL =
  "This Clipwright server is remote and cannot read files on your machine, so upload_image takes no path here. " +
  "Pass a public https URL as upload_image({url}), or call create_upload and PUT the file to the returned put_url " +
  "(for example with curl), then use the upload_id. create_upload with no " +
  "arguments returns a page_url where the user drops the photo.";

export const UPLOAD_PAGE_NEXT_ACTION =
  "The user opens page_url and drops the photo there. Once they say it is done, get_upload with upload_id returns it; " +
  "upload_not_finished means it has not arrived. The link takes one photo and expires at expires_at.";

export const DESCRIBE_TOOL_DESCRIPTION =
  "Free. tools/list gives each tool in short; this answers a tool's full description and every field's guidance, or one field's " +
  "with its subfields. Read it before the first call of a tool or field you have not used, such as quote_ugc templates.";

export const REMOTE_ASSET_PATH_REFUSAL =
  "This Clipwright server is remote and cannot read files on your machine, so create_asset takes no path here. " +
  "Pass source {url} (add kind: \"video\" for an MP4) or {base64, media_type}, or pass {put: {media_type, bytes, sha256}} " +
  "and PUT the file to the returned upload.put_url (for example with curl), then call get_asset.";

export async function putLocalClip(
  client: ClipwrightClient, bytes: Uint8Array<ArrayBuffer>, path: string,
  meta: { role: z.infer<typeof createAssetRequest>["role"]; name: string; analysis_only?: true },
  put: typeof fetch = fetch,
): Promise<unknown> {
  if (bytes.byteLength > ASSET_VIDEO_MAX_BYTES) throw new Error(`${path} is ${bytes.byteLength} bytes; a clip may be ${ASSET_VIDEO_MAX_BYTES}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const created = await client.createAsset({ source: { put: { media_type: "video/mp4", bytes: bytes.byteLength, sha256 } },
    role: meta.role, name: meta.name, ...(meta.analysis_only ? { analysis_only: true } : { rights_confirmed: true }) });
  const pending = pendingAssetRead.safeParse(created);
  const upload = pending.success ? pending.data.upload : undefined;
  if (upload === undefined) return created;
  const answer = await put(upload.put_url, { method: "PUT", body: bytes, headers: { "content-type": upload.put_headers["content-type"] ?? "video/mp4" } });
  if (!answer.ok) throw new Error(`the storage refused the PUT of ${path} with HTTP ${answer.status}; create the asset again`);
  return client.getAsset(created.asset_id);
}

export function withPoll<T extends { analysis_id: string; state: string; retry_after_seconds?: number | null | undefined }>(analysis: T):
  T & { poll?: { tool: "get_reference_analysis"; arguments: { analysis_id: string; wait_seconds: number }; retry_after_seconds: number } } {
  if (analysis.state !== "queued" && analysis.state !== "analyzing") return analysis;
  return { ...analysis, poll: { tool: "get_reference_analysis", arguments: { analysis_id: analysis.analysis_id, wait_seconds: REFERENCE_WAIT_MAX_SECONDS },
    retry_after_seconds: analysis.retry_after_seconds ?? 10 } };
}

export const REFERENCE_INCLUDES = ["profile", "frames"] as const;
export const REFERENCE_OMITTED_NOTE = "Left out to keep this answer small: get_reference_analysis with include: [\"profile\", \"frames\"] " +
  "returns them. plan_reference_remake reads the profile by analysis_id.";
export function lightAnalysis<T extends { reference_profile?: unknown; frames?: unknown }>(analysis: T, include: readonly string[] = []):
  T | (Omit<T, "reference_profile" | "frames"> & { omitted: { fields: string[]; note: string } }) {
  const fields = [...(include.includes("profile") || analysis.reference_profile == null ? [] : ["reference_profile"]),
    ...(include.includes("frames") || analysis.frames == null ? [] : ["frames"])];
  if (fields.length === 0) return analysis;
  const light: Record<string, unknown> = { ...analysis };
  for (const field of fields) delete light[field];
  return { ...light, omitted: { fields, note: REFERENCE_OMITTED_NOTE } } as Omit<T, "reference_profile" | "frames"> & { omitted: { fields: string[]; note: string } };
}

export function listedNoScript<T extends { next_no_script?: { tools: string[]; credits_from?: number | undefined } | undefined;
  display_markdown?: string | undefined }>(analysis: T, listed: (tool: string) => boolean): T {
  const next = analysis.next_no_script;
  if (next === undefined || next.tools.every(listed)) return analysis;
  const tools = next.tools.filter(listed), { next_no_script: _dropped, ...rest } = analysis;
  const line = tools.length > 0 ? `\n\n${noScriptLine({ ...next, tools })}` : "";
  const display = analysis.display_markdown?.replace(new RegExp(`\\n\\n${NO_SCRIPT_LINE_HEAD.replace(/[*?]/g, "\\$&")}[^\\n]*`), line);
  return { ...rest, ...tools.length > 0 ? { next_no_script: { ...next, tools } } : {}, ...display === undefined ? {} : { display_markdown: display } } as T;
}

export const analysisAnswer = (analysis: ReferenceAnalysisRead, listed: (tool: string) => boolean, include: readonly string[] = []) =>
  withPoll(lightAnalysis(listedNoScript(analysis, listed), include));

export function withProfilePoll<T extends { profile_id: string; state: string; retry_after_seconds?: number | null | undefined }>(profile: T):
  T & { poll?: { tool: "get_creator_profile"; arguments: { profile_id: string; wait_seconds: number }; retry_after_seconds: number } } {
  if (profile.state !== "queued" && profile.state !== "analyzing") return profile;
  return { ...profile, poll: { tool: "get_creator_profile", arguments: { profile_id: profile.profile_id, wait_seconds: REFERENCE_WAIT_MAX_SECONDS },
    retry_after_seconds: profile.retry_after_seconds ?? 5 } };
}
function withTrendPoll<T extends { search_id: string; state: string; retry_after_seconds?: number | null | undefined }>(search: T,
  order: { sort?: TrendSort } = {}): T & { poll?: { tool: "get_trend_search"; arguments: { search_id: string; wait_seconds: number;
    sort?: TrendSort }; retry_after_seconds: number } } {
  if (search.state !== "queued" && search.state !== "searching") return search;
  return { ...search, poll: { tool: "get_trend_search", arguments: { search_id: search.search_id, wait_seconds: REFERENCE_WAIT_MAX_SECONDS,
    ...order }, retry_after_seconds: search.retry_after_seconds ?? 5 } };
}
export const CREATOR_START_WAIT_SECONDS = 40;
const REPEAT_TEXT = (another: string) => `Repeating an identical request returns the run it started, starting nothing new; pass ${another} for another one.`;

const UPSCALE_QUOTE_DESCRIPTION = "Price one upscale without spending credits: a delivered clip or picture made larger. source is {run_id} " +
  "of a succeeded generate_video or generate_image run of this account until its reusable_until, {asset_id} of a picture asset, or " +
  "{upload_id, rights_confirmed: true}. A draft clip is lifted to 720p at the sizes list_generation_models lists under " +
  "upscale; a picture is doubled on each side. Answers credits, the output width and height, the source's size and warnings. The same " +
  "take, larger: lettering the draft drew wrong stays wrong. An upscale that fails is charged nothing.";
const UPSCALE_DESCRIPTION = "Upscale a delivered clip or picture (paid), as quote_upscale explains: a new run of skill generate_video or " +
  "generate_image, charged once the larger file is delivered. Use it on a 480p draft take before an edit, or on a small portrait before " +
  "create_asset and create_actor. Look at a draft clip with free take_frames first: the upscale keeps every flaw of the take. Poll " +
  "get_run; generation.url is the larger file and generation.upscaled_from names its source.";

export const MAX_INLINE_FRAMES = 8;
const { display: _display, ...readQuery } = referenceAnalysisQuery.shape;
const creatorProfileQueryWait = creatorProfileQuery.shape.wait_seconds;
const FRAME_FETCH_TIMEOUT_MS = 10_000;

export const THUMBNAIL_MAX_BYTES = 300_000;

export async function generationThumbnails(run: { state: string; generation?: { thumbnail_urls?: string[] | undefined } | undefined },
  fetchImpl: typeof fetch = fetch): Promise<{ type: "image"; data: string; mimeType: "image/jpeg" }[]> {
  if (run.state !== "succeeded") return [];
  const loaded = await Promise.all((run.generation?.thumbnail_urls ?? []).slice(0, 3).map(async url => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(FRAME_FETCH_TIMEOUT_MS) });
      if (!res.ok) return [];
      const bytes = Buffer.from(await res.arrayBuffer());
      return bytes.byteLength <= THUMBNAIL_MAX_BYTES ? [{ type: "image" as const, data: bytes.toString("base64"), mimeType: "image/jpeg" as const }] : [];
    } catch {
      return [];
    }
  }));
  return loaded.flat();
}

export async function keyFrameImages(frames: unknown, fetchImpl: typeof fetch = fetch):
  Promise<{ type: "image"; data: string; mimeType: "image/jpeg" }[]> {
  const keyed = ((frames as { key_frames?: { url?: unknown }[] } | null | undefined)?.key_frames ?? [])
    .flatMap(frame => (typeof frame.url === "string" ? [frame.url] : []));
  const step = keyed.length <= MAX_INLINE_FRAMES ? 1 : (keyed.length - 1) / (MAX_INLINE_FRAMES - 1);
  const urls = [...new Set(Array.from({ length: Math.min(MAX_INLINE_FRAMES, keyed.length) }, (_, i) => keyed[Math.round(i * step)]!))];
  const loaded = await Promise.all(urls.map(async url => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(FRAME_FETCH_TIMEOUT_MS) });
      return res.ok ? [{ type: "image" as const, data: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType: "image/jpeg" as const }] : [];
    } catch {
      return [];
    }
  }));
  return loaded.flat();
}

function uploadNextAction(upload: { width: number; height: number; expires_at: string }): string {
  return "Pass `url` as `image` to quote_ugc, then make_ugc, or the upload_id as {upload_id, rights_confirmed: true} in " +
    "references, first_frame or last_frame of quote_image, generate_image, quote_video and generate_video. Set " +
    `\`aspect_ratio\` explicitly to the picture's shape (${upload.width}x${upload.height}); the url expires at ` +
    `${upload.expires_at} — upload again after that. For workflow assets, use upload_id as asset_id ` +
    "and content_digest directly; it identifies the original uploaded bytes.";
}

export function createServer(client: ClipwrightClient, options: CreateServerOptions = { fileAccess: "local" }): McpServer {
  const ownAgent = options.ownAgent === true;
  const prices = options.prices ?? BASE_PRICES;
  const priced = (tool: string, description: string): string => withPriceLine(tool, description, prices);
  const listed = (tool: string): boolean => tool in ((server as unknown as { _registeredTools?: Record<string, object> })._registeredTools ?? {});
  const ugcRoute = ugcRouteLine(options.adGuide === true, ownAgent && options.facelessDiy === true);
  const server = new McpServer({ name: "clipwright", title: MCP_SERVER_TITLE, version: packageVersion(),
    icons: MCP_SERVER_ICONS.map(icon => ({ ...icon, sizes: [...icon.sizes] })) }, { instructions: mcpServerInstructions({ ownAgent,
    explainer: options.explainer === true, adGuide: options.adGuide, facelessDiy: ownAgent && options.facelessDiy === true }) });
  answerInvalidArguments(server);
  registerWorkflowTools(server, client, prices);
  if (ownAgent) registerFilmDraftTools(server, client, {}, options.adGuide === true, options.facelessDiy === true);

  server.registerTool(
    "make_ugc",
    {
      title: "Make a talking-actor video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("make_ugc",`${ugcRoute} ${MAKE_UGC_DESCRIPTION} ${MAKE_UGC_AGENT_PROTOCOL} ${adMethodPointer(options.adGuide === true)}`),
      inputSchema: ugcTool.extend(agentRetryShape),
    },
    async (args) =>
      withFailureReport(async () => {
        const { attempt, ...input } = args;
        const run = await client.startUgc(input as MakeUgcInputArgs, { attempt });
        return run.state === FAILED_STATE ? failedRepeatNote(formatGetRun(run), attempt) : formatGetRun(run);
      }),
  );

  server.registerTool(
    "get_run",
    {
      title: "Get run status",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Check the status of a video generation started by make_ugc or make_faceless, or of a generate_image or " +
        `generate_video run. ${thirdPartyData("a reference reel")} ` +
        "Pass the run_id, and wait_seconds to hold the answer until the run ends. While the run " +
        "is still working it returns status IN_PROGRESS with poll.arguments: call again with them until it reaches a " +
        "terminal state — SUCCEEDED (with video_url, or generation.url for generate_image and generate_video) or FAILED, " +
        "with display_markdown to show.",
      inputSchema: { run_id: runId, wait_seconds: z.number().int().min(0).max(RUN_WAIT_MAX_SECONDS).optional()
        .describe(`Wait up to this many seconds (at most ${RUN_WAIT_MAX_SECONDS}) for the run to end before answering.`) },
    },
    async ({ run_id, wait_seconds }, extra) =>
      withFailureReport(async () => {
        const run = await client.getRun(run_id, { ...(wait_seconds ? { wait_seconds } : {}), signal: extra.signal });
        const answer = formatGetRun(run);
        const images = await generationThumbnails(run);
        return images.length === 0 ? answer : { ...answer, content: [...answer.content, ...images] } as unknown as McpToolResponse;
      }),
  );

  server.registerTool(
    "get_run_shots",
    {
      title: "Get the shots of a run",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Read the shots of a video made by make_faceless or make_ugc. Pass the run_id. Free and read-only: " +
        "it changes nothing and starts nothing. With planned=true the answer holds the frame size, the frame " +
        "rate, the narration words with their timing, and for each shot its id, its span in frames, its kind, " +
        "the words it covers, its description and preview_url, a signed link to the shot's source picture or " +
        "clip. That link is a large file and it expires: read the shots again for a fresh one, never store " +
        "it. A field named in `withheld` is null on every shot. planned=false is a normal answer, not an " +
        "error: the run has no shots to show, and editable.state with editable.reason says why. " +
        "editable.media_available_until is how long the media of the run are stored. paid_edits.enabled " +
        "says whether a video can be made from an edit; while it is false, none can.",
      inputSchema: { run_id: runId },
    },
    async ({ run_id }) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.getRunShots(run_id)) }],
      })),
  );

  server.registerTool(
    "delete_run_media",
    {
      title: "Delete a run's files",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      description: DELETE_RUN_MEDIA_DESCRIPTION,
      inputSchema: { run_id: runId },
    },
    async ({ run_id }) => withFailureReport(async () => {
      await client.deleteRunMedia(run_id);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: run_id }) }] };
    }),
  );

  const [byDocument, byChanges] = revisionRequest.options;
  const revisionShape = {
    run_id: runId.describe("The run to revise: a succeeded make_faceless run, an original or a revision."),
    changes: byChanges.shape.changes.optional()
      .describe("Shots to generate anew over the run as it is: each a shot_id and the operation to generate for it."),
    document: byDocument.shape.document.optional()
      .describe("The whole edited document, as the run's draft holds it; retimes, deletions and uploads go this way."),
  };
  const revisionOf = ({ changes, document, max_credits }: { changes?: unknown; document?: unknown; max_credits?: number | undefined }): RevisionRequest =>
    revisionRequest.parse({ ...(changes === undefined ? {} : { changes }), ...(document === undefined ? {} : { document }),
      ...(max_credits === undefined ? {} : { max_credits }) });

  server.registerTool(
    "quote_revision",
    {
      title: "Quote a revision of a run",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price a revision of a run without spending credits: what it would change (summary) and what it costs " +
        `(billing.total_credits). Pass run_id and exactly one of changes or document, the same as revise_run. ${REVISION_CHARGE_TEXT} While paid edits are ` +
        "closed it answers editing_disabled and charges nothing.",
      inputSchema: revisionShape,
    },
    async ({ run_id, ...request }) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.quoteRevision(run_id, revisionOf(request))) }],
      })),
  );

  server.registerTool(
    "revise_run",
    {
      title: "Revise a run",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("revise_run",
        "Start a revision of a run made by make_faceless (paid): a new run that renders the video again with the " +
        "shots you change, by changes (a shot and what to generate for it) or by document (the whole edited " +
        `document); pass exactly one. ${REPEAT_TEXT("attempt 2")} ${REVISION_CHARGE_TEXT} An ` +
        "original has a limit on revisions running at once and on revisions failed or unfinished, and paid edits " +
        "of it close some days after it finished; a refusal names which. While paid edits are closed it answers " +
        "editing_disabled and charges nothing. Poll the new run with get_run; once it succeeded it is editable under its own run_id."),
      inputSchema: { ...revisionShape, max_credits: maxCreditsField, ...agentRetryShape },
    },
    async ({ run_id, attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.startRevision(run_id, revisionOf(request), { attempt }))),
  );

  const candidateShape = {
    run_id: runId.describe("The faceless run whose shot the candidate is for: a succeeded original or revision."),
    shot_id: candidateRequest.shape.shot_id.describe("The shot to make a candidate for, as get_run_shots names it."),
    operation: candidateRequest.shape.operation.describe("What to generate: one of the operations get_run_shots lists for the shot."),
    take: candidateRequest.shape.take.optional()
      .describe("Take number, 1 by default: the same request and take return the same run; take 2 makes another candidate."),
  };
  const candidateOf = ({ take, ...request }: Omit<CandidateRequest, "take"> & { take?: number | undefined }): CandidateRequest =>
    ({ ...request, take: take ?? 1 });

  server.registerTool(
    "quote_candidate",
    {
      title: "Quote a shot candidate",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price one shot candidate of a run without spending credits: one picture or clip made for one shot, to keep " +
        "or discard in a revision. Pass run_id, shot_id and operation, the same as create_candidate; the answer names " +
        `the unit, its credits and usable_until, the last moment the candidate can enter a revision. ${CANDIDATE_CHARGE_TEXT} While shot candidates are ` +
        "closed it answers editing_disabled and charges nothing.",
      inputSchema: candidateShape,
    },
    async ({ run_id, ...request }) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.quoteCandidate(run_id, candidateOf(request))) }],
      })),
  );

  server.registerTool(
    "create_candidate",
    {
      title: "Make a shot candidate",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("create_candidate",
        "Make a shot candidate of a run made by make_faceless (paid): a new run of skill edit_shot that generates one " +
        `picture or clip for one shot, to keep or discard in a later revision. ${CANDIDATE_CHARGE_TEXT} ${REPEAT_TEXT("take 2")} ` +
        "An original has a limit on candidates running at once and on candidates failed or " +
        "unfinished, apart from its revisions; a refusal names which. While shot candidates are closed it answers " +
        "editing_disabled and charges nothing. Poll the new run with get_run; once it succeeded, its candidate.preview_url shows what was made."),
      inputSchema: { ...candidateShape, max_credits: maxCreditsField },
    },
    async ({ run_id, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.createCandidate(run_id, candidateOf(request)))),
  );

  const generationCharge = "A generation that fails is charged nothing.";
  const closedTerms = `${generationCharge} While generations are closed it answers generations_disabled or generations_marking_pending and charges nothing.`;
  const quoteTerms =
    "A reference is {upload_id, rights_confirmed: true} for a picture from upload_image or create_upload (rights_confirmed states you may use " +
    "the people and works in it), {run_id} of a succeeded generate_image run of this account until its reusable_until, " +
    `or {asset_id} of a picture asset from create_asset, whose rights were confirmed when it was made. ${closedTerms}`;
  const generationTerms = `${generationCharge} ${REPEAT_TEXT("attempt 2")}`;
  const shotGuide =
    "Pass prompt, or shot to describe the clip as a shot. Write the first frame as start_state, and declare every object the clip " +
    "shows in subject.objects with its exact count and where it is at the start. Split duration_s into beats of 1 to 5 seconds that " +
    "cover every second: one action per beat, done once, written as cause, contact and result (a fingertip dips into the jar once " +
    "and lifts a small dab), and an end_state saying what the frame shows when the beat ends (a dab sits on the fingertip). A " +
    "change runs toward a stated end (the dab thins and sinks in; the cheek glows), and a still beat owns the last seconds, so " +
    "the action is not repeated. Write every field as what is visible, \"her fingertips are clean\", never as an absence: no, " +
    "not, never, without and the like are refused. For a sequence, pass the previous clip's continuity.end_state as continues_from " +
    "and repeat light word for word. A shot that breaks a rule is refused before any charge.";
  const imageTool = z.strictObject(generateImageRequest.shape), imageRunTool = imageTool.extend(agentRetryShape);
  const videoTool = z.strictObject(generateVideoRequest.shape), videoRunTool = videoTool.extend(agentRetryShape);

  server.registerTool(
    "list_generation_models",
    {
      title: "List generation models",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the models generate_image and generate_video take, each with its modes, aspect ratios, resolutions, " +
        "durations, output width and height, and unit_credits: credits per image, or per second of a clip. Only measured " +
        "combinations are listed; any other is refused with unsupported_combination before any charge. Free.",
      inputSchema: {},
    },
    async () => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.listGenerationModels()) }],
    })),
  );

  server.registerTool(
    "quote_image",
    {
      title: "Quote an image",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price one generate_image call without spending credits: its credits (one image at its model's unit_credits), " +
        `its width and height, and warnings. ${quoteTerms}`,
      inputSchema: imageTool,
    },
    async (args) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteImage(args)) }],
    })),
  );

  server.registerTool(
    "generate_image",
    {
      title: "Generate an image",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("generate_image",
        "Generate one image from a prompt (paid): a new run of skill generate_image, charged the quoted credits per image " +
        "once it is delivered. Poll get_run; once it succeeded, generation.url is the image and its run_id can be a reference of a later generation. " + generationTerms),
      inputSchema: imageRunTool,
    },
    async ({ attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.generateImage(request, { attempt }))),
  );

  server.registerTool(
    "quote_video",
    {
      title: "Quote a clip",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price one generate_video call without spending credits: its credits (unit_credits per second of duration_s), " +
        `its width and height, and warnings. ${shotGuide} A reference is as quote_image states it. ${closedTerms}`,
      inputSchema: videoTool,
    },
    async (args) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteVideo(generateVideoRequest.parse(args))) }],
    })),
  );

  server.registerTool(
    "generate_video",
    {
      title: "Generate a clip",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("generate_video", withRoute(
        "Generate one clip (silent unless audio: true) from a prompt or a shot, as quote_video explains (paid). It is a new run of skill " +
        "generate_video, charged unit_credits per second of duration_s " +
        "once it is delivered. Modes: text; first_frame (first_frame, optional last_frame, of the requested aspect ratio " +
        "within 2%); reference (1 to 4 references). Poll get_run; once it succeeded, generation.url is the clip. " + generationTerms,
        generateVideoRoute({ ad: options.adGuide === true, film: ownAgent, filmFormats: ownAgent && options.facelessDiy === true }))),
      inputSchema: videoRunTool,
    },
    async ({ attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.generateVideo(generateVideoRequest.parse(request), { attempt }))),
  );

  const upscaleTool = z.strictObject(upscaleRequest.shape), upscaleRunTool = upscaleTool.extend(agentRetryShape);
  server.registerTool(
    "quote_upscale",
    {
      title: "Quote an upscale",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: UPSCALE_QUOTE_DESCRIPTION,
      inputSchema: upscaleTool,
    },
    async (args) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteUpscale(upscaleRequest.parse(args))) }],
    })),
  );

  server.registerTool(
    "upscale",
    {
      title: "Upscale",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("upscale", `${UPSCALE_DESCRIPTION} ${generationTerms}`),
      inputSchema: upscaleRunTool,
    },
    async ({ attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.upscale(upscaleRequest.parse(request), { attempt }))),
  );

  server.registerTool(
    "quote_ugc",
    {
      title: "Quote a video",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        `${ugcRoute} Estimate the credit cost of a make_ugc call without spending credits; show the user the price before make_ugc. ` +
        `${adMethodPointer(options.adGuide === true)} For such a request the quote's suggestions[] name devices that fit the script's ` +
        "words, each with its words, field and why; the quote adds none of them. plan[] lists every device on the words with its credits, " +
        "and edit_style_applied the style and the fields it set.",
      inputSchema: ugcTool,
    },
    async (args) =>
      withFailureReport(async () => {
        const quote = await client.quoteUgc(args as MakeUgcInputArgs);
        return { content: [{ type: "text", text: JSON.stringify({ ...quote, display_markdown: ugcQuoteMarkdown(quote), display_hint: RUN_DISPLAY_HINT }) }] };
      }),
  );

  server.registerTool(
    "upload_image",
    {
      title: "Upload an image",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: UPLOAD_IMAGE_DESCRIPTION,
      inputSchema: {
        path: z.string().min(1).optional()
          .describe("Absolute or cwd-relative path to a PNG or JPEG file; only on a server running on your machine"),
        url: z.string().url().optional().describe("Public https URL of a PNG or JPEG; the server downloads it"),
      },
    },
    async ({ path, url }) =>
      withFailureReport(async () => {
        if (url !== undefined && path === undefined) {
          const imported = await client.importUpload(url);
          return { content: [{ type: "text", text: JSON.stringify({ ...imported, next_action: uploadNextAction(imported) }) }], isError: false };
        }
        if (path === undefined || url !== undefined) throw new Error("Pass exactly one of path or url");
        if (options.fileAccess !== "local") throw new Error(REMOTE_UPLOAD_REFUSAL);
        const bytes = new Uint8Array(await readFile(path));
        const mediaType = sniffUploadMediaType(bytes);
        if (mediaType === null || bytes.byteLength > UPLOAD_MAX_BYTES) {
          throw new Error(
            mediaType === null
              ? `${path} is not a PNG or JPEG file (checked by signature, not by extension)`
              : `${path} is ${bytes.byteLength} bytes; the ceiling is ${UPLOAD_MAX_BYTES}`,
          );
        }
        const upload = await client.uploadImage(bytes, mediaType);
        return { content: [{ type: "text", text: JSON.stringify({ ...upload, next_action: uploadNextAction(upload) }) }], isError: false };
      }),
  );

  server.registerTool(
    "create_upload",
    {
      title: "Create an upload",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: CREATE_UPLOAD_DESCRIPTION,
      inputSchema: {
        media_type: z.enum(UPLOAD_MEDIA_TYPES).optional().describe("With bytes and sha256: a presigned PUT; omit all three for a page link"),
        bytes: z.number().int().positive().max(UPLOAD_MAX_BYTES).optional().describe("Exact file size in bytes"),
        sha256: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Lowercase hex SHA-256 of the file"),
        filename: z.string().min(1).max(200).optional(),
      },
    },
    async ({ media_type, bytes, sha256, filename }) => withFailureReport(async () => {
      if (media_type === undefined && bytes === undefined && sha256 === undefined && filename === undefined) {
        const page = await client.createUploadPage();
        return { content: [{ type: "text", text: JSON.stringify({ ...page, next_action: UPLOAD_PAGE_NEXT_ACTION }) }] };
      }
      if (media_type === undefined || bytes === undefined || sha256 === undefined) {
        throw new Error("Pass media_type, bytes and sha256 (filename optional) for a presigned PUT, or no arguments for an upload page link");
      }
      const intent = await client.createUpload({ media_type, bytes, sha256, ...(filename === undefined ? {} : { filename }) });
      return { content: [{ type: "text", text: JSON.stringify(intent) }] };
    }),
  );

  server.registerTool(
    "get_upload",
    {
      title: "Get an upload",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_UPLOAD_DESCRIPTION,
      inputSchema: { upload_id: uploadId },
    },
    async ({ upload_id }) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.getUpload(upload_id)) }],
    })),
  );

  server.registerTool(
    "delete_upload",
    {
      title: "Delete an upload",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      description: DELETE_UPLOAD_DESCRIPTION,
      inputSchema: { upload_id: uploadId },
    },
    async ({ upload_id }) => withFailureReport(async () => {
      await client.deleteUpload(upload_id);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: upload_id }) }] };
    }),
  );

  const assetText = async (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(await value) }] });
  server.registerTool(
    "create_asset",
    {
      title: "Create an asset",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: CREATE_ASSET_DESCRIPTION,
      inputSchema: {
        source: z.union([...assetSource.options, z.strictObject({ path: z.string().min(1)
          .describe("Absolute or cwd-relative path to a PNG, JPEG or MP4 file; only on a server running on your machine") })]),
        role: createAssetRequest.shape.role,
        name: createAssetRequest.shape.name,
        rights_confirmed: createAssetRequest.shape.rights_confirmed,
        analysis_only: createAssetRequest.shape.analysis_only,
      },
    },
    async ({ source, role, name, rights_confirmed, analysis_only }) => withFailureReport(async () => {
      if (!("path" in source)) {
        return assetText(client.createAsset({ source, role, name, ...(rights_confirmed === undefined ? {} : { rights_confirmed }),
          ...(analysis_only === undefined ? {} : { analysis_only }) }));
      }
      if (options.fileAccess !== "local") throw new Error(REMOTE_ASSET_PATH_REFUSAL);
      if (rights_confirmed === analysis_only) {
        throw new Error("A local file is your own material: pass rights_confirmed: true, or analysis_only: true to keep it for analyze_reference alone");
      }
      const bytes = new Uint8Array(await readFile(source.path));
      const claim = analysis_only ? { analysis_only } : { rights_confirmed: true as const };
      if (Buffer.from(bytes.subarray(4, 8)).toString("latin1") === "ftyp") {
        return assetText(putLocalClip(client, bytes, source.path, { role, name, ...(analysis_only ? { analysis_only } : {}) }));
      }
      const mediaType = sniffUploadMediaType(bytes);
      if (mediaType === null || bytes.byteLength > UPLOAD_MAX_BYTES) {
        throw new Error(mediaType === null
          ? `${source.path} is not a PNG or JPEG file (checked by signature, not by extension)`
          : `${source.path} is ${bytes.byteLength} bytes; the ceiling is ${UPLOAD_MAX_BYTES}`);
      }
      return assetText(client.createAssetFromBytes(bytes, mediaType, { role, name, ...claim }));
    }),
  );

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: LIST_ASSETS_DESCRIPTION,
      inputSchema: {
        role: z.enum(ASSET_ROLES).optional(),
        kind: z.enum(ASSET_KINDS).optional(),
        mascot: z.literal("true").optional().describe("true: only saved mascots"),
        limit: z.number().int().min(1).max(ASSET_LIST_MAX_LIMIT).optional(),
        cursor: z.string().min(1).optional().describe("next_cursor of the previous page"),
      },
    },
    async (query) => withFailureReport(async () => {
      const page = await client.listAssets({ ...query, limit: query.limit ?? ASSET_TOOL_PAGE }), text = JSON.stringify(page);
      if (text.length <= ASSET_TOOL_ANSWER_CHARS || page.assets.length < 2) return { content: [{ type: "text" as const, text }] };
      let room = ASSET_TOOL_ANSWER_CHARS - (text.length - page.assets.reduce((sum, a) => sum + JSON.stringify(a).length + 1, 0)), fits = 0;
      for (const asset of page.assets.slice(0, -1)) {
        room -= JSON.stringify(asset).length + 1;
        if (room < 0) break;
        fits++;
      }
      let cut = await client.listAssets({ ...query, limit: Math.max(1, fits) });
      while (JSON.stringify(cut).length > ASSET_TOOL_ANSWER_CHARS && cut.assets.length > 1) {
        cut = await client.listAssets({ ...query, limit: cut.assets.length - 1 });
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(cut) }, { type: "text" as const, text: `This page was cut to ${cut.assets.length} ` +
        "assets to fit your tool output; next_cursor continues. To find one sooner, filter by role or kind, or pass mascot true." }] };
    }),
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get an asset",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_ASSET_DESCRIPTION,
      inputSchema: { asset_id: assetId },
    },
    async ({ asset_id }) => withFailureReport(async () => {
      const item = await client.getAsset(asset_id);
      const ready = item.state === "ready" ? item as Extract<AssetItemRead, { state: "ready" }> : null;
      const small = ready?.kind === "image" && ready.bytes <= ASSET_BASE64_MAX_BYTES ? ready.url : null;
      const source = typeof ready?.preview_url === "string" ? ready.preview_url : small;
      const image = source ? await fetchImage(source, { maxBytes: ASSET_BASE64_MAX_BYTES }) : null;
      return { content: [{ type: "text" as const, text: JSON.stringify(item) }, ...(image ? [image] : [])] } as unknown as McpToolResponse;
    }),
  );

  server.registerTool(
    "update_asset",
    {
      title: "Rename an asset",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      description: UPDATE_ASSET_DESCRIPTION,
      inputSchema: { asset_id: assetId, name: createAssetRequest.shape.name.optional(), role: z.enum(ASSET_ROLES).optional() },
    },
    async ({ asset_id, ...patch }) => withFailureReport(async () => assetText(client.updateAsset(asset_id, patch))),
  );

  server.registerTool(
    "delete_asset",
    {
      title: "Delete an asset",
      annotations: { readOnlyHint: false, destructiveHint: true },
      description: DELETE_ASSET_DESCRIPTION,
      inputSchema: { asset_id: assetId },
    },
    async ({ asset_id }) => withFailureReport(async () => {
      await client.deleteAsset(asset_id);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: asset_id }) }] };
    }),
  );

  server.registerTool(
    "quote_analysis",
    {
      title: "Quote a reference analysis",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: QUOTE_ANALYSIS_DESCRIPTION,
      inputSchema: analyzeReferenceRequest.shape,
    },
    async (request) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteAnalysis(request)) }],
    })),
  );

  server.registerTool(
    "analyze_reference",
    {
      title: "Analyse a reference ad",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      description: priced("analyze_reference", ANALYZE_REFERENCE_DESCRIPTION),
      inputSchema: analyzeReferenceRequest.shape,
    },
    async (request) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(analysisAnswer(await client.analyzeReference(request), listed)) }],
    })),
  );

  server.registerTool(
    "get_reference_analysis",
    {
      title: "Get a reference analysis",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_REFERENCE_ANALYSIS_DESCRIPTION,
      inputSchema: { analysis_id: referenceAnalysisId, ...readQuery,
        frames_as: z.enum(["links", "images"]).optional().describe(`images: also return up to ${MAX_INLINE_FRAMES} key frames as images in this answer`),
        include: z.array(z.enum(REFERENCE_INCLUDES)).max(REFERENCE_INCLUDES.length).optional()
          .describe("profile: also the reference_profile; frames: also the frame links. Both are left out by default.") },
    },
    async ({ analysis_id, frames_as, include, ...query }) => withFailureReport(async () => {
      const analysis = await client.getReferenceAnalysis(analysis_id, { ...query, display: "markdown" });
      const images = frames_as === "images" ? await keyFrameImages(analysis.frames) : [];
      return { content: [{ type: "text" as const, text: JSON.stringify(analysisAnswer(analysis, listed, include)) }, ...images] } as unknown as McpToolResponse;
    }),
  );

  server.registerTool(
    "quote_creator_profile",
    {
      title: "Quote a creator profile",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: QUOTE_CREATOR_PROFILE_DESCRIPTION,
      inputSchema: analyzeCreatorRequest.shape,
    },
    async (request) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteCreatorProfile(request)) }],
    })),
  );

  server.registerTool(
    "analyze_creator",
    {
      title: "Profile a creator",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      description: priced("analyze_creator", ANALYZE_CREATOR_DESCRIPTION),
      inputSchema: analyzeCreatorRequest.shape,
    },
    async (request) => withFailureReport(async () => {
      const started = await client.analyzeCreator(request);
      const done = started.state === "queued" || started.state === "analyzing"
        ? await client.getCreatorProfile(started.profile_id, { wait_seconds: CREATOR_START_WAIT_SECONDS, display: "markdown" })
        : await client.getCreatorProfile(started.profile_id, { display: "markdown" });
      return { content: [{ type: "text", text: JSON.stringify(withProfilePoll(done)) }] };
    }),
  );

  server.registerTool(
    "get_creator_profile",
    {
      title: "Get a creator profile",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_CREATOR_PROFILE_DESCRIPTION,
      inputSchema: { profile_id: creatorProfileId, wait_seconds: creatorProfileQueryWait },
    },
    async ({ profile_id, wait_seconds }) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(withProfilePoll(await client.getCreatorProfile(profile_id,
        { ...(wait_seconds === undefined ? {} : { wait_seconds }), display: "markdown" }))) }],
    })),
  );
  server.registerTool(
    "quote_trends",
    {
      title: "Quote a trend search",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: QUOTE_TRENDS_DESCRIPTION,
      inputSchema: findTrendsInput.shape,
    },
    async (request) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.quoteTrends(request)) }],
    })),
  );
  server.registerTool(
    "find_trends",
    {
      title: "Find trending reels on a topic",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      description: priced("find_trends", FIND_TRENDS_DESCRIPTION),
      inputSchema: { ...findTrendsInput.shape, sort: trendSort.optional() },
    },
    async ({ sort, ...request }) => withFailureReport(async () => {
      const started = await client.findTrends(request);
      const order = sort === undefined ? {} : { sort };
      const done = started.state === "queued" || started.state === "searching"
        ? await client.getTrendSearch(started.search_id, { wait_seconds: CREATOR_START_WAIT_SECONDS, display: "markdown", ...order })
        : await client.getTrendSearch(started.search_id, { display: "markdown", ...order });
      return { content: [{ type: "text", text: JSON.stringify(withTrendPoll(done, order)) }] };
    }),
  );
  server.registerTool(
    "get_trend_search",
    {
      title: "Get a trend search",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_TREND_SEARCH_DESCRIPTION,
      inputSchema: { search_id: trendSearchId, wait_seconds: trendSearchQuery.shape.wait_seconds, sort: trendSort.optional() },
    },
    async ({ search_id, wait_seconds, sort }) => withFailureReport(async () => {
      const order = sort === undefined ? {} : { sort };
      const read = await client.getTrendSearch(search_id, { ...(wait_seconds === undefined ? {} : { wait_seconds }), display: "markdown", ...order });
      return { content: [{ type: "text", text: JSON.stringify(withTrendPoll(read, order)) }] };
    }),
  );
  server.registerTool("trend_niches", {
    title: "Read or save the trend niches",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: TREND_NICHES_DESCRIPTION,
    inputSchema: { niches: trendNichesInput.shape.niches.optional() },
  }, async ({ niches }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(niches === undefined ? await client.getTrendNiches() : await client.setTrendNiches({ niches })) }],
  })));
  server.registerTool(
    "delete_creator_profile",
    {
      title: "Delete a creator profile",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      description: DELETE_CREATOR_PROFILE_DESCRIPTION,
      inputSchema: { profile_id: creatorProfileId },
    },
    async ({ profile_id }) => withFailureReport(async () => {
      await client.deleteCreatorProfile(profile_id);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: profile_id }) }] };
    }),
  );
  server.registerTool(
    "list_voices",
    {
      title: "List voices",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the voices for the `voice` field of make_ugc, or of make_faceless with skill=make_faceless. " +
        "Without `skill` the list holds the make_ugc voices only. Each voice names in `skill` the one skill that speaks it; " +
        "the other refuses it before any charge. skill=make_faceless lists " +
        `the ${FACELESS_VOICE_NAMES.length} narration voices of make_faceless (kind faceless_voice, with a ` +
        `language and a gender; default ${DEFAULT_FACELESS_VOICE}; no voice_id). ` +
        "make_ugc voices: the presets, then the " +
        `${MODEL_VOICE_NAMES.length} voices of ${MODEL_VOICE_MODEL} (kind model_voice), then catalog voices in ` +
        `${CATALOG_LANGUAGES.length} languages. Filter by \`language\` (native; any voice speaks any supported ` +
        "language), `gender`, `age`, `use_case` and `model`; an unknown value is refused with the allowed ones. " +
        "Pick a voice by `name` (voice=\"george\"), always the same voice. " +
        "A model_voice voice is spoken only by its `model`: naming it selects that model; its languages are those " +
        "measured on the model, its gender listed only where known. `voice_id` takes an unlisted raw vendor id, such as a " +
        "cloned voice. Keep any voice the user chose. `preview_url` is a short sample in that voice and model (a model_voice " +
        "one in English or the filtered language): play it before a paid render. It expires at `preview_expires_at`: call " +
        "again, never store it; none means no sample yet. `words_per_second` is an English voice's measured pace; eleven_v4 " +
        "has no speed, so match a presenter by the nearest pace. Free. Script limits by speech model: the script field of quote_ugc.",
      inputSchema: voicesQueryShape,
    },
    async (filters) =>
      withFailureReport(async () => {
        const voices = await client.listVoices(filters);
        return { content: [{ type: "text", text: JSON.stringify({ voices }) }] };
      }),
  );

  server.registerTool(
    "list_template_sounds",
    {
      title: "List template sounds",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the sounds make_ugc templates play, by beat: where each beat plays, its default and every name it takes. " +
        "A run plays the defaults; template_sounds { beat: name } swaps a beat's sound, and template_sounds=false plays none. " +
        "The edit beat plays on every cut only with make_ugc edit_sounds=true. " +
        "music_beds lists render_edit's free music library: pass an id as music.track, picking the closest genre, energy and tempo. " +
        "Sounds never change the price. Free.",
      inputSchema: {},
    },
    async () => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.listTemplateSounds()) }],
    })),
  );

  server.registerTool(
    "list_moves",
    {
      title: "List moves",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "The catalogue of moves: motion and graphics to put on lines of a script, for make_ugc, make_faceless and plan_reference_remake " +
        "moves. Filter by beat (hook, problem, demo, proof, social_proof, offer, cta, transition), content (what the line has: number, list, " +
        "quote, rating, photo, screenshot, footage, link, words, none), surface, mood, skill or q; next_cursor pages. Each line says what the " +
        "move does for the viewer and its credits per use (0 is free). names=a,b gives those moves in full: look, data to pass, what must " +
        "already be on the line, how often a video takes it and what pairs with it. A soon move is coming and cannot be picked yet. Free.",
      inputSchema: motionMovesQuery.shape,
    },
    async (filters) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.listMoves(filters)) }],
    })),
  );

  server.registerTool("list_actors", {
    title: "List actors",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: "List saved Clipwright actors with stable IDs, gender, age and verified image formats. Choose actor_id for quote_ugc and make_ugc. preview_url is the actor's picture; a personal actor's expires, so list again for a fresh one; actor IDs remain reusable. actor_id is not combined with image or actor_gender. Without voice, the actor speaks the default voice of their gender.",
    inputSchema: {},
  }, async () => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify({ actors: await client.listActors() }) }],
  })));

  server.registerTool("get_actor_defaults", {
    title: "Get actor B-roll default",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: "Read this account actor's saved B-roll default; set_actor_defaults' broll_policy says what each value does.",
    inputSchema: { actor_id: z.string().min(1) },
  }, async ({ actor_id }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.getActorDefaults(actor_id)) }],
  })));

  server.registerTool("set_actor_defaults", {
    title: "Set actor B-roll default",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Save this account actor's B-roll default without spending credits; broll_policy says what each value does.",
    inputSchema: { actor_id: z.string().min(1), ...actorDefaultsInput.shape },
  }, async ({ actor_id, ...input }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.setActorDefaults(actor_id, input)) }],
  })));

  server.registerTool("extract_brand", {
    title: "Read a brand from a site",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    description: `Free. ${thirdPartyData("the site or reel")} ` + "A public site's colours, fonts, logo and corners as a proposed design, and its own name and description as a " +
      "proposed script voice (voice.about), with a proposed brand_name and prompt_block; none is saved until passed to brand_kit. " +
      "niches: up to three trend niches from the site's own words, saved only when passed to trend_niches, from left out. " +
      "logo_url: import with create_asset for design.logo_asset_id. " +
      "analysis_id instead of url: a style proposed from a finished analyze_reference of a video the user likes (colours, faces, motion, " +
      "transition and caption habits; never its logo, characters or frames). Pass its theme_overrides to create_film_draft for sample " +
      "stills; the style is saved only when passed to brand_kit style.",
    inputSchema: { url: extractBrandInput.shape.url.optional(), analysis_id: proposeBrandStyleInput.shape.analysis_id.optional(),
      name: proposeBrandStyleInput.shape.name },
  }, async ({ url, analysis_id, name }) => withFailureReport(async () => {
    if ((url === undefined) === (analysis_id === undefined)) {
      return { content: [{ type: "text", text: "Pass url (a site) or analysis_id (a reference video's analysis), one of them." }], isError: true };
    }
    const answer = analysis_id === undefined ? await client.extractBrand(url!)
      : await client.proposeBrandStyle({ analysis_id, ...(name === undefined ? {} : { name }) });
    return { content: [{ type: "text", text: JSON.stringify(answer) }] };
  }));

  server.registerTool("brand_kit", {
    title: "Read or save the brand kit",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: `Free. ${thirdPartyData("a site")} ` + "With neither field: the saved design (used when a video names none), the saved script voice, our looks and faces. " +
      "design, voice: the one to save; the other stays as saved, and voice {} clears the voice. Read voice before you write " +
      "a script: when a call passes none, the server takes its banned phrases out, adds its sign-off and names both in warnings[]. " +
      "styles: the saved styles; style saves one by name (a film draft names it in brand_style). " +
      "brand_name, look {tag, description} (the picture look of generated pictures and clips) and prompt_block (a style block to paste " +
      "into every picture and clip prompt): the ones to save; \"\" or {} clears one. The guides serve them as brand.",
    inputSchema: { design: mcpDesign.optional(), voice: mcpScriptVoice.optional(),
      style: z.object({ name: z.string(), design: mcpDesign, habits: z.record(z.string(), z.unknown()).optional(),
        source_analysis_id: z.string().optional() }).strict().optional(),
      brand_name: z.string().optional(), look: z.record(z.string(), z.unknown()).optional(),
      prompt_block: z.string().optional() },
  }, async ({ design, voice, style, brand_name, look, prompt_block }) => withFailureReport(async () => {
    const parts = { design, voice, brand_name, look, prompt_block };
    if (style !== undefined) {
      if (Object.values(parts).some(part => part !== undefined)) {
        return { content: [{ type: "text", text: "Save a style alone: send style without the kit's other fields." }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(await client.saveBrandStyle(style as SaveBrandStyleInput)) }] };
    }
    if (Object.values(parts).every(part => part === undefined)) return { content: [{ type: "text", text: JSON.stringify(await client.getBrandKit()) }] };
    const empty = (value: object) => Object.values(value).every(part => part === undefined);
    const kit: BrandKitInput = {
      ...(design === undefined ? {} : { design: design as DesignInput }),
      ...(voice === undefined ? {} : { voice: empty(voice) ? null : voice as ScriptVoice }),
      ...(brand_name === undefined ? {} : { brand_name: brand_name === "" ? null : brand_name }),
      ...(look === undefined ? {} : { look: empty(look) ? null : look as unknown as BrandLook }),
      ...(prompt_block === undefined ? {} : { prompt_block: prompt_block === "" ? null : prompt_block }),
    };
    return { content: [{ type: "text", text: JSON.stringify(await client.saveBrandKit(kit)) }] };
  }));

  server.registerTool(
    "create_actor",
    {
      title: "Create a personal actor",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("create_actor", CREATE_ACTOR_DESCRIPTION),
      inputSchema: { ...createActorInputShape, ...agentRetryShape },
    },
    async (args) =>
      withFailureReport(async () => {
        const { attempt, ...input } = args;
        const run = await client.createActor(input, { attempt });
        return formatGetRun(run);
      }),
  );

  server.registerTool(
    "quote_actor",
    {
      title: "Quote a personal actor",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Estimate the credit cost of create_actor without spending credits. Call this first and show the " +
        "price before create_actor: each requested format is a separate charged image, except a portrait from your own " +
        "image (portrait), which costs nothing. A portrait that is not your own image asset within 2% of 9:16 is " +
        "refused here; one without exactly one well-framed face fails the run at no charge.",
      inputSchema: createActorInputShape,
    },
    async (args) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.quoteActor(args)) }],
      })),
  );

  server.registerTool(
    "make_faceless",
    {
      title: "Make a faceless video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: priced("make_faceless", `${MAKE_FACELESS_DESCRIPTION} ${MAKE_FACELESS_AGENT_PROTOCOL}`),
      inputSchema: offeredFacelessInput.extend(agentRetryShape),
    },
    async (args) =>
      withFailureReport(async () => {
        const { attempt, ...input } = args;
        const run = await client.startFaceless(makeFacelessInput.parse(input), { attempt });
        return formatGetRun(run);
      }),
  );

  server.registerTool(
    "quote_faceless",
    {
      title: "Quote a faceless video",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Estimate the credit cost of make_faceless without spending credits; show the user the price before make_faceless. " +
        "It can also name the other faceless ways this server offers, each with an estimate, not a quote.",
      inputSchema: offeredFacelessInput,
    },
    async (args) =>
      withFailureReport(async () => {
        const input = makeFacelessInput.parse(args), answer = await client.quoteFaceless(input);
        const served = (answer.alternatives ?? []).filter(way => way.route === "pictures" ||
          (way.route === "cartoon" ? ownAgent && options.facelessDiy === true : ownAgent));
        const { alternatives: _all, ...rest } = answer;
        const quote = served.length > 1 ? { ...rest, alternatives: served } : rest;
        const shown = facelessQuoteMarkdown(quote, { styleReference: input.style_reference !== undefined });
        return { content: [{ type: "text", text: JSON.stringify({ ...quote, display_markdown: shown, display_hint: RUN_DISPLAY_HINT }) }] };
      }),
  );

  server.registerTool(
    "delete_actor",
    {
      title: "Delete a personal actor",
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        "Delete a personal actor of this account by actor_id. Videos already made with it stay as they are, " +
        "and new runs can no longer use it. An actor used by a run that has not finished is refused until that " +
        "run ends. Catalog actors belong to Clipwright and are not deletable.",
      inputSchema: { actor_id: z.string().min(1).describe("Personal actor id from list_actors.") },
    },
    async ({ actor_id }) =>
      withFailureReport(async () => {
        await client.deleteActor(actor_id);
        return { content: [{ type: "text", text: JSON.stringify({ deleted: actor_id }) }] };
      }),
  );

  server.registerTool("get_account", {
    title: "Get account credits",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description:
      "Read this account's credits. Free, spends nothing. debt_credits above zero means make_ugc " +
      "is refused with debt_outstanding whatever the balance, until the account buys credits; " +
      "with no debt, balance_credits is what a new run can spend: plan_credits, this month's plan credits that runs spend " +
      "first and that do not roll over, plus pack_credits, which never expire. plan names the monthly plan, when it renews " +
      "and whether it ends then, or is null. holds_credits are reserved for " +
      "runs still in progress and settle when they finish. grants lists unexpired credit grants. " +
      "support_replies lists Clipwright's replies to this account's support requests and send_feedback, newest first; " +
      "request_id is the feedback_id send_feedback returned. " +
      "quote_ugc already warns when make_ugc would be refused; this tool gives the numbers behind it.",
    inputSchema: {},
  }, async () => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.getAccount()) }],
  })));

  if (options.adGuide === true) {
    server.registerTool("get_ad_guide", {
      title: "Read the ad guide",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_AD_GUIDE_DESCRIPTION,
      inputSchema: adGuideQuery.shape,
    }, async (query) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.getAdGuide(query)) }],
    })));
  }

  server.registerTool("list_prices", {
    title: "List prices",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description:
      "List what every Clipwright tool costs in credits. Free, spends nothing. Each entry names the tool, its REST route " +
      "and its price: lines of credits per unit (call, second of video, second the presenter is in the video, image, clip, second of " +
      "clip), added up, with minimum_credits when there is one; or, where the price depends on the input, a formula. " +
      "Free tools cost 0. For the exact number of a paid call, use the quote tool the entry names.",
    inputSchema: {},
  }, async () => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.listPrices()) }],
  })));

  server.registerTool("send_feedback", {
    title: "Send feedback",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: SEND_FEEDBACK_DESCRIPTION,
    inputSchema: feedbackRequest.shape,
  }, async (request) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.sendFeedback(request)) }],
  })));

  server.registerTool("describe_tool", {
    title: "Describe a tool",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: DESCRIBE_TOOL_DESCRIPTION,
    inputSchema: {
      tool: z.string().min(1).describe("The tool's name, such as quote_ugc."),
      field: z.string().min(1).optional().describe("One field and its subfields, such as templates; omitted, every field."),
    },
  }, async ({ tool, field }) => {
    const described = describeTool(await fullList(), tool, field);
    return described === undefined
      ? { content: [{ type: "text", text: `No tool is named "${tool}"; tools/list names every tool.` }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(described) }] };
  });

  const fullList = advertiseSlimTools(server, prices);
  return server;
}
