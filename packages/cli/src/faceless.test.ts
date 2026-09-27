import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CLIPWRIGHT_API_KEY", "cw_test");
  vi.stubEnv("CLIPWRIGHT_API_URL", "https://api.example");
  vi.stubEnv("CLIPWRIGHT_CLIENT_ID", "cli000000000000000000000000test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Mutant: drop a `.conflicts` entry, and one narration source silently wins over another. */
const sources: Array<[string, string]> = [["--script", "Hi"], ["--script-file", "/nonexistent/narration.txt"], ["--brief", "Tides"]];
const pairs = sources.flatMap((a, i) => sources.slice(i + 1).map(b => [a, b] as const));
it.each(["quote-faceless", "make-faceless"].flatMap(command => pairs.map(([a, b]) => [command, a[0], b[0], a[1], b[1]])))(
  "%s refuses %s with %s before any request", async (command, first, second, one, two) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { program } = await import("./index.js");
    for (const each of program.commands) each.exitOverride().configureOutput({ writeErr: () => {} });
    await expect(program.parseAsync(["node", "clipwright", command, first, one, second, two, "--duration", "30"]))
      .rejects.toMatchObject({ code: "commander.conflictingOption" });
    expect(fetch).not.toHaveBeenCalled();
  });

it.each([
  ["--duration", "29"],
  ["--duration", "30.001"],
  ["--duration", "thirty"],
])("make-faceless refuses %s %s locally, before the paid path", async (flag, value) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { program } = await import("./index.js");
  await expect(program.parseAsync(["node", "clipwright", "make-faceless", "--brief", "Tides", flag, value]))
    .rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("make-faceless --retry reaches the idempotency key, not the body", async () => {
  const seen: Array<{ key: string | null; body: unknown }> = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    seen.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ error: { code: "insufficient_credits", message: "no credits" } }),
      { status: 402, headers: { "Content-Type": "application/json" } });
  });
  const { program } = await import("./index.js");
  await expect(program.parseAsync(["node", "clipwright", "make-faceless", "--brief", "Tides", "--duration", "30", "--retry", "2"]))
    .rejects.toThrow();
  expect(seen[0]?.key).toMatch(/:2$/);
  expect(seen[0]?.body).toEqual({ input_mode: "brief", brief: "Tides", duration_seconds: 30, captions: true });
});
