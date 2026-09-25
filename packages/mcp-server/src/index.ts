#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClipwrightClient } from "@clipwright/sdk";
import { apiBaseUrlFromEnv } from "@clipwright/core";
import { createServer } from "./server.js";

const apiKey = process.env.CLIPWRIGHT_API_KEY;
if (!apiKey) {
  console.error("CLIPWRIGHT_API_KEY env var is required");
  process.exit(1);
}
let baseUrl: string | undefined;
try {
  baseUrl = apiBaseUrlFromEnv(process.env.CLIPWRIGHT_API_URL);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const client = new ClipwrightClient({ apiKey, baseUrl });

const server = createServer(client);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("clipwright mcp server running on stdio");
