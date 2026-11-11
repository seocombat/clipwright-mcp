import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OWN_STILLS_SINGLE_MAX, parseApiFailure, putFilmFilesInput, type FilmRun } from "@clipwright/core";
import type { ClipwrightClient } from "@clipwright/sdk";
import { listTools } from "./remote.js";
import { ClipwrightApiError } from "@clipwright/sdk";
import { FILM_POLL_MS, FILM_WAIT_MS, ownAgentOpenFor, registerFilmDraftTools, stdioModes, stillPictures, waitForFilmRun } from "./film-tools.js";

// #1291 F2, #1337: the «own agent» film tools are listed only where the mode is offered, so the public tool list is unchanged before launch.

const FILM_TOOLS = ["check_film", "create_film_draft", "get_film_draft", "get_film_guide", "get_film_kit", "get_film_run", "make_film_hero", "make_voice", "preview_stills",
  "put_film_files", "quote_film_hero", "quote_render", "quote_stills", "quote_voice", "render_film"];

describe("the film tools (#1291 F2, #1337)", () => {
  /** Mutant: register them unconditionally, and every client sees tools the API refuses. */
  it("are listed with the mode on and absent with it off", async () => {
    const off = (await listTools({ fileAccess: "refuse" })).map(tool => tool.name);
    expect(off.filter(name => FILM_TOOLS.includes(name))).toEqual([]);
    const on = (await listTools({ fileAccess: "refuse", ownAgent: true })).map(tool => tool.name);
    expect(on.filter(name => FILM_TOOLS.includes(name)).sort()).toEqual(FILM_TOOLS);
    expect(on.length).toBe(off.length + FILM_TOOLS.length);
  });

  it("offer the draft's schema: a draft id, a base revision and the sound markup", async () => {
    const put = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(tool => tool.name === "put_film_files")!;
    expect(put.inputSchema.required).toEqual(expect.arrayContaining(["draft_id", "base_revision"]));
    expect(Object.keys(put.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["files", "cues", "sfx", "captions"]));
  });

  /** #1356. Mutants: a film tool whose listed text does not send the agent to the guide, or a guide tool that does not say to read it first. */
  it("send the agent to get_film_guide from every other film tool, and the guide says to read it first", async () => {
    const tools = (await listTools({ fileAccess: "refuse", ownAgent: true })).filter(tool => FILM_TOOLS.includes(tool.name));
    for (const tool of tools.filter(t => t.name !== "get_film_guide")) expect(tool.description, tool.name).toMatch(/get_film_guide/);
    expect(tools.find(t => t.name === "get_film_guide")!.description).toMatch(/^Free\. Read this first/);
  });

  /** #1356 C4. Mutants: a schema or a tool text that says only "replaces", and the agent resends every anchor, sound and caption on each patch. */
  it("say that cues, sfx and captions left out of a patch keep the draft's", async () => {
    const put = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(tool => tool.name === "put_film_files")!;
    // Field guidance is describe_tool's and the REST schema's: both read it from core.
    for (const field of ["cues", "sfx", "captions"] as const) expect(putFilmFilesInput.shape[field].description, field).toMatch(/omitted, the draft's stay/);
    expect(put.description).toMatch(/cues, sfx and captions[^.]*omitted[^.]*kept/);
  });

  /** #1356 C4. Mutant: the tool fills an omitted field with an empty one, and REST and MCP disagree about what a patch keeps. */
  it("put_film_files forwards only the fields the agent sent", async () => {
    const sent: unknown[] = [];
    const api = { putFilmFiles: async (_id: string, change: unknown) => { sent.push(change); return {}; } };
    const server = new McpServer({ name: "film-test", version: "0.0.0" });
    registerFilmDraftTools(server, api as unknown as ClipwrightClient);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try { await client.callTool({ name: "put_film_files", arguments: { draft_id: `fdr_${"a".repeat(32)}`, base_revision: 2, files: { "Movie.tsx": "b" } } }); }
    finally { await client.close(); }
    expect(sent).toEqual([{ base_revision: 2, files: { "Movie.tsx": "b" } }]);
  });

  /** #1356 C1. Mutants: a check tool that is not read-only, that drops the unsaved changes, or names no internal-free reason to call it. */
  it("check_film is read-only, forwards the revision, the voice and unsaved changes, and answers the check", async () => {
    const sent: unknown[] = [];
    const api = { checkFilm: async (id: string, request: unknown) => { sent.push([id, request]); return { ok: true, refusals: [] }; } };
    const listed = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(tool => tool.name === "check_film")!;
    expect(listed.annotations?.readOnlyHint).toBe(true);
    expect(listed.inputSchema.required).toEqual(expect.arrayContaining(["draft_id", "revision", "voice_run_id"]));
    expect(listed.description).toMatch(/^Free and instant\./);
    const server = new McpServer({ name: "film-test", version: "0.0.0" });
    registerFilmDraftTools(server, api as unknown as ClipwrightClient);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const draft = `fdr_${"a".repeat(32)}`;
    let answer: { type: string; text?: string }[];
    try { answer = (await client.callTool({ name: "check_film", arguments: { draft_id: draft, revision: 3, voice_run_id: "run_v1", cues: { hook: 0.2 } } }))
      .content as { type: string; text?: string }[]; }
    finally { await client.close(); }
    expect(sent).toEqual([[draft, { revision: 3, voice_run_id: "run_v1", cues: { hook: 0.2 } }]]);
    expect(JSON.parse(answer[0]!.text!)).toEqual({ ok: true, refusals: [] });
  });
});

const run = (state: string, over: Partial<FilmRun> = {}): FilmRun => ({ run_id: "run_s", skill: "film_stills", state, credits_reserved: 6, credits_charged: null,
  warnings: [], error: null, created_at: "2026-11-09T12:00:00.000Z", finished_at: null, ...over });

/** Each run tool as an MCP client calls it: the registered handler, a fake API behind it. */
async function callFilmTool(name: string, args: Record<string, unknown>, reads: FilmRun[], started: FilmRun,
  fetchImpl: typeof fetch = (async () => new Response(new Uint8Array([7]))) as unknown as typeof fetch) {
  const api = { previewStills: async () => started, makeVoice: async () => started, renderFilm: async () => started, makeFilmHero: async () => started,
    getFilmRun: async () => reads.shift()! };
  const server = new McpServer({ name: "film-test", version: "0.0.0" });
  registerFilmDraftTools(server, api as unknown as ClipwrightClient, { pollMs: 0, sleep: async () => undefined, fetchImpl });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try { return (await client.callTool({ name, arguments: args })).content as { type: string; text?: string; data?: string }[]; }
  finally { await client.close(); }
}

describe("the run tools as a client calls them (#1337)", () => {
  const drawn = run("succeeded", { stills: { frames: [{ at: 1, seconds: 1, frame: 30, image_url: "https://r2.test/f1.png", findings: [] }],
    sheet_url: null, refusals: [] } });
  /** Codex r1. Mutants: answer preview_stills or make_voice without waiting, and the agent gets a queued run and no pictures. */
  it("preview_stills and make_voice wait for their run and answer what it delivered", async () => {
    const stills = await callFilmTool("preview_stills", { draft_id: `fdr_${"a".repeat(32)}`, revision: 1, voice_run_id: "run_v1", at: [1] },
      [run("generating"), drawn], run("queued"));
    expect([JSON.parse(stills[0]!.text!).state, stills.map(c => c.type)]).toEqual(["succeeded", ["text", "image"]]);
    const voice = await callFilmTool("make_voice", { text: "Hello there." }, [run("succeeded", { skill: "film_voice" })], run("queued", { skill: "film_voice" }));
    expect(JSON.parse(voice[0]!.text!).state).toBe("succeeded");
  });

  /** #1371 C4, Codex r3. Mutant: pictures only for a stills run, and a delivered hero reaches the agent as text with no sheet to look at. */
  it("make_film_hero and get_film_run answer a delivered hero with its pose sheet as one picture, read from the run's sheet_url", async () => {
    const hero = run("succeeded", { skill: "film_hero", hero: { mascot_id: `ast_${"a".repeat(32)}`, poses: ["neutral", "palm"], character: null,
      sheet_url: "https://r2.test/runs/run_s/hero-sheet.png" } });
    for (const [name, args, reads] of [["make_film_hero", { character_details: "A round mint cactus" }, []],
      ["get_film_run", { run_id: "run_s" }, [hero]]] as const) {
      const fetched: string[] = [], answer = await callFilmTool(name, args, [...reads], hero,
        (async (url: string) => { fetched.push(url); return new Response(new Uint8Array([7])); }) as unknown as typeof fetch);
      expect([name, answer.map(c => c.type), answer[1]?.data, fetched]).toEqual([name, ["text", "image"], "Bw==", ["https://r2.test/runs/run_s/hero-sheet.png"]]);
      expect(JSON.parse(answer[0]!.text!).hero.sheet_url).toBe("https://r2.test/runs/run_s/hero-sheet.png");
    }
  });

  /** Mutant: wait on a render, which takes minutes, past the agent's tool timeout. */
  it("render_film answers at once with the call to poll", async () => {
    const film = await callFilmTool("render_film", { draft_id: `fdr_${"a".repeat(32)}`, revision: 1, voice_run_id: "run_v1" }, [],
      run("queued", { skill: "film_render" }));
    expect(JSON.parse(film[0]!.text!).poll).toEqual({ tool: "get_film_run", arguments: { run_id: "run_s" }, retry_after_seconds: 5 });
  });

  /** #1356 C1. Mutant: get_film_run answers an unfinished run at once, and the agent spends a turn on every 5 s of a render. */
  it("get_film_run waits for an unfinished run, answers a finished one after one read, and says it waits", async () => {
    const reads = [run("queued"), run("generating"), drawn];
    const waited = await callFilmTool("get_film_run", { run_id: "run_s" }, reads, run("queued"));
    expect([JSON.parse(waited[0]!.text!).state, reads.length, waited.map(c => c.type)]).toEqual(["succeeded", 0, ["text", "image"]]);
    const later = [run("generating")], done = await callFilmTool("get_film_run", { run_id: "run_s" }, [drawn, ...later], run("queued"));
    expect([JSON.parse(done[0]!.text!).state, later.length]).toEqual(["succeeded", 1]);
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(t => t.name === "get_film_run")!;
    expect(tool.description).toMatch(/Waits up to 45 s/);
  });

  /** #1356 C1, Codex r1. Mutants: a longer wait (450 s) runs past the agent's tool timeout; a shorter poll or none reads the run too often or too late. */
  it("get_film_run on a run that never ends reads it every FILM_POLL_MS and answers by the last read that started inside FILM_WAIT_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const start = Date.now(), reads: number[] = [];
      const api = { getFilmRun: async () => { reads.push(Date.now() - start); return run("generating"); } };
      const server = new McpServer({ name: "film-test", version: "0.0.0" });
      registerFilmDraftTools(server, api as unknown as ClipwrightClient);
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
      await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
      let answer: { type: string; text?: string }[] | null = null;
      const call = client.callTool({ name: "get_film_run", arguments: { run_id: "run_s" } })
        .then(result => { answer = result.content as { type: string; text?: string }[]; });
      await vi.advanceTimersByTimeAsync(FILM_WAIT_MS - 1);
      expect(answer).toBeNull();
      await vi.advanceTimersByTimeAsync(FILM_POLL_MS + 1);
      await call;
      await client.close();
      expect(JSON.parse(answer![0]!.text!).poll).toEqual({ tool: "get_film_run", arguments: { run_id: "run_s" }, retry_after_seconds: 5 });
      expect(reads[0]).toBe(0);
      expect(reads.slice(1).map((at, i) => at - reads[i]!)).toEqual(Array(reads.length - 1).fill(FILM_POLL_MS));
      expect(reads.at(-2)!).toBeLessThan(FILM_WAIT_MS);
      expect(reads.at(-1)!).toBeLessThanOrEqual(FILM_WAIT_MS + FILM_POLL_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  /** #1356. Mutants: wait on nine pose pictures past the tool timeout, or offer a hero tool with nothing to draw it from. */
  it("make_film_hero answers at once with the call to poll, and its schema names every source of the hero", async () => {
    const hero = await callFilmTool("make_film_hero", { character_details: "A round mint cactus" }, [], run("queued", { skill: "film_hero" }));
    expect(JSON.parse(hero[0]!.text!).poll).toEqual({ tool: "get_film_run", arguments: { run_id: "run_s" }, retry_after_seconds: 5 });
    const tools = await listTools({ fileAccess: "refuse", ownAgent: true });
    for (const name of ["quote_film_hero", "make_film_hero"]) {
      const tool = tools.find(t => t.name === name)!;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(["character_details", "character_reference", "script", "voice_run_id"]);
      expect(tool.inputSchema.required ?? []).toEqual([]);
    }
    expect(tools.find(t => t.name === "make_film_hero")!.description).toMatch(/per pose published.*mascot_id/s);
  });
});

describe("a stills run as pictures (#1337)", () => {
  /** Mutant: answer before the run ends, and the agent gets no pictures to look at. */
  it("waits for the run to end, then returns each still as a picture", async () => {
    const reads = [run("generating"), run("succeeded", { stills: { frames: [1, 2].map(i => ({ at: i, seconds: i, frame: i * 30,
      image_url: `https://r2.test/f${i}.png`, findings: [] })), sheet_url: null, refusals: [] } })];
    const done = await waitForFilmRun({ getFilmRun: async () => reads.shift()! }, run("queued"), { pollMs: 0, sleep: async () => undefined });
    expect(done.state).toBe("succeeded");
    const fetched: string[] = [];
    const { images } = await stillPictures(done, (async (url: string) => { fetched.push(url); return new Response(new Uint8Array([7])); }) as unknown as typeof fetch);
    expect([fetched, images.map(i => i.mimeType)]).toEqual([["https://r2.test/f1.png", "https://r2.test/f2.png"], ["image/png", "image/png"]]);
  });

  /** Mutant: send every still when a sheet was asked, and the agent's context takes six pictures for one. */
  it("sends the sheet alone when there is one, and nothing for a refused revision", async () => {
    const sheet = run("succeeded", { stills: { frames: [{ at: 1, seconds: 1, frame: 30, image_url: "https://r2.test/f1.png", findings: [] }],
      sheet_url: "https://r2.test/sheet.png", refusals: [] } });
    const fetchImpl = (async () => new Response(new Uint8Array([1]))) as unknown as typeof fetch;
    expect((await stillPictures(sheet, fetchImpl)).images.length).toBe(1);
    expect(await stillPictures(run("failed", { stills: { frames: [], sheet_url: null, refusals: ["Movie.tsx:1: x"] } }), fetchImpl))
      .toEqual({ images: [], note: null });
  });
});

const frames = (count: number, findings: (i: number) => string[] = () => []) => Array.from({ length: count }, (_, i) =>
  ({ at: i + 1, seconds: i + 1, frame: (i + 1) * 30, image_url: `https://r2.test/f${i + 1}.png`, findings: findings(i + 1) }));
const fetchedBy = (urls: string[], answer: (url: string) => Response | Promise<Response> = () => new Response(new Uint8Array([7]))) =>
  (async (url: string) => { urls.push(url); return answer(url); }) as unknown as typeof fetch;

// #1372 C1: 17 frames inline dropped the agent's connection three times and lost a paid round.
describe("many stills come as one sheet (#1372 C1)", () => {
  /** Mutants: a threshold of 8 or more (`>=`), or none, and either the 8 or the 9 case turns red. */
  it(`sends ${OWN_STILLS_SINGLE_MAX} stills one by one, and one more as the sheet alone`, async () => {
    const eight: string[] = [];
    expect((await stillPictures(run("succeeded", { stills: { frames: frames(OWN_STILLS_SINGLE_MAX), sheet_url: null, refusals: [] } }),
      fetchedBy(eight))).images).toHaveLength(OWN_STILLS_SINGLE_MAX);
    expect(eight).toHaveLength(OWN_STILLS_SINGLE_MAX);
    const nine: string[] = [];
    const nineSheet = run("succeeded", { stills: { frames: frames(OWN_STILLS_SINGLE_MAX + 1), sheet_url: "https://r2.test/sheet.png", refusals: [] } });
    expect([(await stillPictures(nineSheet, fetchedBy(nine))).images.length, nine]).toEqual([1, ["https://r2.test/sheet.png"]]);
  });

  /** Mutant: fall back to every frame when a run of more than 8 has no sheet, and the answer is the one that dropped the connection. */
  it("sends no frame of a run above the limit that has no sheet, and says why", async () => {
    const urls: string[] = [];
    const { images, note } = await stillPictures(run("succeeded", { stills: { frames: frames(17), sheet_url: null, refusals: [] } }), fetchedBy(urls));
    expect([images, urls]).toEqual([[], []]);
    expect(note).toMatch(/17 stills.*image_url/);
  });

  /** Mutant: no retry, and a passing network failure loses the picture. */
  it("retries a picture that failed to load", async () => {
    let calls = 0;
    const { images, note } = await stillPictures(run("succeeded", { stills: { frames: frames(1), sheet_url: null, refusals: [] } }),
      fetchedBy([], () => { calls += 1; if (calls === 1) throw new TypeError("socket hang up"); return calls === 2 ? new Response("busy", { status: 503 })
        : new Response(new Uint8Array([7])); }));
    expect([images.length, calls, note]).toEqual([1, 3, null]);
  });

  /** Mutants: a failed fetch fails the tool answer, or the text drops a still or its findings, or says nothing of the missing pictures. */
  it("answers every still with its findings when no picture loads, and names the free re-read", async () => {
    const drawn = run("succeeded", { stills: { frames: frames(3, i => i === 2 ? ["text clipped: \"MORNING\""] : []), sheet_url: null, refusals: [] } });
    const answer = await callFilmTool("get_film_run", { run_id: "run_s" }, [drawn], run("queued"),
      (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch);
    expect(answer.map(c => c.type)).toEqual(["text"]);
    const body = JSON.parse(answer[0]!.text!) as FilmRun & { pictures?: string };
    expect(body.stills!.frames.map(f => [f.image_url, f.findings])).toEqual(drawn.stills!.frames.map(f => [f.image_url, f.findings]));
    expect(body.pictures).toMatch(/3 of 3 stills did not load.*get_film_run.*no charge/);
  });
});

// #1372 C2: a paid round's pictures are read again with no new run.
describe("a stills run read again (#1372 C2)", () => {
  /** Mutants: pictures only on the call that drew them, or a re-read that starts a run; either turns this red. */
  it("get_film_run answers the same sheet on a second read and starts no run", async () => {
    const sheet = run("succeeded", { stills: { frames: frames(12), sheet_url: "https://r2.test/sheet.png", refusals: [] } });
    const started: string[] = [];
    const api = { previewStills: async () => { started.push("previewStills"); return sheet; }, getFilmRun: async () => sheet };
    const server = new McpServer({ name: "film-test", version: "0.0.0" });
    registerFilmDraftTools(server, api as unknown as ClipwrightClient, { pollMs: 0, sleep: async () => undefined,
      fetchImpl: (async (url: string) => new Response(new TextEncoder().encode(url))) as unknown as typeof fetch });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "film-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const read = async () => (await client.callTool({ name: "get_film_run", arguments: { run_id: "run_s" } })).content as { type: string; data?: string }[];
    let first: { type: string; data?: string }[], second: { type: string; data?: string }[];
    try { first = await read(); second = await read(); } finally { await client.close(); }
    expect(first.map(c => c.type)).toEqual(["text", "image"]);
    expect(Buffer.from(second[1]!.data!, "base64").toString()).toBe("https://r2.test/sheet.png");
    expect([second, started]).toEqual([first, []]);
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true })).find(t => t.name === "get_film_run")!;
    expect(tool.description).toMatch(/pictures again.*no charge/);
  });

  /** #1371 C4. Mutants: answer a delivered hero as text alone, or a hero with no sheet as a broken picture, and the agent goes to stills unseen. */
  it("shows a delivered hero's pose sheet as one picture, and none for a hero without one", async () => {
    const hero = (sheet_url: string | null) => run("succeeded", { skill: "film_hero", hero: { mascot_id: `ast_${"a".repeat(32)}`, poses: ["neutral"], character: null, sheet_url } });
    const fetched: string[] = [], fetchImpl = (async (url: string) => { fetched.push(url); return new Response(new Uint8Array([1])); }) as unknown as typeof fetch;
    expect((await stillPictures(hero("https://r2.test/hero-sheet.png"), fetchImpl)).images.map(i => i.type)).toEqual(["image"]);
    expect([(await stillPictures(hero(null), fetchImpl)).images, fetched]).toEqual([[], ["https://r2.test/hero-sheet.png"]]);
    expect((await listTools({ fileAccess: "refuse", ownAgent: true })).find(t => t.name === "make_film_hero")!.description).toMatch(/look at it before .*stills/i);
  });
});

// #1356 C5: the stdio bin offers a made-for-you explainer by the API's price list, not by its own environment. Mutants: ignore the list
// (always false, or the local flag), or count an entry of another tool, and one case turns red.
describe("stdioModes (#1356 C5)", () => {
  const entry = (tool: string, variant: string | null) => ({ action: tool, tool, route: null, variant, lines: [], formula: null, minimum_credits: null,
    quote_tool: null, notes: null });
  const api = (prices: ReturnType<typeof entry>[]) => ({ getFilmGuide: async () => ({}) as never, listPrices: async () => ({ prices }) });
  it("offers the made-for-you explainer when the API prices it, and not when it does not", async () => {
    expect(await stdioModes(api([entry("make_faceless", "explainer standard"), entry("make_faceless", "explainer pro")]))).toEqual({ ownAgent: true, explainer: true });
    expect(await stdioModes(api([entry("make_faceless", null), entry("make_ugc", "explainer standard")]))).toEqual({ ownAgent: true, explainer: false });
  });
  it("says no with one fixed stderr line when the price list does not answer", async () => {
    const log: string[] = [];
    const modes = await stdioModes({ getFilmGuide: async () => ({}) as never, listPrices: async () => { throw new TypeError("fetch failed cw_secret"); } },
      l => log.push(l));
    expect([modes, log.length, log[0]?.includes("cw_secret")]).toEqual([{ ownAgent: true, explainer: false }, 1, false]);
  });
});

// #1356: the stdio bin lists the film tools only when the API opens them to the key. Mutant: always true or always false turns a case red.
describe("ownAgentOpenFor (#1356)", () => {
  const refused = (status: number) => new ClipwrightApiError(parseApiFailure({ status, bodyText: "{}", retryAfterHeader: null }));
  it("says yes when the guide answers", async () => {
    const log: string[] = [];
    expect(await ownAgentOpenFor({ getFilmGuide: async () => ({}) as never }, l => log.push(l))).toBe(true);
    expect(log).toEqual([]);
  });
  it("says no, silently, when the API refuses the key", async () => {
    const log: string[] = [];
    expect(await ownAgentOpenFor({ getFilmGuide: async () => { throw refused(404); } }, l => log.push(l))).toBe(false);
    expect(log).toEqual([]);
  });
  it("says no with one stderr line when the API is unreachable", async () => {
    const log: string[] = [];
    expect(await ownAgentOpenFor({ getFilmGuide: async () => { throw new TypeError("fetch failed"); } }, l => log.push(l))).toBe(false);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/no usable answer/);
  });
  /** Mutants: a 5xx counts as "closed" silently, or the line carries the error's message with the key in it. */
  it("says no with one fixed line on a 5xx, and never prints the key or the body", async () => {
    const log: string[] = [];
    const failure = new ClipwrightApiError(parseApiFailure({ status: 503, bodyText: "Bearer cw_secretkey\nsecond line", retryAfterHeader: null }));
    failure.message = "Bearer cw_secretkey\nsecond line";
    expect(await ownAgentOpenFor({ getFilmGuide: async () => { throw failure; } }, l => log.push(l))).toBe(false);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain("HTTP 503");
    expect(log[0]).not.toContain("cw_secretkey");
    expect(log[0]).not.toContain("\n");
  });
});
