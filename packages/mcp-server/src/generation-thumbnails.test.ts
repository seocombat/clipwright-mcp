import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClipwrightClient } from "@clipwright/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createServer, generationThumbnails, THUMBNAIL_MAX_BYTES } from "./server.js";

const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
const urls = [0, 1, 2].map(i => `https://r2.example.test/thumb-${i}.jpg`);
const fetchOk = (async () => new Response(jpeg)) as typeof fetch;

describe("generationThumbnails (#1245)", () => {
  it("returns one JPEG image block per thumbnail of a succeeded run", async () => {
    const images = await generationThumbnails({ state: "succeeded", generation: { thumbnail_urls: urls } }, fetchOk);
    expect(images).toHaveLength(3);
    expect(images[0]).toEqual({ type: "image", mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") });
  });

  it("carries no image for a failed or unfinished run, nor for one without thumbnails", async () => {
    expect(await generationThumbnails({ state: "failed", generation: { thumbnail_urls: urls } }, fetchOk)).toEqual([]);
    expect(await generationThumbnails({ state: "generating", generation: { thumbnail_urls: urls } }, fetchOk)).toEqual([]);
    expect(await generationThumbnails({ state: "succeeded", generation: {} }, fetchOk)).toEqual([]);
    expect(await generationThumbnails({ state: "succeeded" }, fetchOk)).toEqual([]);
  });

  it("leaves out a thumbnail that is too large or does not load, and reads at most three", async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).endsWith("thumb-0.jpg")) return new Response(new Uint8Array(300_001));
      if (String(url).endsWith("thumb-1.jpg")) return new Response("gone", { status: 403 });
      return new Response(jpeg);
    }) as typeof fetch;
    const images = await generationThumbnails({ state: "succeeded", generation: { thumbnail_urls: [...urls, "https://r2.example.test/thumb-3.jpg"] } }, fetchImpl);
    expect(images).toHaveLength(1);
    const largest = await generationThumbnails({ state: "succeeded", generation: { thumbnail_urls: [urls[0]!] } },
      (async () => new Response(new Uint8Array(300_000))) as typeof fetch);
    expect(THUMBNAIL_MAX_BYTES).toBe(300_000);
    expect(largest).toHaveLength(1);
  });
});

describe("get_run over MCP with thumbnails (#1245)", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function call(run: Record<string, unknown>) {
    vi.spyOn(ClipwrightClient.prototype, "getRun").mockResolvedValue({ run_id: "run_1", skill: "generate_video", warnings: [], error: null,
      final_output: null, ...run } as never);
    vi.stubGlobal("fetch", fetchOk);
    const server = createServer(new ClipwrightClient({ apiKey: "cw_unused", baseUrl: "http://unused.invalid" }), { fileAccess: "local" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      return await client.callTool({ name: "get_run", arguments: { run_id: "run_1" } }) as { content: { type: string }[] };
    } finally {
      await client.close();
      await server.close();
    }
  }

  const generation = { kind: "video", model: "seedance-2.0", url: "https://r2.example.test/clip.mp4", mime: "video/mp4", width: 720, height: 1280,
    duration_s: 5, reusable_until: "2026-12-01T00:00:00.000Z", thumbnail_urls: urls };

  it("a succeeded clip answers its text and three images", async () => {
    const result = await call({ state: "succeeded", generation });
    expect(result.content.map(block => block.type)).toEqual(["text", "image", "image", "image"]);
  });

  it("a succeeded picture answers one image", async () => {
    const result = await call({ state: "succeeded", skill: "generate_image", generation: { ...generation, kind: "image", thumbnail_urls: [urls[0]] } });
    expect(result.content.map(block => block.type)).toEqual(["text", "image"]);
  });

  it("a failed run answers text only", async () => {
    const result = await call({ state: "failed", error: "spend_guard: refused", generation });
    expect(result.content.map(block => block.type)).toEqual(["text"]);
  });
});
