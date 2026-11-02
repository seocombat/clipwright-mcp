import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ClipwrightClient } from "@clipwright/sdk";
import { describe, expect, it, vi } from "vitest";

import { advertisedTools, COPIED_FIELDS, findTwins, hoistRepeats, PAID_TWINS, shorten } from "./advertised-schema.js";
import { listTools } from "./remote.js";
import { createServer, type CreateServerOptions } from "./server.js";

// The SDK's own list, before advertising, comes from a server whose wrap is switched off.
const sdkList = vi.hoisted(() => ({ raw: false }));
vi.mock("./advertised-schema.js", async (importActual) => {
  const actual = await importActual<typeof import("./advertised-schema.js")>();
  return { ...actual, advertiseSlimTools: (server: Parameters<typeof actual.advertiseSlimTools>[0]) => {
    if (!sdkList.raw) actual.advertiseSlimTools(server);
  } };
});

/** ChatGPT shows no tools for a list near 100 KB (#1003); the size is the compact JSON of `result.tools`. */
const TOOLS_LIST_MAX_BYTES = 102_000;

async function rawTools(options: CreateServerOptions): Promise<Tool[]> {
  sdkList.raw = true;
  try {
    const server = createServer(new ClipwrightClient({ apiKey: "cw_unused", baseUrl: "http://unused.invalid" }), options);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "raw-tool-list", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      return (await client.listTools()).tools;
    } finally {
      await client.close();
      await server.close();
    }
  } finally {
    sdkList.raw = false;
  }
}

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));

describe.each([["stdio", { fileAccess: "local" }], ["hosted", { fileAccess: "refuse" }]] as const)("tools/list of the %s server", (_, options) => {
  it(`fits in ${TOOLS_LIST_MAX_BYTES} bytes`, async () => {
    const tools = await listTools(options);
    const largest = tools.map(tool => `${tool.name} ${bytes(tool)}`).sort((a, b) => Number(b.split(" ")[1]) - Number(a.split(" ")[1])).slice(0, 5);
    expect(bytes(tools), `largest tools: ${largest.join(", ")}`).toBeLessThanOrEqual(TOOLS_LIST_MAX_BYTES);
  });

  it("keeps every tool, title, hint, field name and required field of the SDK's list", async () => {
    const [raw, advertised] = [await rawTools(options), await listTools(options)];
    const byName = new Map(advertised.map(tool => [tool.name, tool]));
    // An advertised paid twin's fields are its quote's, then its own.
    const quoteFields = (tool: Tool) => byName.get(PAID_TWINS[tool.name] ?? "")?.inputSchema.properties ?? {};
    const outline = (tools: Tool[], viaQuotes: boolean) => tools.map(tool => ({ name: tool.name, title: tool.title, annotations: tool.annotations,
      fields: Object.keys({ ...(viaQuotes ? quoteFields(tool) : {}), ...tool.inputSchema.properties }), required: tool.inputSchema.required ?? [] }));
    expect(raw).toHaveLength(48);
    expect(outline(advertised, true)).toEqual(outline(raw, false));
    expect(advertised).toEqual(advertisedTools(raw));
  });

  it("resolves every $ref inside its own tool", async () => {
    const refs: string[] = [];
    for (const tool of await listTools(options)) {
      JSON.stringify(tool.inputSchema, (key, value: unknown) => {
        if (key !== "$ref") return value;
        const target = String(value).replace(/^#\//, "").split("/")
          .reduce<unknown>((node, step) => (node as Record<string, unknown> | undefined)?.[step], tool.inputSchema);
        refs.push(`${tool.name} ${String(value)} ${typeof target === "object" && target !== null ? "ok" : "missing"}`);
        return value;
      });
    }
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(ref => !ref.endsWith(" ok"))).toEqual([]);
  });
});

it("advertises each paid tool through its free quote, naming the quote first and the extra fields with their schemas", async () => {
  const raw = await rawTools({ fileAccess: "refuse" });
  const twins = Object.fromEntries([...findTwins(raw)].map(([name, twin]) => [name, `${twin.of} +${twin.plus.join(",")}`]));
  expect(twins).toEqual({ make_ugc: "quote_ugc +attempt", revise_run: "quote_revision +attempt", generate_video: "quote_video +attempt",
    generate_image: "quote_image +attempt", create_actor: "quote_actor +attempt", make_faceless: "quote_faceless +attempt",
    create_candidate: "quote_candidate +", analyze_reference: "quote_analysis +" });
  const advertised = await listTools({ fileAccess: "refuse" });
  for (const [paid, quote] of Object.entries(PAID_TWINS)) {
    const tool = advertised.find(entry => entry.name === paid)!;
    expect(tool.description, paid).toMatch(new RegExp(`^Input: the same fields as ${quote}[,.] `));
    expect(tool.inputSchema.additionalProperties, paid).toBeUndefined();
    for (const field of Object.keys(tool.inputSchema.properties ?? {})) expect(tool.inputSchema.properties![field], `${paid}.${field}`).toHaveProperty("type");
  }
});

it("keeps a paid tool's own schema when its fields drift from its quote's", async () => {
  const raw = await rawTools({ fileAccess: "refuse" });
  const quote = raw.find(tool => tool.name === "quote_ugc")!;
  const drifted = { ...quote, inputSchema: { ...quote.inputSchema, properties: { ...quote.inputSchema.properties, script: { type: "number" } } } };
  expect(findTwins(raw.map(tool => (tool.name === "quote_ugc" ? drifted : tool))).has("make_ugc")).toBe(false);
});

it("points a copied field at the very schema it replaces", async () => {
  const raw = await rawTools({ fileAccess: "refuse" });
  const at = (tool: string, path: string): Record<string, unknown> =>
    path.split("/").slice(1).reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>,
      raw.find(entry => entry.name === tool)!.inputSchema);
  const native = "/properties/document/properties/brief/properties/native/oneOf";
  expect([at("prepare_workflow_plan", `${native}/0/properties/skill`).const, at("prepare_workflow_plan", `${native}/1/properties/skill`).const])
    .toEqual(["make_ugc", "make_faceless"]);
  const ugcFields = Object.keys(raw.find(tool => tool.name === "make_ugc")!.inputSchema.properties!).filter(field => field !== "attempt");
  expect(Object.keys(at("prepare_workflow_plan", `${native}/0/properties/input`).properties as object)).toEqual(ugcFields);
  for (const [tool, paths] of Object.entries(COPIED_FIELDS)) {
    for (const path of Object.keys(paths).filter(entry => entry.endsWith("reference_profile"))) {
      expect((at(tool, path).properties as { version: { const: string } }).version.const, `${tool} ${path}`).toBe("reference-profile-v1");
    }
  }
});

/** Codex r1 on #1003: the description dedup erased plan_reference_remake's pointer, leaving a bare object. */
it.each([["stdio", { fileAccess: "local" }], ["hosted", { fileAccess: "refuse" }]] as const)("advertises every copied-field pointer on the %s server", async (_, options) => {
  const sources: Record<string, [string, string]> = {
    "prepare_workflow_plan /properties/document/properties/brief/properties/native/oneOf/0/properties/input": ["quote_ugc", "make_ugc input"],
    "prepare_workflow_plan /properties/document/properties/brief/properties/native/oneOf/1/properties/input": ["quote_faceless", "make_faceless input"],
    "prepare_workflow_plan /properties/document/properties/brief/properties/reference_profile": ["get_reference_analysis", "reference_profile field"],
    "plan_reference_remake /properties/reference_profile": ["get_reference_analysis", "reference_profile field"],
  };
  const advertised = await listTools(options);
  const pointed = Object.entries(COPIED_FIELDS).flatMap(([tool, paths]) => Object.entries(paths).map(([path, text]) => {
    const schema = advertised.find(entry => entry.name === tool)!.inputSchema as Record<string, unknown>;
    const node = path.split("/").slice(1).reduce<Record<string, unknown>>((at, key) => at[key] as Record<string, unknown>, schema);
    return [`${tool} ${path}`, { node, text }] as const;
  }));
  expect(pointed.map(([key]) => key).sort()).toEqual(Object.keys(sources).sort());
  for (const [key, { node, text }] of pointed) {
    expect(node, key).toEqual({ type: "object", description: text });
    for (const name of sources[key]!) expect(text, key).toContain(name);
  }
});

it("cuts a description after a whole sentence, else after a whole word", () => {
  expect(shorten("One two. Three four five six.", 20)).toBe("One two.");
  expect(shorten("abcdefghij klmnopqrst uvwxyz", 20)).toBe("abcdefghij…");
  expect(shorten("short", 20)).toBe("short");
});

it("moves a repeated subschema to $defs and leaves one $ref per copy", () => {
  const place = { type: "object", properties: { x: { type: "number", minimum: 0, maximum: 100 }, y: { type: "number", minimum: 0, maximum: 100 } } };
  const hoisted = hoistRepeats({ type: "object", properties: { a: structuredClone(place), b: { type: "array", items: structuredClone(place) } } });
  expect(hoisted).toEqual({ type: "object", properties: { a: { $ref: "#/$defs/d0" }, b: { type: "array", items: { $ref: "#/$defs/d0" } } },
    $defs: { d0: place } });
});
