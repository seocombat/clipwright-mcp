import { afterEach, expect, it, vi } from "vitest";
import { ClipwrightClient } from "./index.js";

afterEach(() => vi.unstubAllGlobals());
it("loads the actor catalog from the authenticated API and preserves preview expiry", async () => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("https://api.example/v1/actors");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer cw_test");
    return new Response(JSON.stringify({ actors: [{ actor_id: "actor_anna", name: "Anna",
      description: "Fictional adult woman", gender: "female", approximate_age: 27, version: 1,
      variants: [{ aspect_ratio: "9:16", width: 941, height: 1672,
        preview_url: "https://assets.example/anna", preview_expires_at: "2026-09-09T18:00:00Z" }],
    }] }), { headers: { "Content-Type": "application/json" } });
  });
  const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "https://api.example" });
  const actors = await client.listActors();
  expect(actors[0]?.variants[0]?.preview_expires_at).toBe("2026-09-09T18:00:00Z");
});

it("rejects a malformed catalog instead of offering a broken actor", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ actors: [{ actor_id: "actor_anna" }] }),
    { headers: { "Content-Type": "application/json" } }));
  const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "https://api.example" });
  await expect(client.listActors()).rejects.toThrow();
});

const ACTOR = {
  name: "Studio Demo",
  description: "A fictional adult woman in a bright kitchen",
  gender: "female",
  approximate_age: 32,
} as const;

const QUOTE = {
  skill: "create_actor",
  credits_estimate: 30,
  pricing_snapshot: {
    quality: "medium",
    unit_credits: { portrait: 10, variant: 10 },
    requested_aspects: ["9:16", "1:1", "16:9"],
  },
  warnings: [],
  contract_version: "2026-09-14",
};

const QUEUED = {
  run_id: "run_1", skill: "create_actor", state: "queued", credits_reserved: 30,
  credits_charged: null, warnings: [], error: null, final_output: null, steps: [],
  created_at: "2026-09-16T00:00:00Z", finished_at: null,
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const client = (): ClipwrightClient =>
  new ClipwrightClient({ apiKey: "cw_test", baseUrl: "https://api.example" });

/** Mutant: quote via GET. The stub ignores the method, but a real GET carries */
/** no body, so no price would come back. */
it("quotes a personal actor on the free path, by POST, with the actor as the body", async () => {
  const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
    return json(QUOTE);
  });
  expect(await client().quoteActor(ACTOR)).toMatchObject({ credits_estimate: 30 });
  expect(calls).toEqual([
    { url: "https://api.example/v1/skills/create_actor/quote", method: "POST", body: ACTOR },
  ]);
});

it("starts a paid actor run and sends the body as written", async () => {
  const calls: Array<{ url: string; body: unknown; key: string | null }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("Idempotency-Key") });
    return json(QUEUED);
  });
  expect(await client().createActor(ACTOR)).toMatchObject({ run_id: "run_1", state: "queued" });
  expect(calls[0]?.url).toBe("https://api.example/v1/skills/create_actor/run");
  expect(calls[0]?.body).toEqual(ACTOR);
  expect(calls[0]?.key).toMatch(/^[a-f0-9]{64}:1$/);
});

/** Mutant: key built with the `make_ugc` parser strips actor fields, so two */
/** DIFFERENT descriptions share a key and the second returns the first run. */
it("two different actors get two different idempotency keys, the same actor one key", async () => {
  const keys: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    keys.push(String(new Headers(init.headers).get("Idempotency-Key")));
    return json(QUEUED);
  });
  const sdk = client();
  await sdk.createActor(ACTOR);
  await sdk.createActor({ ...ACTOR, description: "A fictional adult man in a workshop", gender: "male" });
  await sdk.createActor(ACTOR);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys[2]).toBe(keys[0]);
});

/** Mutant: ignore `attempt` (suffix always `:1`), so the second attempt returns */
/** the first run and a SECOND actor from the same description is impossible. */
it("attempt reaches the key and NOTHING else: the body stays the actor", async () => {
  const keys: string[] = [];
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    keys.push(String(new Headers(init.headers).get("Idempotency-Key")));
    bodies.push(JSON.parse(String(init.body)));
    return json(QUEUED);
  });
  const sdk = client();
  await sdk.createActor(ACTOR);
  await sdk.createActor(ACTOR, { attempt: 2 });
  expect(keys[0]).toMatch(/:1$/);
  expect(keys[1]).toMatch(/:2$/);
  expect(keys[0]).not.toBe(keys[1]);
  // Mutant: put `attempt` in the body; the server schema strips it silently and
  // the agent gets the first attempt's run while paying for the second.
  expect(bodies).toEqual([ACTOR, ACTOR]);
});

/** Mutant: parse the 204 body as JSON, and deletion fails as a contract violation. */
it("deletes a personal actor by id and accepts the empty 204 body", async () => {
  const calls: Array<{ url: string; method: string | undefined }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method });
    return new Response(null, { status: 204 });
  });
  await expect(client().deleteActor("actor_u_1 2")).resolves.toBeUndefined();
  expect(calls).toEqual([{ url: "https://api.example/v1/actors/actor_u_1%202", method: "DELETE" }]);
});

it("surfaces an actor still in use as an API error, not as a success", async () => {
  vi.stubGlobal("fetch", async () =>
    json({ error: { code: "actor_in_use", message: "actor is used by a run" } }, 409));
  await expect(client().deleteActor("actor_u_1")).rejects.toMatchObject({ code: "actor_in_use" });
});
