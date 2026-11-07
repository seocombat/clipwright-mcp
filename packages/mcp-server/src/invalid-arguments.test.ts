import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AnySchema, normalizeObjectSchema, safeParseAsync } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { ClipwrightClient } from "@clipwright/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { answerInvalidArguments, argumentFields, INVALID_ARGUMENTS_NEXT_ACTION } from "./invalid-arguments.js";
import { createServer } from "./server.js";

const RUN_ID = `run_${"a".repeat(32)}`;
const RUN = { run_id: RUN_ID, state: "running", skill: "make_ugc" };

const VIDEO_REQUEST = { prompt: "waves", model: "seedance-2.0-mini", mode: "first_frame", aspect_ratio: "9:16", resolution: "720p",
  duration_s: 4, first_frame: { run_id: "run_gen1" } };
/** Calls the tool schema takes and the handler's own parse refuses, for a rule that spans fields. */
const CROSS_FIELD: Record<string, Record<string, unknown>[]> = {
  quote_revision: [{ run_id: "run_1" }, { run_id: RUN_ID }],
  revise_run: [{ run_id: "run_1" }, { run_id: RUN_ID }],
  quote_faceless: [{ input_mode: "script", brief: "only a brief", duration_seconds: 30 }],
  make_faceless: [{ input_mode: "script", brief: "only a brief", duration_seconds: 30 }],
  quote_video: [{ ...VIDEO_REQUEST, mode: "text" }],
  generate_video: [{ prompt: VIDEO_REQUEST.prompt, model: VIDEO_REQUEST.model, mode: "first_frame", aspect_ratio: "9:16",
    resolution: "720p", duration_s: 4 }],
};

/** Records every SDK method the tools reach; the tool under test never gets past the schema. */
function recordingClient(): { calls: string[]; client: ClipwrightClient } {
  const calls: string[] = [];
  const client = new Proxy({}, {
    get: (_target, property: string) => async (): Promise<unknown> => {
      calls.push(property);
      return RUN;
    },
  }) as unknown as ClipwrightClient;
  return { calls, client };
}

async function call(name: string, args: Record<string, unknown>): Promise<{ result: Awaited<ReturnType<Client["callTool"]>>; calls: string[] }> {
  const { calls, client } = recordingClient();
  const server = createServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "invalid-arguments", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  try {
    return { result: await mcp.callTool({ name, arguments: args }), calls };
  } finally {
    await mcp.close();
    await server.close();
  }
}

const report = (result: object): Record<string, unknown> & { fields: { path: string; message: string }[] } => {
  const content = (result as { content: { type: string; text: string }[] }).content;
  expect(content).toHaveLength(1);
  return JSON.parse(content[0]!.text) as ReturnType<typeof report>;
};

describe("a call whose arguments fail the tool's schema", () => {
  // Mutant: the SDK's plain-text refusal left in place, or the report built without its fields; the agent would guess which field to fix.
  it.each([
    ["get_run", { run_id: 5 }, ["run_id"]],
    ["quote_ugc", { script: "Hello", hold_end: 2 }, ["hold_end"]],
    ["make_ugc", { script: 5, aspect_ratio: 7 }, ["script", "aspect_ratio"]],
    ["get_asset", {}, ["asset_id"]],
  ])("%s %j answers invalid_arguments naming every field, and reaches no SDK call", async (name, args, paths) => {
    const { result, calls } = await call(name, args);
    expect(result.isError).toBe(true);
    const answer = report(result);
    expect(answer).toMatchObject({ status: "FAILED", code: "invalid_arguments", retryable: false, next_action: INVALID_ARGUMENTS_NEXT_ACTION });
    expect(answer.fields.map(field => field.path).sort()).toEqual([...paths].sort());
    for (const field of answer.fields) {
      expect(field.message.length).toBeGreaterThan(0);
      expect(answer.message).toContain(`${field.path}: ${field.message}`);
    }
    expect(calls).toEqual([]);
  });

  it("keeps make_ugc's did-you-mean hint inside the field it names", async () => {
    const { result, calls } = await call("make_ugc", { script: "Hello", aspectRatio: "16:9" });
    expect(report(result).fields).toEqual([
      { path: "aspectRatio", message: '"aspectRatio" is not a field of this tool (did you mean "aspect_ratio"?)' },
    ]);
    expect(calls).toEqual([]);
  });

  // Mutant: the list cut at a fixed count; a caller fixing the named fields would meet the rest one call at a time.
  it("lists every issue, with no cut", async () => {
    const extra = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`unknown_${index}`, true]));
    const { result } = await call("make_ugc", { script: 5, ...extra });
    expect(report(result).fields.map(field => field.path).sort()).toEqual(["script", ...Object.keys(extra)].sort());
  });

  // Mutant: a failed union kept as one bare issue, or dropped; the agent would read "source: Invalid input" and nothing to fix.
  it("names the nested fields of the union branch the call came nearest to", async () => {
    const { result, calls } = await call("create_asset", {
      source: { url: 7, surprise: true, other: true }, role: "prop", name: "Mug", rights_confirmed: true });
    expect(report(result).fields).toEqual([
      { path: "source.url", message: "Invalid input: expected string, received number" },
      { path: "source.surprise", message: 'Unrecognized keys: "surprise", "other"' },
      { path: "source.other", message: 'Unrecognized keys: "surprise", "other"' },
    ]);
    expect(calls).toEqual([]);
  });

  // Mutant: any issue kind that yields no field; a refusal would leave that field unnamed, or name nothing at all.
  it("names at least one field in every refusal of every tool, and every issue the schema raised", async () => {
    const { client } = recordingClient();
    const server = createServer(client);
    const registered = (server as unknown as { _registeredTools: Record<string, { inputSchema: AnySchema }> })._registeredTools;
    const unnamed: string[] = [];
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: "invalid-arguments", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
    const empty: string[] = [];
    const unstructured: string[] = [];
    let refusals = 0, handlerRefusals = 0;
    try {
      for (const tool of (await mcp.listTools()).tools) {
        const names = [...Object.keys(tool.inputSchema.properties ?? {}), "not_a_field"];
        const samples = [7, "x", {}, [], null, { url: 7, surprise: true }].flatMap(value =>
          [Object.fromEntries(names.map(name => [name, value])), ...names.map(name => ({ [name]: value }))]);
        for (const args of [...samples, ...(CROSS_FIELD[tool.name] ?? [])]) {
          const result = await mcp.callTool({ name: tool.name, arguments: args });
          const text = (result.content as { text?: string }[])[0]?.text ?? "";
          if (result.isError !== true) continue;
          // JSON is either a report with its code or a schema refusal leaking raw; plain text is a handler's own refusal.
          let body: unknown;
          try { body = JSON.parse(text); } catch { continue; }
          const code = (body as { code?: unknown } | null)?.code;
          if (typeof code !== "string") unstructured.push(`${tool.name} ${JSON.stringify(args)}`);
          if (code !== "invalid_arguments") continue;
          refusals++;
          const { fields } = report(result);
          if (fields.length === 0) empty.push(`${tool.name} ${JSON.stringify(args)}`);
          const schema = registered[tool.name]!.inputSchema;
          const parsed = await safeParseAsync(normalizeObjectSchema(schema) ?? schema, args);
          if (parsed.success) handlerRefusals++;
          for (const issue of parsed.success ? [] : (parsed.error as { issues: { path: PropertyKey[] }[] }).issues) {
            const at = issue.path.map(String).join(".");
            if (!fields.some(field => at === "" || field.path === at || field.path.startsWith(`${at}.`))) unnamed.push(`${tool.name} ${at}`);
          }
        }
      }
    } finally {
      await mcp.close();
      await server.close();
    }
    expect(empty).toEqual([]);
    expect(unstructured).toEqual([]);
    expect([...new Set(unnamed)]).toEqual([]);
    expect(refusals).toBeGreaterThan(100);
    expect(handlerRefusals).toBeGreaterThanOrEqual(Object.values(CROSS_FIELD).flat().length);
  // Hundreds of calls, and describe_tool's first one builds the server's whole list: about 2 s alone, more beside other files.
  }, 20_000);

  // Mutant: a handler's own schema refusal left to the SDK; the agent would get a raw issue array with no code.
  it.each(Object.entries(CROSS_FIELD).flatMap(([name, list]) => list.map(args => [name, args] as const)))(
    "%s %j, refused by the handler's own parse, answers invalid_arguments before any SDK call", async (name, args) => {
      const { result, calls } = await call(name, args);
      const answer = report(result);
      expect(answer).toMatchObject({ code: "invalid_arguments", retryable: false, next_action: INVALID_ARGUMENTS_NEXT_ACTION });
      expect(answer.fields.length).toBeGreaterThan(0);
      for (const field of answer.fields) expect(answer.message).toContain(`${field.path}: ${field.message}`);
      expect(calls).toEqual([]);
    });

  it("keeps a handler's own refusal that is no schema error as it was", async () => {
    const { result, calls } = await call("upload_image", { path: "/tmp/a.png", url: "https://example.com/a.png" });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Pass exactly one of path or url" }]);
    expect(calls).toEqual([]);
  });

  it("leaves a valid call unchanged", async () => {
    const { result, calls } = await call("get_run", { run_id: RUN_ID });
    expect(result.isError ?? false).toBe(false);
    expect(calls).toEqual(["getRun"]);
  });
});

it("names the whole input when the SDK refuses a call before parsing it", async () => {
  const server = new McpServer({ name: "cap", version: "0.0.0" }, { maxToolInputElements: 2 });
  answerInvalidArguments(server);
  let reached = false;
  server.registerTool("echo", { inputSchema: { items: z.array(z.string()) } }, async () => {
    reached = true;
    return { content: [] };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "cap", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  try {
    const answer = report(await mcp.callTool({ name: "echo", arguments: { items: ["a", "b", "c"] } }));
    expect(answer).toMatchObject({ code: "invalid_arguments", retryable: false });
    expect(answer.fields).toEqual([{ path: "input", message: expect.stringContaining("more than the maximum of 2 elements") }]);
    expect(reached).toBe(false);
  } finally {
    await mcp.close();
    await server.close();
  }
});

// Mutant: the guard turned into a silent return; after an SDK upgrade every refusal would fall back to bare text unnoticed.
it("refuses loudly a server whose SDK no longer validates in validateToolInput", () => {
  expect(() => answerInvalidArguments({} as McpServer)).toThrow("the MCP SDK no longer validates tool input in validateToolInput");
  const validating = { validateToolInput: async () => undefined, _registeredTools: {} };
  expect(() => answerInvalidArguments(validating as unknown as McpServer)).toThrow("the MCP SDK no longer runs tool handlers in executeToolHandler");
});

describe("argumentFields", () => {
  it("names a nested issue by its dotted path and a root issue as input", () => {
    expect(argumentFields([
      { code: "invalid_type", path: ["templates", 0, "kind"], message: "Invalid option" },
      { code: "custom", path: [], message: "pass exactly one of script or brief" },
      { code: "unrecognized_keys", path: ["templates", 1], keys: ["colour", "size"], message: 'Unrecognized keys: "colour", "size"' },
    ])).toEqual([
      { path: "templates.0.kind", message: "Invalid option" },
      { path: "input", message: "pass exactly one of script or brief" },
      { path: "templates.1.colour", message: 'Unrecognized keys: "colour", "size"' },
      { path: "templates.1.size", message: 'Unrecognized keys: "colour", "size"' },
    ]);
  });
});
