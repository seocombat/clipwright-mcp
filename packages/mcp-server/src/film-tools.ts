import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipwrightApiError, type ClipwrightClient } from "@clipwright/sdk";
import { checkFilmInput, createFilmDraftInput, filmDraftId, filmHeroInput, filmKitQuery, filmRenderInput, filmStillsInput, filmVoiceInput, OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILLS_MAX_PER_CALL,
  OWN_STILLS_SINGLE_MAX, putFilmFilesInput, runId, type FilmRun } from "@clipwright/core";

import { withFailureReport, type McpToolResponse } from "./format.js";
import { fetchImage, IMAGE_BUDGET_MS, type ImageBlock } from "./images.js";

// The «own agent» explainer's film drafts and runs (#1291 F2, #1337): scene files, the frozen brand theme, stills as pictures, a voice with
// word timings and the render. Listed only where the mode is offered.

export const CREATE_FILM_DRAFT_DESCRIPTION = "Free. Starts a film draft for an explainer you write yourself, frozen in the account's brand " +
  "(brand_kit): the answer names the kit's colour tokens (T.*), faces (FONT.*) and the variation (grid step, hero side) your scenes draw with. " +
  "mascot_id: the hero (list_assets with mascot true); language: the script's, so a brand face without its letters is not used.";
export const PUT_FILM_FILES_DESCRIPTION = "Free. Saves scene files (Movie.tsx, chapters), anchors in seconds (cues), the sound events (sfx: " +
  "{s, at, dt, n, step, g} or {s, from, to}) and captions (one phrase a line, *word* its accent) on base_revision; a file set to null is " +
  "deleted, an omitted one kept; cues, sfx and captions each replace the draft's when sent, and an omitted one is kept. A stale base_revision is refused: read the draft again. Code imports only react, scene-kit and its own files.";
export const GET_FILM_DRAFT_DESCRIPTION = "Free. A film draft: its revision, frozen theme, file names and sizes, anchors, sounds and captions.";
export const CHECK_FILM_DESCRIPTION = "Free and instant. Runs the checks stills and render_film run before money on a draft revision and a " +
  "delivered voice: captions on the voice, Movie.tsx's factory, anchors, names and stamps, product pictures, sounds and the storyboard. Answers " +
  "refusals as file:line, warnings, each anchor's second and word, and the voice's end. Pass changes (files, cues, sfx, captions, storyboard) to " +
  "check them before saving. Run it after every change and fix until ok is true; then take stills.";
export const QUOTE_VOICE_DESCRIPTION = "Free. What make_voice would hold for this text: the most it can charge. Show it and wait for the go-ahead.";
export const MAKE_VOICE_DESCRIPTION = "Paid per second delivered, after quote_voice. Speaks the script with a narrator and returns its words, each " +
  "with start and end seconds: write chunks, anchors and scenes on these timings; film_sec is how long the film on it runs. Waits up to 45 s; an " +
  "unfinished run names get_film_run to call.";
export const QUOTE_STILLS_DESCRIPTION = "Free. What preview_stills would hold: one still per asked moment. free_units: how many of them are " +
  `free (the first ${OWN_FREE_STILLS} stills of a draft in any ${OWN_FREE_STILLS_WINDOW_HOURS} h); free_left: the draft's free stills after them; the start counts them again.`;
export const PREVIEW_STILLS_DESCRIPTION = `Free for a draft's first ${OWN_FREE_STILLS} stills in any ${OWN_FREE_STILLS_WINDOW_HOURS} h, then paid ` +
  "per still drawn, after quote_stills and a clean check_film. Gates the draft revision first (a refusal " +
  `names file:line and is free), then draws up to ${OWN_STILLS_MAX_PER_CALL} moments (anchors, shown 0.25 s after, or seconds; omitted, the ` +
  "storyboard's events) on the draft's theme and the voice's captions, and returns them as pictures with what the layout probe found on each. " +
  `sheet: one tiled picture instead of one per still, always above ${OWN_STILLS_SINGLE_MAX}. Look at every still and fix.`;
export const QUOTE_RENDER_DESCRIPTION = "Free. What render_film would hold, charged only when delivered, and film_sec: how long the film " +
  "runs, the voice then a short tail.";
export const RENDER_FILM_DESCRIPTION = "Paid when the film is delivered, after quote_render. Renders the draft revision on the voice: captions " +
  "on its words, the sound events under it, the frozen theme. Returns at once; call get_film_run until it is succeeded (video_url) or failed.";
export const QUOTE_FILM_HERO_DESCRIPTION = "Free. What make_film_hero would hold: every pose of the hero (with mascot_id, every pose the mascot " +
  "lacks), the most it can charge. Show it and wait for the go-ahead.";
export const MAKE_FILM_HERO_DESCRIPTION = "Paid per pose published, after quote_film_hero. Draws a hero in nine poses and saves it as a mascot of " +
  "your assets: from character_reference or character_details, else invented to fit the meaning of script (or of voice_run_id's text). " +
  "With mascot_id alone, completes that saved mascot instead: only the poses it lacks are drawn, in its look, and added to it. " +
  "A person's photo is drawn as a cartoon unless character_details ask for a photoreal look; a photoreal hero keeps a still face. " +
  "A run that publishes no pose charges nothing. Returns at once; call get_film_run until it is succeeded: it shows the poses as one picture, " +
  "look at it before any stills. Then pass hero.mascot_id to create_film_draft: every later film uses it with no pose made or charged again.";
export const GET_FILM_RUN_DESCRIPTION = "Free. One stills, voice, render or hero run: its state, credits, warnings and what it delivered. " +
  "Waits up to 45 s for an unfinished run to end; call it again while it is still working. A delivered stills run answers its " +
  "pictures again, at no charge.";
export const GET_FILM_GUIDE_DESCRIPTION = "Free. Read this first, before any other film tool: the explainer guide (each step's tool, the rules the " +
  "checks refuse, a whole example film), its method appendix, and the scene kit's files get_film_kit serves.";
export const GET_FILM_KIT_DESCRIPTION = "Free. The scene kit's sources your film imports as scene-kit, with a reference film (films/espresso-hit): " +
  "read index.ts and the reference first, then the drawers whose props you use. path: one file; every file when omitted.";
/** Every other film tool points at the guide, so an agent that starts anywhere reads it first. */
const GUIDE_FIRST = " Read get_film_guide first.";

/** A run is read this often while a tool waits on it, and a tool waits at most this long, inside an agent's usual 60 s timeout. */
export const FILM_POLL_MS = 2_000, FILM_WAIT_MS = 45_000;
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

/** A delivered run as pictures: a stills run's sheet when there is one or above OWN_STILLS_SINGLE_MAX stills, else each still; a delivered
 *  hero as its pose sheet (#1371). `note` says what did not come as a picture; the run's text keeps every link and finding either way (#1372). */
export async function stillPictures(run: FilmRun, fetchImpl?: typeof fetch): Promise<{ images: ImageBlock[]; note: string | null }> {
  if (run.state !== "succeeded") return { images: [], note: null };
  const stills = run.stills, heroSheet = run.hero?.sheet_url;
  if (!stills) {
    if (!heroSheet) return { images: [], note: null };
    const image = await fetchImage(heroSheet, { ...(fetchImpl ? { fetchImpl } : {}), deadline: Date.now() + IMAGE_BUDGET_MS });
    return image ? { images: [image], note: null }
      : { images: [], note: "The pose sheet did not load: call get_film_run with this run_id to read it again, at no charge." };
  }
  const many = stills.frames.length > OWN_STILLS_SINGLE_MAX;
  if (many && !stills.sheet_url) return { images: [], note: `These ${stills.frames.length} stills have no sheet, so none is sent as a picture: ` +
    "open each image_url." };
  const urls = stills.sheet_url ? [stills.sheet_url] : stills.frames.map(f => f.image_url), deadline = Date.now() + IMAGE_BUDGET_MS;
  const images = (await Promise.all(urls.map(url => fetchImage(url, { ...(fetchImpl ? { fetchImpl } : {}), deadline })))).filter(i => i !== null);
  if (images.length === urls.length) return { images, note: null };
  const what = stills.sheet_url ? "The sheet did not load" : `${urls.length - images.length} of ${urls.length} stills did not load`;
  return { images, note: `${what}: call get_film_run with this run_id to read the pictures again, at no charge.` };
}

/** A run's answer: the run, with its pictures when it drew stills. Image blocks, as the analysis read answers them; the shared response type
 *  keeps text-only for every other tool's callers. */
async function runAnswer(run: FilmRun, fetchImpl?: typeof fetch): Promise<McpToolResponse> {
  const { images, note } = await stillPictures(run, fetchImpl);
  return { content: [text({ ...withPoll(run), ...(note ? { pictures: note } : {}) }), ...images] } as unknown as McpToolResponse;
}

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
  server.registerTool("check_film", {
    title: "Check a film draft",
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: CHECK_FILM_DESCRIPTION + GUIDE_FIRST,
    inputSchema: { draft_id: filmDraftId, ...checkFilmInput.shape },
  }, async ({ draft_id, ...request }) => withFailureReport(async () => ({ content: [text(await client.checkFilm(draft_id, request))] })));

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
