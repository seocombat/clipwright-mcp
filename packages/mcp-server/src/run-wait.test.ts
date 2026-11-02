import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ClipwrightClient } from "@clipwright/sdk";
import { AI_DISCLOSURE_TEXT, PRESENTER_ENGINE_LABELS, quoteFaceless, type QuoteResponse, type RunRead } from "@clipwright/core";

import { formatGetRun, RUN_RETRY_AFTER_SECONDS, RUN_WAIT_MAX_SECONDS, waitForRun } from "./format.js";
import { facelessQuoteMarkdown, RUN_DISPLAY_HINT, terminalRunMarkdown, ugcQuoteMarkdown } from "./run-display.js";
import { createServer } from "./server.js";

const run = (state: string, over: Partial<RunRead> = {}): RunRead => ({
  run_id: "run_wait1", skill: "make_ugc", state, credits_reserved: 420, credits_charged: null, warnings: [], error: null,
  final_output: null, steps: [], created_at: new Date(0).toISOString(), finished_at: null, ...over,
}) as RunRead;
const SUCCEEDED = run("succeeded", { credits_charged: 350, balance_after_credits: 4321, finished_at: new Date(0).toISOString(),
  final_output: { video_url: "https://cdn.example/v.mp4", duration_seconds: 35.04, ai_generated: true, ai_disclosure: AI_DISCLOSURE_TEXT } });
const WARNINGS = ["captions were requested off; the video has none", "format 4:5 snapped to 9:16 (3.1% off); the frame is center-cropped"];
const UGC_QUOTE: QuoteResponse = {
  skill: "make_ugc", credits_estimate: 350, duration_estimate_sec: 35, warnings: WARNINGS, contract_version: "2026-11-02", source: null,
  actor: { gender: "female" }, resolved_aspect_ratio: "9:16", tts_model: "eleven_v3", tariff: "parts-v2", minimum_credits: 50,
  price_lines: [{ label: PRESENTER_ENGINE_LABELS.heygen, unit: "face_second", quantity: 35, unit_credits: 9, credits: 315 },
    { label: "production (voice and render)", unit: "second", quantity: 35, unit_credits: 1, credits: 35 }],
};

const FAILED = run("failed", { credits_charged: 0, error: "the photo has no face to animate", warnings: WARNINGS });
const FACELESS_INPUT = { input_mode: "script", script: "A clear story with spoken words.", duration_seconds: 30 } as const;
const FACELESS_QUOTE = { ...quoteFaceless({ outputFrames: 750, captions: true }), skill: "make_faceless" as const, warnings: WARNINGS,
  contract_version: "2026-11-02" };

const body = (result: unknown) => JSON.parse((result as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;

async function connected() {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "run-wait-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

/** Advances fake time a second at a step until the call answers; returns the answer and the seconds it took. */
async function answered(call: Promise<unknown>): Promise<{ result: unknown; seconds: number }> {
  let result: unknown, done = false, seconds = 0;
  void call.then((value) => { result = value; done = true; });
  await vi.advanceTimersByTimeAsync(0);
  while (!done && seconds < 120) {
    await vi.advanceTimersByTimeAsync(1000);
    seconds += 1;
  }
  return { result, seconds };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("get_run waits on the server (#1000)", () => {
  /** Mutant: wait_seconds ignored, and the agent gets the queued run back and polls again. */
  it("holds the answer until the run turns terminal on the third read", async () => {
    const reads = [run("queued"), run("avatar"), SUCCEEDED];
    const getRun = vi.spyOn(ClipwrightClient.prototype, "getRun").mockImplementation(async () => reads.shift() ?? SUCCEEDED);
    const { client, close } = await connected();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const { result, seconds } = await answered(client.callTool({ name: "get_run", arguments: { run_id: "run_wait1", wait_seconds: RUN_WAIT_MAX_SECONDS } }));
      expect(body(result)).toMatchObject({ status: "SUCCEEDED", video_url: "https://cdn.example/v.mp4", credits_charged: 350 });
      expect(body(result)).not.toHaveProperty("poll");
      expect(getRun).toHaveBeenCalledTimes(3);
      expect(seconds).toBeLessThan(RUN_WAIT_MAX_SECONDS);
    } finally {
      await close();
    }
  });

  /** Mutant: a wait by default, and every plain read costs the agent up to 50 s. */
  it.each([[{}], [{ wait_seconds: 0 }]])("answers at once with poll.arguments when asked to wait %j", async (wait) => {
    const getRun = vi.spyOn(ClipwrightClient.prototype, "getRun").mockResolvedValue(run("avatar") as never);
    const { client, close } = await connected();
    try {
      const answer = body(await client.callTool({ name: "get_run", arguments: { run_id: "run_wait1", ...wait } }));
      expect(answer).toMatchObject({ status: "IN_PROGRESS", poll: { tool: "get_run",
        arguments: { run_id: "run_wait1", wait_seconds: RUN_WAIT_MAX_SECONDS }, retry_after_seconds: RUN_RETRY_AFTER_SECONDS } });
      expect(String(answer.next_action)).toContain("poll.arguments");
      expect(getRun).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  /** Mutants: the deadline dropped, or a loop past it, and a client's tool timeout cuts the call. */
  it("stops at its cap on a run that does not end, and refuses a wait above it", async () => {
    const getRun = vi.spyOn(ClipwrightClient.prototype, "getRun").mockResolvedValue(run("avatar") as never);
    const { client, close } = await connected();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const { result, seconds } = await answered(client.callTool({ name: "get_run", arguments: { run_id: "run_wait1", wait_seconds: RUN_WAIT_MAX_SECONDS } }));
      expect(body(result)).toMatchObject({ status: "IN_PROGRESS", poll: { arguments: { wait_seconds: RUN_WAIT_MAX_SECONDS } } });
      expect(seconds).toBe(RUN_WAIT_MAX_SECONDS);
      expect(getRun.mock.calls.length).toBeGreaterThan(2);
      expect(getRun.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil(RUN_WAIT_MAX_SECONDS / 3));
      const refused = await client.callTool({ name: "get_run", arguments: { run_id: "run_wait1", wait_seconds: RUN_WAIT_MAX_SECONDS + 1 } });
      expect(refused.isError).toBe(true);
    } finally {
      await close();
    }
  });

  /** Mutants: the sleep deaf to the abort, or one more read after it, and a call nobody waits for keeps reading. */
  it("wakes at once when the caller leaves mid-wait and reads no more", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const left = new AbortController(), started = Date.now();
    const read = vi.fn(async () => run("avatar"));
    let answer: { state: string } | undefined;
    void waitForRun(read, RUN_WAIT_MAX_SECONDS, left.signal).then((value) => { answer = value; });
    await vi.advanceTimersByTimeAsync(100);
    left.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(answer?.state).toBe("avatar");
    expect(Date.now() - started).toBe(100);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RUN_WAIT_MAX_SECONDS * 1000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads once and stops when the caller left before the wait", async () => {
    const left = new AbortController();
    left.abort();
    const read = vi.fn(async () => run("avatar"));
    expect((await waitForRun(read, RUN_WAIT_MAX_SECONDS, left.signal)).state).toBe("avatar");
    expect(read).toHaveBeenCalledTimes(1);
  });

  /** Mutant: poll left out of a paid tool's first answer, and the agent without a shell has no call to make. */
  it("names the waiting read on a paid tool's first answer", async () => {
    vi.spyOn(ClipwrightClient.prototype, "startUgc").mockResolvedValue(run("queued") as never);
    const { client, close } = await connected();
    try {
      const answer = body(await client.callTool({ name: "make_ugc", arguments: { script: "Hello there, this is a test." } }));
      expect(answer.poll).toEqual({ tool: "get_run", arguments: { run_id: "run_wait1", wait_seconds: RUN_WAIT_MAX_SECONDS },
        retry_after_seconds: RUN_RETRY_AFTER_SECONDS });
    } finally {
      await close();
    }
  });
});

describe("display_markdown on quotes and finished runs (#1000)", () => {
  it("quote_ugc shows the price, the length, what it covers and every warning word for word, with no engine name", async () => {
    vi.spyOn(ClipwrightClient.prototype, "quoteUgc").mockResolvedValue(UGC_QUOTE);
    const { client, close } = await connected();
    try {
      const answer = body(await client.callTool({ name: "quote_ugc", arguments: { script: "Hello there, this is a test." } }));
      expect(answer).toMatchObject({ credits_estimate: 350, warnings: WARNINGS, display_hint: RUN_DISPLAY_HINT });
      const shown = String(answer.display_markdown);
      expect(shown).toBe(ugcQuoteMarkdown(UGC_QUOTE));
      for (const part of ["about 350 credits", "about 35 s", "| Presenter on screen | 35 s × 9 | 315 |", "| Voice and render | 35 s × 1 | 35 |",
        "at least 50 credits", "above or below"]) expect(shown).toContain(part);
      for (const warning of WARNINGS) expect(shown).toContain(`- ${warning}`);
      expect(shown).not.toMatch(/HeyGen|OmniHuman|production \(/);
    } finally {
      await close();
    }
  });

  /** Mutant: a tool answers its value without display_markdown or display_hint; only the tool call shows it. */
  it.each([
    { tool: "quote_ugc", args: { script: "Hello there, this is a test." }, stub: () => vi.spyOn(ClipwrightClient.prototype, "quoteUgc").mockResolvedValue(UGC_QUOTE),
      markdown: () => ugcQuoteMarkdown(UGC_QUOTE) },
    { tool: "quote_faceless", args: FACELESS_INPUT, stub: () => vi.spyOn(ClipwrightClient.prototype, "quoteFaceless").mockResolvedValue(FACELESS_QUOTE),
      markdown: () => facelessQuoteMarkdown(FACELESS_QUOTE) },
    { tool: "get_run", args: { run_id: "run_wait1" }, stub: () => vi.spyOn(ClipwrightClient.prototype, "getRun").mockResolvedValue(SUCCEEDED as never),
      markdown: () => terminalRunMarkdown(SUCCEEDED) },
    { tool: "get_run", args: { run_id: "run_wait1" }, stub: () => vi.spyOn(ClipwrightClient.prototype, "getRun").mockResolvedValue(FAILED as never),
      markdown: () => terminalRunMarkdown(FAILED) },
  ])("$tool answers display_markdown and display_hint through the tool", async ({ tool, args, stub, markdown }) => {
    stub();
    const { client, close } = await connected();
    try {
      const answer = body(await client.callTool({ name: tool, arguments: args }));
      expect(answer.display_markdown).toBe(markdown());
      expect(answer.display_hint).toBe(RUN_DISPLAY_HINT);
    } finally {
      await close();
    }
  });

  /** Mutant: a row counting another row's credits again; the total in the header and the answer no longer matches the rows. */
  describe("quote table rows add up to the quoted total", () => {
    const rowsSum = (shown: string) => shown.split("\n").filter((line) => /^\| (?!Part \|)/.test(line))
      .map((line) => Number(line.split("|").at(-2)!.trim().replace(/,/g, ""))).reduce((sum, value) => sum + value, 0);
    const headerTotal = (shown: string) => Number(/\*\*(?:about|at most) ([\d,]+) credits\*\*/.exec(shown)![1]!.replace(/,/g, ""));
    const ugc = (seconds: number, total: number): QuoteResponse => ({ ...UGC_QUOTE, credits_estimate: total, duration_estimate_sec: seconds,
      price_lines: [{ label: "presenter", unit: "face_second", quantity: seconds, unit_credits: 9, credits: 9 * seconds },
        { label: "production", unit: "second", quantity: seconds, unit_credits: 1, credits: seconds }] });

    it.each([[35, 350], [3, 50]])("quote_ugc of %i s quoted at %i credits", (seconds, total) => {
      const shown = ugcQuoteMarkdown(ugc(seconds, total));
      expect(rowsSum(shown)).toBe(total);
      expect(headerTotal(shown)).toBe(total);
    });

    // By hand: 7 per picture (one per two seconds plus four, at most 31), 49 for the opening clip, 1 per second.
    it.each([[750, 19 * 7 + 30 + 49], [1500, 31 * 7 + 60 + 49], [2250, 31 * 7 + 90 + 49]])("quote_faceless of %i frames quoted at %i credits", (outputFrames, total) => {
      const quote = { ...quoteFaceless({ outputFrames, captions: true }), skill: "make_faceless" as const, warnings: [], contract_version: "2026-11-02" };
      expect(quote.totalCredits).toBe(total);
      const shown = facelessQuoteMarkdown(quote);
      expect(rowsSum(shown)).toBe(total);
      expect(headerTotal(shown)).toBe(total);
    });
  });

  it("quote_faceless shows the ceiling and its parts", () => {
    const quote = { ...quoteFaceless({ outputFrames: 1500, captions: true }), skill: "make_faceless" as const, warnings: [], contract_version: "2026-11-02" };
    const shown = facelessQuoteMarkdown(quote);
    expect(shown).toContain(`at most ${quote.totalCredits} credits`);
    expect(shown).toContain(`| Generated pictures, at most | ${quote.images} × ${quote.imageCredits} | ${quote.images! * quote.imageCredits!} |`);
    expect(shown).toContain(`| Opening animated clip | 1 | ${quote.openerCredits} |`);
    expect(shown).toContain("60 s selected");
    expect(shown).toContain("Warnings: none.");
  });

  it("a succeeded run shows its link, length, charge against the reserve and warnings", () => {
    const answer = body(formatGetRun({ ...SUCCEEDED, warnings: WARNINGS }));
    expect(answer.display_hint).toBe(RUN_DISPLAY_HINT);
    expect(answer.display_markdown).toBe([
      "**Video ready** · `run_wait1` · make_ugc", "", "| File | Length |", "|---|---:|", "| [Download](https://cdn.example/v.mp4) | 35 s |",
      "", "| Credits charged | Reserved | Balance after |", "|---:|---:|---:|", "| 350 | 420 | 4,321 |",
      "", "The link is temporary: download the file.", "", "Warnings:", ...WARNINGS.map((warning) => `- ${warning}`),
    ].join("\n"));
  });

  it("a failed run says what failed as quoted data, and its charge", () => {
    const failed = run("failed", { credits_charged: 0, error: "the presenter | clip `could not` be made\nfor this photo", warnings: [WARNINGS[0]!] });
    const answer = body(formatGetRun(failed));
    expect(answer).toMatchObject({ status: "FAILED", error: failed.error, display_hint: RUN_DISPLAY_HINT });
    const shown = String(answer.display_markdown);
    expect(shown).toContain("**Run failed** · `run_wait1` · make_ugc");
    expect(shown).toContain("- What failed: “the presenter / clip /could not/ be made for this photo”");
    expect(shown).toContain("| 0 | 420 | — |");
    expect(shown).toContain(`- ${WARNINGS[0]}`);
    expect(terminalRunMarkdown(run("failed"))).toContain("What failed: no reason given");
  });

  /** Mutant: a warning's second line dropped or joined, and the table no longer quotes it word for word. */
  it("keeps every line of a multi-line warning word for word", () => {
    const warning = "the opening clip was made again\nits first frame differs from the quote's preview";
    const shown = terminalRunMarkdown({ ...SUCCEEDED, warnings: [warning] });
    expect(shown).toContain("- the opening clip was made again\n  its first frame differs from the quote's preview");
    expect(ugcQuoteMarkdown({ ...UGC_QUOTE, warnings: [warning] })).toContain(`- ${warning.replace("\n", "\n  ")}`);
  });

  /** Mutant: the cap removed, and a long reason floods the table. */
  it("cuts a long failure reason to 300 characters with an ellipsis", () => {
    const shown = terminalRunMarkdown(run("failed", { error: "x".repeat(1000) }));
    const reason = /What failed: “(.*)”/.exec(shown)?.[1] ?? "";
    expect(Array.from(reason)).toHaveLength(300);
    expect(reason.endsWith("…")).toBe(true);
  });

  it("an unfinished run carries no display_markdown", () => {
    expect(body(formatGetRun(run("avatar")))).not.toHaveProperty("display_markdown");
  });
});
