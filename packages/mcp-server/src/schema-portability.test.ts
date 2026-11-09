import { spawnSync } from "node:child_process";

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { listTools } from "./remote.js";

/** Every `pattern` and `patternProperties` key, with the JSON path that holds it. */
function patterns(node: unknown, path: string, out: { path: string; pattern: string }[] = []): { path: string; pattern: string }[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      patterns(item, `${path}[${i}]`, out);
    });
  }
  else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "pattern" && typeof value === "string") out.push({ path: `${path}/pattern`, pattern: value });
      if (key === "patternProperties" && value !== null && typeof value === "object") {
        for (const name of Object.keys(value)) out.push({ path: `${path}/patternProperties`, pattern: name });
      }
      patterns(value, `${path}/${key}`, out);
    }
  }
  return out;
}

/** The patterns Python's `re` refuses to compile, with its error: ChatGPT checks tool schemas in that dialect. */
function refusedByPython(found: { path: string; pattern: string }[]): string[] {
  const script = "import json,re,sys\nfor p in json.load(sys.stdin):\n  try: re.compile(p['pattern'])\n" +
    "  except re.error as e: print(p['path'], '|', p['pattern'], '|', e)";
  const run = spawnSync("python3", ["-I", "-c", script], { input: JSON.stringify(found), encoding: "utf8" });
  if (run.error !== undefined || run.status !== 0) throw new Error(`python3 is required for this guard: ${run.error?.message ?? run.stderr}`);
  return run.stdout.split("\n").filter(Boolean);
}

/** ChatGPT refused a whole refresh for one schema: "Invalid MCP tool schema for tool 'plan_reference_remake'", from `\p{Cc}`. */
describe("every advertised inputSchema is valid JSON Schema 2020-12 and portable to ChatGPT", () => {
  it.each(["refuse", "local"] as const)("fileAccess %s", async (fileAccess) => {
    const tools: Tool[] = await listTools({ fileAccess });
    const ajv = new Ajv2020({ strict: true, validateFormats: false });
    const invalid = tools.flatMap((tool) => {
      if (ajv.validateSchema(tool.inputSchema) !== true) return [`${tool.name}: ${ajv.errorsText(ajv.errors)}`];
      try {
        ajv.compile(tool.inputSchema);
        return [];
      } catch (error) {
        return [`${tool.name}: ${error instanceof Error ? error.message : String(error)}`];
      }
    });
    expect(invalid).toEqual([]);
    const found = tools.flatMap((tool) => patterns(tool.inputSchema, tool.name));
    expect(found.length).toBeGreaterThan(0);
    expect(refusedByPython(found)).toEqual([]);
  });
});
