import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipwrightClient } from "@clipwright/sdk";
import { listTools } from "./remote.js";
import { registerFilmDraftTools } from "./film-tools.js";

// #1421: through MCP every repeat of a paid film tool was attempt 1, so the API replayed the first run, a failed one too.

const draft = `fdr_${"a".repeat(32)}`;
const CALLS: [string, string, Record<string, unknown>][] = [
  ["make_voice", "film_voice", { text: "Hello there." }],
  ["preview_stills", "film_stills", { draft_id: draft, revision: 1, voice_run_id: "run_v1", at: [1] }],
  ["render_film", "film_render", { draft_id: draft, revision: 1, voice_run_id: "run_v1" }],
  ["make_film_hero", "film_hero", { character_details: "A round mint cactus" }],
];

/** The tool as a client calls it, a real SDK client behind it, only fetch faked: what reaches the wire. */
async function wire(name: string, skill: string, args: Record<string, unknown>) {
  const sent: { key: string | null; body: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    sent.push({ key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body) });
    return new Response(JSON.stringify({ run_id: "run_s", skill, state: "failed", credits_reserved: 0, credits_charged: null, warnings: [], error: null,
      created_at: "2026-11-11T12:00:00.000Z", finished_at: "2026-11-11T12:00:01.000Z" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const api = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://api.invalid", clientId: "mcp-test" });
    const server = new McpServer({ name: "film-test", version: "0.0.0" });
    registerFilmDraftTools(server, api, { pollMs: 0, sleep: async () => undefined });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try { await client.callTool({ name, arguments: args }); } finally { await client.close(); }
  } finally { vi.unstubAllGlobals(); }
  expect(sent).toHaveLength(1);
  return sent[0]!;
}

/** The key the SDK sends for this request with no options: what every MCP call sent before #1421, so a run started then still replays. */
async function keyBefore(skill: string, args: Record<string, unknown>) {
  let key: string | null = null;
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    key = new Headers(init?.headers).get("Idempotency-Key");
    return new Response(JSON.stringify({ run_id: "run_s", skill, state: "failed", credits_reserved: 0, credits_charged: null, warnings: [], error: null,
      created_at: "2026-11-11T12:00:00.000Z", finished_at: "2026-11-11T12:00:01.000Z" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const api = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://api.invalid", clientId: "mcp-test" });
    const start = { film_voice: api.makeVoice, film_stills: api.previewStills, film_render: api.renderFilm, film_hero: api.makeFilmHero }[skill]!;
    await start.call(api, args as never);
  } finally { vi.unstubAllGlobals(); }
  return key;
}

describe("the paid film tools take attempt (#1421)", () => {
  /** Codex r1. Mutant: a key with no attempt that differs from the one sent before the release, so a repeat of a run started then pays again. */
  it.each(CALLS)("%s: with no attempt sends the very key it sent before attempt existed", async (name, skill, args) => {
    const before = await keyBefore(skill, args);
    expect(before).toMatch(/:1$/);
    expect((await wire(name, skill, args)).key).toBe(before);
  });

  /** Mutants: drop attempt (every repeat is attempt 1), put it in the body (hash changes, idempotency_key_reused), default it to something but 1. */
  it.each(CALLS)("%s: attempt 2 sends another key, no attempt is attempt 1, the body is the same", async (name, skill, args) => {
    const none = await wire(name, skill, args), one = await wire(name, skill, { ...args, attempt: 1 }), two = await wire(name, skill, { ...args, attempt: 2 });
    expect(none.key).toMatch(/:1$/);
    expect(one.key).toBe(none.key);
    expect(two.key).toMatch(/:2$/);
    expect(two.key).not.toBe(none.key);
    expect(two.body).toBe(none.body);
    expect(one.body).toBe(none.body);
    expect(two.body).not.toContain("attempt");
  });

  it.each(CALLS)("%s: is listed with attempt and says how to repeat a failed run", async (name) => {
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(t => t.name === name)!;
    expect(tool.inputSchema.properties).toHaveProperty("attempt");
    expect(tool.description).toMatch(/attempt 2/);
  });
});
