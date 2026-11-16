import { maxCreditsExceededBody } from "@clipwright/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/** `--max-credits` on every paid command reaches the request body as `max_credits` (#942); a bad value never leaves the machine. */

const ceilingRefusal = () => new Response(JSON.stringify(maxCreditsExceededBody({ holdCredits: 9, maxCredits: 7 })),
  { status: 402, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CLIPWRIGHT_API_KEY", "cw_test");
  vi.stubEnv("CLIPWRIGHT_API_URL", "https://api.example");
  vi.stubEnv("CLIPWRIGHT_CLIENT_ID", "cli000000000000000000000000test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const PAID: Array<[string, string[]]> = [
  ["make", ["make", "--script", "Hello"]],
  ["make-faceless", ["make-faceless", "--brief", "Tides", "--duration", "30"]],
  ["create-actor", ["create-actor", "--name", "Ann", "--description", "a fictional adult", "--gender", "female", "--age", "30"]],
  ["revise", ["revise", "run_edit7", "--shot", "beat-2", "--retake"]],
];

it.each(PAID)("%s sends --max-credits as max_credits", async (_name, args) => {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return ceilingRefusal(); });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", ...args, "--max-credits", "7"]).catch(() => undefined);
  expect(bodies.at(-1)).toMatchObject({ max_credits: 7 });
});

/** Mutant: test the ceiling for truthiness, and a ceiling of 0 is dropped from the paid request. */
it.each(PAID)("%s sends --max-credits 0 as max_credits 0", async (_name, args) => {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return ceilingRefusal(); });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", ...args, "--max-credits", "0"]).catch(() => undefined);
  expect(bodies.at(-1)).toMatchObject({ max_credits: 0 });
});

it("candidate sends --max-credits on the start, after its free quote", async () => {
  const bodies: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    bodies.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return String(url).endsWith("/quote") ? new Response(JSON.stringify({ source_run_id: "run_edit7", root_run_id: "run_edit7", shot_id: "beat-2",
      kind: "picture", operation_mode: "retake", unit: "picture", credits: 9, usable_until: "2099-01-01T00:00:00.000Z", warnings: [],
      contract_version: "x" }), { status: 200, headers: { "Content-Type": "application/json" } }) : ceilingRefusal();
  });
  const { program } = await import("./index.js");
  await program.parseAsync(["node", "clipwright", "candidate", "run_edit7", "--shot", "beat-2", "--retake", "--yes", "--max-credits", "7"])
    .catch(() => undefined);
  expect(bodies.map(({ url, body }) => [url.endsWith("/quote"), (body as { max_credits?: number }).max_credits]))
    .toEqual([[true, undefined], [false, 7]]);
});

it.each(["-1", "1.5", "seven"])("refuses --max-credits %s before any request", async (value) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { program } = await import("./index.js");
  await expect(program.parseAsync(["node", "clipwright", "make", "--script", "Hello", "--max-credits", value])).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
