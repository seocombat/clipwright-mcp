import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  agentFailureReport,
  debtOutstandingBody,
  insufficientCreditsBody,
  parseApiFailure,
  RATE_LIMIT_FREE_PER_MINUTE,
  RATE_LIMIT_LIMIT_HEADER,
  RATE_LIMIT_REMAINING_HEADER,
  RATE_LIMIT_RESET_HEADER,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitedBody,
  rateLimitedError,
  RETRY_AFTER_HEADER,
} from "@clipwright/core";
import { ClipwrightApiError, ClipwrightClient } from "@clipwright/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServer } from "./server.js";

/** One schema, three surfaces: bodies built by the API's own functions travel */
/** through a real HTTP stub, SDK and MCP server; the API side is in apps/api. */

/** Seconds until retry; one number for the body and all headers, as in the middleware. */
const RETRY_AFTER_SECONDS = 7;

/** The 429 body the middleware really sends, with the FREE bucket because the */
/** stub serves it on the free `list_voices` route. */
const LIMITED = rateLimitedBody({
  limit: RATE_LIMIT_FREE_PER_MINUTE,
  windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  retryAfterSeconds: RETRY_AFTER_SECONDS,
  scope: "free",
});

const INSUFFICIENT = insufficientCreditsBody({ balanceCredits: 3, requiredCredits: 8 });
const DEBT = debtOutstandingBody({ debtCredits: 120 });

/** One refusal per route, so EACH tool is tested on its own code. */
const ROUTES = {
  "/v1/voices": { status: 429, body: LIMITED },
  "/v1/skills/make_ugc/quote": { status: 402, body: INSUFFICIENT },
  "/v1/skills/make_ugc/run": { status: 402, body: DEBT },
} as const;

let stub: Server;
let baseUrl = "";

beforeAll(async () => {
  stub = createHttpServer((req, res) => {
    const route = ROUTES[(req.url ?? "") as keyof typeof ROUTES];
    if (route === undefined) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: `no stub for ${req.url}` } }));
      return;
    }
    // All four headers, named from core, only on 429: to the client the stub
    // must look exactly like the middleware.
    const headers: Record<string, string> =
      route.status === 429
        ? {
            "Content-Type": "application/json",
            [RATE_LIMIT_LIMIT_HEADER]: String(RATE_LIMIT_FREE_PER_MINUTE),
            [RATE_LIMIT_REMAINING_HEADER]: "0",
            [RATE_LIMIT_RESET_HEADER]: String(RETRY_AFTER_SECONDS),
            [RETRY_AFTER_HEADER]: String(RETRY_AFTER_SECONDS),
          }
        : { "Content-Type": "application/json" };
    res.writeHead(route.status, headers);
    res.end(JSON.stringify(route.body));
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    stub.close((error) => (error ? reject(error) : resolve())),
  );
});

function sdkClient(): ClipwrightClient {
  return new ClipwrightClient({ apiKey: "cw_test", baseUrl });
}

async function connected(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(sdkClient());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  return {
    client: mcpClient,
    close: async () => {
      await mcpClient.close();
      await server.close();
    },
  };
}

/** The tool response's single text block, parsed back into an object. */
async function callTool(name: string, args: Record<string, unknown>): Promise<{
  isError: boolean;
  payload: Record<string, unknown>;
}> {
  const { client, close } = await connected();
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return {
      isError: result.isError === true,
      payload: JSON.parse(content[0]!.text) as Record<string, unknown>,
    };
  } finally {
    await close();
  }
}

/** The refusal as a bare REST client sees it: fetch plus core's schemas. */
async function restFailure(path: string): Promise<ClipwrightApiError> {
  const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
  const bodyText = await res.text();
  return new ClipwrightApiError(
    parseApiFailure({
      status: res.status,
      bodyText,
      retryAfterHeader: res.headers.get(RETRY_AFTER_HEADER),
    }),
  );
}

describe("a refusal reaches the agent from ONE schema", () => {
  it("a body built by the core schema parses with it", () => {
    // The axis of the whole check: if the shape drifts, nothing else parses.
    expect(rateLimitedError.safeParse(LIMITED).success).toBe(true);
  });

  it("the SDK delivers the schema's message, not its own", async () => {
    // Mutant: build the message in `#request` ("HTTP 429") and this fails.
    // The agent shows this text to the human: seconds and bucket included.
    await expect(sdkClient().listVoices()).rejects.toThrow(LIMITED.error.message);
  });

  it("the SDK delivers STATUS AND PAUSE, not just a message", async () => {
    // Without them the first 429 while polling would kill `makeUgc`.
    const error = (await sdkClient()
      .listVoices()
      .catch((caught: unknown) => caught)) as ClipwrightApiError;

    expect(error).toBeInstanceOf(ClipwrightApiError);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(RETRY_AFTER_SECONDS);
    expect(error.retryable).toBe(true);
  });

  it("the MCP tool returns the same text: the third surface does not rewrite the cause", async () => {
    const { isError, payload } = await callTool("list_voices", {});
    expect(isError).toBe(true);
    expect(payload["message"]).toBe(LIMITED.error.message);
  });

  it("the message CARRIES the refusal's numbers, not just the fact", async () => {
    // Without seconds and limit the agent can neither wait right nor explain.
    const { payload } = await callTool("list_voices", {});
    expect(payload).toMatchObject({
      retry_after_seconds: RETRY_AFTER_SECONDS,
      limit: RATE_LIMIT_FREE_PER_MINUTE,
      window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
  });
});

describe("three surfaces parse one refusal IDENTICALLY", () => {
  /** REST, SDK and MCP are compared WHOLE, so a field added or renamed on one */
  /** surface fails the case. */
  it.each([
    ["list_voices", {}, "/v1/voices", 429],
    ["quote_ugc", { script: "hello" }, "/v1/skills/make_ugc/quote", 402],
  ] as const)("%s: REST, SDK and MCP yield one object", async (tool, args, path, status) => {
    const rest = await restFailure(path);
    expect(rest.status).toBe(status);

    const { payload } = await callTool(tool, args as Record<string, unknown>);
    expect(payload).toEqual(agentFailureReport(rest.failure));
  });
});

describe("402 is a terminal self-describing answer, not a reason to retry", () => {
  it("insufficient_credits: numbers present, retry explicitly forbidden", async () => {
    const { isError, payload } = await callTool("quote_ugc", { script: "hello" });

    expect(isError).toBe(true);
    expect(payload).toMatchObject({
      status: "FAILED",
      code: "insufficient_credits",
      retryable: false,
      balance_credits: 3,
      required_credits: 8,
    });
    expect(String(payload["next_action"])).toContain("Do NOT retry");
  });

  it("debt_outstanding: its own code and advice, not a shade of the first", async () => {
    // "Buy credits" is right: purchases pay off debt first. The advice differs
    // from insufficient_credits because an indebted account may hold a balance.
    const { isError, payload } = await callTool("make_ugc", { script: "hello" });

    expect(isError).toBe(true);
    expect(payload).toMatchObject({
      status: "FAILED",
      code: "debt_outstanding",
      retryable: false,
      debt_credits: 120,
    });
    expect(String(payload["next_action"])).toContain("Tell the user to buy credits");
    // "A purchase adds nothing" versus "nothing left to spend" must reach the
    // agent through MCP.
    expect(String(payload["next_action"])).toContain("adds nothing to the balance");
    expect(String(payload["next_action"])).not.toContain("nothing to spend");
  });

  it("both 402s arrive as a REFUSAL, not as a run in progress", async () => {
    // An `IN_PROGRESS` shape would send the agent polling a run that does not exist.
    for (const [tool, args] of [
      ["quote_ugc", { script: "hello" }],
      ["make_ugc", { script: "hello" }],
    ] as const) {
      const { payload } = await callTool(tool, args as Record<string, unknown>);
      expect(payload["status"]).toBe("FAILED");
      expect(payload["run_id"]).toBeUndefined();
    }
  });
});
