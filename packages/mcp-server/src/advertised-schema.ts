import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// tools/list as clients receive it: the same tools and fields in less JSON, while calls still parse with the full zod schemas (#1003).
// Every change only widens what the advertised schema accepts, so a client that checks it never refuses a call the server takes.

type Schema = { [key: string]: unknown };

/** Fields an agent copies from another answer or tool, advertised by pointer instead of by schema. */
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
  },
};
/** Field descriptions keep their first sentences up to this many characters; deeper ones keep fewer. */
export const FIELD_DESCRIPTION_CHARS = 160;
export const NESTED_DESCRIPTION_CHARS = 60;
/** Tools whose field descriptions stay whole: quote_ugc's carry the templates catalog, the snap rule and the script limits. */
export const WHOLE_FIELD_DESCRIPTIONS = new Set(["quote_ugc"]);

const MAP_KEYWORDS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];
const ONE_KEYWORDS = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedProperties", "unevaluatedItems"];
const LIST_KEYWORDS = ["anyOf", "oneOf", "allOf", "prefixItems"];
const isSchema = (value: unknown): value is Schema => typeof value === "object" && value !== null && !Array.isArray(value);

/** Every subschema slot of a node: its container, its key, and whether it sits one field deeper. */
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

const withoutDescriptions = (schema: unknown): string =>
  JSON.stringify(schema, (key, value: unknown) => (key === "description" && typeof value === "string") || key === "$schema" ? undefined : value);

/** The paid tools whose input is their free quote's plus a few fields; the quote, read first, keeps the field descriptions. */
export const PAID_TWINS: Record<string, string> = {
  make_ugc: "quote_ugc", revise_run: "quote_revision", generate_video: "quote_video", generate_image: "quote_image",
  create_actor: "quote_actor", make_faceless: "quote_faceless", create_candidate: "quote_candidate", analyze_reference: "quote_analysis",
};

/** The paid tool's fields its quote lacks, or undefined when the quote's fields differ from the paid tool's. */
export function twinExtras(paid: Tool, quote: Tool): string[] | undefined {
  const [own, theirs] = [paid, quote].map(tool => JSON.parse(withoutDescriptions(tool.inputSchema)) as Schema);
  const ownFields = (isSchema(own!.properties) ? own!.properties : {}) as Schema;
  const quoteFields = (isSchema(theirs!.properties) ? theirs!.properties : {}) as Schema;
  const shared = Object.keys(quoteFields);
  const same = shared.every(key => JSON.stringify(ownFields[key]) === JSON.stringify(quoteFields[key]))
    && JSON.stringify(((own!.required ?? []) as string[]).filter(key => shared.includes(key))) === JSON.stringify(theirs!.required ?? []);
  return same ? Object.keys(ownFields).filter(key => !shared.includes(key)) : undefined;
}

/** Each paid tool advertised by its quote, with the fields only it takes; a pair whose fields drifted keeps its own schema. */
export function findTwins(tools: readonly Tool[]): Map<string, { of: string; plus: string[] }> {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const twins = new Map<string, { of: string; plus: string[] }>();
  for (const [paid, quote] of Object.entries(PAID_TWINS)) {
    const [paidTool, quoteTool] = [byName.get(paid), byName.get(quote)];
    const plus = paidTool && quoteTool ? twinExtras(paidTool, quoteTool) : undefined;
    if (plus !== undefined) twins.set(paid, { of: quote, plus });
  }
  return twins;
}

/** A description cut after its last whole sentence that fits, or after a whole word. */
export function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("; "));
  return end >= limit / 3 ? head.slice(0, end + 1) : `${head.replace(/\s+\S*$/, "")}…`;
}

/** Repeated subschemas move to `$defs` once, largest saving first; each copy becomes a `$ref`. Nodes in `keep` stay in place. */
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

/** A twin's field as its types only, so a client building the call sends the right types; the quote describes it and lists its values. */
export function typeShape(field: unknown): unknown {
  if (!isSchema(field)) return field;
  const shape: Schema = {};
  for (const keyword of ["type", "format"]) if (keyword in field) shape[keyword] = field[keyword];
  if (isSchema(field.items)) shape.items = typeShape(field.items);
  // oneOf turns anyOf: branches stripped of what told them apart could match a value twice.
  const branches = ["anyOf", "oneOf"].flatMap(keyword => (Array.isArray(field[keyword]) ? (field[keyword] as unknown[]) : []).map(typeShape));
  const distinct = [...new Map(branches.map(branch => [JSON.stringify(branch), branch])).values()];
  if (distinct.length === 1 && Object.keys(shape).length === 0) return distinct[0];
  if (distinct.length > 0) shape.anyOf = distinct;
  return shape;
}

/** A paid twin's description starts by naming the quote whose fields it takes. */
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

function advertise(tools: readonly Tool[]): Tool[] {
  const twins = findTwins(tools);
  const described = new Set<string>();
  // A text a whole-described tool gives a field is said there and nowhere else, whatever the order of the list.
  const kept = new Set<string>();
  for (const tool of tools.filter(entry => WHOLE_FIELD_DESCRIPTIONS.has(entry.name))) {
    walk(tool.inputSchema as Schema, 0, (node, depth) => { if (depth === 1 && typeof node.description === "string") kept.add(node.description); });
  }
  return tools.map(tool => {
    const twin = twins.get(tool.name);
    const schema = structuredClone(tool.inputSchema) as Schema;
    // A pointer is the field's only description, so no dedup, cut or $defs move touches it.
    const pointers = new Set<Schema>();
    for (const [path, description] of Object.entries(COPIED_FIELDS[tool.name] ?? {})) {
      const [container, key] = pointer(schema, path);
      const node = { type: "object", description };
      pointers.add(node);
      put(container, key, node);
    }
    if (twin !== undefined && isSchema(schema.properties)) {
      schema.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, field]) => [key, typeShape(field)]));
      // Open at the root to save bytes: the server parses the call against the full schema and names an unknown field.
      delete schema.additionalProperties;
    }
    delete schema.$schema;
    const own = new Set<string>();
    const keepFields = WHOLE_FIELD_DESCRIPTIONS.has(tool.name);
    walk(schema, 0, (node, depth) => {
      if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
      if (node.minimum === -Number.MAX_SAFE_INTEGER) delete node.minimum;
      // The root still refuses unknown fields; a nested one is refused by the server, which names it.
      if (depth > 0 && node.additionalProperties === false) delete node.additionalProperties;
      if (depth === 0 || typeof node.description !== "string") return;
      if ((keepFields && depth === 1) || pointers.has(node)) return;
      if (described.has(node.description) || kept.has(node.description)) { delete node.description; return; }
      own.add(node.description);
      node.description = shorten(node.description, depth === 1 ? FIELD_DESCRIPTION_CHARS : NESTED_DESCRIPTION_CHARS);
    });
    for (const text of own) described.add(text);
    const { execution, ...rest } = tool;
    const description = twin === undefined ? tool.description : withTwinNote(tool.description ?? "", twin);
    return { ...rest, ...(execution === undefined || execution.taskSupport === "forbidden" ? {} : { execution }),
      ...(description === undefined ? {} : { description }), inputSchema: hoistRepeats(schema, pointers) as Tool["inputSchema"] };
  });
}

let cached: { key: string; tools: Tool[] } | undefined;
/** The advertised list for the tools the SDK lists; the hosted server builds a server per request, so the last answer is kept. */
export function advertisedTools(tools: readonly Tool[]): Tool[] {
  const key = JSON.stringify(tools);
  if (cached?.key !== key) cached = { key, tools: advertise(tools) };
  return structuredClone(cached.tools);
}

type ListHandler = (request: unknown, extra: unknown) => Promise<{ tools: Tool[] }>;
/** Wraps the SDK's tools/list answer; call after every tool is registered. */
export function advertiseSlimTools(server: McpServer): void {
  // The SDK offers no hook into its tools/list answer, so the registered handler is wrapped in its private map.
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, ListHandler> })._requestHandlers;
  const list = handlers?.get("tools/list");
  if (handlers === undefined || list === undefined) throw new Error("the MCP SDK no longer keeps a tools/list handler to wrap");
  handlers.set("tools/list", async (request, extra) => {
    const answer = await list(request, extra);
    return { ...answer, tools: advertisedTools(answer.tools) };
  });
}
