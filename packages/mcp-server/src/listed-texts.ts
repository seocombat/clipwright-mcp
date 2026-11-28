import {
  ANALYSIS_VIDEO_MAX_SECONDS, ASSET_LIST_MAX_LIMIT, ASSET_VIDEO_MAX_SECONDS, REFERENCE_ANALYSIS_MAX_SECONDS, ASSET_TOOL_PAGE, CANDIDATE_CHARGE_TEXT, CREATOR_PROFILE_CREDITS, MAX_OVERLAYS_AT_ONCE, MUSIC_BED_CREDITS, referenceAnalysisPriceRange, REFERENCE_DATA_CREDITS,
  REVISION_CHARGE_TEXT, SCENE_CREDITS, SCRIPT_LENGTH_DESCRIPTION, offeredTemplateKinds, thirdPartyData, TREND_FREE_PAGES_PER_DAY, TREND_GALLERY_DAYS, TREND_PAGE_PAID_CREDITS, TREND_PAGE_WINDOW_SECONDS,TREND_SEARCH_MAX_PAGES, TREND_SEARCH_PER_HOUR, TREND_SEARCH_REELS,
  YOUTUBE_LINK_MAX_SECONDS,
} from "@clipwright/core";


const REPEAT = (another: string) => `Repeating an identical request returns the run it started, starting nothing new; pass ${another} for another one.`;
const GENERATION_RULES = `A generation that fails is charged nothing. ${REPEAT("attempt 2")}`;
const PAID_EDITS_CLOSED = "While paid edits are closed it answers editing_disabled and charges nothing.";
const CANDIDATES_CLOSED = "While shot candidates are closed it answers editing_disabled and charges nothing.";
const CLOSED_GENERATIONS ="While generations are closed it answers generations_disabled or generations_marking_pending and charges nothing.";

export const adMethodPointer = (guide: boolean): string => "With no templates, moves (list_moves) or live shots (shots) on its words, the " +
  `video is the presenter talking${guide ? "; get_ad_guide section ugc maps script words to these devices" : ""}.`;

export interface ListedGuides { ad: boolean; film: boolean; filmFormats: boolean }
export function generateVideoRoute({ ad, film, filmFormats }: ListedGuides): string {
  const faceless = filmFormats ? "for a story, list, cartoon or explainer video, read get_film_guide first"
    : film ? "for an explainer, read get_film_guide first; a narrated story, list or cartoon video is one make_faceless run"
      : "a narrated story, list or cartoon video is one make_faceless run";
  if (ad) return `One clip is one shot. For an ad, read get_ad_guide first; ${faceless}.`;
  return `One clip is one shot. ${faceless[0]!.toUpperCase()}${faceless.slice(1)}; an ad with a presenter is one make_ugc run.`;
}
export const withRoute = (text: string, route: string): string => {
  const at = text.indexOf(". ");
  if (at < 0) return `${text.trimEnd()} ${route}`;
  return `${text.slice(0, at + 2)}${route} ${text.slice(at + 2)}`;
};
export function ugcRouteLine(adGuide: boolean, filmGuide: boolean): string {
  const route = "For a talking presenter video.";
  if (adGuide && filmGuide) return `${route} For a multi-shot ad, read get_ad_guide first; for a story, list, cartoon or explainer, get_film_guide.`;
  if (filmGuide) return `${route} For a story, list, cartoon or explainer, read get_film_guide first.`;
  return adGuide ? `${route} For a multi-shot ad, read get_ad_guide first.` : route;
}

export const LISTED_DESCRIPTIONS: Record<string, string> = {
  analyze_reference: "Break down any reel or ad into a reference_profile: the spoken words with timing, hook, beats, graphics, " +
    `captions, pacing, voice, top comments and the funnel code word. ${thirdPartyData("the reel")} Mode "data" answers only the data: ` +
    "words, scenes between cuts, " +
    "hook and a frame a second. Pass asset_id of an MP4 asset up to 100 MiB, or source_url of an Instagram " +
    `reel or post, a TikTok video or a YouTube video. Both modes read reels up to ${REFERENCE_ANALYSIS_MAX_SECONDS.full} s (a YouTube video, ` +
    `${YOUTUBE_LINK_MAX_SECONDS} s; an asset that is not analysis_only, ${ASSET_VIDEO_MAX_SECONDS} s); a longer one is refused at no charge. ` +
    "A YouTube video is read at reduced resolution, so small on-screen text and graphics may be missed; for a full read, upload its MP4 with " +
    "create_asset. Its comments and the author's median are not read. Full is priced by the reel's length; a link of unknown length holds the most and is " +
    "charged by the length. Charged once it succeeds; a failed analysis costs nothing. 10 new full and 60 new data analyses per hour. The same asset or full link in the same mode " +
    "answers the same analysis free unless it failed; one made before frames and " +
    "speakers existed is redone free once. Poll get_reference_analysis with wait_seconds: 50.",
  create_asset: "Save a picture or clip as an asset until you delete it. source: {run_id} of a succeeded generation, " +
    "{upload_id}, a public https {url} (kind: \"video\" for an MP4), {base64, media_type} of a PNG or JPEG up to 700000 bytes, " +
    "or {put: {media_type, bytes, sha256}}, then PUT the file to upload.put_url within 15 minutes; locally also {path}. A clip: " +
    "MP4, MOV or WebM up to 120 seconds and 100 MB; another codec than H.264 or HEVC (AV1, VP9) or a fragmented MP4 is re-encoded " +
    "to H.264, and 10-bit or HDR video to SDR, said in get_asset warnings. PUT with put_headers. Own material takes rights_confirmed: true, stating that you may use the " +
    "people and works in it; a reference only to analyse " +
    `takes analysis_only: true, is never rendered and may run up to ${ANALYSIS_VIDEO_MAX_SECONDS} seconds. Free. Up to 2000 assets and 1 GB (20 GB once credits were bought, as a pack or a plan), 100 ` +
    "new per day.",
  list_voices: "Voices for make_ugc, or with skill=make_faceless for make_faceless; the other skill refuses the voice " +
    "before any charge. Filter by language, gender, age, use_case and model; an unknown value is refused with the allowed ones. " +
    "preview_url is a voice sample; it expires. Free.",
  analyze_creator: `Profile an Instagram or TikTok creator from a profile or video link. ${thirdPartyData("the creator's account")} ` +
    "It reads the latest 12 videos with views and " +
    "x_median, labels breakout (3×, 10,000 views, 24 h) and viral (10×), x_preliminary under 48 h, comment_rate, the caption's " +
    "funnel code word and why[] for those that took off; followers and cadence. YouTube is refused. Charged once it succeeds; a private or empty account, or any " +
    "failure, costs nothing. 30 new profiles per hour. Within an hour the same link, or a handle link of a creator already " +
    "profiled, answers the same profile, free. Poll " +
    "get_creator_profile when it says so.",
  find_trends: `What is taking off in a niche or on a topic, and what to make next. ${thirdPartyData("the reels")} Reels that took off, ` +
    `up to ${TREND_SEARCH_REELS} per platform, one per creator, TikTok and Instagram ranked by x_median. Charged only on success, a one-platform mix too; ${TREND_SEARCH_PER_HOUR} per hour. poll names get_trend_search, free; sort reorders it free. ` +
    `No keywords: the primary saved niche (trend_niches). gallery_url: a page to share for ${TREND_GALLERY_DAYS} days. ` +
    `next_page: more places, free for ${TREND_PAGE_WINDOW_SECONDS / 3600} hours after the search, ${TREND_FREE_PAGES_PER_DAY} a day, ` +
    `then ${TREND_PAGE_PAID_CREDITS} credits; up to ${TREND_SEARCH_MAX_PAGES} pages, search_id and page alone.`,
  trend_niches: `Free. ${thirdPartyData("creators' hashtags")} ` + "Alone: the saved niches, the first the primary, and suggested ones from analysed creators; none: extract_brand " +
    "on the brand's site. niches: the list to save, at most 3, replacing it; [] clears it.",
  make_ugc: "Make an ad, a UGC video or a product video in which a presenter talks to the camera, from a script: a lip-synced video " +
    "with an actor, a voice, captions, music, templates, moves, inserts and live shots. The actor is actor_id, image or the default. Format and resolution follow the request " +
    "and the source, defaulting to 720x1280. Captions and emphasis follow edit_style, which the quote names; edit_style \"bare\" adds none. " +
    "Poll get_run with its poll.arguments; a failed run whose video " +
    "is still being made can return to queued, named in warnings[]. attempt=2,3,… starts a new run. A video like a reference " +
    "reel: plan_reference_remake with its analysis_id instead.",
  get_reference_analysis: "Read an analyze_reference analysis: queued, analyzing, succeeded or failed with error.code " +
    `(timed_out, analysis_failed, asset_gone, enqueue_failed). ${thirdPartyData("the reel")} untrusted_content lists those fields. wait_seconds (at most 50) holds the ` +
    "answer. Succeeded: next, when there is a way to offer, is plan_reference_remake with its analysis_id, or quote_faceless for a faceless or " +
    "b-roll reel with no presenter; such a reel gets none where faceless videos are not offered. reference_profile and frames only with " +
    "include. frames_as: \"images\" adds up to 8 key frames. Links last 24 hours. Free.",
  create_actor: "Create a personal actor from words on a fictional adult: a 9:16 portrait with one face plus the other " +
    "formats. quality is medium unless set; high costs more per image. Poll get_run (created_actor.actor_id). Each published image is charged as quoted; refused words and " +
    "unusable portraits cost nothing. from_actor_id keeps the face; a mismatch costs nothing. A style_reference look-alike is " +
    "refused at no charge. Refused with actor_generation_disabled while off. portrait (a human-faced mascot too) becomes " +
    "the 9:16 portrait at no charge; one without one well-framed face is refused at no charge.",
  revise_run: `A new run rendering a make_faceless video again with changes or document (exactly one). ${REPEAT("attempt 2")} ` +
    `${REVISION_CHARGE_TEXT} A refusal names its limit. ${PAID_EDITS_CLOSED} Poll get_run.`,
  delete_run_media: "Delete a finished run's files at once; storage erases them after 7 days. The charge stays; nothing is " +
    "refunded. Refused with run_not_finished, run_media_in_use or deletion_held. An analyze_reference run loses its analysis too: a new one is paid. Free.",
  create_candidate: "A new edit_shot run making one picture or clip for one shot of a make_faceless run, to keep or discard in a " +
    `revision. ${CANDIDATE_CHARGE_TEXT} ${REPEAT("take 2")} A refusal names its limit. ${CANDIDATES_CLOSED} Poll get_run.`,
  get_run_shots: "Read the shots of a make_faceless or make_ugc video: frame size and rate, timed words, and each shot's span, " +
    "kind, words and preview_url (it expires). A field named in `withheld` is null on every shot. planned=false is a normal " +
    "answer: editable.reason says why. paid_edits.enabled says whether a video can be made from an edit; while it is false, " +
    "none can. Free.",
  create_upload: "No arguments: a page_url where a person drops a photo you cannot send yourself (attached in chat), then " +
    "get_upload. The link takes one photo for 30 minutes. With media_type, bytes and sha256: upload a local PNG or JPEG (up to 10 MB) to a remote server: pass media_type, bytes and sha256, then within 15 " +
    "minutes `curl -X PUT -H 'content-type: <media_type>' --data-binary @<file> '<put_url>'` and call get_upload " +
    "(upload_not_finished before the PUT). Use the " +
    "upload_id within 24 hours. Free; 200 uploads per day.",
  make_faceless: "Start a faceless video from a script or brief: an opening clip and image scenes. You select 30–90 seconds; it " +
    "ends with its narration, at least 25 seconds and at most a quarter past the selection, " +
    "never beyond 90. Captions are on " +
    "unless turned off. Poll get_run. attempt=2,3,… starts a new run. quote_faceless can also name the other faceless ways.",
  quote_image: "Price one generate_image call without spending credits. A reference is {upload_id, rights_confirmed: true} " +
    "(you may use the people and works in it), {run_id} " +
    "of a succeeded generate_image run until reusable_until, or {asset_id} of a picture asset. A generation that fails is " +
    `charged nothing. ${CLOSED_GENERATIONS}`,
  quote_video: "Price one generate_video call without spending credits (unit_credits per second of duration_s). Pass prompt, or " +
    "shot: the clip as framing, subject, beats of 1 to 5 seconds, camera, light and continuity, each written as what the frame shows " +
    "(describe_tool quote_video says how). A reference is " +
    `as quote_image states it. A generation that fails is charged nothing. ${CLOSED_GENERATIONS}`,
  quote_upscale: "Price an upscale without spending credits: a draft clip to 720p, a picture doubled. A failed one costs nothing.",
  upscale: "Upscale a delivered clip (a 480p draft) or picture: a new run, charged once delivered; a failed one costs nothing. Check " +
    "the draft with free take_frames first: flaws stay. An identical request returns its run; attempt 2 starts another.",
  get_account: "This account's credits. Free. debt_credits above zero refuses make_ugc (debt_outstanding) until credits are " +
    "bought; else balance_credits is what a run can spend: plan_credits (this month's, spent first) plus pack_credits; plan " +
    "names the monthly plan. holds_credits are held by runs in progress. support_replies holds our replies.",
  get_creator_profile: "Read an analyze_creator profile: queued, analyzing, succeeded or failed with error.code (timed_out, " +
    `profile_unavailable, source_failed, enqueue_failed). ${thirdPartyData("the creator's account")} untrusted_content lists those fields. wait_seconds (at most 50) holds ` +
    "the answer. Free.",
  generate_video: "Generate one clip from a prompt or a shot. A new run, charged unit_credits per second of duration_s once " +
    `delivered. Modes: text; first_frame (the requested format within 2%); reference (1 to 4). Poll get_run. ${GENERATION_RULES}`,
  delete_creator_profile: "Delete a creator profile and what it read, at once; profiling the link again is paid. The charge " +
    "stays; nothing is refunded. Refused with run_not_finished or deletion_held (ask support). Free.",
  generate_image: "Generate one image from a prompt, a new run, charged the quoted credits once delivered; its run_id can be a " +
    `later reference. Poll get_run. ${GENERATION_RULES}`,
  quote_analysis: "Price analyze_reference for an asset_id or source_url and a mode " +
    `(full ${referenceAnalysisPriceRange()}; data ${REFERENCE_DATA_CREDITS}; charged once it ` +
    "succeeds); for a link of unknown length the most, with credits_by_length listing each length's price; 0 when a start would answer an existing " +
    "analysis or redo an old one free. repeat_note says what asking again costs. For a YouTube video link, warnings say it is read at " +
    "reduced resolution. A YouTube page that is not one video, or an unknown link, is refused. Free.",
  quote_candidate: "Price one shot candidate without spending credits; usable_until is the last moment it can enter a revision. " +
    `${CANDIDATE_CHARGE_TEXT} ${CANDIDATES_CLOSED}`,
  send_feedback: "Tell Clipwright what is missing, confusing, wrong or far too slow instead of giving up; replies show in " +
    "get_account. Free. The same feedback within 24 hours answers the same feedback_id; 20 per hour.",
  get_run: `Status of any run by run_id. ${thirdPartyData("a reference reel")} wait_seconds holds the answer; while ` +
    "IN_PROGRESS call again with poll.arguments until SUCCEEDED or FAILED.",
  quote_creator_profile: `Price analyze_creator for a source_url (${CREATOR_PROFILE_CREDITS}, charged once it succeeds): 0 when a profile from the ` +
    "last hour would answer; a reel or " +
    "short link not seen before quotes the full price. A YouTube or unknown link is refused. Free.",
  list_prices: "Every tool's price in credits: lines per unit added up, with minimum_credits, or a formula; free tools cost 0. " +
    "Exact numbers come from the quote tool. Free.",
  get_asset: "Read one asset with a fresh url (an hour) and a small preview picture to look at; warnings says when a clip was " +
    "re-encoded. awaiting_upload: PUT the file; " +
    "processing: read again shortly; failed: " +
    "error.code; deleted: asset_not_found. Free.",
  delete_upload: "Delete an upload: unusable at once, erased after 7 days unless another upload of the same picture is kept. " +
    "Refused with upload_in_use while an unfinished run uses it. Free.",
  list_assets: `List assets, newest first, ${ASSET_TOOL_PAGE} a page unless limit (up to ${ASSET_LIST_MAX_LIMIT}), fewer when a page would not fit your ` +
    "tool output; filter by role and kind rather than reading them all; mascot true lists saved mascots with their poses, whose id is " +
    "make_faceless mascot_id. next_cursor pages. pending lists assets in progress and today's " +
    "failures; usage counts against 2000 assets and 1 GB, or 20 GB once credits were bought, as a pack or a plan. Free.",
  quote_actor: "Price create_actor without spending credits. Each format is a charged image, except a portrait from your own " +
    "image, which costs nothing. A portrait not within 2% of 9:16 is refused here; one without exactly one well-framed face fails at no charge.",
  list_actors: "Saved actors with IDs, gender, age and verified formats, for actor_id. preview_url is the actor's picture; a " +
    "personal actor's expires. actor_id is not combined with image or actor_gender. Free.",
  quote_revision: "Price a revision without spending credits: pass run_id and exactly one of changes or document. " +
    `${REVISION_CHARGE_TEXT} ${PAID_EDITS_CLOSED}`,
  list_moves: "The catalogue of moves (motion and graphics) for script lines: moves of make_ugc, make_faceless and " +
    "plan_reference_remake. Filter by beat, content, surface, mood, skill or q; each line has the move's purpose and credits per use (0 is free). " +
    "names=a,b answers those in full (data to pass, what the line needs). Read it before planning the visuals. Free.",
  list_template_sounds: "Sounds make_ugc templates play, by beat; template_sounds swaps or (false) mutes them; the edit beat " +
    "needs edit_sounds=true. Also music_beds: render_edit's free music, each with genre, energy, tempo and length. Sounds never change the " +
    "price. Free.",
  upload_image: "An upload_id and a signed url for a PNG or JPEG up to 10 MB, from a local `path` (local server only) or a public " +
    "https `url` (up to 20 seconds and 3 redirects). The url is signed for 24 hours; the upload_id lasts 365 days. Set " +
    "aspect_ratio to match the picture. Remote server and a file on disk, or a photo attached in chat: create_upload. Free; 200 uploads per day, at most 30 " +
    "url downloads per hour.",
  run_workflow_plan: "Start one approved paid workflow run: pass its quote's launch object unchanged; poll get_run. " +
    `${thirdPartyData("a reference reel")} Never ` +
    "auto-approve, auto-quote or invent a key: if delivery is uncertain, repeat with the original key; a new key can pay twice.",
  plan_reference_remake: "Compile a reference remake into a workflow plan from an analysis_id of analyze_reference and the user's " +
    `script; free, starts no run. ${thirdPartyData("the reference reel")} ` +
    "audience: whom the viewer trusts and where (maker, seller, expert at home, user), argued from " +
    "the analysis; actor, setting and script match it. warnings name what it does not " +
    "reproduce. Missing media: generate it and compile again. plan_id, base_version and " +
    "review_notes save the next revision; a note changes nothing by itself: a shot goes in assets[].anchor or line_edits, pauses in " +
    "pause_trim, the product in hand and its demo in product. Only an approved revision runs.",
  get_upload: "Read an upload: fresh url, content_digest, size and usable_until. After create_upload: upload_not_finished until " +
    "the PUT lands or the photo is dropped on the page, upload_expired after 24 hours (a page link: 30 minutes). Free.",
  delete_asset: "Delete an asset: it leaves the list at once and no new generation can use it; its file goes after 7 days. Runs " +
    "made with it stay. Free.",
  delete_actor: "Delete a personal actor; videos made with it stay. Refused while an unfinished run uses it; catalog actors are " +
    "not deletable.",
  list_generation_models: "Models of generate_image and generate_video with modes, formats, durations and unit_credits: " +
    "credits per image, or per second of a clip. Any combination not listed is refused with unsupported_combination before any charge. Free.",
  prepare_workflow_plan: `Free; starts no run. ${thirdPartyData("a reference reel")} The complete document:` + " omit plan_id and base_version to create, supply both to save " +
    "a revision. Strict, at most 256000 JSON bytes; keep accepted narration exact. After a lost save answer, read the saved document; " +
    "never auto-approve or buy.",
  brand_kit: `Free. ${thirdPartyData("a site")} ` + "Alone: the saved kit, styles, looks and faces. A field saves its value; \"\" or {} clears.",
  extract_brand: `Free. ${thirdPartyData("the site or reel")} ` + "A site's colours, fonts, logo, corners and name as a proposed design, voice, brand_name, prompt_block; " +
    "its words as trend niches. " +
    "logo_url: create_asset it for design.logo_asset_id. analysis_id: a style from a reference video's analysis.",
};

export const LISTED_FIELDS: Record<string, Record<string, string>> = {
  quote_ugc: {
    script: "The words the actor says; required unless segments supplies them. " +
      `${SCRIPT_LENGTH_DESCRIPTION.slice(0, SCRIPT_LENGTH_DESCRIPTION.indexOf(". ") + 1)} Spaces, audio tags and stress marks count.`,
    templates: "Price unchanged, a covered presenter still billed. " +
      `Kinds: ${offeredTemplateKinds().map(kind => kind.kind).join(", ")}. Data and limits per kind: describe_tool.`,
    tts_model: "Speech model; omitted, the voice's own. gemini-3.8-flash-tts speaks only its own voices and refuses voice_id, " +
      "captions, segments and inserts before any charge.",
    voice: "A list_voices name (presets sarah | george | eric | daria_ru_female); another is refused before any charge. Omitted: " +
      "the actor's gender default.",
    image: "Public https URL of the actor's photo (PNG, JPEG or WebP, up to 10 MB; a local file via upload_image); another source " +
      "is refused (unusable_source) before any charge.",
    aspect_ratio: "Omitted: 9:16, or the supported format nearest the image. A source more than 15% off the request " +
      "is refused (aspect_conflict) before any charge.",
    scenes: `${SCENE_CREDITS} credits per scene, charged only for scenes drawn in the delivered ` +
      "video. Needs script and long-form qualification.",
    music: `Music under the voice, made by AI (it may carry an invisible watermark), off unless asked: "auto" or { mood }. ` +
      `${MUSIC_BED_CREDITS} credits per video, charged only when delivered with it.`,
    shots: "Live shots of the actor on script words, no overlaps; 9:16, long-form qualification. Acting shots: wide or full, " +
      "a start frame, a cast from pictures; action: shot, second by second. Each kind has its presenter-second price in list_prices.",
    overlays: `Images or videos over the presenter; at most ${MAX_OVERLAYS_AT_ONCE} at once. Price unchanged.`,
    moves: "Moves from list_moves on your words: each { name, anchor: { quote }, cover_words?, placement?, data? }, data as list_moves " +
      "names it. Its credits are on the quote.",
    layout_windows: "Presenter reframings: split (9:16 only) or card. A covered or blurred presenter is billed as face time.",
    broll_policy: "anyone, no_actor or no_people (the default). Templates with your own media need anyone.",
    inserts: "Inserts on script words; need long-form qualification and broll_policy=anyone.",
    voice_id: "Raw vendor voice id outside the catalog; an unknown id fails the run, not the request.",
    actor_id: "From list_actors; not with image or actor_gender.",
  },
  quote_faceless: {
    duration_seconds: "30 to 90 seconds; the charge never exceeds the quote. A script must estimate 21 seconds to the selection " +
      "plus 5, at most 90.",
    voice: "A list_voices name with skill=make_faceless; omitted, narrator_en_wise_lady. " +
      "An unknown or make_ugc voice is refused before any charge.",
  },
  quote_actor: {
    description: "Words describing a fictional adult; with from_actor_id, the view's look, clothing and pose. A real person or a " +
      "likeness to one is refused before any charge (actor_prompt_refused).",
    quality: "medium (default) or high, which costs more per image.",
    aspect_ratios: "Always includes 9:16; a format that fails the identity check is not charged.",
  },
  quote_analysis: {
    mode: `full (default, priced by the reel's length): the reference_profile. data (${REFERENCE_DATA_CREDITS} credits): ` +
      "duration, size, timed transcript, hook and a " +
      "3×3 frame sheet.",
  },
  plan_reference_remake: {
    music: `Music under the voice, as make_ugc music: ${MUSIC_BED_CREDITS} credits on the plan's quote. Off unless you ask.`,
  },
  quote_trends: { language: "ISO 639-1; a reel whose language cannot be told is kept." },
};
