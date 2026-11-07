import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { MCP_UGC_SHORTENED_TEXTS, priceLine } from "@clipwright/core";
import { ClipwrightClient } from "@clipwright/sdk";
import { describe, expect, it, vi } from "vitest";

import { advertisedTools, COPIED_FIELDS, fieldTexts, findTwins, hoistRepeats, PAID_TWINS } from "./advertised-schema.js";
import { LISTED_DESCRIPTIONS, LISTED_FIELDS } from "./listed-texts.js";
import { listTools } from "./remote.js";
import { createServer, type CreateServerOptions } from "./server.js";

// The SDK's own list, before advertising, comes from a server whose wrap is switched off.
const sdkList = vi.hoisted(() => ({ raw: false }));
vi.mock("./advertised-schema.js", async (importActual) => {
  const actual = await importActual<typeof import("./advertised-schema.js")>();
  return { ...actual, advertiseSlimTools: (server: Parameters<typeof actual.advertiseSlimTools>[0]) =>
    (sdkList.raw ? async () => [] : actual.advertiseSlimTools(server)) };
});

/** ChatGPT shows no tools for a list near 100 KB (#1003); #1142 moved field guidance to describe_tool and set 70 KB. */
const TOOLS_LIST_MAX_BYTES = 70_000;

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
  it(`fits in the client's ${TOOLS_LIST_MAX_BYTES} bytes`, async () => {
    const tools = await listTools(options);
    const largest = tools.map(tool => `${tool.name} ${bytes(tool)}`).sort((a, b) => Number(b.split(" ")[1]) - Number(a.split(" ")[1])).slice(0, 5);
    const size = bytes(tools);
    expect(size, `${size} bytes, headroom ${TOOLS_LIST_MAX_BYTES - size}; largest tools: ${largest.join(", ")}`).toBeLessThanOrEqual(TOOLS_LIST_MAX_BYTES);
  });

  it("keeps every tool, title, hint, field name and required field of the SDK's list", async () => {
    const [raw, advertised] = [await rawTools(options), await listTools(options)];
    const outline = (tools: Tool[]) => tools.map(tool => ({ name: tool.name, title: tool.title, annotations: tool.annotations,
      fields: Object.keys(tool.inputSchema.properties ?? {}), required: tool.inputSchema.required ?? [] }));
    expect(raw).toHaveLength(57);
    expect(outline(advertised)).toEqual(outline(raw));
    expect(advertised).toEqual(advertisedTools(raw));
  });

  /** #1028: a client building the call from the schema stringified a twin's untyped number, and the server refused it. */
  it("gives every field of every tool the types of the SDK's schema, and its values unless its quote lists them", async () => {
    const [raw, advertised] = [await rawTools(options), await listTools(options)];
    type Node = Record<string, unknown>;
    const resolve = (root: Node, node: Node): Node => typeof node.$ref === "string"
      ? resolve(root, node.$ref.replace(/^#\//, "").split("/").reduce<Node>((at, key) => at[key] as Node, root)) : node;
    // A field's accepted variants: its own type (and values), then each alternative's, whichever of anyOf and oneOf holds them.
    const shape = (root: Node, value: unknown, values: boolean): string[] => {
      const node = resolve(root, value as Node);
      // zod's starts_with is no JSON Schema format, and the list drops it beside the pattern that says the same (#1045).
      const own = { type: node.type, format: node.format === "starts_with" ? undefined : node.format, ...(values ? { enum: node.enum, const: node.const } : {}),
        items: node.items === undefined ? undefined : shape(root, node.items, values) };
      const branches = [...(node.anyOf as unknown[] | undefined ?? []), ...(node.oneOf as unknown[] | undefined ?? [])];
      const mine = Object.values(own).some(entry => entry !== undefined) || branches.length === 0 ? [JSON.stringify(own)] : [];
      return [...new Set([...mine, ...branches.flatMap(branch => shape(root, branch, values))])].sort();
    };
    const fields = (tools: Tool[], values: (tool: string) => boolean) => tools.flatMap(tool => Object.entries(tool.inputSchema.properties ?? {})
      .map(([field, schema]) => [`${tool.name}.${field}`, shape(tool.inputSchema as Node, schema, values(tool.name))] as const));
    const expected = fields(raw, name => !(name in PAID_TWINS));
    expect(expected.length).toBeGreaterThan(200);
    expect(Object.fromEntries(fields(advertised, name => !(name in PAID_TWINS)))).toEqual(Object.fromEntries(expected));
    // A paid tool's values a client must pick from are on its quote, as the paid tool accepts them.
    const byName = (tools: Tool[]) => new Map(tools.map(tool => [tool.name, tool]));
    const [rawTool, listed] = [byName(raw), byName(advertised)];
    const quoteValues = Object.entries(PAID_TWINS).flatMap(([paid, quote]) => Object.keys(listed.get(quote)!.inputSchema.properties ?? {}).map(field => {
      const [own, theirs] = [rawTool.get(paid)!.inputSchema, listed.get(quote)!.inputSchema] as Node[];
      return [`${paid}.${field}`, shape(theirs!, (theirs!.properties as Node)[field], true), shape(own!, (own!.properties as Node)[field], true)];
    }));
    expect(quoteValues.filter(([, quote]) => JSON.stringify(quote).includes('\\"enum\\":')).length).toBeGreaterThan(10);
    expect(quoteValues.map(([key, quote]) => [key, quote])).toEqual(quoteValues.map(([key, , paid]) => [key, paid]));
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

it("advertises each paid tool through its free quote, naming the quote first and the extra fields", async () => {
  const raw = await rawTools({ fileAccess: "refuse" });
  const twins = Object.fromEntries([...findTwins(raw)].map(([name, twin]) => [name, `${twin.of} +${twin.plus.join(",")}`]));
  expect(twins).toEqual({ make_ugc: "quote_ugc +attempt", revise_run: "quote_revision +attempt", generate_video: "quote_video +attempt",
    generate_image: "quote_image +attempt", create_actor: "quote_actor +attempt", make_faceless: "quote_faceless +attempt",
    create_candidate: "quote_candidate +", analyze_reference: "quote_analysis +", find_trends: "quote_trends +sort" });
  const advertised = await listTools({ fileAccess: "refuse" });
  for (const [paid, quote] of Object.entries(PAID_TWINS)) {
    const tool = advertised.find(entry => entry.name === paid)!;
    expect(tool.description, paid).toMatch(new RegExp(`^Input: the same fields as ${quote}[,.] `));
    const texts: unknown[] = [];
    JSON.stringify(tool.inputSchema, (key, value: unknown) => { if (key === "description" && typeof value === "string") texts.push(value); return value; });
    expect(texts, paid).toEqual([]);
  }
});

it("gives no text of its own to another tool's field whose text quote_ugc says in fewer words (#1045)", async () => {
  const [raw, advertised] = [await rawTools({ fileAccess: "refuse" }), await listTools({ fileAccess: "refuse" })];
  const shared = raw.filter(tool => tool.name !== "quote_ugc").flatMap(tool => Object.entries(tool.inputSchema.properties ?? {})
    .filter(([, field]) => MCP_UGC_SHORTENED_TEXTS.includes(String((field as { description?: string }).description)))
    .map(([field]) => [tool.name, field] as const));
  expect(shared).toContainEqual(["plan_reference_remake", "voice"]);
  for (const [tool, field] of shared) {
    const listed = advertised.find(entry => entry.name === tool)!.inputSchema.properties![field] as { description?: string };
    expect(listed.description, `${tool}.${field}`).toBeUndefined();
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
    "plan_reference_remake /properties/moves": ["quote_ugc", "moves array"],
    "plan_reference_remake /properties/motion_style": ["quote_ugc", "motion_style object"],
    "plan_reference_remake /properties/cast": ["quote_ugc", "shot cast"],
    "brand_kit /properties/design": ["quote_ugc", "design object"],
    "quote_ugc /properties/motion_style": ["describe_tool quote_ugc motion_style", "styles"],
  };
  const advertised = await listTools(options);
  const pointed = Object.entries(COPIED_FIELDS).flatMap(([tool, paths]) => Object.entries(paths).map(([path, text]) => {
    const schema = advertised.find(entry => entry.name === tool)!.inputSchema as Record<string, unknown>;
    const node = path.split("/").slice(1).reduce<Record<string, unknown>>((at, key) => at[key] as Record<string, unknown>, schema);
    return [`${tool} ${path}`, { node, text }] as const;
  }));
  expect(pointed.map(([key]) => key).sort()).toEqual(Object.keys(sources).sort());
  for (const [key, { node, text }] of pointed) {
    // Mutant: a pointer typed object over an array field, and a client sends the moves as one object.
    expect(node, key).toEqual({ ...(key.endsWith("/moves") || key.endsWith("/cast") ? { type: "array", items: { type: "object" } } : { type: "object" }),
      description: text });
    for (const name of sources[key]!) expect(text, key).toContain(name);
  }
});


it("drops what any JSON object meets and a pattern its date-time format states, keeping every other bound", () => {
  const [tool] = advertisedTools([{ name: "t", inputSchema: { type: "object", properties: {
    open: { type: "object", propertyNames: { type: "string" }, additionalProperties: {} },
    keys: { type: "object", propertyNames: { type: "string", pattern: "^k" }, additionalProperties: { type: "string" } },
    at: { type: "string", format: "date-time", pattern: "^2" }, id: { type: "string", pattern: "^id_" },
    url: { type: "string", format: "starts_with", pattern: "^https:" }, uri: { type: "string", format: "uri" },
    bare: { type: "string", format: "starts_with" } } } }]);
  expect(tool!.inputSchema.properties).toEqual({ open: { type: "object" },
    keys: { type: "object", propertyNames: { type: "string", pattern: "^k" }, additionalProperties: { type: "string" } },
    at: { type: "string", format: "date-time" }, id: { type: "string", pattern: "^id_" },
    url: { type: "string", pattern: "^https:" }, uri: { type: "string", format: "uri" }, bare: { type: "string", format: "starts_with" } });
});

it("moves a repeated subschema to $defs and leaves one $ref per copy", () => {
  const place = { type: "object", properties: { x: { type: "number", minimum: 0, maximum: 100 }, y: { type: "number", minimum: 0, maximum: 100 } } };
  const hoisted = hoistRepeats({ type: "object", properties: { a: structuredClone(place), b: { type: "array", items: structuredClone(place) } } });
  expect(hoisted).toEqual({ type: "object", properties: { a: { $ref: "#/$defs/d0" }, b: { type: "array", items: { $ref: "#/$defs/d0" } } },
    $defs: { d0: place } });
});

type Describe = (args: Record<string, unknown>) => Promise<{ isError: boolean; text: string }>;
async function withDescribeTool(options: CreateServerOptions, use: (describe: Describe) => Promise<void>): Promise<void> {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_unused", baseUrl: "http://unused.invalid" }), options);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "describe-tool", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    await use(async (args) => {
      const answer = await client.callTool({ name: "describe_tool", arguments: args });
      return { isError: answer.isError === true, text: (answer.content as { text: string }[])[0]!.text };
    });
  } finally {
    await client.close();
    await server.close();
  }
}

describe.each([["stdio", { fileAccess: "local" }], ["hosted", { fileAccess: "refuse" }]] as const)("describe_tool on the %s server (#1142)", (_, options) => {
  it("answers each tool's full description and every field text its schema holds", async () => {
    const raw = await rawTools(options);
    await withDescribeTool(options, async (describeTool) => { for (const tool of raw) {
      const answer = JSON.parse((await describeTool({ tool: tool.name })).text) as { description: string; fields: Record<string, string> };
      expect(answer.description, tool.name).toBe(tool.description ?? "");
      const texts: string[] = [];
      JSON.stringify(tool.inputSchema, (key, value: unknown) => { if (key === "description" && typeof value === "string") texts.push(value); return value; });
      const answered = Object.values(answer.fields).flatMap(text => text.split("\n"));
      expect(texts.filter(text => !answered.includes(text)), tool.name).toEqual([]);
    } });
  // Each answer builds the SDK's whole list, as tools/list does: one call is quick, 56 in a row are not.
  }, 60_000);

  it("answers one field with its subfields, and names an unknown tool as unknown", () => withDescribeTool(options, async (describeTool) => {
    const one = JSON.parse((await describeTool({ tool: "quote_ugc", field: "templates" })).text) as { fields: Record<string, string> };
    expect(one.fields.templates).toContain("lower_third (over)");
    expect(Object.keys(one.fields).every(path => path === "templates" || path.startsWith("templates[]"))).toBe(true);
    expect(Object.keys(one.fields).length).toBeGreaterThan(1);
    // An object field answers its nested fields by dotted path; a name it merely starts (voice of voice_id) is another field.
    const nested = Object.keys((JSON.parse((await describeTool({ tool: "prepare_workflow_plan", field: "document" })).text) as
      { fields: Record<string, string> }).fields);
    expect(nested).toContain("document.brief.native.input.script");
    expect(nested.every(path => path === "document" || path.startsWith("document.") || path.startsWith("document[]"))).toBe(true);
    const voice = Object.keys((JSON.parse((await describeTool({ tool: "quote_ugc", field: "voice" })).text) as { fields: Record<string, string> }).fields);
    expect(voice).toEqual(["voice"]);
    expect(await describeTool({ tool: "no_such_tool" })).toEqual({ isError: true, text: expect.stringContaining("no_such_tool") });
  }));
});

it("names each field by its path, items as [], and joins the different texts of one path's branches", () => {
  expect(fieldTexts({ type: "object", properties: {
    a: { description: "A.", type: "array", items: { type: "object", properties: { b: { description: "B." } } } },
    c: { anyOf: [{ description: "One." }, { description: "Two." }, { description: "One." }] } } })).toEqual({ a: "A.", "a[].b": "B.", c: "One.\nTwo." });
});

const NUMBER = /\d+(?:[.,]\d+)*/g;
const ZERO_CHARGE = /\b(?:charged nothing|charges nothing|costs? nothing|at no charge)\b/gi;
/** Numbers a full description gives about the answer, not about a price, a limit or a refusal; describe_tool still says them. */
const ANSWER_NUMBERS: Record<string, string[]> = {
  upload_image: ["256"], // SHA-256
  analyze_reference: ["3", "2"], // the hook's first 3 s, a 3×3 sheet, about 2–3 minutes
  get_reference_analysis: ["60", "4", "3", "0"], // 60 frames a page, 4×3 sheets, credits_charged 0 once failed
  analyze_creator: ["300", "2", "0", "50"], // captions cut at 300, 2× flagged top, null never 0, poll's wait_seconds
  get_creator_profile: ["0"], // credits_charged 0 once failed
  list_voices: ["17", "30", "3.8", "31", "4"], // catalog counts and model names
};
/** snake_case words of a refusal sentence that name an answer's field, not a refusal code; describe_tool still says them. */
const ANSWER_FIELDS: Record<string, string[]> = {
  get_reference_analysis: ["reference_profile", "source_url"],
  delete_creator_profile: ["profile_id", "creator_profile_not_found"], // what a read answers after the delete
  make_faceless: ["run_id", "video_url"],
};

/** The full text each listed text was written from: a change to it fails here until the listed text says the same, then pin the new digest. */
const WRITTEN_FROM: Record<string, string> = {
  analyze_creator: "7b719565ce3545fb", analyze_reference: "7470cd3b5d69774e", brand_kit: "1b5d31f10debd2ea", extract_brand: "112b76358d1111aa",
  prepare_workflow_plan: "dcc184695ee43de7", create_actor: "64dc97d2adf395ca", create_asset: "a72d252508f84fe1",
  create_candidate: "ac7da0d7f8974609", create_upload: "d851091117ab3350", delete_actor: "e625ea18d3d26377", delete_asset: "dd3a4991f04a444f",
  delete_creator_profile: "c5ee9a4029150781", find_trends: "fc42bb71d6a811d0", delete_run_media: "e4f93b3a9cd5ea05", delete_upload: "ebb515f237d976c0", generate_image: "92cdec4c8c45facb",
  generate_video: "a186d4a3edb2902b", get_account: "69e49b07e4b1be32", get_asset: "508a09c765a61f1f", get_creator_profile: "ccb8cc20d52ad7c9",
  get_reference_analysis: "cf4027c19e9a3dd3", get_run: "0ad53c727736d024", get_run_shots: "2b13db5cf3bca267", get_upload: "4bd3baac899982b4",
  list_actors: "89ca3249262caa88", list_assets: "ffa330bb764bedab", list_generation_models: "5737b2f41d69b048", list_moves: "067d552b22260a07", list_prices: "73634ccff928eacc",
  list_template_sounds: "22aba7b06ba63bfd", list_voices: "edd37da7991c06d4", make_faceless: "993ab6aa6f21c163", make_ugc: "7526c26c0963d629",
  plan_reference_remake: "113268b78befd274", "plan_reference_remake.music": "2f4412656b080b28", quote_actor: "e12a380eb9ee5f43",
  "quote_actor.aspect_ratios": "696dce090682b9ab", "quote_actor.description": "683e0cde898f0b05", "quote_actor.quality": "30a1a4112b5cec33",
  quote_analysis: "f8cafa866c28e5b6", "quote_analysis.mode": "87cd0678550af1e9", quote_candidate: "9cf2107d7d2e6101",
  quote_creator_profile: "551da40d61728402", "quote_faceless.duration_seconds": "b07373eacdcf86fe", "quote_faceless.voice": "4bb82130e245fe72",
  quote_image: "a21d80c84bd1fdd1", quote_revision: "2b7dc951c0ec0b8b", "quote_trends.language": "6123ffc4aa981c9f",
  "quote_ugc.actor_id": "ec9da39dc8413ce5", "quote_ugc.aspect_ratio": "b49a2e8f98e0ba34", "quote_ugc.broll_policy": "d8b247cc27906eaa",
  "quote_ugc.image": "8beaedf565c18d60", "quote_ugc.inserts": "2b0530cdf229962a", "quote_ugc.layout_windows": "48fd405d98d1c275",
  "quote_ugc.music": "ef9b89fd232638f1", "quote_ugc.overlays": "51dd7c5214297733", "quote_ugc.scenes": "1ef584e9b5864e44",
  "quote_ugc.script": "a9b4f9ba26c63207", "quote_ugc.shots": "15bc485c9fa83551", "quote_ugc.templates": "7b59c92fa0d03167",
  "quote_ugc.tts_model": "716efd015654205b", "quote_ugc.voice": "ce189b0cde20f160", "quote_ugc.voice_id": "35656914f07fa68d",
  quote_video: "3519b8c6ba6b25ea", revise_run: "47fcbe16835c2a97", run_workflow_plan: "eadcf5c87214179c", send_feedback: "facfb59478212d21",
  upload_image: "b07fead9a6855d53",
};
const digest = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

it("keeps in tools/list every price line, quote-first rule, number and refusal code of a tool's full text (#1142)", async () => {
  const [raw, listed] = [await rawTools({ fileAccess: "refuse" }), await listTools({ fileAccess: "refuse" })];
  const names = new Set(raw.map(tool => tool.name));
  const problems: string[] = [];
  for (const tool of raw) {
    const short = listed.find(entry => entry.name === tool.name)!.description ?? "";
    const line = priceLine(tool.name);
    const full = tool.description ?? "";
    if (line !== null && !short.endsWith(` ${line}`)) problems.push(`${tool.name}: no price line`);
    if (line !== null && !line.includes("Quote first with quote_")) problems.push(`${tool.name}: no quote-first rule`);
    const body = line === null ? full : full.slice(0, -line.length - 1);
    const numbers = new Set(short.match(NUMBER) ?? []);
    for (const number of new Set(body.match(NUMBER) ?? [])) {
      if (!numbers.has(number) && !(ANSWER_NUMBERS[tool.name] ?? []).includes(number)) problems.push(`${tool.name}: number ${number}`);
    }
    const fields = new Set(Object.keys(fieldTexts(tool.inputSchema as Record<string, unknown>)).flatMap(path => path.split(/[.[\]]+/)));
    const refusals = body.split(/(?<=\.)\s+/).filter(sentence => /refus|answers|fails with|error\.code/i.test(sentence));
    for (const code of new Set(refusals.flatMap(sentence => sentence.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? []))) {
      if (names.has(code) || fields.has(code) || short.includes(code) || (ANSWER_FIELDS[tool.name] ?? []).includes(code)) continue;
      problems.push(`${tool.name}: code ${code}`);
    }
    // Each case the full text charges nothing (a failure, a refusal, a closed state) stays a zero charge in the list.
    const zero = (text: string) => (text.match(ZERO_CHARGE) ?? []).length;
    if (zero(short) < zero(body)) problems.push(`${tool.name}: ${zero(body)} zero charges, ${zero(short)} listed`);
    // A listed text says no number, price or limit its full text does not say.
    const fullNumbers = new Set(body.match(NUMBER) ?? []);
    for (const number of numbers) if (!fullNumbers.has(number) && !(line ?? "").includes(number)) problems.push(`${tool.name}: new number ${number}`);
    const texts = fieldTexts(tool.inputSchema as Record<string, unknown>);
    for (const [field, text] of Object.entries(LISTED_FIELDS[tool.name] ?? {})) {
      const said = new Set(texts[field]?.match(NUMBER) ?? []);
      for (const number of text.match(NUMBER) ?? []) if (!said.has(number)) problems.push(`${tool.name}.${field}: new number ${number}`);
      if (zero(text) > 0 && zero(texts[field] ?? "") === 0) problems.push(`${tool.name}.${field}: a zero charge its full text lacks`);
    }
  }
  expect(problems).toEqual([]);
  // A price beside its mode is said as the full text pairs them, never swapped.
  const mode = fieldTexts(raw.find(tool => tool.name === "quote_analysis")!.inputSchema as Record<string, unknown>).mode!;
  for (const pair of mode.match(/\w+ \((?:default, )?\d+ credits\)/g) ?? []) expect(LISTED_FIELDS.quote_analysis!.mode).toContain(pair);
});

it("lists a short text only for a tool or field whose full text it was written from", async () => {
  const raw = await rawTools({ fileAccess: "refuse" });
  const byName = new Map(raw.map(tool => [tool.name, tool]));
  const sources = {
    ...Object.fromEntries(Object.keys(LISTED_DESCRIPTIONS).map(name => {
      const full = byName.get(name)!.description ?? "";
      const line = priceLine(name);
      return [name, line !== null && full.endsWith(` ${line}`) ? full.slice(0, -line.length - 1) : full];
    })),
    ...Object.fromEntries(Object.entries(LISTED_FIELDS).flatMap(([name, fields]) => Object.keys(fields).map(field =>
      [`${name}.${field}`, fieldTexts(byName.get(name)!.inputSchema as Record<string, unknown>)[field]!]))),
  };
  expect(Object.fromEntries(Object.entries(sources).map(([key, text]) => [key, digest(text)])), "a full text changed: say the change in listed-texts.ts, then pin its digest")
    .toEqual(WRITTEN_FROM);
});
