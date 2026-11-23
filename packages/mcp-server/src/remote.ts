import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ClipwrightClient } from "@clipwright/sdk";

import { createServer, type CreateServerOptions } from "./server.js";

import { knownPrices, offeredBy } from "./offer.js";

export { BASE_PRICES, knownPrices, offeredBy } from "./offer.js";
export { invalidArgumentsReport } from "./invalid-arguments.js";

export const HOSTED_FULL_LIST_OPTIONS = { fileAccess: "refuse", ownAgent: true, adGuide: true, facelessDiy: true } as const satisfies CreateServerOptions;
export const STDIO_FULL_LIST_OPTIONS = { ...HOSTED_FULL_LIST_OPTIONS, fileAccess: "local" } as const satisfies CreateServerOptions;

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

export async function catalogTools(priceList: { readonly prices: readonly unknown[] }): Promise<Tool[]> {
  const prices = knownPrices(priceList);
  if (prices === undefined) throw new Error("the price list leaves a base tool unpriced");
  const offered = offeredBy(prices);
  const modes = Object.entries(HOSTED_FULL_LIST_OPTIONS).flatMap(([mode, on]) => (on === true ? [mode as keyof typeof offered] : []));
  const closed = modes.filter(mode => !offered[mode]);
  if (closed.length > 0) throw new Error(`the price list does not sell ${closed.join(", ")}: the catalogs would list tools no account can use`);
  return listTools({ ...STDIO_FULL_LIST_OPTIONS, prices });
}

export async function handleRemoteRequest(client: ClipwrightClient, request: Request, parsedBody?: unknown,
  offered: Omit<CreateServerOptions, "fileAccess"> = {}): Promise<Response> {
  const server = createServer(client, { fileAccess: "refuse", ...offered });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, parsedBody === undefined ? {} : { parsedBody });
  } finally {
    await server.close();
  }
}
