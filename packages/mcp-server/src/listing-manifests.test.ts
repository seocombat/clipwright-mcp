import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

import { ClipwrightClient } from "@clipwright/sdk";

import { createServer } from "./server.js";

/** Listings read these files, not the package: drift from `package.json` would ship silently. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const pkg = json("package.json");
const serverJson = json("server.json");
const manifest = json("mcpb/manifest.json");

async function registeredToolNames(): Promise<string[]> {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "listing-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

describe("server.json for the official MCP registry", () => {
  it("name equals the package mcpName, versions equal the package version", () => {
    expect(serverJson.name).toBe(pkg.mcpName);
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages).toHaveLength(1);
    expect(serverJson.packages[0]).toMatchObject({ identifier: pkg.name, version: pkg.version, transport: { type: "stdio" } });
  });

  it("passes the registry schema vendored under the same $id", () => {
    const schema = json("schemas/server.schema.2025-12-11.json");
    expect(schema.$id).toBe(serverJson.$schema);
    const result = new AjvJsonSchemaValidator().getValidator(schema)(serverJson);
    expect(result.errorMessage).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it("the API key is required and secret", () => {
    const key = serverJson.packages[0].environmentVariables.find((env: { name: string }) => env.name === "CLIPWRIGHT_API_KEY");
    expect(key).toMatchObject({ isRequired: true, isSecret: true });
  });
});

describe("manifest.json of the .mcpb bundle", () => {
  it("version equals the package version; the API key is required, hidden and reaches the process", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.user_config.api_key).toMatchObject({ type: "string", sensitive: true, required: true });
    expect(manifest.server.mcp_config.env.CLIPWRIGHT_API_KEY).toBe("${user_config.api_key}");
    expect(manifest.server.mcp_config.args).toEqual([`\${__dirname}/${manifest.server.entry_point}`]);
    expect(manifest.server.entry_point).toBe(pkg.bin["clipwright-mcp"]);
  });

  it("the tool list matches what the server registers", async () => {
    const listed = manifest.tools.map((tool: { name: string }) => tool.name).sort();
    expect(listed).toEqual(await registeredToolNames());
  });
});
