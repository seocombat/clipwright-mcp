import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClipwrightClient, resolveClientId } from "@clipwright/sdk";
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServer } from "./server.js";

/** The server must start where `~/.clipwright` is read-only (containers, CI): */
/** tools that need no install identity keep working over a real MCP transport. */

/** HOME where `.clipwright` exists but is not writable. */
let home = "";
let savedHome: string | undefined;
let savedClientId: string | undefined;

let stub: Server;
let baseUrl = "";

const VOICES = [
  {
    name: "george",
    language: "en",
    gender: "male",
    description: "Warm voice",
    model: "eleven_v3",
  },
];
/** A `quote` body matching core's `quoteResponse`; the SDK parses it strictly. */
const QUOTE = {
  skill: "make_ugc",
  credits_estimate: 8,
  duration_estimate_sec: 7.4,
  warnings: [],
  contract_version: "v1",
  source: null,
  actor: { gender: "male" },
  resolved_aspect_ratio: "9:16",
  tts_model: "eleven_v3",
};

/** A run in the tolerant projection, which `get_run` must parse. */
const RUN = {
  run_id: "run_x",
  skill: "make_ugc",
  state: "avatar",
  credits_reserved: 8,
  credits_charged: null,
  warnings: [],
  error: null,
  final_output: null,
  steps: [],
  created_at: "2026-07-29T00:00:00.000Z",
  finished_at: null,
};

beforeAll(async () => {
  stub = createHttpServer((req, res) => {
    // Route by path: otherwise `get_run` would "succeed" by tolerantly parsing
    // a voices body.
    const url = req.url ?? "";
    const body = url.startsWith("/v1/runs/")
      ? RUN
      : url.includes("/quote")
        ? QUOTE
        : { voices: VOICES };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    stub.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  savedHome = process.env.HOME;
  savedClientId = process.env.CLIPWRIGHT_CLIENT_ID;

  home = mkdtempSync(join(tmpdir(), "clipwright-readonly-home-"));
  mkdirSync(join(home, ".clipwright"));
  // 0o500: read and enter, but no new files. The directory EXISTS and is not
  // writable.
  chmodSync(join(home, ".clipwright"), 0o500);

  process.env.HOME = home;
  delete process.env.CLIPWRIGHT_CLIENT_ID;
});

afterEach(() => {
  chmodSync(join(home, ".clipwright"), 0o700);
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  if (savedClientId === undefined) delete process.env.CLIPWRIGHT_CLIENT_ID;
  else process.env.CLIPWRIGHT_CLIENT_ID = savedClientId;
});

async function connected(): Promise<{ client: Client; close: () => Promise<void> }> {
  // The client is built HERE, in the broken environment, as `index.ts` does at
  // import.
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl }));
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

describe("an unwritable ~/.clipwright does not stop the server from starting", () => {
  it("the environment really reproduces the write refusal", () => {
    // Guards against a false green: under root, 0o500 does not block writes.
    expect(
      () => resolveClientId(),
      "environment does not reproduce an unwritable ~/.clipwright (running as root?)",
    ).toThrow(/CLIPWRIGHT_CLIENT_ID/);
  });

  it("tools/list returns the full tool set", async () => {
    const { client, close } = await connected();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "create_actor",
        "delete_actor",
        "get_account",
        "get_actor_defaults",
        "get_run",
        "list_actors",
        "list_voices",
        "make_ugc",
        "quote_actor",
        "quote_ugc",
        "set_actor_defaults",
        "upload_image",
      ]);
    } finally {
      await close();
    }
  });

  it("three of four tools work: they need no identity", async () => {
    // All three, `get_run` included: SKILL.md promises exactly these.
    const { client, close } = await connected();
    try {
      const voices = await client.callTool({ name: "list_voices", arguments: {} });
      expect(voices.isError ?? false).toBe(false);

      const quote = await client.callTool({
        name: "quote_ugc",
        arguments: { script: "hello there" },
      });
      expect(quote.isError ?? false).toBe(false);

      const run = await client.callTool({ name: "get_run", arguments: { run_id: "run_x" } });
      expect(run.isError ?? false).toBe(false);
      // The run stage arrived, so the tool really parsed the response.
      expect(JSON.stringify(run.content)).toContain("avatar");
    } finally {
      await close();
    }
  });

  it("make_ugc refuses clearly and does NOT crash the server", async () => {
    const { client, close } = await connected();
    try {
      const started = await client.callTool({
        name: "make_ugc",
        arguments: { script: "hello there" },
      });
      // The refusal names the variable that fixes it.
      expect(JSON.stringify(started.content)).toContain("CLIPWRIGHT_CLIENT_ID");

      // The server survives the refusal. Mutant "resolve identity in the
      // constructor" fails every check in this file.
      const voices = await client.callTool({ name: "list_voices", arguments: {} });
      expect(voices.isError ?? false).toBe(false);
      expect(JSON.stringify(voices.content)).toContain("george");
    } finally {
      await close();
    }
  });
});
