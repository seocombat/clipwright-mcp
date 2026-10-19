import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ClipwrightClient } from "@clipwright/sdk";

import { createServer, type CreateServerOptions } from "./server.js";

// The two pieces a remote host needs from this package, so the MCP SDK has one copy: the tool list and one stateless POST.

/** The tools exactly as a client lists them, from a server that never reaches the API. */
export async function listTools(options: CreateServerOptions): Promise<Tool[]> {
  const sdk = new ClipwrightClient({ apiKey: "cw_unused", baseUrl: "http://unused.invalid", clientId: "tool-list" });
  const server = createServer(sdk, options);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "clipwright-tool-list", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

/** Answers one POST of Streamable HTTP without a session, in JSON, with a server that reads no files; `parsedBody` skips a second parse. */
export async function handleRemoteRequest(client: ClipwrightClient, request: Request, parsedBody?: unknown): Promise<Response> {
  const server = createServer(client, { fileAccess: "refuse" });
  // No `sessionIdGenerator`: the SDK's stateless mode, which issues no session id and checks none.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, parsedBody === undefined ? {} : { parsedBody });
  } finally {
    await server.close();
  }
}
