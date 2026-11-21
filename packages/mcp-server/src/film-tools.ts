import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipwrightApiError, type ClipwrightClient } from "@clipwright/sdk";
import { adId, createAdInput, updateAdInput, agentRetryShape, checkFilmInput, createFilmDraftInput, filmCutInput, filmDraftId, filmEditInput, filmHeroInput, OWN_EDIT_MAX_SECONDS, TAKE_CHECK_PROMPT_MAX_CHARS, TAKE_FRAMES_PER_HOUR, filmGuideQuery, filmKitQuery, filmRenderInput, filmStillsInput, filmVoiceInput, OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILLS_MAX_PER_CALL,
  OWN_STILLS_SINGLE_MAX, putFilmFilesInput, runId, takeCheckInput, takeFramesInput, type FilmRun, filmCutRunInput, OWN_CUT_INCLUDED_SECONDS,
  OWN_CUT_MAX_NEW_SOUNDS, OWN_CUT_MAX_SECONDS, OWN_CUT_MIN_SECONDS, type TakeCheckRequest, createCutInput, CUT_MAX_QUIET_SEC, CUT_PREVIEW_MAX_STILLS,
  cutId, filmCutPreviewInput, guideModesOf, HERO_RUNS_PER_HOUR, OWN_HERO_FREE_POSES_PER_DAY, OWN_HERO_FREE_POSES_WINDOW_HOURS, updateCutInput } from "@clipwright/core";

import { withFailureReport, type McpToolResponse } from "./format.js";
import { fetchImage, IMAGE_BUDGET_MS, type ImageBlock } from "./images.js";
import type { CreateServerOptions } from "./server.js";

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
/** A faceless voice's record, told only where faceless DIY is on. */
export const MAKE_VOICE_CUT_DESCRIPTION = " For a faceless video, pass its cut_id (create_cut): the record takes the voice, and the delivered " +
  "voice answers next: the record's next call.";
export const QUOTE_STILLS_DESCRIPTION = "Free. What preview_stills would hold: one still per asked moment. free_units: how many of them are " +
  `free (the first ${OWN_FREE_STILLS} stills of a draft in any ${OWN_FREE_STILLS_WINDOW_HOURS} h); free_left: the draft's free stills after them; the start counts them again.`;
export const PREVIEW_STILLS_DESCRIPTION = `Free for a draft's first ${OWN_FREE_STILLS} stills in any ${OWN_FREE_STILLS_WINDOW_HOURS} h, then paid ` +
  "per still drawn, after quote_stills and a clean check_film. Gates the draft revision first (a refusal " +
  `names file:line and is free), then draws up to ${OWN_STILLS_MAX_PER_CALL} moments (anchors, shown 0.25 s after, or seconds; omitted, the ` +
  "storyboard's events) on the draft's theme and the voice's captions, and returns them as pictures with what the layout probe found on each. " +
  `sheet: one tiled picture instead of one per still, always above ${OWN_STILLS_SINGLE_MAX}. Look at every still and fix.`;
export const QUOTE_RENDER_DESCRIPTION = "Free. What render_film would hold, charged only when delivered, and film_sec: how long the film " +
  "runs, the voice then a short tail. With music.generate, lines show the film and the music apart.";
export const RENDER_FILM_DESCRIPTION = "Paid when the film is delivered, after quote_render. Renders the draft revision on the voice: captions " +
  "on its words, the sound events under it, the frozen theme, and music if asked: a library track (free) or one made for the film (charged " +
  "only when the delivered film carries it), lower under the voice. Returns at once; call get_film_run until it is succeeded (video_url) or failed.";
export const QUOTE_FILM_HERO_DESCRIPTION = "Free. What make_film_hero would hold: every pose of the hero (with mascot_id, every pose the mascot " +
  "lacks), the most it can charge. Show it and wait for the go-ahead.";
export const MAKE_FILM_HERO_DESCRIPTION = "Paid per pose published (a head: once, saved whole), after quote_film_hero; a drawn pose whose face shows but whose mouth cannot move with the voice is " +
  "published with a warning and not charged (a pose with no face to animate is charged). At most " + HERO_RUNS_PER_HOUR + " heroes an hour, and none while the " +
  "account has received " + OWN_HERO_FREE_POSES_PER_DAY + " such uncharged poses in the last " + OWN_HERO_FREE_POSES_WINDOW_HOURS + " hours. Draws a hero in nine poses and saves it as a mascot of " +
  "your assets: from character_reference or character_details, else invented to fit the meaning of script (or of voice_run_id's text). " +
  "With mascot_id alone, completes that saved mascot instead: only the poses it lacks are drawn, in its look, and added to it. " +
  "A person's photo is drawn as a cartoon unless character_details ask for a photoreal look; a photoreal hero keeps a still face. " +
  "A run that publishes no pose charges nothing. Returns at once; call get_film_run until it is succeeded: it shows the poses as one picture, " +
  "look at it before any stills. Then pass hero.mascot_id to create_film_draft: every later film uses it with no pose made or charged again.";
export const CREATE_AD_DESCRIPTION = "Free. Starts the ad's record once the script and shot list are written: brief (product, audience, " +
  "message, notes with the product page's facts) and slots, one per shot in cut order ({ id: \"hook\", shot: \"what it shows and the line it " +
  "carries\" }). Pass its ad_id and a slot to check_take when you check a take, and ad_id to render_edit with each clip's slot. " +
  "people_only: true marks a shot with no product, label or detail in any frame. " +
  "Mistakes to avoid: one slot for two shots; a new record per take; slot ids you will not reuse.";
export const UPDATE_AD_DESCRIPTION = "Free. Replaces the record's brief, its slots or both. slots is the whole shot list again, not a patch: send " +
  "every slot you keep. Mistakes to avoid: dropping a slot that has checked takes (refused; reword it instead); a new record when the shot " +
  "list grows.";
export const GET_AD_DESCRIPTION = "Free. The ad record: each slot's state (no_take, checking, failed, passed), read from its check_take " +
  "verdicts only, its checked takes with every verdict, the edits, and next: the edit with each slot's latest take that passed on its longest " +
  "clean window, and the slots still to fill with takes you judged on take_frames. passed: own footage, or the latest verdict on the take's " +
  "file passed. The check is optional: render_edit cuts any take and says a verdict in warnings. " +
  "Mistakes to avoid: guessing windows when next already has them.";
export const QUOTE_EDIT_DESCRIPTION = "Free. What render_edit would hold for this edit list, and film_sec: how long the cut runs. Checks every " +
  "clip, window, voice piece and caption first and names what is wrong; a check_take verdict on a clip's file, when there is one, is said in " +
  "warnings (a failed verdict, a window across a defect or past the clean windows). With music.generate, lines show " +
  "the cut and the music apart. Answers next: render_edit with the same arguments. Show it and wait for the go-ahead. Mistakes to avoid: " +
  "from and to in the edit's seconds (they are the clip's own); captions in the clip's seconds " +
  "(they are the edit's); a window that keeps an empty first frame or leaves the take's clean windows; a voice that runs past the cut; " +
  "music.at in a clip's seconds (it is the edit's).";
export const RENDER_EDIT_DESCRIPTION = "Paid once per delivered cut, after quote_edit. Cuts windows of your own delivered generate_video clips " +
  "(run_id) or video assets (asset_id) back to back, holds the last frame for hold seconds, lays the make_voice take (whole at voice.at, or " +
  "its sentences as voice.pieces on the seconds their pictures start), plays a clip's own sound where it has sound: true (a clip made with " +
  "audio: true, never under the voice's words), lays music if asked and burns in captions: one vertical 9:16 720p " +
  `MP4 at 25 fps, up to ${OWN_EDIT_MAX_SECONDS} s. music is a library track (free) or one made for the cut (charged only when the delivered ` +
  "cut carries it); it plays from music.at to the end, lower under the voice. A clip up to 3% off 9:16 is cropped to fill it; one further off is shown whole with bars; warnings name each. An " +
  "edit that fails costs nothing. Returns at once; call get_film_run until it is succeeded (video_url) or failed. Read each take you made " +
  "on take_frames (free) before you cut it; check_take is optional, worth it on a product shot or when the user asks, and a verdict on a " +
  "clip's file is said in warnings. With ad_id every clip names its slot. Mistakes to avoid: rendering without the quote's go-ahead; cutting " +
  "a take you have not looked at; changing the arguments between quote and render; expecting a zoom (it " +
  "has none); music under a voice-led ad at volume above -6; a music-only cut without music; a caption over the product, its print, the " +
  "hands or the face.";
export const TAKE_FRAMES_DESCRIPTION = "Free. Your generate_video clip (run_id) or video asset (asset_id) as contact sheets: frames at fps (8 to " +
  "read the whole take, 12 to 24 on a contact), each labelled with its second, 8 to a row, at most 96 frames a call and " +
  `${TAKE_FRAMES_PER_HOUR} calls an hour. from and to narrow the ` +
  "seconds; crop (x, y, w, h, shares of the frame) enlarges one part, such as a hand on the product. Look at every frame: a hand that passes " +
  "through the product, a lid that lifts before it is touched, a product that changes shape. shots: the stretches between cuts and whips in " +
  "these seconds, each with its subject motion, camera move and camera shake (run it on a reference reel saved as a video asset to measure " +
  "its energy shot by shot). Waits up to 45 s and returns the sheets as pictures. This is your own look before a cut; check_take, paid, " +
  "judges a product shot or a take the user wants checked. Mistakes to avoid: calling a take clean from 8 fps alone (read each contact " +
  "again at 12 to 24 fps with a crop); calling a moment no frame shows clean; checking the thumbnail instead of every frame.";
export const QUOTE_TAKE_CHECK_DESCRIPTION = "Free. What check_take would hold for this clip, and next: check_take with the same arguments. " +
  "Show it and wait for the go-ahead. Mistakes to avoid: leaving out ad_id and slot when the take is for an ad record (its verdict then does " +
  "not join the record).";
export const CHECK_TAKE_DESCRIPTION = "Paid per delivered verdict, after quote_take_check. Judges your generate_video clip (run_id) or video " +
  "asset (asset_id) frame by frame against direction, the shot's part of the prompt you made it with (up to 1500 characters): each defect with its code, the seconds it shows, its " +
  "repair level (asset: a new first frame or reference; action: the prompt's steps; camera: the framing; roll: the same prompt again) and " +
  "whole_take when it cannot be cut out, then clean: the windows without defects, 0.5 s or longer, to cut from. A take with its own sound is " +
  "also heard: a voice that does not fit the person on screen who speaks is VOICE_MISMATCH, a fault of its sound that leaves the clean " +
  "windows as they are; render_edit then cuts the take only silent (no sound: true). product_image: the product as it " +
  "really is, a link or { run_id } of your generate_image picture, { upload_id } or { asset_id }; moves: the seconds a hand meets the product, looked at first. ad_id and slot: the verdict joins that slot of the ad record. " +
  "format: fashion (people and clothes in motion) or product (a product in the hands, the default); motion, free, measures the take and each " +
  "clean window as subject motion (the camera's own move taken out), camera move and camera shake, names a window too static for this format " +
  "and names shake on its own: advice to re-shoot, not a defect, so it never fails the take; only a take in which nothing moves at all fails, " +
  "with FROZEN_TAKE. " +
  "With speed: true a take up to 30 s is also read for speed: something hanging or drifting in the air (a salt flake, a drop, a flame rising " +
  "slowly) is SLOW_MOTION with its seconds in why; it neither fails the take nor narrows the clean windows, so cut it, make the take again or " +
  "keep it where a slow beat suits the shot. " +
  "The check is optional: render_edit and render_cut cut any take and say a verdict on its file in warnings. A " +
  "check that delivers no verdict costs nothing. Waits up to 45 s; an unfinished run names get_film_run to call. A passed take answers next (the record, or " +
  "the edit on its clean window); a failed one answers next: the take's own generate_video request to repair. " +
  "Mistakes to avoid: the whole prompt with its shared prefix as direction (send the shot's action and timeline); no product_image for a " +
  "labelled product; cutting around a whole_take defect; repeating the same request for an action or asset fault.";
/** The faceless picture mode, told only where faceless DIY is on. */
export const CHECK_TAKE_PICTURE_DESCRIPTION = " For a faceless take, against picture judges it against the picture it was made from: direction is " +
  "{ start, changes: [{ at_s, cause, result }], camera, end, locks }, look { words, palette } names the colours it keeps; picture is needed " +
  "only for a take made without a first frame. Its verdict adds action_at_s (put the beat's take.action_s there) and subject (the box a push " +
  "closes on); a colour outside the look is advice only. Against a picture, cut_id (create_cut) and slot are required: the record's slot that " +
  "needs this take; a picture, card or footage slot takes no check. A passed take answers next: get_cut, which names what the record still " +
  "needs. The quote says what it costs.";
export const GET_FILM_RUN_DESCRIPTION = "Free. One stills, voice, render, edit, hero, take frames or take check run: its state, credits, warnings and what it delivered. " +
  "Waits up to 45 s for an unfinished run to end; call it again while it is still working. A delivered stills run answers its " +
  "pictures again, at no charge.";
export const GET_FILM_GUIDE_DESCRIPTION = "Free. Read this first, before any other film tool: the explainer guide (each step's tool, the rules the " +
  "checks refuse, a whole example film), its method appendix, and the scene kit's files get_film_kit serves.";
export const GET_FILM_KIT_DESCRIPTION = "Free. The scene kit's sources your film imports as scene-kit, with a reference film (films/espresso-hit): " +
  "read index.ts and the reference first, then the drawers whose props you use. path: one file a call; without it, the list of files.";
/** The faceless formats the guide also teaches, said only where they are served. */
export const FACELESS_GUIDE_FORMATS = " format: story, list, own_pictures or cartoon reads how to make that faceless video yourself from " +
  "make_voice, generate_image and generate_video instead; section reads one part of it (steps first). version: the whole guide's version, " +
  "the same for every section; a cut record keeps the one it was made under.";
export const QUOTE_CUT_DESCRIPTION = "Free. What render_cut would hold for this cut sheet, line by line in items (the cut, seconds over " +
  `${OWN_CUT_INCLUDED_SECONDS}, a described bed, takes' own sound, music), and film_sec: how long it runs. Checks the sheet as check_cut does ` +
  "and names what is wrong by field path. cut_id names the cut record the video belongs to; a record that is not yours is refused (404 " +
  "cut_not_found). Show it and wait for the go-ahead.";
export const RENDER_CUT_DESCRIPTION = "Paid once per delivered video, after quote_cut. Renders a cut sheet check_cut passed, of the cut record " +
  "cut_id: each beat's picture, " +
  "held frame or take window on its words with its camera move and punch-ins, cards, outlines and captions with their accents; the voice " +
  "centred in stereo with the bed, hits and effects under it, a take's own sound where take_sound lists it, and music when asked. One " +
  `vertical 9:16 720p MP4 at 25 fps, ${OWN_CUT_MIN_SECONDS} to ${OWN_CUT_MAX_SECONDS} s, with up to ${OWN_CUT_MAX_NEW_SOUNDS} described sounds made. A part that ` +
  "could not be made is left out and not charged; a cut that fails costs nothing. A take's check against its picture is optional; a " +
  "verdict on its file is said in warnings. Returns at once; " +
  "call get_film_run until it is succeeded (video_url) or failed; get_cut lists the render too.";
export const CHECK_CUT_DESCRIPTION ="Free and instant. Checks a faceless cut sheet (story, list, own_pictures or cartoon) against your " +
  "make_voice words and your own pictures, held frames and generate_video takes: every source yours, delivered and within 15% of 9:16; the " +
  "beats covering the words in order; nothing on screen still for over half a second; each take long enough for its beat. Answers ok, " +
  "refusals by field path, advice (keep a choice with overrides and its why), warnings and the planned shots with each take's window. A " +
  `stretch over ${CUT_MAX_QUIET_SEC} s of pictures, held frames or cards with nothing landing is refused unless each beat in it names its hold. ` +
  "cut_id: the cut record the sheet belongs to; a passed sheet then answers next: quote_cut_preview, and without it next: create_cut. Run " +
  "it after every change until ok is true. Mistakes to avoid: pairing pictures by the order they came in instead of by what they show, " +
  "playing a take past the second it leaves its picture, and holding a frame still where a picture with a camera move is meant.";
export const CREATE_CUT_DESCRIPTION = "Free. Starts the faceless video's cut record once the script is approved: brief (format, topic, look, " +
  "language, script, voice_run_id, notes) and slots, the shot plan in order, one per shot ({ id: \"lamp\", needs: take, picture, card or " +
  "footage, shot: \"what it shows and the words it plays on\" }). take is a clip you make with generate_video from its picture; " +
  "footage is the user's own video. Pass its cut_id to make_voice, to the take checks with a take slot, and to the " +
  "previews and the render: each names the record, and the record answers next: the call to make now. Mistakes to avoid: a picture or card " +
  "slot for a take; a footage slot for a clip made with generate_video; a new record per take.";
export const UPDATE_CUT_DESCRIPTION = "Free. Replaces the record's brief, its slots or both. slots is the whole shot plan again, not a patch: " +
  "send every slot you keep. The guide version stays the one the record was made under. Mistakes to avoid: dropping a slot that has checked " +
  "takes, or making it a picture, card or footage slot (refused with 409; reword its shot instead).";
export const GET_CUT_DESCRIPTION = "Free. The cut record: the brief, the guide version it was made under, the voice, each slot with its state " +
  "(take slots: no_take, checking, failed or passed, with every check_take verdict; other slots: none), the previews and renders, and next: " +
  "the call to make now with its arguments (the voice, then check_cut on a sheet with the voice's sentences as beats). A take's check is " +
  "optional and never blocks the video. Mistakes to avoid: working from memory instead of next.";
export const QUOTE_CUT_PREVIEW_DESCRIPTION = "Free. What preview_cut would hold: one still per asked word. free_units: how many of them are free " +
  `(an account's first ${OWN_FREE_STILLS} stills in any ${OWN_FREE_STILLS_WINDOW_HOURS} h, across its cut records); free_left: the free stills ` +
  "after them; the start counts them again. Checks the sheet as check_cut does and names what is wrong by field path; a take need not " +
  "have passed its check yet. Show it and wait for the go-ahead. Mistakes to avoid: quoting a sheet check_cut still refuses.";
export const PREVIEW_CUT_DESCRIPTION = `Free for an account's first ${OWN_FREE_STILLS} stills in any ${OWN_FREE_STILLS_WINDOW_HOURS} h, across ` +
  "its cut records, then paid per still drawn, after quote_cut_preview and a clean check_cut. Draws up to " +
  `${CUT_PREVIEW_MAX_STILLS} stills of the cut sheet of the record cut_id, each the frame just after an asked word starts (at: word indexes ` +
  "of the voice), with the picture, take or card, its camera move, punch-ins, outlines, event text and captions as render_cut draws them, " +
  "and returns them as pictures. Look at every still and fix the sheet before quote_cut. A preview that draws nothing costs nothing. " +
  "Waits up to 45 s; an unfinished run names get_film_run to call. Mistakes to avoid: previewing before check_cut has no refusals; asking " +
  "every word instead of the accents, the events and each beat's first word.";
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
  if (run.take_frames) {
    const urls = run.take_frames.sheets.map(sheet => sheet.image_url), { images, loaded, over } = await inlined(urls, fetchImpl);
    if (over) return { images, note: `${over} of ${urls.length} sheets are past one answer's picture size, so they come as links: open the ` +
      `image_url of each sheet after the first ${images.length}.` };
    return { images, note: loaded === urls.length ? null : `${urls.length - loaded} of ${urls.length} sheets did not load: call ` +
      "get_film_run with this run_id to read them again, at no charge." };
  }
  const stills = run.stills, heroSheet = run.hero?.sheet_url;
  if (!stills) {
    if (!heroSheet) return { images: [], note: null };
    const { images, over } = await inlined([heroSheet], fetchImpl);
    return images.length ? { images, note: null } : { images: [], note: over ? "The pose sheet is past one answer's picture size: open its sheet_url."
      : "The pose sheet did not load: call get_film_run with this run_id to read it again, at no charge." };
  }
  const many = stills.frames.length > OWN_STILLS_SINGLE_MAX;
  if (many && !stills.sheet_url) return { images: [], note: `These ${stills.frames.length} stills have no sheet, so none is sent as a picture: ` +
    "open each image_url." };
  const urls = stills.sheet_url ? [stills.sheet_url] : stills.frames.map(f => f.image_url), { images, loaded, over } = await inlined(urls, fetchImpl);
  if (over) return { images, note: stills.sheet_url ? "The sheet is past one answer's picture size: open its sheet_url." : `${over} of ` +
    `${urls.length} stills are past one answer's picture size, so they come as links: open the image_url of each still after the first ${images.length}.` };
  if (loaded === urls.length) return { images, note: null };
  const what = stills.sheet_url ? "The sheet did not load" : `${urls.length - loaded} of ${urls.length} stills did not load`;
  return { images, note: `${what}: call get_film_run with this run_id to read the pictures again, at no charge.` };
}

/** The most base64 one answer's pictures carry (#1758): an MCP client drops an answer over 16 MB, so the text and a margin stay under it. */
export const FILM_INLINE_IMAGES_MAX_CHARS = 12_000_000;

/** The pictures in order while their base64 fits FILM_INLINE_IMAGES_MAX_CHARS; `over` counts the loaded ones past it, sent as links. */
async function inlined(urls: readonly string[], fetchImpl?: typeof fetch): Promise<{ images: ImageBlock[]; loaded: number; over: number }> {
  const deadline = Date.now() + IMAGE_BUDGET_MS;
  const fetched = (await Promise.all(urls.map(url => fetchImage(url, { ...(fetchImpl ? { fetchImpl } : {}), deadline })))).filter(i => i !== null);
  const images: ImageBlock[] = [];
  let chars = 0;
  for (const image of fetched) {
    if (chars + image.data.length > FILM_INLINE_IMAGES_MAX_CHARS) break;
    chars += image.data.length;
    images.push(image);
  }
  return { images, loaded: fetched.length, over: fetched.length - images.length };
}

/** A run's answer: the run, with its pictures when it drew stills. Image blocks, as the analysis read answers them; the shared response type
 *  keeps text-only for every other tool's callers. */
async function runAnswer(run: FilmRun, fetchImpl?: typeof fetch): Promise<McpToolResponse> {
  const { images, note } = await stillPictures(run, fetchImpl);
  return { content: [text({ ...withPoll(run), ...(note ? { pictures: note } : {}) }), ...images] } as unknown as McpToolResponse;
}

/** A guide's answer; `closed` where the API refuses it (4xx) to this key. Unreachable or a server fault: `failed` and one stderr line
 *  naming `what`, and the server still starts without those tools. */
async function guideAnswer<T>(read: () => Promise<T>, what: string, log: (line: string) => void): Promise<{ answer: T } | "closed" | "failed"> {
  try {
    return { answer: await read() };
  } catch (error) {
    if (error instanceof ClipwrightApiError && error.status >= 400 && error.status < 500) return "closed";
    // Never the error's message: it can echo a request header, the key, or a body with newlines.
    const why = error instanceof ClipwrightApiError ? `HTTP ${error.status}` : "no usable answer";
    log(`clipwright mcp: could not ask whether the ${what} tools are open (${why}); starting without them`);
    return "failed";
  }
}

/** Asks the API whether the mode is open for this key: the guide answers an account it is open to and is refused for the rest. */
export async function ownAgentOpenFor(client: Pick<ClipwrightClient, "getFilmGuide">, log: (line: string) => void = console.error): Promise<boolean> {
  return typeof await guideAnswer(() => client.getFilmGuide(), "film", log) === "object";
}

/** What a stdio server offers, by the API, so it lists what the hosted server lists for the same account: the film tools by the guide, the
 *  ad and faceless tools by the guide's catalog, the made-for-you explainer by its line on the price list. Every option is set. */
export async function stdioModes(client: Pick<ClipwrightClient, "getFilmGuide" | "getAdGuide" | "listPrices">,
  log: (line: string) => void = console.error): Promise<Required<Omit<CreateServerOptions, "fileAccess">>> {
  const explainer = client.listPrices().then(({ prices }) => prices.some(p => p.tool === "make_faceless" && p.variant?.startsWith("explainer") === true),
    () => { log("clipwright mcp: could not read the price list; starting without the explainer offer"); return false; });
  const [film, sold] = await Promise.all([guideAnswer(() => client.getFilmGuide(), "film", log), explainer]);
  const guides = typeof film === "object" ? film.answer.guides : undefined, { adGuide, facelessDiy } = guideModesOf(guides);
  // The ad guide is listed alone where the film tools are closed, or where the API names no catalog: then it is asked on its own. An API
  // that failed is not asked again, so a hung one delays the start once.
  const adOpen = guides !== undefined ? adGuide
    : film !== "failed" && typeof await guideAnswer(() => client.getAdGuide({ section: "ugc" }), "ad", log) === "object";
  return { ownAgent: typeof film === "object", explainer: sold, adGuide: adOpen, facelessDiy };
}

/** The same arguments and attempt are the same run, a failed one too: a repeat needs its own attempt. */
const REPEAT_RUN = " The same arguments and attempt return the run already started, whatever its state; to repeat a failed run, pass attempt + 1 (attempt 2 after the first), which starts a new run, charged as its quote says.";

export type FilmToolsTiming ={ pollMs?: number; sleep?: (ms: number) => Promise<void>; fetchImpl?: typeof fetch };

/** The ad tools a customer's own agent cuts and audits takes with, listed only where get_ad_guide is (the ad epic's accounts). */
export const AD_DIY_TOOLS = ["create_ad", "update_ad", "get_ad", "quote_edit", "render_edit", "take_frames", "quote_take_check", "check_take"] as const;

/** `adDiy`: list the ad tools too (AD_DIY_TOOLS); off, the film tools stay as they were. */
export function registerFilmDraftTools(server: McpServer, client: ClipwrightClient, timing: FilmToolsTiming = {}, adDiy = false,
  facelessDiy = false): void {
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

  // A cut record is the faceless DIY mode's: without it, a voice names none.
  const { cut_id: _cut, ...explainerVoice } = filmVoiceInput.shape;
  const voiceShape = (facelessDiy ? filmVoiceInput.shape : explainerVoice) as typeof filmVoiceInput.shape;
  server.registerTool("quote_voice", { title: "Quote a film voice", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_VOICE_DESCRIPTION + GUIDE_FIRST, inputSchema: voiceShape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteVoice(input))] })));
  server.registerTool("make_voice", { title: "Make a film voice", annotations: { readOnlyHint: false, destructiveHint: false },
    description: MAKE_VOICE_DESCRIPTION + (facelessDiy ? MAKE_VOICE_CUT_DESCRIPTION : "") + REPEAT_RUN + GUIDE_FIRST,
    inputSchema: { ...voiceShape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => waited(await client.makeVoice(input, { attempt }))));
  server.registerTool("quote_stills", { title: "Quote film stills", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_STILLS_DESCRIPTION + GUIDE_FIRST, inputSchema: filmStillsInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteStills(input))] })));
  server.registerTool("preview_stills", { title: "See film stills", annotations: { readOnlyHint: false, destructiveHint: false },
    description: PREVIEW_STILLS_DESCRIPTION + REPEAT_RUN + GUIDE_FIRST, inputSchema: { ...filmStillsInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => waited(await client.previewStills(input, { attempt }))));
  server.registerTool("quote_render", { title: "Quote a film render", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_RENDER_DESCRIPTION + GUIDE_FIRST, inputSchema: filmRenderInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteRender(input))] })));
  server.registerTool("render_film", { title: "Render the film", annotations: { readOnlyHint: false, destructiveHint: false },
    description: RENDER_FILM_DESCRIPTION + REPEAT_RUN + GUIDE_FIRST, inputSchema: { ...filmRenderInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => runAnswer(await client.renderFilm(input, { attempt }), fetchImpl)));
  server.registerTool("quote_film_hero", { title: "Quote a film hero", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_FILM_HERO_DESCRIPTION + GUIDE_FIRST, inputSchema: filmHeroInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteFilmHero(input))] })));
  server.registerTool("make_film_hero", { title: "Make a film hero", annotations: { readOnlyHint: false, destructiveHint: false },
    description: MAKE_FILM_HERO_DESCRIPTION + REPEAT_RUN + GUIDE_FIRST, inputSchema: { ...filmHeroInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => runAnswer(await client.makeFilmHero(input, { attempt }), fetchImpl)));
  if (adDiy) registerAdDiyTools(server, client, waited, fetchImpl);
  if (adDiy || facelessDiy) registerTakeTools(server, client, waited, facelessDiy);
  if (facelessDiy) {
    server.registerTool("quote_cut", { title: "Quote a faceless cut", annotations: { readOnlyHint: true, destructiveHint: false },
      description: QUOTE_CUT_DESCRIPTION + GUIDE_FIRST, inputSchema: filmCutRunInput.shape },
    async (input) => withFailureReport(async () => ({ content: [text(await client.quoteCut(input))] })));
    server.registerTool("render_cut", { title: "Render a faceless cut", annotations: { readOnlyHint: false, destructiveHint: false },
      description: RENDER_CUT_DESCRIPTION + REPEAT_RUN + GUIDE_FIRST, inputSchema: { ...filmCutRunInput.shape, ...agentRetryShape } },
    async ({ attempt, ...input }) => withFailureReport(async () => runAnswer(await client.renderCut(input, { attempt }), fetchImpl)));
    registerCutRecordTools(server, client, waited);
  }
  server.registerTool("get_film_run", { title: "Read a film run", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_RUN_DESCRIPTION + GUIDE_FIRST, inputSchema: { run_id: runId } },
  async ({ run_id }) => withFailureReport(async () => waited(await client.getFilmRun(run_id))));
  registerFilmGuideTools(server, client, facelessDiy);
}

function registerAdDiyTools(server: McpServer, client: ClipwrightClient, waited: (run: FilmRun) => Promise<McpToolResponse>, fetchImpl?: typeof fetch): void {
  server.registerTool("create_ad", { title: "Start an ad record", annotations: { readOnlyHint: false, destructiveHint: false },
    description: CREATE_AD_DESCRIPTION, inputSchema: createAdInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.createAd(input))] })));
  server.registerTool("update_ad", { title: "Change an ad record", annotations: { readOnlyHint: false, destructiveHint: false },
    description: UPDATE_AD_DESCRIPTION, inputSchema: { ad_id: adId, ...updateAdInput.shape } },
  async ({ ad_id, ...change }) => withFailureReport(async () => ({ content: [text(await client.updateAd(ad_id, change))] })));
  server.registerTool("get_ad", { title: "Read an ad record", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_AD_DESCRIPTION, inputSchema: { ad_id: adId } },
  async ({ ad_id }) => withFailureReport(async () => ({ content: [text(await client.getAd(ad_id))] })));
  server.registerTool("quote_edit", { title: "Quote an edit", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_EDIT_DESCRIPTION, inputSchema: filmEditInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteEdit(input))] })));
  server.registerTool("render_edit", { title: "Render an edit", annotations: { readOnlyHint: false, destructiveHint: false },
    description: RENDER_EDIT_DESCRIPTION + REPEAT_RUN, inputSchema: { ...filmEditInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => runAnswer(await client.renderEdit(input, { attempt }), fetchImpl)));
}

/** The cut record and its previews, in the faceless DIY mode. */
function registerCutRecordTools(server: McpServer, client: ClipwrightClient, waited: (run: FilmRun) => Promise<McpToolResponse>): void {
  server.registerTool("create_cut", { title: "Start a cut record", annotations: { readOnlyHint: false, destructiveHint: false },
    description: CREATE_CUT_DESCRIPTION + GUIDE_FIRST, inputSchema: createCutInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.createCut(input))] })));
  server.registerTool("update_cut", { title: "Change a cut record", annotations: { readOnlyHint: false, destructiveHint: false },
    description: UPDATE_CUT_DESCRIPTION + GUIDE_FIRST, inputSchema: { cut_id: cutId, ...updateCutInput.shape } },
  async ({ cut_id, ...change }) => withFailureReport(async () => ({ content: [text(await client.updateCut(cut_id, change))] })));
  server.registerTool("get_cut", { title: "Read a cut record", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_CUT_DESCRIPTION + GUIDE_FIRST, inputSchema: { cut_id: cutId } },
  async ({ cut_id }) => withFailureReport(async () => ({ content: [text(await client.getCut(cut_id))] })));
  server.registerTool("quote_cut_preview", { title: "Quote a cut preview", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_CUT_PREVIEW_DESCRIPTION + GUIDE_FIRST, inputSchema: filmCutPreviewInput.shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quotePreviewCut(input))] })));
  server.registerTool("preview_cut", { title: "See a cut's stills", annotations: { readOnlyHint: false, destructiveHint: false },
    description: PREVIEW_CUT_DESCRIPTION + REPEAT_RUN + GUIDE_FIRST, inputSchema: { ...filmCutPreviewInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => waited(await client.previewCut(input, { attempt }))));
}

/** take_frames and the take check, in the ad and the faceless DIY modes; the picture mode's fields are listed only where faceless DIY is on. */
function registerTakeTools(server: McpServer, client: ClipwrightClient, waited: (run: FilmRun) => Promise<McpToolResponse>, picture: boolean): void {
  const { against: _a, look: _l, picture: _p, cut_id: _c, ...rest } = takeCheckInput.shape;
  // Without the faceless DIY mode, direction is the prompt text alone and a slot is an ad record's: the picture mode's fields are not offered there.
  const motionShape = { ...rest, direction: rest.direction.options[0].describe("What the take was asked to show: the shot's part of the prompt " +
    `you made it with (its action and timeline), up to ${TAKE_CHECK_PROMPT_MAX_CHARS} characters`),
    slot: rest.slot.describe("With ad_id: the slot of the ad record this take is for") };
  // One handler type for both lists: each sends its input on as a TakeCheckRequest, and the API validates the mode.
  const shape = (picture ? takeCheckInput.shape : motionShape) as typeof takeCheckInput.shape, also = picture ? CHECK_TAKE_PICTURE_DESCRIPTION : "";
  server.registerTool("take_frames", { title: "See a take's frames", annotations: { readOnlyHint: false, destructiveHint: false },
    description: TAKE_FRAMES_DESCRIPTION + REPEAT_RUN, inputSchema: { ...takeFramesInput.shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => waited(await client.takeFrames(input, { attempt }))));
  server.registerTool("quote_take_check", { title: "Quote a take check", annotations: { readOnlyHint: true, destructiveHint: false },
    description: QUOTE_TAKE_CHECK_DESCRIPTION + also, inputSchema: shape },
  async (input) => withFailureReport(async () => ({ content: [text(await client.quoteTakeCheck(input as TakeCheckRequest))] })));
  server.registerTool("check_take", { title: "Check a take", annotations: { readOnlyHint: false, destructiveHint: false },
    description: CHECK_TAKE_DESCRIPTION + also + REPEAT_RUN, inputSchema: { ...shape, ...agentRetryShape } },
  async ({ attempt, ...input }) => withFailureReport(async () => waited(await client.checkTake(input as TakeCheckRequest, { attempt }))));
}

function registerFilmGuideTools(server: McpServer, client: ClipwrightClient, facelessDiy: boolean): void {
  // A story, list, own_pictures or cartoon guide is listed only where it is served; elsewhere the tool stays as it was.
  if (facelessDiy) {
    server.registerTool("get_film_guide", { title: "Read the film guide", annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_FILM_GUIDE_DESCRIPTION + FACELESS_GUIDE_FORMATS, inputSchema: filmGuideQuery.shape },
    async (query) => withFailureReport(async () => ({ content: [text(await client.getFilmGuide(query))] })));
    server.registerTool("check_cut", { title: "Check a faceless cut", annotations: { readOnlyHint: true, destructiveHint: false },
      description: CHECK_CUT_DESCRIPTION + GUIDE_FIRST, inputSchema: filmCutInput.shape },
    async (sheet) => withFailureReport(async () => ({ content: [text(await client.checkCut(sheet))] })));
  } else {
    server.registerTool("get_film_guide", { title: "Read the film guide", annotations: { readOnlyHint: true, destructiveHint: false },
      description: GET_FILM_GUIDE_DESCRIPTION, inputSchema: {} },
    async () => withFailureReport(async () => ({ content: [text(await client.getFilmGuide())] })));
  }
  server.registerTool("get_film_kit", { title: "Read the scene kit", annotations: { readOnlyHint: true, destructiveHint: false },
    description: GET_FILM_KIT_DESCRIPTION + GUIDE_FIRST, inputSchema: filmKitQuery.shape },
  async (query) => withFailureReport(async () => ({ content: [text(await client.getFilmKit(query))] })));
}
