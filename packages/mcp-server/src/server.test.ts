import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ClipwrightClient } from "@clipwright/sdk";
import { CATALOG_LANGUAGES, MAKE_UGC_AGENT_PROTOCOL, MAKE_UGC_DESCRIPTION, VOICES_QUERY_FIELDS } from "@clipwright/core";

import { createServer } from "./server.js";

/** Links `createServer` to an in-memory MCP client: tools/list exactly as a real */
/** client sees it, without network or stdio. */
async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const sdkClient = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" });
  const server = createServer(sdkClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);

  return {
    client: mcpClient,
    close: async () => {
      await mcpClient.close();
      await server.close();
    },
  };
}

/** Minimal run for stubbing `getRun`; the response shape is not checked here. */
const QUEUED_RUN = {
  run_id: "run_1",
  skill: "make_ugc",
  state: "queued",
  credits_reserved: 90,
  credits_charged: null,
  warnings: [],
  error: null,
  final_output: null,
  steps: [],
  created_at: new Date().toISOString(),
  finished_at: null,
};

describe("tools/list (US-516)", () => {
  it("actor defaults tools preserve the actor id and named policy through the SDK", async () => {
    const value = { actor_id: "actor_u_1 2", broll_policy: "no_actor" as const };
    const get = vi.spyOn(ClipwrightClient.prototype, "getActorDefaults").mockResolvedValue(value);
    const set = vi.spyOn(ClipwrightClient.prototype, "setActorDefaults").mockResolvedValue(value);
    const { client, close } = await connectedClient();
    try {
      await client.callTool({ name: "get_actor_defaults", arguments: { actor_id: value.actor_id } });
      await client.callTool({ name: "set_actor_defaults", arguments: value });
      expect(get).toHaveBeenCalledWith(value.actor_id);
      expect(set).toHaveBeenCalledWith(value.actor_id, { broll_policy: "no_actor" });
    } finally {
      await close();
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("list_actors returns real catalog entries from the SDK", async () => {
    const actors = [{ actor_id: "actor_anna", name: "Anna", description: "Fictional adult woman",
      gender: "female" as const, approximate_age: 27, version: 1,
      variants: [{ aspect_ratio: "9:16" as const, width: 941, height: 1672,
        preview_url: "https://assets.example/anna", preview_expires_at: "2026-09-09T18:00:00Z" }] }];
    const spy = vi.spyOn(ClipwrightClient.prototype, "listActors").mockResolvedValue(actors);
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({ name: "list_actors", arguments: {} });
      expect(result.isError ?? false).toBe(false);
      expect(JSON.stringify(result.content)).toContain("actor_anna");
      expect(JSON.stringify(result.content)).toContain("preview_expires_at");
    } finally { await close(); spy.mockRestore(); }
  });
  it("publishes the full set of video, actor and actor-settings tools", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "create_actor",
        "delete_actor",
        "get_account",
        "get_actor_defaults",
        "get_run",
        "list_actors",
        "list_voices",
        "make_faceless",
        "make_ugc",
        "quote_actor",
        "quote_faceless",
        "quote_ugc",
        "set_actor_defaults",
        "upload_image",
      ]);
    } finally {
      await close();
    }
  });

  it("get_account returns the /v1/account body from the SDK, with no input", async () => {
    const accountBody = {
      account_id: "acc_1",
      balance_credits: 900,
      debt_credits: 45,
      holds_credits: 0,
      grants: [],
    };
    const spy = vi.spyOn(ClipwrightClient.prototype, "getAccount").mockResolvedValue(accountBody);
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({ name: "get_account", arguments: {} });
      expect(result.isError ?? false).toBe(false);
      const [first] = result.content as { type: string; text: string }[];
      expect(JSON.parse(first!.text)).toEqual(accountBody);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      await close();
      spy.mockRestore();
    }
  });

  it("image / aspect_ratio / resolution / voice are described: the agent sees values and the snap rule", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const props = tools.find((t) => t.name === "make_ugc")?.inputSchema.properties as Record<
        string,
        { description?: string }
      >;
      expect(props.aspect_ratio?.description).toContain("9:16 | 1:1 | 16:9");
      expect(props.aspect_ratio?.description).toContain("snapped to 9:16");
      expect(props.resolution?.description).toContain("720p | 1080p | 4k");
      expect(props.image?.description).toContain("upload_image");
      expect(props.voice?.description).toContain("owner_ru_clone");
    } finally {
      await close();
    }
  });

  it("publishes model-dependent script limits on quote, make and voice discovery", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      for (const name of ["quote_ugc", "make_ugc"]) {
        const props = tools.find((tool) => tool.name === name)!.inputSchema.properties!;
        const script = props.script as { maxLength: number; description: string };
        expect(script.maxLength).toBe(10000);
        expect(script.description).toMatch(/eleven_v3: 5000/);
        expect(script.description).toMatch(/eleven_flash_v2_5: 10000/);
        expect(script.description).toContain("потОм");
        expect(script.description).toContain("spaces");
      }
      expect(tools.find((tool) => tool.name === "list_voices")!.description).toContain("eleven_v3: 5000");
    } finally {
      await close();
    }
  });

  it("upload_image reads the file, sniffs the type by signature and returns a url with next_action", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "cw-upload-"));
    const file = join(dir, "photo.dat");
    writeFileSync(file, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
    const { client, close } = await connectedClient();
    try {
      const spy = vi.spyOn(ClipwrightClient.prototype, "uploadImage").mockResolvedValue({
        upload_id: `upl_${"cd".repeat(16)}`,
        url: "https://r2.example/uploads/acc/x.png?sig=1",
        media_type: "image/png",
        bytes: 12,
        width: 1376,
        height: 768,
        expires_at: "2026-09-07T10:00:00.000Z",
      });
      const result = await client.callTool({ name: "upload_image", arguments: { path: file } });
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text) as { url: string; next_action: string };
      expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array), "image/png");
      expect(parsed.url).toContain("https://");
      expect(parsed.next_action).toContain("aspect_ratio");
      expect(parsed.next_action).toContain("1376x768");
      spy.mockRestore();
    } finally {
      await close();
    }
  });

  it("upload_image refuses a file without a PNG/JPEG signature before the network", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "cw-upload-")), "note.png");
    writeFileSync(file, "not an image at all");
    const { client, close } = await connectedClient();
    try {
      const spy = vi.spyOn(ClipwrightClient.prototype, "uploadImage").mockClear();
      const result = await client.callTool({ name: "upload_image", arguments: { path: file } });
      expect(result.isError).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      await close();
    }
  });

  it("the make_ugc schema has voice and voice_id", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const makeUgc = tools.find((t) => t.name === "make_ugc");
      expect(makeUgc).toBeDefined();
      const properties = makeUgc?.inputSchema.properties as Record<string, unknown> | undefined;
      expect(properties).toHaveProperty("voice");
      expect(properties).toHaveProperty("voice_id");
    } finally {
      await close();
    }
  });

  it("make_ugc voice is a shaped string, not an enum of presets", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const props = tools.find((t) => t.name === "make_ugc")?.inputSchema.properties as Record<
        string,
        { type?: string; enum?: unknown; pattern?: string; description?: string }
      >;
      expect(props.voice?.type).toBe("string");
      expect(props.voice?.enum).toBeUndefined();
      expect(props.voice?.pattern).toBeDefined();
      expect(props.voice?.description).toContain("list_voices");
    } finally {
      await close();
    }
  });

  it("list_voices returns an unknown voice name through SDK parsing without error", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          voices: [
            {
              name: "es_female_lucia",
              kind: "catalog",
              language: "es",
              gender: "neutral",
              description: "Bright Spanish voice",
              model: "eleven_v3",
              verified_models: ["eleven_flash_v2_5"],
              rank: 3,
            },
          ],
          models: [{ id: "eleven_v3", char_limit: 5000, languages: ["es"] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({ name: "list_voices", arguments: {} });
      expect(result.isError ?? false).toBe(false);
      const text = (result.content as { text: string }[])[0]?.text ?? "";
      expect(JSON.parse(text)).toMatchObject({ voices: [{ name: "es_female_lucia", kind: "catalog" }] });
    } finally {
      await close();
      globalThis.fetch = savedFetch;
    }
  });

  it("make_ugc passes an unknown voice name to the API: the server decides", async () => {
    vi.stubEnv("CLIPWRIGHT_CLIENT_ID", "mcp0000000000000000000000000test");
    const savedFetch = globalThis.fetch;
    const bodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify(QUEUED_RUN), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "make_ugc",
        arguments: { script: "Hola desde Clipwright.", voice: "es_female_lucia" },
      });
      expect(result.isError ?? false).toBe(false);
      expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ voice: "es_female_lucia" });
    } finally {
      await close();
      globalThis.fetch = savedFetch;
      vi.unstubAllEnvs();
    }
  });

  it("list_voices publishes core's filters and passes them as the query string", async () => {
    const savedFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          voices: [
            { name: "ru_female_fixture", kind: "catalog", language: "ru", gender: "female", description: "d", model: "eleven_v3" },
          ],
          models: [{ id: "eleven_v3", char_limit: 5000, languages: ["ru"] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((entry) => entry.name === "list_voices")!;
      const properties = tool.inputSchema.properties ?? {};
      expect(Object.keys(properties).sort()).toEqual([...VOICES_QUERY_FIELDS].sort());
      expect((properties.language as { enum: string[] }).enum).toEqual([...CATALOG_LANGUAGES]);
      expect(tool.inputSchema.required ?? []).toEqual([]);
      expect(tool.description).not.toMatch(/curated|small/i);
      expect(tool.description).toContain(`${CATALOG_LANGUAGES.length} languages`);

      const result = await client.callTool({
        name: "list_voices",
        arguments: { language: "ru", gender: "female", age: "young", use_case: "social_media", model: "eleven_v3" },
      });
      expect(result.isError ?? false).toBe(false);
      expect(urls).toEqual([
        "http://unused.invalid/v1/voices?language=ru&gender=female&age=young&use_case=social_media&model=eleven_v3",
      ]);
      const text = (result.content as { text: string }[])[0]?.text ?? "";
      expect(JSON.parse(text)).toMatchObject({ voices: [{ name: "ru_female_fixture", gender: "female" }] });
    } finally {
      await close();
      globalThis.fetch = savedFetch;
    }
  });

  it("list_voices without filters returns the catalog from client.listVoices()", async () => {
    const { client, close } = await connectedClient();
    try {
      const spy = vi
        .spyOn(ClipwrightClient.prototype, "listVoices")
        .mockResolvedValue([
          { name: "owner_ru_clone", language: "ru", description: "клон владельца", model: "eleven_v3" },
        ]);

      const result = await client.callTool({ name: "list_voices", arguments: {} });
      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]?.text ?? "{}") as { voices: unknown[] };

      expect(parsed.voices).toEqual([
        { name: "owner_ru_clone", language: "ru", description: "клон владельца", model: "eleven_v3" },
      ]);
      spy.mockRestore();
    } finally {
      await close();
    }
  });
});

/** Offering a field the server rejects with 400 punishes the agent for our own */
/** offer; the whole tool JSON is checked, since the LLM reads prose first. */
describe("tools/list does not offer rejected fields", () => {
  const REJECTED_FIELDS = ["character", "webhook_url"] as const;

  it("no rejected field is declared in a tool schema", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        const properties = Object.keys(tool.inputSchema.properties ?? {});
        for (const field of REJECTED_FIELDS) {
          expect(properties).not.toContain(field);
        }
      }
    } finally {
      await close();
    }
  });

  it("no rejected field appears ANYWHERE in the JSON, description prose included", async () => {
    // The caller reads the description before the schema.
    const { client, close } = await connectedClient();
    try {
      const wholeJson = JSON.stringify((await client.listTools()).tools);
      expect(wholeJson).not.toMatch(/\bcharacter\b/);
      expect(wholeJson).not.toContain("webhook_url");
    } finally {
      await close();
    }
  });

  it("the make_ugc description CARRIES the text shared with the REST catalog", async () => {
    // `/v1/public/skills` requires equality with the same constant. Mutant:
    // inline a literal here instead and this fails.
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const makeUgc = tools.find((t) => t.name === "make_ugc");
      expect(makeUgc?.description).toContain(MAKE_UGC_DESCRIPTION);
      // The protocol half is separate: sibling tool names are not for the catalog.
      expect(makeUgc?.description).toContain(MAKE_UGC_AGENT_PROTOCOL);
    } finally {
      await close();
    }
  });

  it("the make_ugc description does not promise a fixed 1080p 9:16", async () => {
    // Format and resolution follow the request and source; a fixed promise in
    // prose would be a silent substitution the schema cannot catch.
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const makeUgc = tools.find((t) => t.name === "make_ugc");
      expect(makeUgc?.description).not.toContain("1080p 9:16");
    } finally {
      await close();
    }
  });

  it("remaining unhonored fields state the reason in their description", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const makeUgc = tools.find((t) => t.name === "make_ugc");
      const properties = makeUgc?.inputSchema.properties as
        | Record<string, { description?: string }>
        | undefined;

      // `person` is accepted but not rendered; the caller must learn that from
      // the schema, not from the finished clip.
      expect(properties?.person?.description).toContain("NOT HONORED YET");
      // `script` works: no disposition note, and it still says it is required.
      expect(properties?.script?.description).not.toContain("NOT HONORED YET");
      expect(properties?.script?.description).toContain("required");
      expect(properties?.script?.description).toContain("qualification");
    } finally {
      await close();
    }
  });

  it("quote_ugc is built from the same offered shape as make_ugc", async () => {
    // Otherwise the agent would quote one request and send another.
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const quote = tools.find((t) => t.name === "quote_ugc");
      const make = tools.find((t) => t.name === "make_ugc");

      const quoteKeys = Object.keys(quote?.inputSchema.properties ?? {}).sort();
      const makeKeys = Object.keys(make?.inputSchema.properties ?? {})
        .filter((k) => k !== "attempt")
        .sort();

      expect(quoteKeys).toEqual(makeKeys);
    } finally {
      await close();
    }
  });

  it("`run_id` is declared with core's SHAPE: garbage never reaches the network", async () => {
    // Mutant: go back to `z.string()` and any value reaches the API.
    const spy = vi
      .spyOn(ClipwrightClient.prototype, "getRun")
      .mockResolvedValue(QUEUED_RUN);
    const { client, close } = await connectedClient();
    try {
      for (const bad of ["../../etc/passwd", "not-a-run", "", "run_"]) {
        const refused = await client.callTool({ name: "get_run", arguments: { run_id: bad } });
        expect(refused.isError, `"${bad}" accepted at the MCP input`).toBe(true);
      }
      expect(spy, "garbage reached the API").not.toHaveBeenCalled();

      // A valid shape passes: the boundary does not block real work.
      await client.callTool({ name: "get_run", arguments: { run_id: "run_1" } });
      expect(spy).toHaveBeenCalledWith("run_1");
    } finally {
      spy.mockRestore();
      await close();
    }
  });

  /** Mutant: keep `attempt` in the body; the schema strips it silently and the */
  /** agent's retry returns the first run instead of a new one. */
  it("personal actor: three tools, non-empty schemas, `attempt` stays out of the body", async () => {
    const ACTOR = {
      name: "Studio Demo",
      description: "A fictional adult woman in a bright kitchen",
      gender: "female" as const,
      approximate_age: 32,
    };
    const spy = vi
      .spyOn(ClipwrightClient.prototype, "createActor")
      .mockResolvedValue(QUEUED_RUN as never);
    const { client, close } = await connectedClient();
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      for (const name of ["create_actor", "quote_actor", "delete_actor"]) {
        expect(names, `missing tool ${name}`).toContain(name);
      }
      const byName = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]));
      expect(Object.keys(byName.get("create_actor")?.inputSchema.properties ?? {})).toEqual(
        expect.arrayContaining(["name", "description", "gender", "approximate_age", "attempt"]),
      );
      expect(Object.keys(byName.get("delete_actor")?.inputSchema.properties ?? {})).toEqual(["actor_id"]);

      await client.callTool({ name: "create_actor", arguments: { ...ACTOR, attempt: 2 } });
      // Schema defaults arrive filled in; what matters is that `attempt` went to
      // SDK opts, not the body where the schema would strip it.
      expect(spy).toHaveBeenCalledWith(expect.objectContaining(ACTOR), { attempt: 2 });
      expect(spy.mock.calls[0]?.[0]).not.toHaveProperty("attempt");
    } finally {
      spy.mockRestore();
      await close();
    }
  });

  /** Mutant: call the paid `createActor` from `quote_actor` and this fails; */
  /** a quote is free by contract. */
  it("quote_actor asks for the price and does NOT start a paid run", async () => {
    const quote = vi
      .spyOn(ClipwrightClient.prototype, "quoteActor")
      .mockResolvedValue({ skill: "create_actor", credits_estimate: 30 } as never);
    const create = vi.spyOn(ClipwrightClient.prototype, "createActor").mockResolvedValue(QUEUED_RUN as never);
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "quote_actor",
        arguments: {
          name: "Studio Demo",
          description: "A fictional adult woman in a bright kitchen",
          gender: "female",
          approximate_age: 32,
        },
      });
      expect(quote).toHaveBeenCalledTimes(1);
      expect(create, "the quote started a paid run").not.toHaveBeenCalled();
      expect(JSON.stringify(result.content)).toContain("30");
    } finally {
      quote.mockRestore();
      create.mockRestore();
      await close();
    }
  });

  /** Mutant: encode the id in the handler; the SDK encodes it too, so a space */
  /** would become `%2520` and ANOTHER actor would be deleted. */
  it("delete_actor passes the id to the SDK VERBATIM, without its own encoding", async () => {
    const spy = vi.spyOn(ClipwrightClient.prototype, "deleteActor").mockResolvedValue(undefined);
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({ name: "delete_actor", arguments: { actor_id: "actor_u_1 2" } });
      expect(spy).toHaveBeenCalledWith("actor_u_1 2");
      expect(JSON.stringify(result.content)).toContain("actor_u_1 2");
    } finally {
      spy.mockRestore();
      await close();
    }
  });

  /** Mutant: swallow the refusal (`.catch(() => undefined)`) and the tool says */
  /** "deleted" about a live actor. */
  it("delete_actor surfaces the API refusal instead of reporting success", async () => {
    const spy = vi
      .spyOn(ClipwrightClient.prototype, "deleteActor")
      .mockRejectedValue(Object.assign(new Error("actor is used by a run"), { code: "actor_in_use" }));
    const { client, close } = await connectedClient();
    try {
      const result = await client.callTool({ name: "delete_actor", arguments: { actor_id: "actor_u_1" } });
      expect(result.isError, "the refusal was reported as success").toBe(true);
      expect(JSON.stringify(result.content)).not.toContain("deleted");
    } finally {
      spy.mockRestore();
      await close();
    }
  });

  it("the server version comes from the manifest, not a literal", async () => {
    // Mutant: hard-code the number in `server.ts`.
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { version: string };
    const { client, close } = await connectedClient();
    try {
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(client.getServerVersion()?.version).toBe(manifest.version);
    } finally {
      await close();
    }
  });
});
