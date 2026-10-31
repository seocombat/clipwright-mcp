import { CANDIDATE_CHARGE_TEXT } from "./edit-candidate.js";
import { REVISION_CHARGE_TEXT } from "./edit-revision.js";
import { FEEDBACK_PER_HOUR } from "./feedback.js";
import { REFERENCE_ANALYSIS_CREDITS, REFERENCE_ANALYSIS_PER_HOUR, REFERENCE_DATA_CREDITS, REFERENCE_DATA_PER_HOUR } from "./reference-analysis.js";

/** What each route does, keyed by `endpointLabel`. `/docs` and `/openapi.json` print the same sentence; */
/** the web docs test proves every shown route has one and nothing else does. */
export const ENDPOINT_NOTES: Readonly<Record<string, string>> = {
  "GET /v1/public/workflows": "Lists public workflow methods and whether each is available now, without account plans or an account admission claim.",
  "GET /v1/public/workflows/{id}": "Reads a method's guidance, limitations and what it can do right now.",
  "POST /v1/workflow-plans": "Creates an immutable account-owned workflow draft. Charges nothing and starts no render.",
  "GET /v1/workflow-plans/{id}": "Reads the account's current workflow revision and readiness.",
  "POST /v1/workflow-plans/reference-remake": "Compiles a reference profile and the accepted script into a new reference-remake draft; its warnings name what the plan does not reproduce. Charges nothing, generates nothing and starts no render.",
  "POST /v1/workflow-plans/{id}/revisions": "Saves a new draft against base_version. A matching lost-response retry returns that revision.",
  "POST /v1/workflow-plans/{id}/approve": "Approves a ready revision and its digest. Charges nothing and starts no render.",
  "POST /v1/workflow-plans/{id}/quote": "Quotes an approved workflow through native preparation. The quote expires after five minutes; no credits are reserved. Its launch is the ready body of the run request, with a fresh idempotency_key.",
  "POST /v1/workflow-plans/{id}/run": "Admits the exact quoted native request once, returning a receipt and the existing native Run. Send the quote's launch unchanged as the body, with the Idempotency-Key header equal to launch.idempotency_key; the same accepted request replays its run.",
  "GET /health": "Liveness of the API itself. Answers without a key.",
  "GET /": "Names the service and points to this document. Answers without a key.",
  "GET /robots.txt": "Tells crawlers not to index the API host. Answers without a key.",
  "GET /openapi.json": "The OpenAPI 3.1 description of this API, built from the same schemas the API validates with. Answers without a key.",
  "GET /v1/voices": "Voices you can name in voice or voice_id for make_ugc; skill=make_faceless lists the narration voices of make_faceless instead.",
  "GET /v1/template-sounds":
    "The sounds make_ugc templates play, by beat: where each beat plays, its default and every name template_sounds takes. Free.",
  "GET /v1/account": "Balance, debt and holds of the account behind the key.",
  "POST /v1/feedback":
    `Tells us what is missing, confusing, wrong or slow, optionally about a run of this account; we read every one. Free. The same kind, text and run within 24 hours answer the same feedback_id; ${FEEDBACK_PER_HOUR} per hour.`,
  "GET /v1/public/skills": "Catalogue of skills and their input, without a key.",
  "GET /v1/public/prices":
    "The price of every action in credits: a fixed number per unit, or a formula where the price depends on the input; the quote gives the exact number. Free, without a key.",
  "GET /v1/actors": "Actors saved on the account, with the id make_ugc takes.",
  "GET /v1/actors/{id}/defaults": "Reads the saved actor's default policy for people in inserts.",
  "POST /v1/actors/{id}/defaults": "Sets the saved actor's default policy for people in inserts. A run can override it.",
  "DELETE /v1/actors/{id}": "Forgets a saved actor. An actor used by a live run is kept.",
  "GET /v1/runs/{id}": "State of one run of any skill, its warnings and its video url.",
  "GET /v1/runs/{id}/shots":
    "The shots of one run: each shot's span, words, description and preview, and whether the run can be edited.",
  "GET /v1/runs/{id}/edit":
    "The saved draft of an edit of one run, with its version. Version 0 is a run with no draft: its document changes nothing.",
  "POST /v1/runs/{id}/edit":
    "Saves the draft of an edit against the version it was read at. Charges nothing and renders nothing.",
  "POST /v1/runs/{id}/revisions/quote":
    `Prices a revision of a faceless run: what the document or the list of shot changes generates and what it costs. Charges nothing. ${REVISION_CHARGE_TEXT} While paid edits are closed it answers editing_disabled.`,
  "POST /v1/runs/{id}/revisions":
    `Starts a revision, a new faceless run made from the document, and holds the quoted credits. The same Idempotency-Key with the same request returns the first revision; another key is another revision, charged again. ${REVISION_CHARGE_TEXT} While paid edits are closed it answers editing_disabled and charges nothing.`,
  "POST /v1/runs/{id}/candidates/quote":
    `Prices one shot candidate of a faceless run: one picture or clip made for one shot, to keep or discard. Charges nothing. ${CANDIDATE_CHARGE_TEXT} While shot candidates are closed it answers editing_disabled.`,
  "POST /v1/runs/{id}/candidates":
    `Starts a shot candidate and holds the price of its one unit. ${CANDIDATE_CHARGE_TEXT} The same Idempotency-Key with the same request and take returns the first candidate; take + 1 makes another, charged again. While shot candidates are closed it answers editing_disabled and charges nothing.`,
  "GET /v1/runs/{id}/candidates":
    "The shot candidates of a faceless run's family, oldest first, each with its state, its charge and a preview once made. While shot candidates are closed it answers editing_disabled.",
  "POST /v1/uploads":
    "Takes image bytes and returns a signed https url, upload_id and content_digest (SHA-256 of the original bytes). Use upload_id as a workflow asset_id and copy content_digest directly; native video and actor calls use url.",
  "GET /v1/uploads":
    "Your uploads a revision still takes, newest first and one per picture, each with upload_id, the original content_digest, a freshly signed url and the moment it stops being usable. Free.",
  "POST /v1/uploads/import":
    "Downloads a public https PNG or JPEG (up to 10 MB, 20 seconds, 3 redirects) and returns the same upload shape. Private addresses are refused; 30 downloads per hour per account. Free.",
  "POST /v1/uploads/intents":
    "Returns a presigned PUT url for a local PNG or JPEG of the declared type, size and sha256. The upload_id is usable once the PUT lands; before that generations answer upload_not_finished. Free.",
  "GET /v1/uploads/{id}":
    "One upload with a freshly signed url and its usable_until. After a presigned PUT it confirms the file: upload_not_finished until it is there, upload_expired after 24 hours. Free.",
  "POST /v1/assets":
    "Saves a picture as an account asset, kept until you delete it: from a run_id, an upload_id, a public https url or base64. Your own material needs rights_confirmed: true, or analysis_only: true for a reference kept for analyze_reference alone, which no render or generation takes. 2000 assets and 20 GB per account, 100 new ones per day. Free.",
  "POST /v1/assets/bytes":
    "Saves the PNG or JPEG in the body (up to 10 MB) as an asset; role, name and rights_confirmed=true (or analysis_only=true, for analyze_reference alone) travel in the query. Free.",
  "GET /v1/assets":
    "The account's live assets, newest first, each with a link signed for an hour, and the usage of the caps; filters role and kind, paged by cursor. Free.",
  "GET /v1/assets/{id}": "One live asset with a link signed for an hour. Free.",
  "POST /v1/assets/{id}": "Renames an asset or changes its role. Free.",
  "DELETE /v1/assets/{id}":
    "Deletes an asset: it leaves the list and generations at once, and a daily cleanup removes its file once 7 days have passed. Free.",
  "POST /v1/reference-analyses/quote":
    `Prices an analysis of this asset or link: ${REFERENCE_ANALYSIS_CREDITS} credits, ${REFERENCE_DATA_CREDITS} with mode data, or 0 when ` +
    "its live analysis in that mode would answer. Charges nothing.",
  "POST /v1/reference-analyses":
    "Starts reading an MP4 asset, up to 120 s, into a reference profile (or, with mode data, its transcript, hook and a frame sheet) and " +
    "answers at once; the same asset in the same mode answers the same analysis for free. Holds " +
    `${REFERENCE_ANALYSIS_CREDITS} credits (${REFERENCE_DATA_CREDITS} for data), charged once it succeeds; a failed one costs nothing. ` +
    `${REFERENCE_ANALYSIS_PER_HOUR} new full and ${REFERENCE_DATA_PER_HOUR} new data analyses per hour.`,
  "GET /v1/reference-analyses/{id}":
    "One reference analysis: queued, analyzing, succeeded with reference_profile or data and warnings, or failed with its error. Free.",
  "POST /v1/skills/make_ugc/quote": "Prices a make_ugc call with this input. Charges nothing.",
  "POST /v1/skills/make_ugc/run":
    "Starts a video run and answers at once with a run_id. Poll the run for the result.",
  "POST /v1/skills/create_actor/quote":
    "Prices a create_actor call with this input. Charges nothing.",
  "POST /v1/skills/create_actor/run":
    "Starts an actor run and answers at once with a run_id. Poll the run for the result.",
  "POST /v1/skills/make_faceless/quote":
    "Prices a make_faceless call with this input. Charges nothing.",
  "POST /v1/skills/make_faceless/run":
    "Starts a faceless video run and answers at once with a run_id. Poll the run for the result.",
  "GET /v1/generations/models":
    "The models generate_image and generate_video take, with their measured modes, aspect ratios, resolutions, durations, output size and credits per image or per second. Free. While generations are closed it answers generations_disabled.",
  "POST /v1/skills/generate_image/quote":
    "Prices one image with this request: credits, width, height and warnings. Charges nothing.",
  "POST /v1/skills/generate_image/run":
    "Starts one image generation and answers at once with a run_id; the run's generation block holds the image once delivered. A failed generation is charged nothing. While generations are closed it answers generations_disabled and charges nothing.",
  "POST /v1/skills/generate_video/quote":
    "Prices one silent clip with this request: credits per second times its duration, width, height and warnings. Charges nothing.",
  "POST /v1/skills/generate_video/run":
    "Starts one clip generation and answers at once with a run_id; the run's generation block holds the clip once delivered. A failed generation is charged nothing. While generations are closed it answers generations_disabled and charges nothing.",
};
