import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CLIPWRIGHT_API_KEY", "cw_test");
  vi.stubEnv("CLIPWRIGHT_API_URL", "https://api.example");
  vi.stubEnv("CLIPWRIGHT_CLIENT_ID", "cli000000000000000000000000test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["quote", "make"])("%s forwards the selected actor to the API", async (command) => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    // Stop at admission, before polling. The rejection must reach the caller too.
    return new Response(JSON.stringify({ error: { code: "actor_unavailable", message: "actor unavailable" } }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  });
  const { program } = await import("./index.js");
  await expect(program.parseAsync(["node", "clipwright", command, "--script", "Hello", "--actor-id", "actor_anna"]))
    .rejects.toMatchObject({ code: "actor_unavailable" });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe(`https://api.example/v1/skills/make_ugc/${command === "make" ? "run" : "quote"}`);
  expect(calls[0]?.body).toMatchObject({ actor_id: "actor_anna", script: "Hello" });
  expect(calls[0]?.body).not.toHaveProperty("image");
});

it("rejects conflicting actor and local image before reading or uploading the file", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { program } = await import("./index.js");
  for (const command of program.commands) command.exitOverride().configureOutput({ writeErr: () => {} });
  await expect(program.parseAsync(["node", "clipwright", "make", "--script", "Hello", "--actor-id", "actor_anna", "--image-file", "/missing/portrait.png"]))
    .rejects.toMatchObject({ code: "commander.conflictingOption" });
  expect(fetch).not.toHaveBeenCalled();
});

it("actors prints the server catalog", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: unknown) => {
    expect(String(url)).toBe("https://api.example/v1/actors");
    return new Response(JSON.stringify({ actors: [] }), { headers: { "Content-Type": "application/json" } });
  });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", "actors"]);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({ actors: [] });
});

const ACTOR_ARGV = [
  "--name", "Studio Demo",
  "--description", "A fictional adult woman in a bright kitchen",
  "--gender", "female",
  "--age", "32",
];

const QUOTE_BODY = {
  skill: "create_actor", credits_estimate: 30,
  pricing_snapshot: { quality: "medium", unit_credits: { portrait: 10, variant: 10 }, requested_aspects: ["9:16"] },
  warnings: [], contract_version: "2026-09-14",
};

/** Mutant: send the quote to the paid path (or the reverse) and this fails. */
it.each([
  ["quote-actor", "quote", QUOTE_BODY],
  ["create-actor", "run", { run_id: "run_1", skill: "create_actor", state: "queued", credits_reserved: 30,
    credits_charged: null, warnings: [], error: null, final_output: null, steps: [],
    created_at: "2026-09-16T00:00:00Z", finished_at: null }],
] as const)("%s sends the described actor to the %s endpoint", async (command, leaf, reply) => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { headers: { "Content-Type": "application/json" } });
  });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", command, ...ACTOR_ARGV]);
  expect(calls[0]?.url).toBe(`https://api.example/v1/skills/create_actor/${leaf}`);
  expect(calls[0]?.body).toEqual({
    name: "Studio Demo",
    description: "A fictional adult woman in a bright kitchen",
    gender: "female",
    approximate_age: 32,
  });
});

/** Mutant: skip parsing `--aspects` (or leave the age a string) and this fails. */
it("create-actor passes the chosen formats and quality, age as a number", async () => {
  const calls: Array<Record<string, unknown>> = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(QUOTE_BODY), { headers: { "Content-Type": "application/json" } });
  });
  const { program } = await import("./index.js");
  await program.parseAsync([
    "node", "clipwright", "quote-actor", ...ACTOR_ARGV, "--quality", "high", "--aspects", "9:16, 1:1",
  ]);
  expect(calls[0]).toMatchObject({ approximate_age: 32, quality: "high", aspect_ratios: ["9:16", "1:1"] });
});

/** Mutant: drop `.choices(...)` on `--gender` or `--quality`, and garbage reaches */
/** the API, wasting a request before the schema refuses it. */
it.each([
  ["--gender", "banana"],
  ["--quality", "ultra"],
])("quote-actor rejects an invalid %s BEFORE the request", async (flag, value) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { program } = await import("./index.js");
  for (const command of program.commands) command.exitOverride().configureOutput({ writeErr: () => {} });
  await expect(
    program.parseAsync(["node", "clipwright", "quote-actor", ...ACTOR_ARGV, flag, value]),
  ).rejects.toMatchObject({ code: expect.stringContaining("commander.") });
  expect(fetch, `${flag} ${value} reached the API`).not.toHaveBeenCalled();
});

it("delete-actor asks the API to delete that id and says so", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const calls: Array<{ url: string; method: string | undefined }> = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), method: init.method });
    return new Response(null, { status: 204 });
  });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", "delete-actor", "actor_u_1"]);
  expect(calls).toEqual([{ url: "https://api.example/v1/actors/actor_u_1", method: "DELETE" }]);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({ deleted: "actor_u_1" });
});

/** Mutant: swallow the refusal and print "deleted", and this fails. */
it("delete-actor of an actor still in use fails instead of reporting success", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ error: { code: "actor_in_use", message: "used by a run" } }),
      { status: 409, headers: { "Content-Type": "application/json" } }));
  const { program } = await import("./index.js");
  await expect(program.parseAsync(["node", "clipwright", "delete-actor", "actor_u_1"]))
    .rejects.toMatchObject({ code: "actor_in_use" });
  expect(output).not.toHaveBeenCalled();
});
