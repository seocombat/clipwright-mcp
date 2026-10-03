import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  debtOutstandingBody,
  insufficientCreditsBody,
  RATE_LIMIT_FREE_PER_MINUTE,
  PUBLIC_API_BASE_URL,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitedBody,
  RETRY_AFTER_HEADER,
} from "@clipwright/core";
import { idempotencyKeyFor } from "@clipwright/core/idempotency";

import {
  ClipwrightApiError,
  ClipwrightClient,
  ClipwrightResponseError,
  resolveClientId,
} from "./index.js";

// An uncreatable HOME: mkdir under `/` hits EACCES, emulating a read-only
// HOME on a foreign host.
const READONLY_HOME = "/nonexistent-readonly-clipwright-xyz";

let savedHome: string | undefined;
let savedClientId: string | undefined;
let savedFetch: typeof fetch;

beforeEach(() => {
  savedHome = process.env.HOME;
  savedClientId = process.env.CLIPWRIGHT_CLIENT_ID;
  savedFetch = globalThis.fetch;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  if (savedClientId === undefined) delete process.env.CLIPWRIGHT_CLIENT_ID;
  else process.env.CLIPWRIGHT_CLIENT_ID = savedClientId;
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

/** A run body valid for core's `run.parse()`. */
function runBody(state: string, runId = "run_test1"): unknown {
  return {
    run_id: runId,
    skill: "make_ugc",
    state,
    credits_reserved: 8,
    credits_charged: null,
    warnings: [],
    error: null,
    final_output: null,
    steps: [],
    created_at: new Date().toISOString(),
    finished_at: null,
  };
}

/** Watchdog verdict: the call never settled. */
const HUNG = "HUNG";

/** The call's outcome OR the "hung" verdict; without it a hung `makeUgc` would */
/** fail as a bare vitest timeout. */
async function settledWithin<T>(promise: Promise<T>, ms = 4_000): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(HUNG), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      ),
      watchdog,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A fake `Response` with `text()` and headers, the two things the SDK reads; */
/** a fake differing exactly there would pass code that fails in production. */
function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
    headers: new Headers(headers),
  } as Response;
}

function jsonResponse(body: unknown): Response {
  return response(200, body);
}

describe("resolveClientId (A5)", () => {
  it("env CLIPWRIGHT_CLIENT_ID wins and does NOT write the file", () => {
    process.env.HOME = READONLY_HOME; // the file cannot be created, and must not be
    process.env.CLIPWRIGHT_CLIENT_ID = "  explicit-install-id  ";
    // Trimmed env comes back; no throw proves the filesystem was untouched.
    expect(resolveClientId()).toBe("explicit-install-id");
  });

  it("no env → the id is born in ~/.clipwright/client-id and the same one is returned again", async () => {
    // The one-line quickstart install relies on this: no variable needed.
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const home = mkdtempSync(join(tmpdir(), "cw-client-id-"));
    process.env.HOME = home;
    delete process.env.CLIPWRIGHT_CLIENT_ID;

    const first = resolveClientId();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(readFileSync(join(home, ".clipwright", "client-id"), "utf8")).toBe(first);
    expect(resolveClientId()).toBe(first);
  });

  it("read-only HOME without env → throws asking for CLIPWRIGHT_CLIENT_ID", () => {
    process.env.HOME = READONLY_HOME;
    delete process.env.CLIPWRIGHT_CLIENT_ID;
    expect(() => resolveClientId()).toThrow(/CLIPWRIGHT_CLIENT_ID/);
  });
});

describe("ClipwrightClient — lazy client id resolution", () => {
  it("constructor does NOT throw on read-only HOME; only startUgc does", async () => {
    process.env.HOME = READONLY_HOME;
    delete process.env.CLIPWRIGHT_CLIENT_ID;

    // Construction must not fail: MCP builds the client eagerly, and a throw
    // would kill the whole server (quote_ugc included) before tools/list.
    const client = new ClipwrightClient({ apiKey: "cw_test" });

    // The resolver runs lazily, on the first run start.
    await expect(client.startUgc({ script: "hello" })).rejects.toThrow(/CLIPWRIGHT_CLIENT_ID/);
  });
});

describe("ClipwrightClient.makeUgc — attempt suffix", () => {
  it("makeUgc({attempt:2}) sends Idempotency-Key = <hash>:2", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    let capturedKey: string | undefined;

    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers["Idempotency-Key"]) capturedKey = headers["Idempotency-Key"];
      return jsonResponse(runBody("succeeded"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const input = { script: "hello" };
    await client.makeUgc(input, { attempt: 2 });

    // attempt flows makeUgc → startUgc → suffix :2 (otherwise CLI --retry is dead).
    expect(capturedKey).toBe(`${idempotencyKeyFor(input, "unit-client")}:2`);
  });
});

describe("ClipwrightClient.startUgc — the server judges an unknown voice name", () => {
  it("a non-preset name goes in the request body instead of failing key computation", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const bodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return jsonResponse(runBody("queued"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await client.startUgc({ script: "Hola desde Clipwright.", voice: "es_female_lucia" });

    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ voice: "es_female_lucia" });
  });
});

describe("ClipwrightClient.getRun — tolerates new run stages", () => {
  it.each([undefined, { status: "unavailable", reason: "missing_timings" }])("preserves optional timing-gap output: %j", async (metric) => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    globalThis.fetch = vi.fn(async () => jsonResponse({
      ...(runBody("succeeded") as object),
      final_output: { video_url: "https://example.com/final.mp4", duration_seconds: 5,
        ai_generated: true, ai_disclosure: "AI-generated", speech_timing_gaps: metric },
    })) as unknown as typeof fetch;
    const out = await new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" }).getRun("run_test1");
    expect(out.final_output?.speech_timing_gaps).toEqual(metric);
  });
  it('a stage outside RUN_STATES ("publishing") → returns the object, does NOT throw', async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(runBody("publishing", "run_pub")),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    // Strict run.parse would reject "publishing"; runRead.safeParse does not.
    const out = await client.getRun("run_pub");
    expect(out.state).toBe("publishing");
    expect(out.run_id).toBe("run_pub");
  });
});

describe("ClipwrightClient.startUgc — strict write parsing", () => {
  it("garbage response body → startUgc throws (the server never sends garbage)", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ nonsense: true }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    // Writes stay strict (run.parse), unlike the tolerant getRun.
    await expect(client.startUgc({ script: "hello" })).rejects.toThrow();
  });

  it("a broken RESPONSE differs from rejected INPUT and warns about money", async () => {
    // After `POST /run` the run may exist and be charged; calling it rejected
    // input would hide that.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ nonsense: true }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const started = (await client
      .startUgc({ script: "hello" })
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;

    expect(started).toBeInstanceOf(ClipwrightResponseError);
    expect(started.mayHaveTakenEffect).toBe(true);
    expect(started.message).toMatch(/may have been created and charged/);
    // No culprit is named: a gateway may have sent the off-contract response.
    expect(started.message).not.toMatch(/Clipwright API answered|failed on its side/i);
    // The cause is kept for diagnostics.
    expect((started as Error & { cause?: unknown }).cause).toBeDefined();

    // `quote` has no side effects, and the message must say so.
    const quoted = (await client
      .quoteUgc({ script: "hello" })
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;
    expect(quoted).toBeInstanceOf(ClipwrightResponseError);
    expect(quoted.mayHaveTakenEffect).toBe(false);
    expect(quoted.message).toMatch(/retrying is safe/);
  });

  it("rejected INPUT stays a ZodError and never reaches the network", async () => {
    // The other half of the split: input failing the schema stays an input error.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return jsonResponse(runBody("queued"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client
      .startUgc({ script: "" })
      .catch((caught: unknown) => caught)) as Error;

    expect(error).not.toBeInstanceOf(ClipwrightResponseError);
    expect(error.name).toBe("ZodError");
    expect(calls).toBe(0);
  });
});

describe("ClipwrightClient.makeUgc — unknown terminal state", () => {
  it('unknown terminal "canceled" → NOT treated as terminal → timeout with run_id', async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";

    // Start returns a valid queued run; polling returns the unknown "canceled".
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const isPoll = String(url).includes("/v1/runs/");
      return jsonResponse(runBody(isPoll ? "canceled" : "queued", "run_canceled"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const started = Date.now();
    // Not in TERMINAL_STATES, so polling runs to maxWaitMs and ends in a clean
    // timeout with run_id (no endless loop, no parse error).
    await expect(
      client.makeUgc({ script: "hello" }, { maxWaitMs: 50 }),
    ).rejects.toThrow(/run_canceled/);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("ClipwrightClient.getAccount", () => {
  it("GET /v1/account → account body parsed by the schema", async () => {
    const body = {
      account_id: "acc_1",
      balance_credits: 900,
      debt_credits: 45,
      holds_credits: 30,
      grants: [],
    };
    let requestedPath: string | undefined;
    let requestedMethod: string | undefined;
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      requestedPath = String(url);
      requestedMethod = init?.method ?? "GET";
      return jsonResponse(body);
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });

    expect(await client.getAccount()).toEqual(body);
    expect(requestedPath).toBe("http://x/v1/account");
    expect(requestedMethod).toBe("GET");
  });

  it("a wrongly shaped body → ClipwrightResponseError, not a silently accepted object", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ account_id: "acc_1", balance_credits: "900" }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(client.getAccount()).rejects.toBeInstanceOf(ClipwrightResponseError);
  });
});

describe("ClipwrightClient.listVoices", () => {
  it("GET /v1/voices → the preset array from the response body", async () => {
    const voices = [
      {
        name: "owner_ru_clone",
        language: "ru",
        description: "Клон голоса владельца",
        model: "eleven_v3",
      },
      {
        name: "sarah",
        language: "en",
        gender: "female",
        description: "Soft female voice",
        model: "eleven_flash_v2_5",
      },
    ];
    let requestedPath: string | undefined;
    globalThis.fetch = vi.fn(async (url: unknown) => {
      requestedPath = String(url);
      return jsonResponse({ voices });
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const result = await client.listVoices();

    expect(requestedPath).toBe("http://x/v1/voices");
    expect(result).toEqual(voices);
  });

  it("an unknown name, new fields and extra keys do not break the catalog", async () => {
    // Mutant: restore `z.enum(VOICE_PRESET_NAMES)` on `voiceCatalogEntry.name` and this fails.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        voices: [
          { name: "george", language: "en", gender: "male", description: "Warm storyteller", model: "eleven_v3" },
          {
            name: "es_female_lucia",
            kind: "catalog",
            language: "es",
            locale: "es-MX",
            accent: "mexican",
            gender: "neutral",
            age: "middle_aged",
            use_case: "social_media",
            description: "Bright Spanish voice",
            model: "eleven_v3",
            supported_models: ["eleven_v3", "eleven_flash_v2_5"],
            verified_models: ["eleven_flash_v2_5"],
            preview_url: "https://samples.example/es_female_lucia.mp3",
            preview_expires_at: "2026-09-13T12:00:00Z",
            rank: 3,
          },
          { name: "de_x_future", kind: "not_invented_yet", language: "de", description: "d", model: "eleven_v3" },
        ],
        models: [{ id: "eleven_v3", char_limit: 5000, languages: ["en", "es", "de"] }],
        next_cursor: null,
      }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const voices = await client.listVoices();

    expect(voices.map((voice) => voice.name)).toEqual(["george", "es_female_lucia", "de_x_future"]);
    expect(voices[1]).toMatchObject({
      kind: "catalog",
      locale: "es-MX",
      gender: "neutral",
      verified_models: ["eleven_flash_v2_5"],
    });
    expect(voices[2]?.kind).toBe("not_invented_yet");
  });

  it("a speech model this client does not know breaks neither the catalog nor the quote", async () => {
    // Mutant: restore `z.enum(TTS_MODELS)` on `voiceCatalogEntry.model` or `quoteResponse.tts_model`.
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        voices: [{ name: "owner_ru_clone", kind: "preset", language: "ru", description: "d", model: "eleven_v9_future" }],
        models: [{ id: "eleven_v9_future", char_limit: 5000, languages: ["ru"] }],
      }),
    ) as unknown as typeof fetch;
    expect((await client.listVoices())[0]?.model).toBe("eleven_v9_future");

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        skill: "make_ugc",
        credits_estimate: 8,
        duration_estimate_sec: 7.4,
        warnings: [],
        contract_version: "v1",
        source: null,
        actor: { gender: "male" },
        resolved_aspect_ratio: "9:16",
        tts_model: "eleven_v9_future",
      }),
    ) as unknown as typeof fetch;
    expect((await client.quoteUgc({ script: "привет" })).tts_model).toBe("eleven_v9_future");
  });

  it("filters go in the query string; an unset one is omitted", async () => {
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      requested.push(String(url));
      return jsonResponse({
        voices: [
          {
            name: "es_female_lucia",
            kind: "catalog",
            language: "es",
            gender: "female",
            age: "young",
            use_case: "social_media",
            description: "Bright Spanish voice",
            model: "eleven_v3",
            supported_models: ["eleven_v3"],
            verified_models: ["eleven_flash_v2_5"],
          },
        ],
        models: [{ id: "eleven_v3", char_limit: 5000, languages: ["es"] }],
      });
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const voices = await client.listVoices({
      language: "es",
      gender: "female",
      age: "young",
      use_case: "social_media",
      model: "eleven_v3",
    });
    await client.listVoices({ language: undefined, gender: "male" });

    expect(requested).toEqual([
      "http://x/v1/voices?language=es&gender=female&age=young&use_case=social_media&model=eleven_v3",
      "http://x/v1/voices?gender=male",
    ]);
    expect(voices).toMatchObject([{ name: "es_female_lucia", kind: "catalog", age: "young" }]);
  });

  it("the body is parsed by the `voicesResponse` SCHEMA, not an `Array.isArray` check", async () => {
    // `Array.isArray` let an array of strings through; the caller then failed
    // on `.map`, far from the cause.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ voices: ["george", "sarah"] }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(client.listVoices()).rejects.toBeInstanceOf(ClipwrightResponseError);
  });

  it("an entry without a name is rejected too: the name selects the preset", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ voices: [{ language: "en", description: "d" }] }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(client.listVoices()).rejects.toBeInstanceOf(ClipwrightResponseError);
  });

  it("a catalog parse failure is NOT reported as costly: the `GET` changed nothing", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ voices: "nope" }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client.listVoices().catch((caught: unknown) => caught)) as {
      mayHaveTakenEffect: boolean;
    };
    expect(error.mayHaveTakenEffect).toBe(false);
  });
});

/** Bodies built by the server's own functions: a literal would stay green */
/** after the server shape changed. */
const RATE_LIMITED = rateLimitedBody({
  limit: RATE_LIMIT_FREE_PER_MINUTE,
  windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  retryAfterSeconds: 2,
  scope: "free",
});
const INSUFFICIENT = insufficientCreditsBody({ balanceCredits: 3, requiredCredits: 8 });
const DEBT = debtOutstandingBody({ debtCredits: 120 });

describe("ClipwrightClient — typed refusal", () => {
  it("429 carries status, code and Retry-After, not just text", async () => {
    globalThis.fetch = vi.fn(async () =>
      response(429, RATE_LIMITED, { [RETRY_AFTER_HEADER]: "2" }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = await client.listVoices().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ClipwrightApiError);
    const api = error as ClipwrightApiError;
    expect(api.status).toBe(429);
    expect(api.code).toBe("rate_limited");
    expect(api.retryAfterSeconds).toBe(2);
    expect(api.retryable).toBe(true);
    expect(api.message).toBe(RATE_LIMITED.error.message);
  });

  it("429 with an HTML body gives a meaningful message, not a parser error", async () => {
    // Mutant "unconditional res.json()" fails here: SyntaxError would fire
    // before anyone looked at the status.
    globalThis.fetch = vi.fn(async () =>
      response(429, "<html><body>error code: 1015</body></html>", {
        [RETRY_AFTER_HEADER]: "3",
      }),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client.listVoices().catch((caught: unknown) => caught)) as Error;

    expect(error).toBeInstanceOf(ClipwrightApiError);
    expect(error.message).not.toMatch(/JSON|token/i);
    expect(error.message).toContain("429");
    expect((error as ClipwrightApiError).retryAfterSeconds).toBe(3);
  });

  it("both 402s are terminal and carry numbers", async () => {
    for (const [body, expected] of [
      [INSUFFICIENT, { code: "insufficient_credits", balance_credits: 3, required_credits: 8 }],
      [DEBT, { code: "debt_outstanding", debt_credits: 120 }],
    ] as const) {
      globalThis.fetch = vi.fn(async () => response(402, body)) as unknown as typeof fetch;
      const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
      const error = (await client
        .quoteUgc({ script: "hi" })
        .catch((caught: unknown) => caught)) as ClipwrightApiError;

      expect(error).toBeInstanceOf(ClipwrightApiError);
      expect(error.status).toBe(402);
      expect(error.retryable).toBe(false);
      expect(error.report()).toMatchObject({ status: "FAILED", retryable: false, ...expected });
    }
  });

  it("a successful non-JSON response names the path instead of throwing SyntaxError", async () => {
    globalThis.fetch = vi.fn(async () =>
      response(200, "<html>login</html>"),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(client.listVoices()).rejects.toThrow(/\/v1\/voices/);
  });

  it("a non-JSON body on RUN START warns about money, like a schema failure", async () => {
    // Otherwise the next `--retry 2` would pay for a second render.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    globalThis.fetch = vi.fn(async () =>
      response(202, "<html>gateway</html>"),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client
      .startUgc({ script: "hello" })
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;

    expect(error).toBeInstanceOf(ClipwrightResponseError);
    expect(error.mayHaveTakenEffect).toBe(true);
    expect(error.message).toMatch(/may have been created and charged/);
    expect((error as Error & { cause?: unknown }).cause).toBeDefined();
  });

  it("a failure AFTER sending the start also warns about money", async () => {
    // The server may already have created a paid run.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });

    // (a) the body broke mid-read: a response arrived, delivery is certain.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      headers: new Headers(),
      text: async () => {
        throw new TypeError("terminated");
      },
    })) as unknown as typeof fetch;
    const onBody = (await client
      .startUgc({ script: "hello" })
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;
    expect(onBody).toBeInstanceOf(ClipwrightResponseError);
    expect(onBody.mayHaveTakenEffect).toBe(true);
    expect(onBody.deliveryConfirmed).toBe(true);
    expect(onBody.message).toMatch(/may have been created and charged/);

    // (b) the request itself failed: delivery is UNKNOWN and the message says so.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const onSend = (await client
      .startUgc({ script: "hello" })
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;
    expect(onSend).toBeInstanceOf(ClipwrightResponseError);
    expect(onSend.deliveryConfirmed).toBe(false);
    expect(onSend.message).toMatch(/unknown whether it was/);

    // (c) on a free path the network error stays itself: its message is more
    // useful than our wrapper.
    const onFree = (await client.listVoices().catch((caught: unknown) => caught)) as Error;
    expect(onFree).not.toBeInstanceOf(ClipwrightResponseError);
    expect(onFree.message).toContain("fetch failed");
  });

  it("a broken body on 429 does NOT erase the status: the refusal stays retryable", async () => {
    // Otherwise `makeUgc` would abandon a paid run instead of waiting.
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ [RETRY_AFTER_HEADER]: "2" }),
      text: async () => {
        throw new TypeError("terminated");
      },
    })) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client
      .listVoices()
      .catch((caught: unknown) => caught)) as ClipwrightApiError;

    expect(error).toBeInstanceOf(ClipwrightApiError);
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    // The pause survived: it came in a header, not the body.
    expect(error.retryAfterSeconds).toBe(2);
  });

  it("a voice catalog without an array is a contract violation, not a crash on .map", async () => {
    globalThis.fetch = vi.fn(async () => response(200, {})) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const error = (await client
      .listVoices()
      .catch((caught: unknown) => caught)) as ClipwrightResponseError;

    expect(error).toBeInstanceOf(ClipwrightResponseError);
    expect(error.mayHaveTakenEffect).toBe(false);
  });
});

/** Stub: start returns queued, the first `refusals` polls are refused. Each poll's */
/** time is recorded: only the gap between polls proves `Retry-After` was honored. */
function stubPolls(refusals: number, refusal: () => Response): () => number[] {
  const at: number[] = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    if (!String(url).includes("/v1/runs/")) return jsonResponse(runBody("queued", "run_poll"));
    at.push(Date.now());
    return at.length <= refusals ? refusal() : jsonResponse(runBody("succeeded", "run_poll"));
  }) as unknown as typeof fetch;
  return () => at;
}

/** Gaps between consecutive polls. */
const gaps = (at: number[]): number[] => at.slice(1).map((t, i) => t - at[i]!);

describe("ClipwrightClient.makeUgc — poll retry", () => {
  const stub = stubPolls;

  it("429 on a poll does not kill makeUgc, and the pause is not shorter than Retry-After", async () => {
    // Mutant "no retry" fails here. Fake timers measure the pause exactly
    // without waiting seconds per run.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const polls = stub(2, () => response(429, RATE_LIMITED, { [RETRY_AFTER_HEADER]: "2" }));

    vi.useFakeTimers();
    try {
      const client = new ClipwrightClient({
        apiKey: "cw_test",
        baseUrl: "http://x",
        pollIntervalMs: 1,
      });
      const pending = client.makeUgc({ script: "hello" }, { maxWaitMs: 60_000 });
      await vi.advanceTimersByTimeAsync(60_000);

      await expect(pending).resolves.toMatchObject({ state: "succeeded" });
      const at = polls();
      expect(at).toHaveLength(3);

      // EACH gap, not their sum: "retry instantly, then wait four seconds" has
      // the same sum. Mutant "sleep own interval" fails here.
      for (const gap of gaps(at)) {
        expect(gap).toBeGreaterThanOrEqual(2_000);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("5xx on a poll is retried too", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const polls = stub(1, () => response(503, ""));

    const client = new ClipwrightClient({
      apiKey: "cw_test",
      baseUrl: "http://x",
      pollIntervalMs: 1,
    });
    await expect(client.makeUgc({ script: "hello" }, { maxWaitMs: 20_000 })).resolves.toMatchObject(
      { state: "succeeded" },
    );
    expect(polls()).toHaveLength(2);
  });

  it("402 on a poll is NOT retried and propagates at once", async () => {
    // Mutant "retry 402" fails here: the agent would spin until the deadline
    // instead of telling the user to top up.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const polls = stub(99, () => response(402, INSUFFICIENT));

    const client = new ClipwrightClient({
      apiKey: "cw_test",
      baseUrl: "http://x",
      pollIntervalMs: 1,
    });
    const error = (await client
      .makeUgc({ script: "hello" }, { maxWaitMs: 20_000 })
      .catch((caught: unknown) => caught)) as ClipwrightApiError;

    expect(error).toBeInstanceOf(ClipwrightApiError);
    expect(error.status).toBe(402);
    // Exactly one poll: no retry happened.
    expect(polls()).toHaveLength(1);
  });

  it("401 on a poll is terminal too: a retry would get the same answer", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const polls = stub(99, () => response(401, { error: { code: "unauthorized", message: "bad token" } }));

    const client = new ClipwrightClient({
      apiKey: "cw_test",
      baseUrl: "http://x",
      pollIntervalMs: 1,
    });
    await expect(client.makeUgc({ script: "hello" }, { maxWaitMs: 20_000 })).rejects.toThrow(
      /bad token/,
    );
    expect(polls()).toHaveLength(1);
  });

  it("endless 429 stops at maxWaitMs instead of spinning forever", async () => {
    // Mutant "recompute deadline on retry" fails here: a chain of 429s would
    // extend the wait forever.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    stub(Number.MAX_SAFE_INTEGER, () => response(429, RATE_LIMITED, { [RETRY_AFTER_HEADER]: "2" }));

    vi.useFakeTimers();
    try {
      const started = Date.now();
      const client = new ClipwrightClient({
        apiKey: "cw_test",
        baseUrl: "http://x",
        pollIntervalMs: 1,
      });

      // The throw time is taken at the throw and checked tightly against the
      // deadline, so an unclamped two-second sleep fails.
      let failedAt = 0;
      const pending = client.makeUgc({ script: "hello" }, { maxWaitMs: 120 }).catch(
        (caught: unknown) => {
          failedAt = Date.now();
          return caught;
        },
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const error = (await pending) as Error;

      // The timeout names run_id (to fetch the run later) AND the refusal:
      // "slow render" and "polling throttled" are different news.
      expect(error.message).toContain("run_poll");
      expect(error.message).toContain("429");

      // The pause is clamped to the remaining deadline, so the throw lands ON
      // it rather than after the server's two seconds.
      expect(failedAt - started).toBeGreaterThanOrEqual(120);
      expect(failedAt - started).toBeLessThan(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a huge Retry-After does not turn into no pause at all", async () => {
    // `setTimeout` above 2^31−1 ms fires after 0 ms. Mutant "drop the cap in
    // sleep" fails here.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    // The huge value goes in the BODY too: the body outranks the header.
    const THIRTY_DAYS_SECONDS = 30 * 24 * 3600;
    const polls = stub(1, () =>
      response(
        429,
        rateLimitedBody({
          limit: RATE_LIMIT_FREE_PER_MINUTE,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          retryAfterSeconds: THIRTY_DAYS_SECONDS,
          scope: "free",
        }),
        { [RETRY_AFTER_HEADER]: String(THIRTY_DAYS_SECONDS) },
      ),
    );

    vi.useFakeTimers();
    try {
      const client = new ClipwrightClient({
        apiKey: "cw_test",
        baseUrl: "http://x",
        pollIntervalMs: 1,
      });
      // The deadline exceeds the pause, or clamping would hide the overflow.
      const pending = client.makeUgc({ script: "hello" }, { maxWaitMs: 40 * 24 * 3600 * 1000 });

      // Check the boundary: one millisecond before the pause ends, a sleep
      // clamped to the timer cap would already have polled again.
      await vi.advanceTimersByTimeAsync(THIRTY_DAYS_SECONDS * 1000 - 1);
      expect(polls()).toHaveLength(1);

      // Advance the rest; the run completes.
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({ state: "succeeded" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ClipwrightClient — invalid durations are rejected instead of hanging the process", () => {
  // `pollIntervalMs: NaN` (an unset `Number(process.env.POLL_MS)`) used to
  // schedule timers forever and keep Node alive.
  it.each([Number.NaN, 0, -1, Number.POSITIVE_INFINITY])(
    "pollIntervalMs: %p is rejected at construction",
    (bad) => {
      expect(() => new ClipwrightClient({ apiKey: "cw_test", pollIntervalMs: bad })).toThrow(
        /pollIntervalMs/,
      );
    },
  );

  it("maxWaitMs: NaN is rejected before the first request", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return jsonResponse(runBody("queued"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(
      client.makeUgc({ script: "hello" }, { maxWaitMs: Number.NaN }),
    ).rejects.toThrow(/maxWaitMs/);
    // Rejected BEFORE the paid request: a bad setting must not cost money.
    expect(calls).toBe(0);
  });

  it("an invalid attempt is rejected BEFORE the paid request", async () => {
    // `NaN` would become a `:NaN` key suffix and start a SECOND paid render
    // (reachable via `clipwright make --retry banana`).
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return jsonResponse(runBody("succeeded"));
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    for (const bad of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY, 2 ** 53]) {
      await expect(
        client.startUgc({ script: "hello" }, { attempt: bad }),
        `attempt: ${String(bad)}`,
      ).rejects.toThrow(/attempt/);
    }
    // No request went out: an invalid attempt number costs nothing.
    expect(calls).toBe(0);
  });

  it("unset durations take defaults and work", () => {
    // Guards against overcorrection: `undefined` means "not set", not an error.
    expect(() => new ClipwrightClient({ apiKey: "cw_test" })).not.toThrow();
  });

  it("a fractional interval is valid and NOT rounded to zero", async () => {
    // Mutant "Math.trunc in positiveMs" fails here: 0.5 would become a
    // zero pause.
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    const polls = stubPolls(1, () => response(503, ""));

    vi.useFakeTimers();
    try {
      const client = new ClipwrightClient({
        apiKey: "cw_test",
        baseUrl: "http://x",
        pollIntervalMs: 0.5,
      });
      const pending = client.makeUgc({ script: "hello" }, { maxWaitMs: 60_000 });
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toMatchObject({ state: "succeeded" });

      // A pause exists between polls: the given fraction, not zero.
      const at = polls();
      expect(at).toHaveLength(2);
      expect(at[1]! - at[0]!).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ClipwrightClient.uploadImage", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const ok = {
    upload_id: `upl_${"ab".repeat(16)}`,
    url: "https://bucket.acct.r2.cloudflarestorage.com/uploads/acc/x.png?X-Amz-Signature=s",
    media_type: "image/png",
    bytes: 11,
    width: 16,
    height: 9,
    expires_at: "2026-09-07T10:00:00.000Z",
  };

  it("POST /v1/uploads sends raw bytes with the image Content-Type, not JSON", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = vi.fn(async (url: unknown, init: RequestInit) => {
      seen = { url: String(url), init };
      return response(201, ok);
    }) as unknown as typeof fetch;
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const result = await client.uploadImage(PNG, "image/png");
    expect(seen).toBeDefined();
    const { url, init } = seen as { url: string; init: RequestInit };
    expect(url).toBe("http://x/v1/uploads");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(init.body).toBe(PNG);
    expect(result).toEqual(ok);
  });

  it("the body is checked by the uploadResponse schema: an http URL is rejected", async () => {
    globalThis.fetch = vi.fn(async () =>
      response(201, { ...ok, url: "http://x/uploads/a.png" }),
    ) as unknown as typeof fetch;
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    await expect(client.uploadImage(PNG, "image/png")).rejects.toBeInstanceOf(
      ClipwrightResponseError,
    );
  });
});

describe("ClipwrightClient.makeUgc — maxWaitMs deadline", () => {
  it("maxWaitMs:50 against a never-ending avatar → throws with run_id in ≈50 ms, does not hang", async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(runBody("avatar", "run_stuck")),
    ) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://x" });
    const started = Date.now();
    await expect(
      client.makeUgc({ script: "hello" }, { maxWaitMs: 50 }),
    ).rejects.toThrow(/run_stuck/);
    // No hang: the throw arrived promptly, not after a long poll interval.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

/** The default address must match the one the landing page's `curl` example */
/** shows; the landing page's claim registry cites this case by name. */
describe("client base URL matches the product's public address", () => {
  it("a client without an explicit baseUrl calls PUBLIC_API_BASE_URL", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ voices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new ClipwrightClient({ apiKey: "cw_test" });
    await client.listVoices();

    expect(calls[0]).toBeDefined();
    expect(calls[0]!.startsWith(PUBLIC_API_BASE_URL)).toBe(true);
  });
});

/** Cancellation is tested against a real, silent server: a fake `fetch` would */
/** only prove that `signal` was passed, not that the request was cut. */
describe("ClipwrightClient — an expired deadline aborts the request itself", () => {
  let server: Server;
  let baseUrl: string;
  /** Where the server stays silent: on the status poll or already on start. */
  let silentOn: "poll" | "start" = "poll";
  /** Responses cut by the client: proof the request was aborted. */
  let cutByClient = 0;

  beforeEach(async () => {
    process.env.CLIPWRIGHT_CLIENT_ID = "unit-client";
    silentOn = "poll";
    cutByClient = 0;

    server = createServer((req, res) => {
      res.on("close", () => {
        if (!res.writableEnded) cutByClient += 1;
      });
      const isStart = req.method === "POST" && req.url === "/v1/skills/make_ugc/run";
      if (isStart && silentOn === "poll") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(runBody("queued", "run_stuck")));
      }
      // Otherwise no answer at all: the connection hangs open.
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it("makeUgc: a hung POLL is aborted by the deadline with the same timeout text", async () => {
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl, pollIntervalMs: 10 });
    const started = Date.now();

    // The poll leaves at 10 ms and hangs; the deadline fires at 1000 ms, in the
    // MIDDLE of a request rather than between polls.
    const outcome = await settledWithin(client.makeUgc({ script: "hello" }, { maxWaitMs: 1000 }));

    expect(outcome).not.toBe(HUNG);
    const error = (outcome as { error: unknown }).error;
    expect(error).toBeInstanceOf(Error);
    // Same news as a deadline between polls, so the same text: run_id and a
    // hint to poll later.
    expect((error as Error).message).toMatch(/makeUgc timed out after 1000ms/);
    expect((error as Error).message).toMatch(/getRun\("run_stuck"\)/);
    expect(Date.now() - started).toBeLessThan(3000);

    // The request was really cut: the server saw an unfinished response close,
    // which a client that merely stopped waiting would not cause.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cutByClient).toBeGreaterThan(0);
  });

  it("makeUgc: a hung START is aborted by the deadline and says the run may be charged", async () => {
    silentOn = "start";
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl, pollIntervalMs: 10 });

    const outcome = await settledWithin(client.makeUgc({ script: "hello" }, { maxWaitMs: 300 }));

    expect(outcome).not.toBe(HUNG);
    const error = (outcome as { error: unknown }).error;
    // NOT a polling timeout: the request left and the run may be charged;
    // "timed out" would invite a second render.
    expect(error).toBeInstanceOf(ClipwrightResponseError);
    expect((error as ClipwrightResponseError).mayHaveTakenEffect).toBe(true);
    expect((error as ClipwrightResponseError).deliveryConfirmed).toBe(false);
  });

  it("requestTimeoutMs: a single getRun does not hang forever on a silent server", async () => {
    const client = new ClipwrightClient({ apiKey: "cw_test", baseUrl, requestTimeoutMs: 200 });
    const started = Date.now();

    const outcome = await settledWithin(client.getRun("run_stuck"));

    expect(outcome).not.toBe(HUNG);
    // Each request has its own timeout; outside `makeUgc` there is no call deadline.
    expect((outcome as { error: unknown }).error).toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
