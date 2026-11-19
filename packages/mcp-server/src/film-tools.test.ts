import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { CreateServerOptions } from "./server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FILM_GUIDE_FORMATS, guideModesOf, OWN_STILLS_SINGLE_MAX, parseApiFailure, putFilmFilesInput, type FilmGuideFormat, type FilmRun }
  from "@clipwright/core";
import type { ClipwrightClient } from "@clipwright/sdk";
import { listTools } from "./remote.js";
import { ClipwrightApiError } from "@clipwright/sdk";
import { AD_DIY_TOOLS, FILM_POLL_MS, FILM_WAIT_MS, ownAgentOpenFor, registerFilmDraftTools, stdioModes, stillPictures, waitForFilmRun } from "./film-tools.js";

// #1291 F2, #1337: the «own agent» film tools are listed only where the mode is offered, so the public tool list is unchanged before launch.

const FILM_TOOLS = ["check_film", "check_take", "create_ad", "create_film_draft", "get_ad", "get_film_draft", "get_film_guide", "get_film_kit", "get_film_run",
  "make_film_hero", "make_voice", "preview_stills", "put_film_files", "quote_edit", "quote_film_hero", "quote_render", "quote_stills", "quote_take_check",
  "quote_voice", "render_edit", "render_film", "take_frames", "update_ad"];

/** A two-card cut sheet, as an agent writes it. */
const CARD_SHEET = { format: "story", look: "silhouette", voice_run_id: "run_voice", method: { kind: "story", techniques: [{ id: "a", why: "1" },
  { id: "b", why: "2" }, { id: "c", why: "3" }] },
  structure: { arc: "a", hook: { kind: "payoff_line", payoff_words: [0, 0], cold_open: null }, ending: { kind: "reveal", words: [0, 0] } },
  style: { look: "l", light: "l", palette: ["#000000", "#ffffff", "#c9862e"], effect_colours: "amber" },
  beats: [{ id: "a", words: [0, 0], kind: "card", shot_size: "ms", why: "w", technique_ids: ["a"], card: "ONE" },
    { id: "b", words: [1, 1], kind: "card", shot_size: "ms", why: "w", technique_ids: ["b"], card: "TWO" }], sound: { bed: null } };

describe("the film tools (#1291 F2, #1337)", () => {
  /** Mutant: register them unconditionally, and every client sees tools the API refuses. */
  it("are listed with the mode on and absent with it off", async () => {
    const off = (await listTools({ fileAccess: "refuse", adGuide: true })).map(tool => tool.name);
    expect(off.filter(name => FILM_TOOLS.includes(name))).toEqual([]);
    const on = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).map(tool => tool.name);
    expect(on.filter(name => FILM_TOOLS.includes(name)).sort()).toEqual(FILM_TOOLS);
    expect(on.length).toBe(off.length + FILM_TOOLS.length);
  });

  // Mutant: the ad tools listed to every account of the mode, before the owner sets their prices and the live acceptance passes.
  it("list the ad tools only where get_ad_guide is offered", async () => {
    const mode = (await listTools({ fileAccess: "refuse", ownAgent: true })).map(tool => tool.name);
    expect(mode.filter(name => (AD_DIY_TOOLS as readonly string[]).includes(name))).toEqual([]);
    expect(mode.filter(name => FILM_TOOLS.includes(name)).sort()).toEqual(FILM_TOOLS.filter(name => !(AD_DIY_TOOLS as readonly string[]).includes(name)));
    const epic = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).map(tool => tool.name);
    expect(epic.filter(name => (AD_DIY_TOOLS as readonly string[]).includes(name)).sort()).toEqual([...AD_DIY_TOOLS].sort());
  });

  // Mutant: the faceless formats listed to every account of the mode, which the API then refuses with a 404.
  it("offer get_film_guide's faceless formats only where they are served, and pass them to the API", async () => {
    const guideOf = async (facelessDiy?: boolean) => (await listTools({ fileAccess: "refuse", ownAgent: true, ...facelessDiy ? { facelessDiy } : {} }))
      .find(tool => tool.name === "get_film_guide")!;
    const plain = await guideOf();
    expect([Object.keys(plain.inputSchema.properties ?? {}), plain.description]).toEqual([[], expect.not.stringContaining("own_pictures")]);
    const faceless = await guideOf(true);
    expect(Object.keys(faceless.inputSchema.properties ?? {}).sort()).toEqual(["format", "section"]);
    expect(faceless.description).toContain("own_pictures");
    const asked: unknown[] = [];
    const server = new McpServer({ name: "t", version: "0" });
    registerFilmDraftTools(server, { getFilmGuide: async (query: unknown) => { asked.push(query); return { guide: "g" }; } } as unknown as ClipwrightClient,
      {}, false, true);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    await client.callTool({ name: "get_film_guide", arguments: { format: "list", section: "steps" } });
    expect(asked).toEqual([{ format: "list", section: "steps" }]);
  });

  // Faceless DIY F1. Mutants: check_cut listed to every account of the mode, or its sheet not passed to the API as the agent wrote it.
  it("list check_cut only where the faceless guide is served, read-only, with its mistakes to avoid, and pass the sheet on", async () => {
    const names = async (facelessDiy: boolean) => (await listTools({ fileAccess: "refuse", ownAgent: true, ...facelessDiy ? { facelessDiy } : {} }))
      .map(tool => tool.name);
    expect(await names(false)).not.toContain("check_cut");
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true, facelessDiy: true })).find(one => one.name === "check_cut")!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tool.description!.match(/Mistakes to avoid:/g)).toHaveLength(1);
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(["format", "voice_run_id", "beats", "sound"]));
    const sent: unknown[] = [];
    const server = new McpServer({ name: "t", version: "0" });
    registerFilmDraftTools(server, { checkCut: async (sheet: unknown) => { sent.push(sheet); return { ok: true }; } } as unknown as ClipwrightClient,
      {}, false, true);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const answer = await client.callTool({ name: "check_cut", arguments: CARD_SHEET });
    expect(answer.isError).not.toBe(true);
    expect(sent).toEqual([expect.objectContaining({ format: "story", voice_run_id: "run_voice", beats: expect.arrayContaining([expect.objectContaining({ card: "ONE" })]) })]);
  });

  // Faceless DIY F1 slice B. Mutants: the paid cut listed to every account of the mode, or listed read-only.
  it("list quote_cut and render_cut only where the faceless guide is served, the render as a paid run with its attempt", async () => {
    const tools = async (facelessDiy: boolean) => listTools({ fileAccess: "refuse", ownAgent: true, ...facelessDiy ? { facelessDiy } : {} });
    expect((await tools(false)).map(tool => tool.name)).not.toEqual(expect.arrayContaining(["quote_cut"]));
    expect((await tools(false)).map(tool => tool.name)).not.toContain("render_cut");
    const listed = await tools(true), quote = listed.find(tool => tool.name === "quote_cut")!, render = listed.find(tool => tool.name === "render_cut")!;
    expect(quote.annotations).toMatchObject({ readOnlyHint: true });
    expect(render.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(Object.keys(render.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["voice_run_id", "beats", "max_credits", "attempt"]));
  });

  // F3. Mutants: the cut record tools listed to every account of the mode, a tool without its mistakes, update_cut without the record's id,
  // preview_cut answering before its stills are drawn, or cut_id offered on the motion check and on an explainer's voice.
  it("list the cut record and preview tools only where the faceless guide is served, and preview_cut waits for its stills", async () => {
    const CUT_TOOLS = ["create_cut", "get_cut", "preview_cut", "quote_cut_preview", "update_cut"];
    const tools = async (o: { adGuide?: boolean; facelessDiy?: boolean }) => listTools({ fileAccess: "refuse", ownAgent: true, ...o });
    const ad = await tools({ adGuide: true }), faceless = await tools({ facelessDiy: true });
    expect(ad.map(tool => tool.name).filter(name => CUT_TOOLS.includes(name))).toEqual([]);
    expect(faceless.map(tool => tool.name).filter(name => CUT_TOOLS.includes(name)).sort()).toEqual(CUT_TOOLS);
    for (const name of CUT_TOOLS) expect(faceless.find(t => t.name === name)!.description!.match(/Mistakes to avoid: \S/g), name).toHaveLength(1);
    const find = (name: string) => faceless.find(t => t.name === name)!;
    expect([find("get_cut").annotations?.readOnlyHint, find("quote_cut_preview").annotations?.readOnlyHint, find("preview_cut").annotations?.readOnlyHint])
      .toEqual([true, true, false]);
    expect(find("update_cut").inputSchema.required).toEqual(["cut_id"]);
    expect(find("preview_cut").inputSchema.required).toEqual(expect.arrayContaining(["cut_id", "at", "beats"]));
    expect(Object.keys(find("preview_cut").inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["attempt", "max_credits"]));
    for (const name of ["quote_take_check", "check_take"]) {
      expect(Object.keys(ad.find(t => t.name === name)!.inputSchema.properties ?? {}), name).not.toContain("cut_id");
      expect(Object.keys(find(name).inputSchema.properties ?? {}), name).toContain("cut_id");
    }
    expect(Object.keys(ad.find(t => t.name === "make_voice")!.inputSchema.properties ?? {})).not.toContain("cut_id");
    expect(Object.keys(find("make_voice").inputSchema.properties ?? {})).toContain("cut_id");
    const drawn = run("succeeded", { skill: "film_cut_preview", stills: { frames: [{ at: 3, seconds: 1.2, frame: 30, image_url: "https://r2.test/p.png",
      findings: [] }], sheet_url: null, refusals: [] } });
    const started: unknown[] = [];
    const api = { previewCut: async (input: unknown, opts: unknown) => { started.push([input, opts]); return run("queued", { skill: "film_cut_preview" }); },
      getFilmRun: async () => drawn };
    const server = new McpServer({ name: "t", version: "0" });
    registerFilmDraftTools(server, api as unknown as ClipwrightClient, { pollMs: 0, sleep: async () => undefined,
      fetchImpl: (async () => new Response(new Uint8Array([7]))) as unknown as typeof fetch }, false, true);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    let content: { type: string; text?: string }[];
    try { content = (await client.callTool({ name: "preview_cut", arguments: { ...CARD_SHEET, cut_id: `fv_${"f".repeat(32)}`, at: [1], attempt: 2 } }))
      .content as { type: string; text?: string }[]; }
    finally { await client.close(); }
    expect([JSON.parse(content[0]!.text!).state, content.map(c => c.type)]).toEqual(["succeeded", ["text", "image"]]);
    expect(started).toEqual([[expect.objectContaining({ cut_id: `fv_${"f".repeat(32)}`, at: [1], format: "story" }), { attempt: 2 }]]);
  });

  it("offer the draft's schema: a draft id, a base revision and the sound markup", async () => {
    const put = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(tool => tool.name === "put_film_files")!;
    expect(put.inputSchema.required).toEqual(expect.arrayContaining(["draft_id", "base_revision"]));
    expect(Object.keys(put.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["files", "cues", "sfx", "captions"]));
  });

  /** #1356. Mutants: a film tool whose listed text does not send the agent to the guide, or a guide tool that does not say to read it first. */
  it("send the agent to get_film_guide from every other film tool, and the guide says to read it first", async () => {
    const tools = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).filter(tool => FILM_TOOLS.includes(tool.name));
    // An edit cuts the account's clips, not a film draft: the explainer guide is not its manual.
    for (const tool of tools.filter(t => !["get_film_guide", ...AD_DIY_TOOLS].includes(t.name)))
      expect(tool.description, tool.name).toMatch(/get_film_guide/);
    expect(tools.find(t => t.name === "get_film_guide")!.description).toMatch(/^Free\. Read this first/);
  });

  /** #1356 C4. Mutants: a schema or a tool text that says only "replaces", and the agent resends every anchor, sound and caption on each patch. */
  it("say that cues, sfx and captions left out of a patch keep the draft's", async () => {
    const put = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(tool => tool.name === "put_film_files")!;
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
    const listed = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(tool => tool.name === "check_film")!;
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
    renderEdit: async () => started, takeFrames: async () => started, checkTake: async () => started, getFilmRun: async () => reads.shift()! };
  const server = new McpServer({ name: "film-test", version: "0.0.0" });
  registerFilmDraftTools(server, api as unknown as ClipwrightClient, { pollMs: 0, sleep: async () => undefined, fetchImpl }, true);
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
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(t => t.name === "get_film_run")!;
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

  /** #1356. Mutants: wait on nine pose pictures past the tool timeout, or offer a hero tool with nothing to draw it from. #1380: mascot_id
   *  completes a saved mascot, and the description says so. */
  it("make_film_hero answers at once with the call to poll, and its schema names every source of the hero", async () => {
    const hero = await callFilmTool("make_film_hero", { character_details: "A round mint cactus" }, [], run("queued", { skill: "film_hero" }));
    expect(JSON.parse(hero[0]!.text!).poll).toEqual({ tool: "get_film_run", arguments: { run_id: "run_s" }, retry_after_seconds: 5 });
    const tools = await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true });
    for (const name of ["quote_film_hero", "make_film_hero"]) {
      const tool = tools.find(t => t.name === name)!;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort())
        .toEqual(name === "make_film_hero" ? ["attempt", "character_details", "character_reference", "mascot_id", "max_credits", "script", "voice_run_id"]
          : ["character_details", "character_reference", "mascot_id", "max_credits", "script", "voice_run_id"]);
      expect(tool.inputSchema.required ?? []).toEqual([]);
    }
    expect(tools.find(t => t.name === "make_film_hero")!.description).toMatch(/per pose published.*mascot_id/s);
    expect(tools.find(t => t.name === "make_film_hero")!.description).toMatch(/With mascot_id alone, completes that saved mascot/);
  });

  // Mutants: render_edit not answering at once with the poll, its schema missing a field of the edit list, or its text hiding the charge rule.
  it("render_edit answers at once with the call to poll, and quote_edit and render_edit take the whole edit list", async () => {
    const edit = await callFilmTool("render_edit", { clips: [{ run_id: "run_clip", from: 0, to: 2 }] }, [], run("queued", { skill: "film_edit" }));
    expect(JSON.parse(edit[0]!.text!).poll).toEqual({ tool: "get_film_run", arguments: { run_id: "run_s" }, retry_after_seconds: 5 });
    const tools = await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true });
    for (const name of ["quote_edit", "render_edit"]) {
      const tool = tools.find(t => t.name === name)!;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort())
        .toEqual(["ad_id", "ambience", ...name === "render_edit" ? ["attempt"] : [], "captions", "clips", "hold", "max_credits", "music", "voice"]);
      expect(tool.inputSchema.required).toEqual(["clips"]);
    }
    expect(tools.find(t => t.name === "render_edit")!.description).toMatch(/^Paid once per delivered cut, after quote_edit\..*up to 3% off 9:16 is cropped to fill it; one further off is shown whole with bars.*costs nothing/s);
  });
});

describe("the ad record as a client calls it (#1539 stage 2)", () => {
  const AD = `ad_${"a".repeat(32)}`;
  // Mutants: a tool forwarding the ad id inside the body, update_ad dropping the id, or the record's next lost on the way.
  it("create_ad, update_ad and get_ad reach the API with the record's id apart from its body", async () => {
    const calls: unknown[][] = [], record = { ad_id: AD, next: { action: "quote_take_check" } };
    const api = { createAd: async (...a: unknown[]) => { calls.push(["create", ...a]); return record; },
      updateAd: async (...a: unknown[]) => { calls.push(["update", ...a]); return record; },
      getAd: async (...a: unknown[]) => { calls.push(["get", ...a]); return record; } };
    const server = new McpServer({ name: "ad-test", version: "0.0.0" });
    registerFilmDraftTools(server, api as unknown as ClipwrightClient, {}, true);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(), client = new Client({ name: "ad-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const brief = { product: "Mug" }, slots = [{ id: "hook", shot: "the mug to the lens" }];
      const answer = await client.callTool({ name: "create_ad", arguments: { brief, slots } });
      expect(JSON.parse((answer.content as { text: string }[])[0]!.text).next).toEqual({ action: "quote_take_check" });
      await client.callTool({ name: "update_ad", arguments: { ad_id: AD, slots } });
      await client.callTool({ name: "get_ad", arguments: { ad_id: AD } });
    } finally { await client.close(); }
    expect(calls).toEqual([["create", { brief: { product: "Mug" }, slots: [{ id: "hook", shot: "the mug to the lens" }] }],
      ["update", AD, { slots: [{ id: "hook", shot: "the mug to the lens" }] }], ["get", AD]]);
  });

  // Mutant: a DIY tool listed without the mistakes an agent makes with it.
  it("names the mistakes to avoid in every ad tool's description, and the ad fields on check_take and render_edit", async () => {
    const tools = await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true });
    for (const name of AD_DIY_TOOLS) expect(tools.find(t => t.name === name)!.description, name).toMatch(/Mistakes to avoid: \S/);
    expect(tools.find(t => t.name === "render_edit")!.description).toMatch(/ad_slot_unchecked\) before any credits/);
    expect(tools.find(t => t.name === "get_ad")!.inputSchema.required).toEqual(["ad_id"]);
    expect(Object.keys(tools.find(t => t.name === "update_ad")!.inputSchema.properties ?? {}).sort()).toEqual(["ad_id", "brief", "slots"]);
  });
});

describe("a take's audit as a client calls it", () => {
  const sheets = [1, 2].map(i => ({ image_url: `https://r2.test/sheet${i}.png`, from: (i - 1) * 3, to: i * 3 - 0.125, frames: 24 }));
  // Mutants: take_frames answering before the run ends, or with its sheets as links only, and the agent sees no frame.
  it("take_frames waits for the run and returns every sheet as a picture", async () => {
    const fetched: string[] = [];
    const content = await callFilmTool("take_frames", { run_id: "run_clip" }, [run("generating", { skill: "film_take_frames" }),
      run("succeeded", { skill: "film_take_frames", take_frames: { fps: 8, frames: 48, sheets } })], run("queued", { skill: "film_take_frames" }),
    fetchedBy(fetched));
    expect(content.map(c => c.type)).toEqual(["text", "image", "image"]);
    expect(fetched).toEqual(["https://r2.test/sheet1.png", "https://r2.test/sheet2.png"]);
  });

  // Mutants: check_take answering at once without the verdict, its schema dropping a field, or its text hiding the charge rule.
  it("check_take waits for the verdict, and both check tools take the take, its direction, the product and the moves", async () => {
    const verdict = { duration_sec: 8, findings: [{ code: "HANDLING", level: "action" as const, from: 2.5, to: 3.1, whole_take: false, why: null }],
      clean: [{ from: 0, to: 2.5 }, { from: 3.1, to: 8 }] };
    const content = await callFilmTool("check_take", { run_id: "run_clip", direction: "A hand lifts the jar." },
      [run("succeeded", { skill: "film_take_check", take_check: verdict })], run("queued", { skill: "film_take_check" }));
    expect(JSON.parse(content[0]!.text!).take_check).toEqual(verdict);
    const tools = await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true });
    for (const name of ["quote_take_check", "check_take"]) {
      expect(Object.keys(tools.find(t => t.name === name)!.inputSchema.properties ?? {}).sort())
        .toEqual(["ad_id", "asset_id", ...name === "check_take" ? ["attempt"] : [], "direction", "format", "max_credits", "moves", "product_image", "run_id", "slot"]);
    }
    expect(Object.keys(tools.find(t => t.name === "take_frames")!.inputSchema.properties ?? {}).sort())
      .toEqual(["asset_id", "attempt", "crop", "fps", "from", "max_credits", "run_id", "to"]);
    expect(tools.find(t => t.name === "check_take")!.description).toMatch(/^Paid per delivered verdict, after quote_take_check\..*costs nothing/s);
    expect(tools.find(t => t.name === "take_frames")!.description).toMatch(/^Free\..*at most 96 frames/s);
  });

  // F2 C5. Mutants: the take tools left off a faceless DIY account, the picture fields listed to an ad-only account, or not told where listed.
  it("list the take tools on the faceless DIY list too, with the picture fields and their text only there", async () => {
    const names = async (o: { adGuide?: boolean; facelessDiy?: boolean }) => listTools({ fileAccess: "refuse", ownAgent: true, ...o });
    const faceless = await names({ facelessDiy: true }), ad = await names({ adGuide: true });
    expect(faceless.map(t => t.name)).toEqual(expect.arrayContaining(["take_frames", "quote_take_check", "check_take"]));
    expect(faceless.map(t => t.name)).not.toContain("render_edit");
    for (const name of ["quote_take_check", "check_take"]) {
      expect(Object.keys(faceless.find(t => t.name === name)!.inputSchema.properties ?? {}), name).toEqual(expect.arrayContaining(["against", "look", "picture"]));
      expect(Object.keys(ad.find(t => t.name === name)!.inputSchema.properties ?? {}), name).not.toContain("against");
    }
    expect(faceless.find(t => t.name === "check_take")!.description).toContain("against picture");
    expect(ad.find(t => t.name === "check_take")!.description).not.toContain("against picture");
    // Code review #3. Mutant: the ad list's direction keeps the picture mode's object form and its text.
    for (const name of ["quote_take_check", "check_take"]) {
      const direction = (list: typeof ad) => (list.find(t => t.name === name)!.inputSchema.properties as Record<string, Record<string, unknown>>).direction!;
      expect([direction(ad).type, direction(ad).anyOf, JSON.stringify(direction(ad))], name).toEqual(["string", undefined, expect.not.stringMatching(/picture|start/)]);
      expect(JSON.stringify(direction(faceless)), name).toMatch(/changes/);
    }
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
    const tool = (await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(t => t.name === "get_film_run")!;
    expect(tool.description).toMatch(/pictures again.*no charge/);
  });

  /** #1371 C4. Mutants: answer a delivered hero as text alone, or a hero with no sheet as a broken picture, and the agent goes to stills unseen. */
  it("shows a delivered hero's pose sheet as one picture, and none for a hero without one", async () => {
    const hero = (sheet_url: string | null) => run("succeeded", { skill: "film_hero", hero: { mascot_id: `ast_${"a".repeat(32)}`, poses: ["neutral"], character: null, sheet_url } });
    const fetched: string[] = [], fetchImpl = (async (url: string) => { fetched.push(url); return new Response(new Uint8Array([1])); }) as unknown as typeof fetch;
    expect((await stillPictures(hero("https://r2.test/hero-sheet.png"), fetchImpl)).images.map(i => i.type)).toEqual(["image"]);
    expect([(await stillPictures(hero(null), fetchImpl)).images, fetched]).toEqual([[], ["https://r2.test/hero-sheet.png"]]);
    expect((await listTools({ fileAccess: "refuse", ownAgent: true, adGuide: true })).find(t => t.name === "make_film_hero")!.description).toMatch(/look at it before .*stills/i);
  });
});

// #1356 C5: the stdio bin offers a made-for-you explainer by the API's price list, not by its own environment. Mutants: ignore the list
// (always false, or the local flag), or count an entry of another tool, and one case turns red.
describe("stdioModes (#1356 C5)", () => {
  const entry = (tool: string, variant: string | null) => ({ action: tool, tool, route: null, variant, lines: [], formula: null, minimum_credits: null,
    quote_tool: null, notes: null });
  const api = (prices: ReturnType<typeof entry>[]) => ({ getFilmGuide: async () => ({ guides: [] }) as never, getAdGuide: async () => ({}) as never,
    listPrices: async () => ({ prices }) });
  const closed = { adGuide: false, facelessDiy: false };
  it("offers the made-for-you explainer when the API prices it, and not when it does not", async () => {
    expect(await stdioModes(api([entry("make_faceless", "explainer standard"), entry("make_faceless", "explainer pro")]))).toEqual({ ownAgent: true, explainer: true, ...closed });
    expect(await stdioModes(api([entry("make_faceless", null), entry("make_ugc", "explainer standard")]))).toEqual({ ownAgent: true, explainer: false, ...closed });
  });
  it("says no with one fixed stderr line when the price list does not answer", async () => {
    const log: string[] = [];
    const modes = await stdioModes({ getFilmGuide: async () => ({ guides: [] }) as never, getAdGuide: async () => ({}) as never,
      listPrices: async () => { throw new TypeError("fetch failed cw_secret"); } }, l => log.push(l));
    expect([modes, log.length, log[0]?.includes("cw_secret")]).toEqual([{ ownAgent: true, explainer: false, ...closed }, 1, false]);
  });
});

// #1696: the npm server lists what the hosted one lists for the same account, read from the guide catalog the API answers.
// Mutants: the catalog ignored, an explainer entry read as faceless, the ad guide not asked alone, or a mode listed apart.
describe("stdio lists the hosted server's DIY tools (#1696)", () => {
  const refused = new ClipwrightApiError(parseApiFailure({ status: 403, bodyText: "{}", retryAfterHeader: null }));
  const v = "0123456789ab", use_when = "w";
  const AD = { tool: "get_ad_guide" as const, use_when, version: v };
  const film = (format: FilmGuideFormat) => ({ tool: "get_film_guide" as const, format, use_when, version: v });
  // Mutant: a looser return type, so a new option of the factory goes unanswered on stdio and stays off there.
  it("answers every option of the server factory but the file access", () => {
    expectTypeOf<Awaited<ReturnType<typeof stdioModes>>>().toEqualTypeOf<Required<Omit<CreateServerOptions, "fileAccess">>>();
  });
  // Mutant: one faceless format read as the mode, so a catalog that lists only another one hides the tools.
  it.each(FILM_GUIDE_FORMATS.filter(format => format !== "explainer"))("opens the faceless tools on a catalog that lists %s alone", async (format) => {
    expect(guideModesOf([film(format)])).toEqual({ adGuide: false, facelessDiy: true });
    expect(await stdioModes(fake([film("explainer"), film(format)]).client)).toMatchObject({ facelessDiy: true });
  });
  const fake = (guides: unknown, ad: "answers" | "refused" = "refused") => {
    const asked: string[] = [];
    return { asked, client: {
      // As the API answers: a faceless format is refused to an account it is not served, so only the plain guide tells the modes.
      getFilmGuide: async (query?: object) => { asked.push("film");
        return (guides === "refused" || Object.keys(query ?? {}).length ? Promise.reject(refused) : { guides }) as never; },
      getAdGuide: async () => { asked.push("ad"); return (ad === "refused" ? Promise.reject(refused) : {}) as never; },
      listPrices: async () => ({ prices: [] }) } };
  };
  it.each([
    [[film("explainer")], { ownAgent: true, adGuide: false, facelessDiy: false }],
    [[AD, film("explainer")], { ownAgent: true, adGuide: true, facelessDiy: false }],
    [[film("explainer"), film("story"), film("cartoon")], { ownAgent: true, adGuide: false, facelessDiy: true }],
    [[AD, film("explainer"), film("cartoon")], { ownAgent: true, adGuide: true, facelessDiy: true }],
    [[], { ownAgent: true, adGuide: false, facelessDiy: false }],
  ])("reads the modes from the film guide's catalog %j, asking nothing more", async (guides, modes) => {
    const { asked, client } = fake(guides);
    expect(await stdioModes(client)).toEqual({ ...modes, explainer: false });
    expect(asked).toEqual(["film"]);
  });
  it.each([["refused", "answers", true], ["refused", "refused", false], [undefined, "answers", true]] as const)(
    "asks the ad guide on its own where the film guide is closed or names no catalog (film %s, ad %s)", async (guides, ad, open) => {
      const { asked, client } = fake(guides, ad);
      expect(await stdioModes(client)).toEqual({ ownAgent: guides !== "refused", explainer: false, adGuide: open, facelessDiy: false });
      expect(asked).toEqual(["film", "ad"]);
    });
  // Mutants: the ad guide asked after a server fault too, so a hung API holds the start twice; or a status on either side of 4xx misread.
  const status = (code: number) => new ClipwrightApiError(parseApiFailure({ status: code, bodyText: "{}", retryAfterHeader: null }));
  it.each([["no answer", new TypeError("fetch failed")], ["HTTP 500", status(500)], ["HTTP 503", status(503)]])(
    "asks nothing more where the film guide failed (%s), with one stderr line", async (_, failure) => {
      const log: string[] = [], asked: string[] = [];
      const modes = await stdioModes({ getFilmGuide: async () => { asked.push("film"); throw failure; },
        getAdGuide: async () => { asked.push("ad"); return {} as never; }, listPrices: async () => ({ prices: [] }) }, l => log.push(l));
      expect([modes, asked, log.length]).toEqual([{ ownAgent: false, explainer: false, adGuide: false, facelessDiy: false }, ["film"], 1]);
    });
  it.each([400, 404, 499])("reads HTTP %i on the film guide as closed: the ad guide is asked, nothing is logged", async (code) => {
    const log: string[] = [], asked: string[] = [];
    const modes = await stdioModes({ getFilmGuide: async () => { asked.push("film"); throw status(code); },
      getAdGuide: async () => { asked.push("ad"); return {} as never; }, listPrices: async () => ({ prices: [] }) }, l => log.push(l));
    expect([modes.adGuide, asked, log]).toEqual([true, ["film", "ad"], []]);
  });
  // The tool list differs by transport only in what reads a file; every name is on both, so a mode cannot be lost to stdio.
  it("lists the same tool names on both transports under the same modes", async () => {
    for (const ownAgent of [false, true]) for (const adGuide of [false, true]) for (const facelessDiy of [false, true]) {
      const names = async (fileAccess: "local" | "refuse") => (await listTools({ fileAccess, ownAgent, adGuide, facelessDiy })).map(t => t.name).sort();
      expect(await names("local"), JSON.stringify({ ownAgent, adGuide, facelessDiy })).toEqual(await names("refuse"));
    }
    const full = (await listTools({ fileAccess: "local", ownAgent: true, adGuide: true, facelessDiy: true })).map(t => t.name);
    expect(full).toEqual(expect.arrayContaining(["get_ad_guide", "get_film_guide", "get_film_kit", "check_cut", "create_cut", "render_cut", ...AD_DIY_TOOLS]));
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
