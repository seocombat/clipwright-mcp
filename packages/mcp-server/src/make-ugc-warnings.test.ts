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
let answer: Record<string, unknown> = QUEUED_RUN;

beforeAll(async () => {
  stub = createHttpServer((req, res) => {
    if (req.url !== "/v1/skills/make_ugc/run") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: `no stub for ${req.url}` } }));
      return;
    }
    res.writeHead(answer === QUEUED_RUN ? 202 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(answer));
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    stub.close((error) => (error ? reject(error) : resolve())),
  );
});

async function callMakeUgc(attempt?: number): Promise<Record<string, unknown>> {
  const sdkClient = new ClipwrightClient({ apiKey: "cw_test", baseUrl });
  const server = createServer(sdkClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  try {
    const result = await mcpClient.callTool({
      name: "make_ugc",
      arguments: { script: "hello from the warnings case", ...attempt ? { attempt } : {} },
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
    expect(payload["repeat"]).toBeUndefined();
  });
});

/** Pilot 6 (#1551): the same body returned the failed run, and nothing said how to start a new one. Mutants: no note, a note on a fresh */
/** start, or the next attempt miscounted. */
describe("make_ugc answered with a failed run", () => {
  it("says the arguments already ran and names the next attempt", async () => {
    answer = { ...QUEUED_RUN, state: "failed", error: "the vendor failed the take", finished_at: new Date().toISOString(), credits_charged: 0 };
    try {
      const first = await callMakeUgc();
      expect(first["status"]).toBe("FAILED");
      expect(first["repeat"]).toBe("These arguments already started this run, and it failed. To make the video again, call make_ugc with the " +
        "same arguments and attempt 2: that starts a new run, charged as its quote says.");
      expect(String(first["display_markdown"])).toContain("attempt 2");
      expect((await callMakeUgc(2))["repeat"]).toContain("attempt 3");
    } finally { answer = QUEUED_RUN; }
  });
});
