import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchImage, IMAGE_BUDGET_MS } from "./images.js";

// #1373: a picture that hangs gives up by its deadline, and a downloaded picture past the cap is not sent.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
let server: Server | undefined;

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  server?.closeAllConnections();
  await new Promise(resolve => server ? server.close(resolve) : resolve(undefined));
  server = undefined;
});

/** A local server whose every answer stalls: no headers at all, or headers and the first bytes of a body that never ends. */
async function stalling(mode: "headers" | "body"): Promise<{ url: string; requests: () => number }> {
  let requests = 0;
  server = createServer((_req, res) => {
    requests += 1;
    if (mode === "body") { res.writeHead(200, { "content-type": "image/png", "content-length": "1000" }); res.write(PNG); }
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/picture.png`, requests: () => requests };
}

/** The fetch's answer, or "hung" when it has not come 3 s after a 300 ms deadline. */
async function within(deadlineMs: number, url: string): Promise<{ answer: unknown; elapsed: number }> {
  const started = Date.now();
  const answer = await Promise.race([fetchImage(url, { deadline: started + deadlineMs }),
    new Promise(resolve => setTimeout(() => resolve("hung"), deadlineMs + 3_000))]);
  return { answer, elapsed: Date.now() - started };
}

describe("a picture's fetch time budget (#1373 item 1)", () => {
  /** Mutants: no abort signal on the fetch, or each try waits its full 5 s whatever the deadline left. */
  it("gives up on a server that never answers once the deadline passes, without another try", async () => {
    const { url, requests } = await stalling("headers");
    const { answer, elapsed } = await within(300, url);
    expect([answer, requests()]).toEqual([null, 1]);
    expect(elapsed).toBeLessThan(2_000);
  });

  /** Mutant: a budget that bounds the headers only, and a body that stops mid-way holds the answer. */
  it("gives up on a body that stalls after its headers", async () => {
    const { url, requests } = await stalling("body");
    const { answer, elapsed } = await within(300, url);
    expect([answer, requests()]).toEqual([null, 1]);
    expect(elapsed).toBeLessThan(2_000);
  });

  /** Mutants (Codex r1): a try bounded by what is left of the budget alone, so the first of a hung picture holds 10 s, or a budget
   *  other than 10 s, past what two tries inside an agent's 60 s tool timeout need. */
  it("bounds each try at 5 s, and the last by what is left of a 10 s budget", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const timeouts: number[] = [], timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => { timeouts.push(ms); return timeout(ms); });
    const start = Date.now();
    const fetchImpl = (async () => { vi.setSystemTime(Date.now() + 3_500); throw new TypeError("socket hang up"); }) as unknown as typeof fetch;
    expect(await fetchImage("https://r2.test/p.png", { fetchImpl })).toBeNull();
    expect([timeouts, Date.now() - start]).toEqual([[5_000, 5_000, 3_000], 10_500]);
  });

  /** Mutants: no default deadline, so a failing picture is tried three times at 5 s each, or a default other than IMAGE_BUDGET_MS. */
  it(`without a deadline, tries again only within ${IMAGE_BUDGET_MS} ms`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tried = async (spent: number) => {
      const start = Date.now();
      let calls = 0;
      const fetchImpl = (async () => {
        calls += 1;
        if (calls === 1) { vi.setSystemTime(start + spent); throw new TypeError("socket hang up"); }
        return new Response(PNG);
      }) as unknown as typeof fetch;
      return { image: await fetchImage("https://r2.test/p.png", { fetchImpl }), calls };
    };
    const spentAll = await tried(IMAGE_BUDGET_MS);
    expect([spentAll.image, spentAll.calls]).toEqual([null, 1]);
    const spentAlmost = await tried(IMAGE_BUDGET_MS - 1);
    expect([spentAlmost.image?.mimeType, spentAlmost.calls]).toEqual(["image/png", 2]);
  });
});

describe("a downloaded picture's byte cap (#1373 item 2)", () => {
  const answering = (bytes: number) => (async () => new Response(new Uint8Array(bytes).fill(1))) as unknown as typeof fetch;

  /** Mutants: no cap on the bytes downloaded, or a cap that refuses a picture exactly at the limit. */
  it("sends a picture up to maxBytes and none past it", async () => {
    expect((await fetchImage("https://r2.test/p.png", { fetchImpl: answering(8), maxBytes: 8 }))?.data).toBe(Buffer.alloc(8, 1).toString("base64"));
    expect(await fetchImage("https://r2.test/p.png", { fetchImpl: answering(9), maxBytes: 8 })).toBeNull();
  });
});
