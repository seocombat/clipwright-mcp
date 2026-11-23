import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { priceLine, type PriceEntry } from "@clipwright/core";

import { adMethodPointer, LISTED_DESCRIPTIONS, LISTED_FIELDS } from "./listed-texts.js";


type Schema = { [key: string]: unknown };

export const COPIED_FIELDS: Record<string, Record<string, string>> = {
  prepare_workflow_plan: {
    "/properties/document/properties/brief/properties/native/oneOf/0/properties/input":
      "The make_ugc input: the same fields as quote_ugc.",
    "/properties/document/properties/brief/properties/native/oneOf/1/properties/input":
      "The make_faceless input: the same fields as quote_faceless.",
    "/properties/document/properties/brief/properties/reference_profile":
      "The reference_profile field of a succeeded get_reference_analysis answer, passed unchanged.",
  },
  plan_reference_remake: {
    "/properties/reference_profile":
      "The reference_profile field of a succeeded get_reference_analysis answer, passed unchanged.",
    "/properties/moves": "The moves array of quote_ugc input.",
    "/properties/motion_style": "The motion_style object of quote_ugc input.",
    "/properties/cast": "As quote_ugc shot cast.",
  },
  brand_kit: { "/properties/design": "The design object of quote_ugc input." },
  quote_ugc: { "/properties/motion_style": "Free drawing style of captions, templates and scenes; describe_tool quote_ugc motion_style " +
    "lists the styles and spans." },
};

const MAP_KEYWORDS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];
const ONE_KEYWORDS = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedProperties", "unevaluatedItems"];
const LIST_KEYWORDS = ["anyOf", "oneOf", "allOf", "prefixItems"];
const isSchema = (value: unknown): value is Schema => typeof value === "object" && value !== null && !Array.isArray(value);

function slots(node: Schema): [Schema | unknown[], string | number, boolean][] {
  const found: [Schema | unknown[], string | number, boolean][] = [];
  for (const [keyword, value] of Object.entries(node)) {
    if (MAP_KEYWORDS.includes(keyword) && isSchema(value)) for (const key of Object.keys(value)) found.push([value, key, true]);
    else if (ONE_KEYWORDS.includes(keyword) && isSchema(value)) found.push([node, keyword, true]);
    else if (LIST_KEYWORDS.includes(keyword) && Array.isArray(value)) for (let index = 0; index < value.length; index++) found.push([value, index, false]);
  }
  return found;
}
const child = (container: Schema | unknown[], key: string | number): unknown => (container as Record<string | number, unknown>)[key];
const put = (container: Schema | unknown[], key: string | number, value: unknown): void => {
  (container as Record<string | number, unknown>)[key] = value;
};

function walk(node: Schema, depth: number, visit: (node: Schema, depth: number) => void): void {
  visit(node, depth);
  for (const [container, key, deeper] of slots(node)) {
    const value = child(container, key);
    if (isSchema(value)) walk(value, deeper ? depth + 1 : depth, visit);
  }
}

export function toDraft2020(node: Schema): Schema {
  if (Array.isArray(node.items)) {
    node.prefixItems = node.items;
    delete node.items;
    if (node.additionalItems !== undefined) node.items = node.additionalItems;
  }
  delete node.additionalItems;
  for (const [container, key] of slots(node)) {
    const value = child(container, key);
    if (isSchema(value)) toDraft2020(value);
  }
  return node;
}

const withoutDescriptions = (schema: unknown): string =>
  JSON.stringify(schema, (key, value: unknown) => (key === "description" && typeof value === "string") || key === "$schema" ? undefined : value);

export const PAID_TWINS: Record<string, string> = {
  make_ugc: "quote_ugc", revise_run: "quote_revision", generate_video: "quote_video", generate_image: "quote_image",
  create_actor: "quote_actor", make_faceless: "quote_faceless", create_candidate: "quote_candidate", analyze_reference: "quote_analysis",
  find_trends: "quote_trends", upscale: "quote_upscale", render_edit: "quote_edit", check_take: "quote_take_check", render_film: "quote_render",
  preview_stills: "quote_stills", make_film_hero: "quote_film_hero", make_voice: "quote_voice",
};

export const SHARED_INPUTS: Record<string, string> = {
  quote_cut: "check_cut", quote_cut_preview: "check_cut", preview_cut: "check_cut", render_cut: "check_cut",
};

export function twinExtras(paid: Tool, quote: Tool): string[] | undefined {
  const [own, theirs] = [paid, quote].map(tool => JSON.parse(withoutDescriptions(tool.inputSchema)) as Schema);
  const ownFields = (isSchema(own!.properties) ? own!.properties : {}) as Schema;
  const quoteFields = (isSchema(theirs!.properties) ? theirs!.properties : {}) as Schema;
  const shared = Object.keys(quoteFields);
  const same = shared.every(key => key in ownFields && JSON.stringify(ownFields[key]) === JSON.stringify(quoteFields[key]));
  return same ? Object.keys(ownFields).filter(key => !shared.includes(key)) : undefined;
}

export function findTwins(tools: readonly Tool[]): Map<string, { of: string; plus: string[] }> {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const twins = new Map<string, { of: string; plus: string[] }>();
  for (const [name, of] of [...Object.entries(PAID_TWINS), ...Object.entries(SHARED_INPUTS)]) {
    const [tool, source] = [byName.get(name), byName.get(of)];
    const plus = tool && source ? twinExtras(tool, source) : undefined;
    if (plus !== undefined) twins.set(name, { of, plus });
  }
  return twins;
}

export function hoistRepeats(schema: Schema, keep: ReadonlySet<Schema> = new Set()): Schema {
  const { $defs: existing, ...root } = schema;
  const defs: Schema = isSchema(existing) ? { ...existing } : {};
  const scan = (visit: (container: Schema | unknown[], key: string | number, value: Schema) => boolean): void => {
    const step = (node: Schema): void => {
      for (const [container, key] of slots(node)) {
        const value = child(container, key);
        if (isSchema(value) && !visit(container, key, value)) step(value);
      }
    };
    step(root);
    for (const def of Object.values(defs)) if (isSchema(def)) step(def);
  };
  for (let index = 0; ; index++) {
    const counts = new Map<string, number>();
    scan((_, __, value) => {
      if (!("$ref" in value) && !keep.has(value)) { const text = JSON.stringify(value); counts.set(text, (counts.get(text) ?? 0) + 1); }
      return false;
    });
    const name = `d${index}`;
    const refLength = JSON.stringify({ $ref: `#/$defs/${name}` }).length;
    let best: string | undefined, gain = 0;
    for (const [text, count] of counts) {
      const saved = (text.length - refLength) * count - text.length - name.length - 4;
      if (count > 1 && saved > gain) { gain = saved; best = text; }
    }
    if (best === undefined) break;
    scan((container, key, value) => {
      if (keep.has(value) || JSON.stringify(value) !== best) return false;
      put(container, key, { $ref: `#/$defs/${name}` });
      return true;
    });
    defs[name] = JSON.parse(best) as Schema;
  }
  return Object.keys(defs).length === 0 ? root : { ...root, $defs: defs };
}

export function typeShape(field: unknown): unknown {
  if (!isSchema(field)) return field;
  const shape: Schema = {};
  for (const keyword of ["type", "format"]) if (keyword in field) shape[keyword] = field[keyword];
  if ("format" in field && "pattern" in field) shape.pattern = field.pattern;
  if (isSchema(field.items)) shape.items = typeShape(field.items);
  const branches = ["anyOf", "oneOf"].flatMap(keyword => (Array.isArray(field[keyword]) ? (field[keyword] as unknown[]) : []).map(typeShape));
  const distinct = [...new Map(branches.map(branch => [JSON.stringify(branch), branch])).values()];
  if (distinct.length === 1 && Object.keys(shape).length === 0) return distinct[0];
  if (distinct.length > 0) shape.anyOf = distinct;
  return shape;
}

const withTwinNote = (description: string, twin: { of: string; plus: string[] }): string =>
  `Input: the same fields as ${twin.of}${twin.plus.length === 0 ? "" : `, plus ${twin.plus.join(", ")}`}. ${description}`.trim();

function pointer(root: Schema, path: string): [Schema | unknown[], string] {
  const keys = path.split("/").slice(1);
  let node: unknown = root;
  for (const key of keys.slice(0, -1)) node = (node as Record<string, unknown> | undefined)?.[key];
  const last = keys.at(-1)!;
  if (!isSchema(node) && !Array.isArray(node) || child(node, last) === undefined) throw new Error(`no schema at ${path}`);
  return [node, last];
}

function advertise(tools: readonly Tool[], prices: readonly PriceEntry[]): Tool[] {
  const twins = findTwins(tools), guide = tools.some(tool => tool.name === "get_ad_guide");
  return tools.map(tool => {
    const twin = twins.get(tool.name);
    const schema = toDraft2020(structuredClone(tool.inputSchema) as Schema);
    const pointers = new Set<Schema>();
    for (const [path, description] of Object.entries(COPIED_FIELDS[tool.name] ?? {})) {
      const [container, key] = pointer(schema, path);
      const node = { ...(typeShape(child(container, key)) as Schema), description };
      pointers.add(node);
      put(container, key, node);
    }
    const listed = new Set<Schema>();
    for (const [key, description] of Object.entries(LISTED_FIELDS[tool.name] ?? {})) {
      const [container, at] = pointer(schema, `/properties/${key}`);
      const node = child(container, at) as Schema;
      node.description = description;
      listed.add(node);
    }
    if (twin !== undefined && isSchema(schema.properties)) {
      schema.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, field]) =>
        [key, twin.plus.includes(key) ? field : typeShape(field)]));
      delete schema.additionalProperties;
    }
    delete schema.$schema;
    walk(schema, 0, (node, depth) => {
      if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
      if (node.minimum === -Number.MAX_SAFE_INTEGER) delete node.minimum;
      if (node.format === "starts_with" && typeof node.pattern === "string") delete node.format;
      if (isSchema(node.propertyNames) && Object.keys(node.propertyNames).join() === "type" && node.propertyNames.type === "string") delete node.propertyNames;
      if (isSchema(node.additionalProperties) && Object.keys(node.additionalProperties).length === 0) delete node.additionalProperties;
      if (node.format === "date-time" && typeof node.pattern === "string") delete node.pattern;
      if (depth > 0 && node.additionalProperties === false) delete node.additionalProperties;
      if (depth === 0 || typeof node.description !== "string" || pointers.has(node) || listed.has(node)) return;
      delete node.description;
    });
    const { execution, outputSchema, ...rest } = tool;
    const body = listedDescription(tool, prices, guide);
    const description = twin === undefined ? body : withTwinNote(body ?? "", twin);
    return { ...rest, ...(execution === undefined || execution.taskSupport === "forbidden" ? {} : { execution }),
      ...(outputSchema === undefined ? {} : { outputSchema: toDraft2020(structuredClone(outputSchema) as Schema) as Tool["outputSchema"] }),
      ...(description === undefined ? {} : { description }), inputSchema: hoistRepeats(schema, pointers) as Tool["inputSchema"] };
  });
}

export function listedDescription(tool: Pick<Tool, "name" | "description">, prices: readonly PriceEntry[], guide = false): string | undefined {
  const short = tool.name === "make_ugc" ? `${LISTED_DESCRIPTIONS.make_ugc} ${adMethodPointer(guide)}` : LISTED_DESCRIPTIONS[tool.name];
  if (short === undefined) return tool.description;
  const price = priceLine(tool.name, prices);
  return price !== null && tool.description?.endsWith(price) ? `${short} ${price}` : short;
}

export function fieldTexts(node: Schema, path = "", into: Record<string, string> = {}): Record<string, string> {
  if (path !== "" && typeof node.description === "string" && !(into[path]?.split("\n").includes(node.description) ?? false)) {
    into[path] = into[path] === undefined ? node.description : `${into[path]}\n${node.description}`;
  }
  for (const [keyword, value] of Object.entries(node)) {
    if (MAP_KEYWORDS.includes(keyword) && isSchema(value)) {
      for (const [key, sub] of Object.entries(value)) {
        if (isSchema(sub)) fieldTexts(sub, keyword === "properties" ? (path === "" ? key : `${path}.${key}`) : `${keyword}.${key}`, into);
      }
    } else if (ONE_KEYWORDS.includes(keyword) && isSchema(value)) fieldTexts(value, keyword === "items" ? `${path}[]` : path, into);
    else if (LIST_KEYWORDS.includes(keyword) && Array.isArray(value)) for (const branch of value) if (isSchema(branch)) fieldTexts(branch, path, into);
  }
  return into;
}

export function describeTool(tools: readonly Tool[], name: string, field?: string):
  { tool: string; description: string; fields: Record<string, string> } | undefined {
  const tool = tools.find(entry => entry.name === name);
  if (tool === undefined) return undefined;
  const fields = Object.entries(fieldTexts(tool.inputSchema as Schema))
    .filter(([path]) => field === undefined || path === field || path.startsWith(`${field}.`) || path.startsWith(`${field}[]`));
  return { tool: name, description: tool.description ?? "", fields: Object.fromEntries(fields) };
}

let cached: { key: string; tools: Tool[] } | undefined;
export function advertisedTools(tools: readonly Tool[], prices: readonly PriceEntry[]): Tool[] {
  const key = JSON.stringify(tools);
  if (cached?.key !== key) cached = { key, tools: advertise(tools, prices) };
  return structuredClone(cached.tools);
}

type ListHandler = (request: unknown, extra: unknown) => Promise<{ tools: Tool[] }>;
export function advertiseSlimTools(server: McpServer, prices: readonly PriceEntry[]): () => Promise<Tool[]> {
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, ListHandler> })._requestHandlers;
  const list = handlers?.get("tools/list");
  if (handlers === undefined || list === undefined) throw new Error("the MCP SDK no longer keeps a tools/list handler to wrap");
  handlers.set("tools/list", async (request, extra) => {
    const answer = await list(request, extra);
    return { ...answer, tools: advertisedTools(answer.tools, prices) };
  });
  let full: Promise<Tool[]> | undefined;
  return () => (full ??= list({ method: "tools/list", params: {} }, {}).then(answer => answer.tools));
}
