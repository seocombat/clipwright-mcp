import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClipwrightClient } from "@clipwright/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServer } from "./server.js";

/** `make_ugc` DELIVERS `run.warnings`. Mutant: give `server.ts` its own */
/** IN_PROGRESS response literal again. */

const WARNINGS = [
  "source is 16:9, snapped to 9:16 by the vendor's centre crop",
  "voice preset language does not match the script language",
];

const QUEUED_RUN = {
  run_id: "run_mcpwarnings",
  skill: "make_ugc",
  state: "queued",
  credits_reserved: 90,
  credits_charged: null,
  warnings: WARNINGS,
  error: null,
  final_output: null,
  steps: [],
  created_at: new Date().toISOString(),
  finished_at: null,
};

let stub: Server;
let baseUrl = "";

beforeAll(async () => {
  stub = createHttpServer((req, res) => {
    if (req.url !== "/v1/skills/make_ugc/run") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: `no stub for ${req.url}` } }));
      return;
    }
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify(QUEUED_RUN));
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    stub.close((error) => (error ? reject(error) : resolve())),
  );
});

async function callMakeUgc(): Promise<Record<string, unknown>> {
  const sdkClient = new ClipwrightClient({ apiKey: "cw_test", baseUrl });
  const server = createServer(sdkClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  try {
    const result = await mcpClient.callTool({
      name: "make_ugc",
      arguments: { script: "hello from the warnings case" },
    });
    const content = result.content as { type: string; text: string }[];
    return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
  } finally {
    await mcpClient.close();
    await server.close();
  }
}

describe("make_ugc delivers the run's warnings", () => {
  it("the response carries ALL warnings, in the same order", async () => {
    const payload = await callMakeUgc();

    expect(payload["warnings"]).toEqual(WARNINGS);
  });

  it("the rest of the response is unchanged: IN_PROGRESS, run_id, state, next_action", async () => {
    // Otherwise a response that no longer tells the agent what to do next could
    // satisfy the case above.
    const payload = await callMakeUgc();

    expect(payload["status"]).toBe("IN_PROGRESS");
    expect(payload["run_id"]).toBe(QUEUED_RUN.run_id);
    expect(payload["state"]).toBe("queued");
    expect(payload["video_url"]).toBeNull();
    expect(String(payload["next_action"])).toContain(QUEUED_RUN.run_id);
  });
});
