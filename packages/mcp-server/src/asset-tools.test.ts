import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ASSET_BASE64_MAX_BYTES, ASSET_TOOL_ANSWER_CHARS, ASSET_TOOL_PAGE, type AssetListQuery } from "@clipwright/core";
import { ClipwrightClient } from "@clipwright/sdk";

import { createServer } from "./server.js";

// #1372 C3 and C4: an agent sees the picture it picks, and a page of assets fits its tool output.

const id = (n: number) => `ast_${n.toString(16).padStart(32, "0")}`;
/** A link as the storage signs it, as long as the live one (589 characters, #1376): the bulk of an asset's answer. */
const signed = (asset: string, file: string) => `https://${"0".repeat(32)}.r2.cloudflarestorage.com/clipwright-renders/assets/` +
  `acc_${"a".repeat(32)}/${asset}/${file}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=` +
  `${"C".repeat(32)}%2F20261110%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261110T120000Z&X-Amz-Expires=3600&X-Amz-Signature=${"d".repeat(64)}` +
  "&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject";
/** Every third a mascot with its nine poses and a written character, as the live library holds them (8 of its newest 20). */
const ready = (n: number, over: Record<string, unknown> = {}) => ({ asset_id: id(n), state: "ready", kind: "image", role: "character",
  name: `Character reference number ${n}`, media_type: "image/png", bytes: 300_000, width: 1080, height: 1920, duration_frames: null, fps: null,
  codec: null, pix_fmt: null, content_digest: "b".repeat(64), source_type: "base64", analysis_only: false,
  ...(n % 3 === 0 ? { mascot: { poses: ["up", "palm", "point", "celebrate", "surprise", "think", "shrug", "wink", "neutral"],
    character: "A round mint cactus in a tiny straw hat, ".repeat(11).trim() } } : {}),
  url: signed(id(n), `${"b".repeat(64)}.png`), expires_at: "2026-11-10T13:00:00.000Z", created_at: "2026-11-10T12:00:00.000Z",
  updated_at: "2026-11-10T12:00:00.000Z", ...over });

async function connected(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "asset-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

type Block = { type: string; text?: string; data?: string; mimeType?: string };
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("get_asset shows the picture (#1372 C3)", () => {
  async function read(item: unknown, answer: (url: string) => Response | Promise<Response> = () => new Response(WEBP)) {
    vi.spyOn(ClipwrightClient.prototype, "getAsset").mockResolvedValue(item as never);
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { fetched.push(url); return answer(url); });
    const { client, close } = await connected();
    try {
      return { content: (await client.callTool({ name: "get_asset", arguments: { asset_id: id(1) } })).content as Block[], fetched };
    } finally { await close(); }
  }

  /** Mutants: no picture at all, the original instead of the preview, or the preview labelled with the original's type. */
  it("answers the JSON, then the preview as a picture", async () => {
    const preview = signed(id(1), "preview.webp");
    const { content, fetched } = await read(ready(1, { preview_url: preview }));
    expect(content.map(c => [c.type, c.mimeType])).toEqual([["text", undefined], ["image", "image/webp"]]);
    expect(JSON.parse(content[0]!.text!).asset_id).toBe(id(1));
    expect([fetched, Buffer.from(content[1]!.data!, "base64")]).toEqual([[preview], Buffer.from(WEBP)]);
  });

  /** Mutants: no picture without a preview, or the original sent whatever its size, past what one answer carries. */
  it("without a preview, sends a picture asset itself only up to the inline size", async () => {
    const small = await read(ready(1, { bytes: ASSET_BASE64_MAX_BYTES }), () => new Response(PNG));
    expect([small.fetched, small.content.map(c => [c.type, c.mimeType])]).toEqual([[ready(1).url], [["text", undefined], ["image", "image/png"]]]);
    const large = await read(ready(1, { bytes: ASSET_BASE64_MAX_BYTES + 1 }));
    expect([large.fetched, large.content.map(c => c.type)]).toEqual([[], ["text"]]);
    const clip = await read(ready(1, { kind: "video", media_type: "video/mp4", bytes: 1000 }));
    expect([clip.fetched, clip.content.map(c => c.type)]).toEqual([[], ["text"]]);
  });

  /** Mutant (#1373 item 2): the preview's downloaded bytes go out uncapped, since the asset's own size says nothing of its preview's. */
  it("sends a preview only up to the inline size, counted on the bytes downloaded", async () => {
    const at = await read(ready(1, { preview_url: signed(id(1), "preview.webp") }), () => new Response(new Uint8Array(ASSET_BASE64_MAX_BYTES)));
    expect(at.content.map(c => c.type)).toEqual(["text", "image"]);
    const past = await read(ready(1, { preview_url: signed(id(1), "preview.webp") }), () => new Response(new Uint8Array(ASSET_BASE64_MAX_BYTES + 1)));
    expect([past.fetched.length, past.content.map(c => c.type)]).toEqual([1, ["text"]]);
  });

  /** Mutant: a picture that does not load fails the read, and the agent loses the asset's JSON too. */
  it("answers the JSON alone when the picture does not load, and a pending asset with no picture", async () => {
    const down = await read(ready(1, { preview_url: signed(id(1), "preview.webp") }), () => { throw new TypeError("network down"); });
    expect([down.content.map(c => c.type), JSON.parse(down.content[0]!.text!).asset_id]).toEqual([["text"], id(1)]);
    const pending = await read({ asset_id: id(1), state: "processing", kind: "image", role: "character", name: "x", source_type: "url",
      analysis_only: false, error: null, processing_deadline: null, created_at: "2026-11-10T12:00:00.000Z" });
    expect([pending.fetched, pending.content.map(c => c.type)]).toEqual([[], ["text"]]);
  });
});

describe("list_assets fits the agent's tool output (#1372 C4)", () => {
  const ALL = Array.from({ length: 200 }, (_, i) => ready(i + 1));
  /** A cursor as long as the live one (94 characters), naming where the next page starts; the last page has none. */
  const cursorAt = (start: number) => `${"Y".repeat(60)}${String(start).padStart(34, "0")}`;
  const pageOf = (lib: readonly unknown[], start: number, limit: number) => {
    const end = Math.min(lib.length, start + limit);
    return { assets: lib.slice(start, end), pending: [], next_cursor: end < lib.length ? cursorAt(end) : null,
      usage: { count: lib.length, bytes: 60_000_000, max_count: 2000, max_bytes: 1_000_000_000 }, contract_version: "2026-11-10" };
  };
  async function list(args: Record<string, unknown>, lib: readonly unknown[] = ALL) {
    const asked: AssetListQuery[] = [];
    vi.spyOn(ClipwrightClient.prototype, "listAssets").mockImplementation(async (query: AssetListQuery = {}) => {
      asked.push(query);
      return pageOf(lib, query.cursor ? Number(query.cursor.slice(60)) : 0, query.limit ?? 50) as never;
    });
    const { client, close } = await connected();
    try {
      const blocks = (await client.callTool({ name: "list_assets", arguments: args })).content as Block[];
      return { text: blocks[0]!.text!, note: blocks[1]?.text, asked };
    } finally { await close(); }
  }

  /** Mutants: the API's page of 50 by default, or a default that overrides the agent's own limit. */
  it(`answers ${ASSET_TOOL_PAGE} of 200 assets within ${ASSET_TOOL_ANSWER_CHARS} characters, and keeps an asked limit that fits`, async () => {
    expect(signed(id(1), `${"b".repeat(64)}.png`)).toHaveLength(589);
    const first = await list({});
    expect(first.text.length).toBeLessThanOrEqual(ASSET_TOOL_ANSWER_CHARS);
    expect([first.asked, JSON.parse(first.text).assets.length, first.note]).toEqual([[{ limit: ASSET_TOOL_PAGE }], ASSET_TOOL_PAGE, undefined]);
    expect((await list({ limit: 3 })).asked).toEqual([{ limit: 3 }]);
  });

  /** #1376: the agent asked the whole library and the answer spilled out of its tool output. Mutants: answer the page as asked; cut it without
   *  asking again, so next_cursor skips the assets left out; cut more than needed; or cut it silently. */
  it("asks a page that runs past the agent's tool output again at the most assets that fit, and says so", async () => {
    const all = await list({ limit: 100 });
    const kept = JSON.parse(all.text).assets.length as number;
    expect(all.asked).toEqual([{ limit: 100 }, { limit: kept }]);
    expect(all.text.length).toBeLessThanOrEqual(ASSET_TOOL_ANSWER_CHARS);
    const page = (n: number) => JSON.stringify({ ...JSON.parse(all.text), assets: ALL.slice(0, n) }).length;
    expect(page(kept + 1)).toBeGreaterThan(ASSET_TOOL_ANSWER_CHARS);
    expect(all.note).toBe(`This page was cut to ${kept} assets to fit your tool output; next_cursor continues. ` +
      "To find one sooner, filter by role or kind, or pass mascot true.");
    expect((await list({ role: "character", limit: 100 })).asked).toEqual([{ role: "character", limit: 100 }, { role: "character", limit: kept }]);
  });

  /** Codex r1: a library that fits in one page answers no next_cursor, and the cut page then gains one: the answer measured without it ran past
   *  the cap. Mutants: trust the first page's size, or hand back the first page's cursor, and the assets left out cannot be reached. */
  it("keeps a cut page within the cap once it gains a next_cursor, and every asset is reached by paging", async () => {
    // A library of 12 whose first asset's name is padded until the page that fits without a cursor runs past the cap with one.
    const size = (lib: unknown[], n: number, withCursor: boolean) => JSON.stringify({ ...pageOf(lib, 0, n), ...(withCursor ? {} : { next_cursor: null }) }).length;
    const libOf = (pad: number) => [ready(1, { name: "n".repeat(1 + pad) }), ...ALL.slice(1, 12)];
    const tight = Array.from({ length: 1500 }, (_, pad) => libOf(pad)).find(lib => {
      let fits = 0;
      while (fits < lib.length - 1 && size(lib, fits + 1, false) <= ASSET_TOOL_ANSWER_CHARS) fits++;
      return size(lib, lib.length, false) > ASSET_TOOL_ANSWER_CHARS && size(lib, fits, true) > ASSET_TOOL_ANSWER_CHARS;
    })!;
    expect(tight).toBeDefined();
    // Codex r3: every page of the 200 is cut too, so a re-ask that drops the agent's cursor would hand back the first page again.
    for (const lib of [tight, ALL]) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const answer = await list({ limit: 100, ...(cursor ? { cursor } : {}) }, lib), body = JSON.parse(answer.text);
        expect(answer.text.length).toBeLessThanOrEqual(ASSET_TOOL_ANSWER_CHARS);
        seen.push(...body.assets.map((a: { asset_id: string }) => a.asset_id));
        cursor = body.next_cursor ?? undefined;
      } while (cursor && seen.length <= lib.length);
      expect(seen).toEqual(lib.map(a => a.asset_id));
    }
  });

  /** Mutant: drop a filter on the way, and the agent pages through every role to find one character. */
  it("forwards role, kind and mascot", async () => {
    expect((await list({ role: "character", kind: "image", mascot: "true" })).asked)
      .toEqual([{ role: "character", kind: "image", mascot: "true", limit: ASSET_TOOL_PAGE }]);
  });
});
