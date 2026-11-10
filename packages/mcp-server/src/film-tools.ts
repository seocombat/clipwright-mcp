import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipwrightApiError, type ClipwrightClient } from "@clipwright/sdk";
import { createFilmDraftInput, filmDraftId, filmHeroInput, filmKitQuery, filmRenderInput, filmStillsInput, filmVoiceInput, putFilmFilesInput, runId,
  type FilmRun } from "@clipwright/core";

import { withFailureReport, type McpToolResponse } from "./format.js";

// The «own agent» explainer's film drafts and runs (#1291 F2, #1337): your agent keeps its scene files here, reads back the frozen brand
// theme, sees its stills as pictures, takes a voice with word timings and orders the render. Listed only where the mode is offered, so the
// public tool list does not change before it launches.

export const CREATE_FILM_DRAFT_DESCRIPTION = "Free. Starts a film draft for an explainer you write yourself, frozen in the account's brand " +
  "(brand_kit): the answer names the kit's colour tokens (T.*), faces (FONT.*) and the variation (grid step, hero side) your scenes draw with. " +
  "mascot_id: the hero (list_assets with mascot true); language: the script's, so a brand face without its letters is not used.";
export const PUT_FILM_FILES_DESCRIPTION = "Free. Saves scene files (Movie.tsx, chapters), anchors in seconds (cues), the sound events (sfx: " +
  "{s, at, dt, n, step, g} or {s, from, to}) and captions (one phrase a line, *word* its accent) on base_revision; a file set to null is " +
  "deleted, an omitted one kept; cues, sfx and captions each replace the draft's when sent, and an omitted one is kept. A stale base_revision is refused: read the draft again. Code imports only react, scene-kit and its own files.";
export const GET_FILM_DRAFT_DESCRIPTION = "Free. A film draft: its revision, frozen theme, file names and sizes, anchors, sounds and captions.";
export const QUOTE_VOICE_DESCRIPTION = "Free. What make_voice would hold for this text: the most it can charge. Show it and wait for the go-ahead.";
export const MAKE_VOICE_DESCRIPTION = "Paid per second delivered, after quote_voice. Speaks the script with a narrator and returns its words, each " +
  "with start and end seconds: write chunks, anchors and scenes on these timings. Waits up to 45 s; an unfinished run names get_film_run to call.";
export const QUOTE_STILLS_DESCRIPTION = "Free. What preview_stills would hold: one still per asked moment.";
export const PREVIEW_STILLS_DESCRIPTION = "Paid per still drawn, after quote_stills. Gates the draft revision first (a refusal names file:line and " +
  "is free), then draws up to 8 moments (anchors, shown 0.25 s after, or seconds) on the draft's theme and the voice's captions, and returns " +
  "them as pictures with what the layout probe found on each. sheet: one tiled picture instead of one per still. Look at every still and fix.";
export const QUOTE_RENDER_DESCRIPTION = "Free. What render_film would hold: the film at the voice's length, charged only when delivered.";
export const RENDER_FILM_DESCRIPTION = "Paid when the film is delivered, after quote_render. Renders the draft revision on the voice: captions " +
  "on its words, the sound events under it, the frozen theme. Returns at once; call get_film_run until it is succeeded (video_url) or failed.";
export const QUOTE_FILM_HERO_DESCRIPTION = "Free. What make_film_hero would hold: every pose of the hero, the most it can charge. Show it and wait for the go-ahead.";
export const MAKE_FILM_HERO_DESCRIPTION = "Paid per pose published, after quote_film_hero. Draws a hero in nine poses and saves it as a mascot of " +
  "your assets: from character_reference or character_details, else invented to fit the meaning of script (or of voice_run_id's text). " +
  "A run that publishes no pose charges nothing. Returns at once; call get_film_run until it is succeeded, then pass hero.mascot_id to " +
  "create_film_draft: every later film uses it with no pose made or charged again.";
export const GET_FILM_RUN_DESCRIPTION = "Free. One stills, voice, render or hero run: its state, credits, warnings and what it delivered. " +
  "Waits up to 45 s for an unfinished run to end; call it again while it is still working.";
export const GET_FILM_GUIDE_DESCRIPTION = "Free. Read this first, before any other film tool: the explainer guide (each step's tool, the rules the " +
  "checks refuse, a whole example film), its method appendix, and the scene kit's files get_film_kit serves.";
export const GET_FILM_KIT_DESCRIPTION = "Free. The scene kit's sources your film imports as scene-kit, with a reference film (films/espresso-hit): " +
  "read index.ts and the reference first, then the drawers whose props you use. path: one file; every file when omitted.";
/** Every other film tool points at the guide, so an agent that starts anywhere reads it first. */
const GUIDE_FIRST = " Read get_film_guide first.";

/** A run is read this often while a tool waits on it, and a tool waits at most this long, inside an agent's usual 60 s timeout. */
export const FILM_POLL_MS = 2_000, FILM_WAIT_MS = 45_000;
const FETCH_TIMEOUT_MS = 10_000;
const finished = (run: FilmRun) => run.state === "succeeded" || run.state === "failed";
const text = (value: unknown) => ({ type: "text" as const, text: JSON.stringify(value) });
const withPoll = (run: FilmRun) => finished(run) ? run : { ...run, poll: { tool: "get_film_run", arguments: { run_id: run.run_id }, retry_after_seconds: 5 } };

/** Reads the run until it ends or the wait is over. */
export async function waitForFilmRun(client: Pick<ClipwrightClient, "getFilmRun">, run: FilmRun, o: { waitMs?: number; pollMs?: number;
  sleep?: (ms: number) => Promise<void> } = {}): Promise<FilmRun> {
  const sleep = o.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))), until = Date.now() + (o.waitMs ?? FILM_WAIT_MS);
  let current = run;
  while (!finished(current) && Date.now() < until) {
    await sleep(o.pollMs ?? FILM_POLL_MS);
    current = await client.getFilmRun(run.run_id);
  }
  return current;
}

/** A delivered stills run as pictures: the sheet when there is one, else each still; a picture that does not load is left out. */
export async function stillImages(run: FilmRun, fetchImpl: typeof fetch = fetch): Promise<{ type: "image"; data: string; mimeType: string }[]> {
  const stills = run.stills;
  if (!stills || run.state !== "succeeded") return [];
  const urls = stills.sheet_url ? [{ url: stills.sheet_url, mimeType: "image/png" }] : stills.frames.map(f => ({ url: f.image_url, mimeType: "image/png" }));
  const loaded = await Promise.all(urls.map(async ({ url, mimeType }) => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      return res.ok ? [{ type: "image" as const, data: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType }] : [];
    } catch {
      return [];
    }
  }));
  return loaded.flat();
}

/** A run's answer: the run, with its pictures when it drew stills. Image blocks, as the analysis read answers them; the shared response type
 *  keeps text-only for every other tool's callers. */
async function runAnswer(run: FilmRun, fetchImpl?: typeof fetch): Promise<McpToolResponse> {
  return { content: [text(withPoll(run)), ...await stillImages(run, fetchImpl)] } as unknown as McpToolResponse;
}

/** How the run tools wait and fetch: the real clock and network unless a test binds its own. */
/** Asks the API whether the mode is open for this key: the guide answers an account it is open to and is refused (4xx) for the rest.
 *  Unreachable or a server fault: no film tools, one stderr line, the server still starts. */
export async function ownAgentOpenFor(client: Pick<ClipwrightClient, "getFilmGuide">, log: (line: string) => void = console.error): Promise<boolean> {
  try {
    await client.getFilmGuide();
    return true;
  } catch (error) {
    if (error instanceof ClipwrightApiError && error.status >= 400 && error.status < 500) return false;
    // Never the error's message: it can echo a request header, the key, or a body with newlines.
    const why = error instanceof ClipwrightApiError ? `HTTP ${error.status}` : "no usable answer";
    log(`clipwright mcp: could not ask whether the film tools are open (${why}); starting without them`);
    return false;
  }
}

/** What a stdio server offers, by the API: the film tools by the guide, the made-for-you explainer by its line on the price list. */
export async function stdioModes(client: Pick<ClipwrightClient, "getFilmGuide" | "listPrices">, log: (line: string) => void = console.error):
  Promise<{ ownAgent: boolean; explainer: boolean }> {
  const explainer = client.listPrices().then(({ prices }) => prices.some(p => p.tool === "make_faceless" && p.variant?.startsWith("explainer") === true),
    () => { log("clipwright mcp: could not read the price list; starting without the explainer offer"); return false; });
  const [ownAgent, sold] = await Promise.all([ownAgentOpenFor(client, log), explainer]);
  return { ownAgent, explainer: sold };
}

export type FilmToolsTiming ={ pollMs?: number; sleep?: (ms: number) => Promise<void>; fetchImpl?: typeof fetch };

export function registerFilmDraftTools(server: McpServer, client: ClipwrightClient, timing: FilmToolsTiming = {}): void {
  const { fetchImpl, ...wait } = timing;
  const waited = async (run: FilmRun) => runAnswer(await waitForFilmRun(client, run, wait), fetchImpl);
  server.registerTool("create_film_draft", {
    title: "Start a film draft",
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: CREATE_FILM_DRAFT_DESCRIPTION + GUIDE_FIRST,
    inputSchema: createFilmDraftInput.shape,
  }, async (input) => withFailureReport(async () => ({ content: [{ type: "text", text: JSON.stringify(await client.createFilmDraft(input)) }] })));
  server.registerTool("put_film_files", {
    title: "Save a film draft's files",
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: PUT_FILM_FILES_DESCRIPTION + GUIDE_FIRST,
    inputSchema: { draft_id: filmDraftId, ...putFilmFilesInput.shape },
  }, async ({ draft_id, ...change }) => withFailureReport(async () => ({
    content: [{ type: "text", text: JSON.stringify(await client.putFilmFiles(draft_id, change)) }] })));
  server.registerTool("get_film_draft", {
    title: "Read a film draft",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_DRAFT_DESCRIPTION + GUIDE_FIRST,
    inputSchema: { draft_id: filmDraftId },
  }, async ({ draft_id }) => withFailureReport(async () => ({ content: [{ type: "text", text: JSON.stringify(await client.getFilmDraft(draft_id)) }] })));

  server.registerTool("quote_voice", { title: "Quote a film voice", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_VOICE_DESCRIPTION + GUIDE_FIRST, inputSchema: filmVoiceInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteVoice(input))] })));
  server.registerTool("make_voice", { title: "Make a film voice", annotations: { readOnlyHint: false, destructiveHint: false },
    description: MAKE_VOICE_DESCRIPTION + GUIDE_FIRST, inputSchema: filmVoiceInput.shape },
  async (input) => withFailureReport(async () => waited(await client.makeVoice(input))));
  server.registerTool("quote_stills", { title: "Quote film stills", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_STILLS_DESCRIPTION + GUIDE_FIRST, inputSchema: filmStillsInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteStills(input))] })));
  server.registerTool("preview_stills", { title: "See film stills", annotations: { readOnlyHint: false, destructiveHint: false },
    description: PREVIEW_STILLS_DESCRIPTION + GUIDE_FIRST, inputSchema: filmStillsInput.shape },
  async (input) => withFailureReport(async () => waited(await client.previewStills(input))));
  server.registerTool("quote_render", { title: "Quote a film render", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_RENDER_DESCRIPTION + GUIDE_FIRST, inputSchema: filmRenderInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteRender(input))] })));
  server.registerTool("render_film", { title: "Render the film", annotations: { readOnlyHint: false, destructiveHint: false },
    description: RENDER_FILM_DESCRIPTION + GUIDE_FIRST, inputSchema: filmRenderInput.shape },
  async (input) => withFailureReport(async () => runAnswer(await client.renderFilm(input), fetchImpl)));
  server.registerTool("quote_film_hero", { title: "Quote a film hero", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_FILM_HERO_DESCRIPTION + GUIDE_FIRST, inputSchema: filmHeroInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteFilmHero(input))] })));
  server.registerTool("make_film_hero", { title: "Make a film hero", annotations: { readOnlyHint: false, destructiveHint: false },
    description: MAKE_FILM_HERO_DESCRIPTION + GUIDE_FIRST, inputSchema: filmHeroInput.shape },
  async (input) => withFailureReport(async () => runAnswer(await client.makeFilmHero(input), fetchImpl)));
  server.registerTool("get_film_run", { title: "Read a film run", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_RUN_DESCRIPTION + GUIDE_FIRST, inputSchema: { run_id: runId } },
  async ({ run_id }) => withFailureReport(async () => waited(await client.getFilmRun(run_id))));
  server.registerTool("get_film_guide", { title: "Read the film guide", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_GUIDE_DESCRIPTION, inputSchema: {} },
  async () => withFailureReport(async () => ({ content: [text(await client.getFilmGuide())] })));
  server.registerTool("get_film_kit", { title: "Read the scene kit", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_KIT_DESCRIPTION + GUIDE_FIRST, inputSchema: filmKitQuery.shape },
  async (query) => withFailureReport(async () => ({ content: [text(await client.getFilmKit(query))] })));
}
