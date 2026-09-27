import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClipwrightClient } from "@clipwright/sdk";
// `offeredUgcInputShape`, not the full shape: fields the server rejects must not
// be offered to a caller who would get a 400 for using them.
import {
  offeredUgcInputShape,
  actorDefaultsInput,
  BROLL_POLICY_DESCRIPTION,
  CATALOG_LANGUAGES,
  CREATE_ACTOR_DESCRIPTION,
  createActorInputShape,
  SCRIPT_LENGTH_DESCRIPTION,
  voicesQueryShape,
  agentRetryShape,
  runId,
  MAKE_UGC_DESCRIPTION,
  MAKE_UGC_AGENT_PROTOCOL,
  MAKE_FACELESS_DESCRIPTION,
  MAKE_FACELESS_AGENT_PROTOCOL,
  makeFacelessInput,
  offeredFacelessInputShape,
  UPLOAD_IMAGE_DESCRIPTION,
  UPLOAD_MAX_BYTES,
  sniffUploadMediaType,
} from "@clipwright/core";
import { formatGetRun, withFailureReport } from "./format.js";

// Version from the manifest: a literal drifts, and a JSON import breaks `rootDir`.
const packageVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;

/** Builds the MCP server with its tools registered but NO transport connected, */
/** so tool registration is testable without a stdio process. */
export function createServer(client: ClipwrightClient): McpServer {
  const server = new McpServer({ name: "clipwright", version: packageVersion() });

  // tools/list publishes the full schema; an empty schema leaves agents guessing.
  server.registerTool(
    "make_ugc",
    {
      title: "Make a talking-actor video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: `${MAKE_UGC_DESCRIPTION} ${MAKE_UGC_AGENT_PROTOCOL}`,
      // Flat schema: offered render input plus agent retry. The description must agree
      // with it, since an LLM reads the description before the schema.
      inputSchema: { ...offeredUgcInputShape, ...agentRetryShape },
    },
    async (args) =>
      withFailureReport(async () => {
        // `attempt` goes in SDK opts: inside `input` the schema would strip it,
        // and a retry would return the same run.
        const { attempt, ...input } = args;
        // Return right after start (state≈"queued"), without waiting.
        const run = await client.startUgc(input, { attempt });
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
        "Check the status of a video generation started by make_ugc or make_faceless. Pass the run_id. While the run " +
        "is still working it returns status IN_PROGRESS with a next_action telling you to poll again; " +
        "repeat every ~5 seconds until it reaches a terminal state — SUCCEEDED (with video_url) or FAILED.",
      inputSchema: { run_id: runId },
    },
    async ({ run_id }) =>
      withFailureReport(async () => {
        // Terminal shape lives in the pure `formatGetRun`: both `status` and `state`.
        const run = await client.getRun(run_id);
        return formatGetRun(run);
      }),
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
      inputSchema: offeredUgcInputShape,
    },
    async (args) =>
      withFailureReport(async () => {
        const quote = await client.quoteUgc(args);
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
        path: z.string().min(1).describe("Absolute or cwd-relative path to a PNG or JPEG file"),
      },
    },
    async ({ path }) =>
      withFailureReport(async () => {
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...upload,
                next_action:
                  "Pass `url` as `image` to quote_ugc, then make_ugc. Set `aspect_ratio` explicitly " +
                  `to the picture's shape (${upload.width}x${upload.height}); the url expires at ` +
                  `${upload.expires_at} — upload again after that.`,
              }),
            },
          ],
          isError: false,
        };
      }),
  );
  server.registerTool(
    "list_voices",
    {
      title: "List voices",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the voices for make_ugc's `voice` field: the presets first, then catalog voices in " +
        `${CATALOG_LANGUAGES.length} languages. Filter by \`language\` (the voice's native language; any voice ` +
        "speaks any supported language), `gender`, `age`, `use_case` and `model`; an unknown filter value is " +
        "refused with the allowed values. Pick a voice by `name` (e.g. voice=\"george\"); a name always means " +
        "the same voice. `voice_id` is an escape hatch for a raw vendor voice id that is not listed, such as a " +
        "cloned voice. Without voice or voice_id the default voice follows the actor's gender: sarah for a " +
        "woman, george for a man, taken from actor_id or from actor_gender next to image. With image and no " +
        "actor_gender the voice is george and a warning says so: pass the gender of the person in the photo as " +
        "actor_gender (ask the user only when you cannot tell), or pick a voice here. Keep any voice the user chose. A voice with `preview_url` has a short-lived audio sample " +
        "spoken by that voice with that model; play it to the user before a paid render instead of judging a " +
        "voice by its description. It expires at `preview_expires_at`: call this tool again for a fresh link, " +
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

  // Flat shape for tools/list; the union parse refuses a script/brief mismatch before the SDK call.
  server.registerTool(
    "make_faceless",
    {
      title: "Make a faceless video",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: `${MAKE_FACELESS_DESCRIPTION} ${MAKE_FACELESS_AGENT_PROTOCOL}`,
      inputSchema: { ...offeredFacelessInputShape, ...agentRetryShape },
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
      inputSchema: offeredFacelessInputShape,
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
