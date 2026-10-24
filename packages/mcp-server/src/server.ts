import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClipwrightClient } from "@clipwright/sdk";
// `mcpUgcInputShape`, not the full shape: fields the server rejects must not
// be offered to a caller who would get a 400 for using them.
import {
  mcpUgcInputShape,
  type MakeUgcInputArgs,
  actorDefaultsInput,
  BROLL_POLICY_DESCRIPTION,
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
  MODEL_VOICE_MODEL,
  MODEL_VOICE_NAMES,
  SCRIPT_LENGTH_DESCRIPTION,
  voicesQueryShape,
  agentRetryShape,
  runId,
  MAKE_UGC_DESCRIPTION,
  MAKE_UGC_AGENT_PROTOCOL,
  MAKE_FACELESS_DESCRIPTION,
  MAKE_FACELESS_AGENT_PROTOCOL,
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
  GET_ASSET_DESCRIPTION,
  LIST_ASSETS_DESCRIPTION,
  UPDATE_ASSET_DESCRIPTION,
} from "@clipwright/core";
import { formatGetRun, withFailureReport } from "./format.js";
import { registerWorkflowTools } from './workflow-tools.js';

// Version from the manifest: a literal drifts, and a JSON import breaks `rootDir`.
const packageVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;

export interface CreateServerOptions {
  /** `local` reads the caller's files (stdio); `refuse` is a remote server, where a path names a file on another machine. */
  fileAccess: "local" | "refuse";
}

/** What `upload_image` answers a path on a server that reads no files; the tool list stays the same on both transports. */
export const REMOTE_UPLOAD_REFUSAL =
  "This Clipwright server is remote and cannot read files on your machine, so upload_image takes no path here. " +
  "Pass a public https URL as upload_image({url}), or call create_upload and PUT the file to the returned put_url " +
  "(for example with curl), then use the upload_id.";

/** What `create_asset` answers a path on a server that reads no files. */
export const REMOTE_ASSET_PATH_REFUSAL =
  "This Clipwright server is remote and cannot read files on your machine, so create_asset takes no path here. " +
  "Pass source {url} (add kind: \"video\" for an MP4) or {base64, media_type}, or pass {put: {media_type, bytes, sha256}} " +
  "and PUT the file to the returned upload.put_url (for example with curl), then call get_asset.";

/** A local MP4 as an asset (clipwright#724 F2 S3): declared by size and sha256, PUT to the signed url, then read once. */
export async function putLocalClip(
  client: ClipwrightClient, bytes: Uint8Array<ArrayBuffer>, path: string, meta: { role: z.infer<typeof createAssetRequest>["role"]; name: string },
  put: typeof fetch = fetch,
): Promise<unknown> {
  if (bytes.byteLength > ASSET_VIDEO_MAX_BYTES) throw new Error(`${path} is ${bytes.byteLength} bytes; a clip may be ${ASSET_VIDEO_MAX_BYTES}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const created = await client.createAsset({ source: { put: { media_type: "video/mp4", bytes: bytes.byteLength, sha256 } },
    role: meta.role, name: meta.name, rights_confirmed: true });
  const pending = pendingAssetRead.safeParse(created);
  const upload = pending.success ? pending.data.upload : undefined;
  if (upload === undefined) return created;
  // fetch sends the content-length of the body itself, which is the declared size.
  const answer = await put(upload.put_url, { method: "PUT", body: bytes, headers: { "content-type": upload.put_headers["content-type"] ?? "video/mp4" } });
  if (!answer.ok) throw new Error(`the storage refused the PUT of ${path} with HTTP ${answer.status}; create the asset again`);
  return client.getAsset(created.asset_id);
}

function uploadNextAction(upload: { width: number; height: number; expires_at: string }): string {
  return "Pass `url` as `image` to quote_ugc, then make_ugc, or the upload_id as {upload_id, rights_confirmed: true} in " +
    "references, first_frame or last_frame of quote_image, generate_image, quote_video and generate_video. Set " +
    `\`aspect_ratio\` explicitly to the picture's shape (${upload.width}x${upload.height}); the url expires at ` +
    `${upload.expires_at} — upload again after that. For workflow assets, use upload_id as asset_id ` +
    "and content_digest directly; it identifies the original uploaded bytes.";
}

/** Builds the MCP server with its tools registered but NO transport connected, */
/** so tool registration is testable without a stdio process. */
export function createServer(client: ClipwrightClient, options: CreateServerOptions = { fileAccess: "local" }): McpServer {
  const server = new McpServer({ name: "clipwright", version: packageVersion() });
  registerWorkflowTools(server, client);

  // tools/list publishes the full schema; an empty schema leaves agents guessing.
  server.registerTool(
    "make_ugc",
    {
      title: "Make a talking-actor video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: `${MAKE_UGC_DESCRIPTION} ${MAKE_UGC_AGENT_PROTOCOL}`,
      // Flat schema: offered render input plus agent retry. The description must agree
      // with it, since an LLM reads the description before the schema.
      inputSchema: { ...mcpUgcInputShape, ...agentRetryShape },
    },
    async (args) =>
      withFailureReport(async () => {
        // `attempt` goes in SDK opts: inside `input` the schema would strip it,
        // and a retry would return the same run.
        const { attempt, ...input } = args;
        // Return right after start (state≈"queued"), without waiting. Template data is checked strictly by the server (#778 S3, D3).
        const run = await client.startUgc(input as MakeUgcInputArgs, { attempt });
        // Same formatter as `get_run`, so warnings reach the agent at once.
        return formatGetRun(run);
      }),
  );

  server.registerTool(
    "get_run",
    {
      title: "Get run status",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Check the status of a video generation started by make_ugc or make_faceless, or of a generate_image or " +
        "generate_video run. Pass the run_id. While the run " +
        "is still working it returns status IN_PROGRESS with a next_action telling you to poll again; " +
        "repeat every ~5 seconds until it reaches a terminal state — SUCCEEDED (with video_url, or generation.url for " +
        "generate_image and generate_video) or FAILED.",
      inputSchema: { run_id: runId },
    },
    async ({ run_id }) =>
      withFailureReport(async () => {
        // Terminal shape lives in the pure `formatGetRun`: both `status` and `state`.
        const run = await client.getRun(run_id);
        return formatGetRun(run);
      }),
  );

  // The editor's read tool; the draft of an edit stays on REST, the SDK and the CLI.
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

  // The revision pair: a flat object for tools/list, and the union parse refuses none or both of `changes` and `document`.
  const [byDocument, byChanges] = revisionRequest.options;
  const revisionShape = {
    run_id: runId.describe("The run to revise: a succeeded make_faceless run, an original or a revision."),
    changes: byChanges.shape.changes.optional()
      .describe("Shots to generate anew over the run as it is: each a shot_id and the operation to generate for it."),
    document: byDocument.shape.document.optional()
      .describe("The whole edited document, as the run's draft holds it; retimes, deletions and uploads go this way."),
  };
  const revisionOf = ({ changes, document }: { changes?: unknown; document?: unknown }): RevisionRequest =>
    revisionRequest.parse({ ...(changes === undefined ? {} : { changes }), ...(document === undefined ? {} : { document }) });

  server.registerTool(
    "quote_revision",
    {
      title: "Quote a revision of a run",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price a revision of a run WITHOUT spending credits: what it would change (summary) and what it costs " +
        "(billing.total_credits). Pass run_id and exactly one of changes or document, the same as revise_run. Always " +
        `call this first and show the user the price before revise_run. ${REVISION_CHARGE_TEXT} While paid edits are ` +
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
      description:
        "Start a revision of a run made by make_faceless (paid): a NEW run that renders the video again with the " +
        "shots you change, by changes (a shot and what to generate for it) or by document (the whole edited " +
        "document); pass exactly one. Call quote_revision first and show the user the price. An identical request " +
        "returns the same run it started before, so a call repeated after a lost answer starts nothing new; to " +
        `start a second revision with the same request on purpose, pass attempt 2. ${REVISION_CHARGE_TEXT} An ` +
        "original has a limit on revisions running at once and on revisions failed or unfinished, and paid edits " +
        "of it close some days after it finished; a refusal names which. While paid edits are closed it answers " +
        "editing_disabled and charges nothing. The result is a new run: poll it with get_run; once it succeeded " +
        "it is editable under its own run_id.",
      inputSchema: { ...revisionShape, ...agentRetryShape },
    },
    async ({ run_id, attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.startRevision(run_id, revisionOf(request), { attempt }))),
  );

  // The candidate pair; the list stays on REST, the SDK and the CLI, since an agent polls its own candidate with get_run.
  const candidateShape = {
    run_id: runId.describe("The faceless run whose shot the candidate is for: a succeeded original or revision."),
    shot_id: candidateRequest.shape.shot_id.describe("The shot to make a candidate for, as get_run_shots names it."),
    operation: candidateRequest.shape.operation.describe("What to generate: one of the operations get_run_shots lists for the shot."),
    take: candidateRequest.shape.take.optional()
      .describe("Take number, 1 by default: the same request and take return the same run; take 2 makes another candidate."),
  };
  // The tool schema has already parsed every field; only the take's default is added here.
  const candidateOf = ({ take, ...request }: Omit<CandidateRequest, "take"> & { take?: number | undefined }): CandidateRequest =>
    ({ ...request, take: take ?? 1 });

  server.registerTool(
    "quote_candidate",
    {
      title: "Quote a shot candidate",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Price one shot candidate of a run WITHOUT spending credits: one picture or clip made for one shot, to keep " +
        "or discard in a revision. Pass run_id, shot_id and operation, the same as create_candidate; the answer names " +
        "the unit, its credits and usable_until, the last moment the candidate can enter a revision. Always call this " +
        `first and show the user the price before create_candidate. ${CANDIDATE_CHARGE_TEXT} While shot candidates are ` +
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
      description:
        "Make a shot candidate of a run made by make_faceless (paid): a NEW run of skill edit_shot that generates one " +
        "picture or clip for one shot, to keep or discard in a later revision. Call quote_candidate first and show the " +
        `user the price. ${CANDIDATE_CHARGE_TEXT} An identical request returns the same run it started before, so a ` +
        "call repeated after a lost answer starts nothing new; to make another candidate with the same request on " +
        "purpose, pass take 2. An original has a limit on candidates running at once and on candidates failed or " +
        "unfinished, apart from its revisions; a refusal names which. While shot candidates are closed it answers " +
        "editing_disabled and charges nothing. The result is a new run: poll it with get_run; once it succeeded, its " +
        "candidate.preview_url shows what was made.",
      inputSchema: candidateShape,
    },
    async ({ run_id, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.createCandidate(run_id, candidateOf(request)))),
  );

  // Single generations (clipwright#724): the tools are listed while the feature is closed and relay the API's refusal.
  const generationTerms =
    "A reference is {upload_id, rights_confirmed: true} for a picture from upload_image or create_upload (rights_confirmed states you may use " +
    "the people and works in it), {run_id} of a succeeded generate_image run of this account until its reusable_until, " +
    "or {asset_id} of a picture asset from create_asset, whose rights were confirmed when it was made. " +
    "A generation that fails is charged nothing, even when the vendor was already paid. An identical request returns the " +
    "same run it started before, so a call repeated after a lost answer starts nothing new; to make another one with the " +
    "same request on purpose, pass attempt 2. While generations are closed it answers generations_disabled or " +
    "generations_marking_pending and charges nothing.";
  // Strict objects: an unknown key is refused at the tool, not stripped. The clip's mode rules run in the handler.
  const imageTool = generateImageRequest, imageRunTool = generateImageRequest.extend(agentRetryShape);
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
        "Price one generate_image call WITHOUT spending credits: its credits (one image at its model's unit_credits), " +
        "its width and height, and warnings. Always call this first and show the user the price before generate_image. " +
        generationTerms,
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
      description:
        "Generate one image from a prompt (paid): a NEW run of skill generate_image, charged the quoted credits per image " +
        "once it is delivered. Call quote_image first and show the user the price. Poll the run with get_run; once it " +
        "succeeded, generation.url is the image and its run_id can be a reference of a later generation. " + generationTerms,
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
        "Price one generate_video call WITHOUT spending credits: its credits (unit_credits per second of duration_s), " +
        "its width and height, and warnings. Always call this first and show the user the price before generate_video. " +
        generationTerms,
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
      description:
        "Generate one silent clip (paid): a NEW run of skill generate_video, charged unit_credits per second of duration_s " +
        "once it is delivered. Modes: text; first_frame (first_frame, optional last_frame, of the requested aspect ratio " +
        "within 2%); reference (1 to 4 references). Call quote_video first and show the user the price. Poll the run with " +
        "get_run; once it succeeded, generation.url is the clip. " + generationTerms,
      inputSchema: videoRunTool,
    },
    async ({ attempt, ...request }) =>
      withFailureReport(async () => formatGetRun(await client.generateVideo(generateVideoRequest.parse(request), { attempt }))),
  );

  server.registerTool(
    "quote_ugc",
    {
      title: "Quote a video",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Estimate the credit cost of a make_ugc call WITHOUT spending credits. " +
        "Always call this first and show the user the price before make_ugc.",
      // Same core shape as make_ugc, so the quote prices exactly what make_ugc
      // would render.
      inputSchema: mcpUgcInputShape,
    },
    async (args) =>
      withFailureReport(async () => {
        const quote = await client.quoteUgc(args as MakeUgcInputArgs);
        return { content: [{ type: "text", text: JSON.stringify(quote) }] };
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
      title: "Create a presigned upload",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: CREATE_UPLOAD_DESCRIPTION,
      inputSchema: {
        media_type: z.enum(UPLOAD_MEDIA_TYPES),
        bytes: z.number().int().positive().max(UPLOAD_MAX_BYTES).describe("Exact file size in bytes"),
        sha256: z.string().regex(/^[a-f0-9]{64}$/).describe("Lowercase hex SHA-256 of the file"),
        filename: z.string().min(1).max(200).optional(),
      },
    },
    async (args) => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.createUpload(args)) }],
    })),
  );

  // Read-only although it may finish an intent: only the write tool create_upload makes one.
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

  // Account assets (clipwright#724 F2). A path is read only by a server on the caller's machine, as with upload_image.
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
      },
    },
    async ({ source, role, name, rights_confirmed }) => withFailureReport(async () => {
      if (!("path" in source)) {
        return assetText(client.createAsset({ source, role, name, ...(rights_confirmed === undefined ? {} : { rights_confirmed }) }));
      }
      if (options.fileAccess !== "local") throw new Error(REMOTE_ASSET_PATH_REFUSAL);
      if (rights_confirmed !== true) throw new Error("A local file is your own material: pass rights_confirmed: true");
      const bytes = new Uint8Array(await readFile(source.path));
      // A clip goes by PUT (up to 100 MB), then one read hands it to processing; a picture goes as the body.
      if (Buffer.from(bytes.subarray(4, 8)).toString("latin1") === "ftyp") {
        return assetText(putLocalClip(client, bytes, source.path, { role, name }));
      }
      const mediaType = sniffUploadMediaType(bytes);
      if (mediaType === null || bytes.byteLength > UPLOAD_MAX_BYTES) {
        throw new Error(mediaType === null
          ? `${source.path} is not a PNG or JPEG file (checked by signature, not by extension)`
          : `${source.path} is ${bytes.byteLength} bytes; the ceiling is ${UPLOAD_MAX_BYTES}`);
      }
      return assetText(client.createAssetFromBytes(bytes, mediaType, { role, name, rights_confirmed: true }));
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
        limit: z.number().int().min(1).max(ASSET_LIST_MAX_LIMIT).optional(),
        cursor: z.string().min(1).optional().describe("next_cursor of the previous page"),
      },
    },
    async (query) => withFailureReport(async () => assetText(client.listAssets(query))),
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get an asset",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_ASSET_DESCRIPTION,
      inputSchema: { asset_id: assetId },
    },
    async ({ asset_id }) => withFailureReport(async () => assetText(client.getAsset(asset_id))),
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
    "list_voices",
    {
      title: "List voices",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the voices for the `voice` field of make_ugc, or of make_faceless with skill=make_faceless. " +
        "Without `skill` the list holds the make_ugc voices only. Each voice names the one skill that speaks it " +
        "in `skill`, and the other skill refuses it before any charge. skill=make_faceless lists " +
        `the ${FACELESS_VOICE_NAMES.length} narration voices of make_faceless (kind faceless_voice, each with a ` +
        `language and a gender; without voice it speaks ${DEFAULT_FACELESS_VOICE}; it takes no voice_id). ` +
        "The rest of this text is about the make_ugc voices: the presets first, then the " +
        `${MODEL_VOICE_NAMES.length} voices of ${MODEL_VOICE_MODEL} (kind model_voice), then catalog voices in ` +
        `${CATALOG_LANGUAGES.length} languages. Filter by \`language\` (the voice's native language; any voice ` +
        "speaks any supported language), `gender`, `age`, `use_case` and `model`; an unknown filter value is " +
        "refused with the allowed values. Pick a voice by `name` (e.g. voice=\"george\"); a name always means " +
        "the same voice. A model_voice voice is spoken only by its `model`: naming it selects that model, " +
        "it has no language of its own and matches the languages measured on the model, and its gender is " +
        "listed only where it is known. `voice_id` is an escape hatch for a raw vendor voice id that is not listed, such as a " +
        "cloned voice. Without voice or voice_id the default voice follows the actor's gender: sarah for a " +
        "woman, george for a man, taken from actor_id or from actor_gender next to image. With image and no " +
        "actor_gender the voice is george and a warning says so: pass the gender of the person in the photo as " +
        "actor_gender (ask the user only when you cannot tell), or pick a voice here. Keep any voice the user chose. A voice with `preview_url` has a short-lived audio sample " +
        "spoken by that voice with that model; play it to the user before a paid render instead of judging a " +
        "voice by its description. A model_voice sample is in English, or in the language you filter by. " +
        "It expires at `preview_expires_at`: call this tool again for a fresh link, " +
        "never store it. A voice without `preview_url` has no sample yet. Free. " + SCRIPT_LENGTH_DESCRIPTION,
      inputSchema: voicesQueryShape,
    },
    async (filters) =>
      withFailureReport(async () => {
        // Relays /v1/voices: no vendor call and no vendor key on this surface.
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
        "Sounds never change the price. Free.",
      inputSchema: {},
    },
    async () => withFailureReport(async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.listTemplateSounds()) }],
    })),
  );

  server.registerTool("list_actors", {
    title: "List actors",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: "List saved Clipwright actors with stable IDs, gender, age and verified image formats. Choose actor_id for quote_ugc and make_ugc. Preview URLs expire; actor IDs remain reusable. Do not combine actor_id with image, person or actor_gender. Without voice, the actor speaks the default voice of their gender.",
    inputSchema: {},
  }, async () => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify({ actors: await client.listActors() }) }],
  })));

  server.registerTool("get_actor_defaults", {
    title: "Get actor B-roll default",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: `Read this account actor's saved B-roll default. ${BROLL_POLICY_DESCRIPTION}`,
    inputSchema: { actor_id: z.string().min(1) },
  }, async ({ actor_id }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.getActorDefaults(actor_id)) }],
  })));

  server.registerTool("set_actor_defaults", {
    title: "Set actor B-roll default",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: `Save this account actor's B-roll default without spending credits. ${BROLL_POLICY_DESCRIPTION}`,
    inputSchema: { actor_id: z.string().min(1), ...actorDefaultsInput.shape },
  }, async ({ actor_id, ...input }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.setActorDefaults(actor_id, input)) }],
  })));

  // Personal actor: the same schema the server checks, so offered and accepted
  // input cannot drift.
  server.registerTool(
    "create_actor",
    {
      title: "Create a personal actor",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: CREATE_ACTOR_DESCRIPTION,
      inputSchema: { ...createActorInputShape, ...agentRetryShape },
    },
    async (args) =>
      withFailureReport(async () => {
        // `attempt` goes in SDK opts: inside `input` the schema would strip it,
        // and a retry would return the first run.
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
        "Estimate the credit cost of create_actor WITHOUT spending credits. Call this first and show the " +
        "price before create_actor: each requested format is a separate charged image.",
      inputSchema: createActorInputShape,
    },
    async (args) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.quoteActor(args)) }],
      })),
  );

  // Flat strict object for tools/list; the union parse refuses a script/brief mismatch before the SDK call.
  server.registerTool(
    "make_faceless",
    {
      title: "Make a faceless video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: `${MAKE_FACELESS_DESCRIPTION} ${MAKE_FACELESS_AGENT_PROTOCOL}`,
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
        "Estimate the credit cost of make_faceless WITHOUT spending credits. " +
        "Always call this first and show the user the price before make_faceless.",
      inputSchema: offeredFacelessInput,
    },
    async (args) =>
      withFailureReport(async () => ({
        content: [{ type: "text", text: JSON.stringify(await client.quoteFaceless(makeFacelessInput.parse(args))) }],
      })),
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

  // Balance without spending an attempt; otherwise only a 402 would reveal it.
  server.registerTool("get_account", {
    title: "Get account credits",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description:
      "Read this account's credits. Free, spends nothing. debt_credits above zero means make_ugc " +
      "is refused with debt_outstanding whatever the balance, until the account buys credits; " +
      "with no debt, balance_credits is what a new run can spend. holds_credits are reserved for " +
      "runs still in progress and settle when they finish. grants lists unexpired credit grants. " +
      "quote_ugc already warns when make_ugc would be refused; this tool gives the numbers behind it.",
    inputSchema: {},
  }, async () => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.getAccount()) }],
  })));

  return server;
}
