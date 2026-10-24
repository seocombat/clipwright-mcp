# @clipwright/sdk

TypeScript client for the [Clipwright](https://clipwright.io/?ref=npm) UGC and faceless
video API.

```ts
import { ClipwrightClient } from "@clipwright/sdk";

const client = new ClipwrightClient({ apiKey: process.env.CLIPWRIGHT_API_KEY! });

const quote = await client.quoteUgc({ script: "Hello from Clipwright." });
const run = await client.makeUgc({ script: "Hello from Clipwright." });
```

`makeUgc` renders a clip and **costs money**; `quoteUgc` does not. Native render starts
carry an idempotency key derived from the input and from this installation's
id, so a retried request returns the original run instead of paying twice. Pass
`idempotencyKey` explicitly when you deliberately want a fresh run.

Recipes, each a prompt an agent turned into a video with the call it sent and
the price, are in the [`@clipwright/mcp-server` README](https://www.npmjs.com/package/@clipwright/mcp-server).

## Workflow plans

| Method | Request and result |
| --- | --- |
| `listWorkflows()` | Six public methods and deployment availability. Free. |
| `getWorkflow(methodId)` | One method's guidance, limitations and capability snapshot. Free. |
| `createWorkflowPlan({ document })` | Store a complete account-owned document. Free; starts no run. |
| `getWorkflowPlan(planId)` | Read the current revision, readiness issues and warnings. Free. |
| `saveWorkflowPlan(planId, { base_version, document })` | Save an edited revision. Free; approval is separate. |
| `approveWorkflowPlan(planId, { revision, content_digest })` | Explicitly approve that revision. Free; starts no run. |
| `quoteWorkflowPlan(planId)` | Quote the approved revision with an empty POST body. Free. |
| `runWorkflowPlan(planId, request)` | Start one paid intent and return its captured receipt and native run immediately. |

The four native methods are `ugc-product-intro`, `ugc-faq-answer`,
`faceless-explainer` and `product-image-story`. Their executors must each be
configured, qualified and enabled. `website-proof-demo` and `kinetic-launch`
remain `execution_blocked`; catalog availability grants no account permission.
Use the method and capability pins from the method response in the document.

Preparation, saving, approval and quoting never call one another or launch a
run. Inspect the chosen revision's issues and warnings before approving it;
show the quote's native price before a paid launch. For a complete
`{ "document": ... }` in `create.json`, these are separate free calls:

```ts
import { readFile } from "node:fs/promises";

const plan = await client.createWorkflowPlan(JSON.parse(await readFile("create.json", "utf8")));
console.log(plan);
// After inspecting the plan and choosing this exact revision:
await client.approveWorkflowPlan(plan.plan_id, {
  revision: plan.revision,
  content_digest: plan.content_digest,
});
const workflowQuote = await client.quoteWorkflowPlan(plan.plan_id);
console.log(workflowQuote);
```

After the user accepts this quote, the paid launch body has exactly five fields:

```ts
const request = {
  revision: workflowQuote.revision,
  content_digest: workflowQuote.content_digest,
  semantic_input_digest: workflowQuote.semantic_input_digest,
  quote_id: workflowQuote.quote_id,
  idempotency_key: "workflow-example:1",
};
const launched = await client.runWorkflowPlan(workflowQuote.plan_id, request);
const status = await client.getRun(launched.receipt.run_id);
```

Choose and keep one explicit key per purchase intent. The SDK sends that same
key in the body and `Idempotency-Key`; it refuses a key changed or rejected by
HTTP header encoding before sending. Workflow launches use no installation id
or automatic attempt suffix. If fetch, body reading or response validation
fails after send, `ClipwrightResponseError.mayHaveTakenEffect` is true: preserve
the original request and key to recover that purchase. A new key can pay twice.
There is no automatic paid retry, quote refresh or source re-signing on replay.

Writes reject unknown fields and documents over 256000 JSON bytes. Reads accept
future fields and enum values and preserve unknown fields inside documents;
an older client refuses an unsupported save instead of erasing intent. Keep
accepted raw narration unchanged. After a lost save answer, repeating the same
explicit base version and document returns the already-saved current revision
without resetting approval; a genuinely different current document conflicts.
Workflow refusals retain every structured issue and warning in `failure` and
`report()`, with kinds `workflow_invalid`, `workflow_conflict` or
`workflow_not_ready` and no automatic retry.

`getRun` includes optional `workflow` evidence: the immutable receipt and
`approved_plan`, native state/warnings, `actual_output`, `asset_placements`,
advisory beat dispositions and validation issues. Verified native faceless
settlement can prove the artifact digest, format and measured duration without
later optional geometry. Placement proof needs an intact owned checkpoint;
unavailable evidence is `null` with an issue, while a measured empty list is
`[]`. UGC without byte/format proof retains its native video URL and reports
`actual_output: null`. Historical evidence does not renew expired media links.
`creative_acceptance` remains `not_reviewed`; a technical delivery is separate
from a person's review of the creative result.

Original image instances use stable owned upload ids and source digests with
nonoverlapping word/quote anchors. The generated opener is illustrative;
original product proof belongs in supported IMAGE shots. Protected areas must
survive native crop, PAN and captions; unsupported layouts, source orientation
or placement are refused. See the [workflow API contract](https://clipwright.io/docs).

## Native video methods

`quoteFaceless(input)` prices a faceless video for a `duration_seconds` of 30 to 90
(the delivered video runs from 25 seconds to a quarter past it, never past 90, and
never costs more than the quote), and
`startFaceless(input, { attempt })` starts it and returns the run at once; poll
`getRun` until it succeeds. The input names its source with `input_mode`:
`{ input_mode: "script", script, duration_seconds }` reads your text as written,
`{ input_mode: "brief", brief, duration_seconds }` writes the narration from a
short description. Captions are on unless `captions: false`. Both methods
refuse a mismatched `script`/`brief` before sending anything. `voice` picks the
narration voice: a name from `listVoices({ skill: "make_faceless" })`, in English,
Russian, Spanish, Portuguese, French or Italian. Without it the narration is
read by `narrator_en_wise_lady`. The API refuses an unknown name and a
`make_ugc` voice before any charge; `voice_id` is refused before sending.

`listVoices({ language, gender, age, use_case, model, skill })` returns the voices for
`voice`, each filter optional. It is free. A voice with a sample carries a
`preview_url` that expires in an hour. Pass a voice's `name` as `voice`;
`language` is a filter only, since any voice speaks any supported language.
Each voice names the one skill that speaks it in `skill`: `make_ugc` or
`make_faceless`. The other skill refuses it before any charge. Without `skill`
the list holds the `make_ugc` voices only; the narration voices of
`make_faceless` are listed with `skill: "make_faceless"`.

For `make_ugc` the list holds the presets, the thirty voices of the speech model
`gemini-3.8-flash-tts` (`kind: "model_voice"`) and the catalog. A `model_voice`
voice has no language of its own: `language: "en"` and `language: "ru"` find it,
and its sample is in English unless you ask for `language: "ru"`. Naming such a
voice makes the run speak `gemini-3.8-flash-tts` without `tts_model`. That model
speaks only its own voices and refuses `captions: true` before any charge.

Without `voice` or `voice_id`, the voice follows the actor's gender: `sarah` for
a woman, `george` for a man. `actor_id` brings its catalog gender; with `image`,
pass `actor_gender` (`"female"` or `"male"`). An `image` without `actor_gender`
gets `george` and a warning. `actor_gender` next to `actor_id` or without
`image` is refused before any charge. With `tts_model: "gemini-3.8-flash-tts"`
the defaults are `kore` for a woman and `charon` otherwise.

`getRunShots(runId)` reads the shots of a finished video: for each shot its span
in frames, its kind, the words it covers, its description and a signed link to
its source picture or clip. A run with no shots to show answers
`planned: false` with `editable.state` and `editable.reason`; that is an answer,
not an error. `getRunEdit(runId)` reads the draft of an edit of that run and
`saveRunEdit(runId, { base_version, document })` saves it. Version 0 means
nothing is stored. A save names the version the draft was read at and is
refused with `edit_conflict` when the stored one differs; the error carries
`failure.version`. A run without a draft is refused with `run_not_editable`,
carrying `failure.state` and `failure.reason`. `saveRunEdit` sends one request
and never repeats it: a save whose answer was lost answers `edit_conflict` when
sent again, so read the draft and compare it with your document before you
treat that as a conflict. The three calls are free. A draft charges nothing and
renders nothing. Responses are parsed tolerantly: a kind of shot, an action or
the code of an issue that a later API adds arrives as a plain string.

`quoteRevision(runId, request)` prices a revision of a faceless video for
nothing, and `startRevision(runId, request, { attempt })` starts it: a new run,
returned at once, that renders the video again with the shots you change. The
request is `{ document }`, the edited document of the draft, or
`{ changes: [{ shot_id, operation }] }`. A revision that delivers is charged its
quoted total; one that fails is charged nothing, even when its paid work was
already done. The same request and attempt send the same idempotency key, so a
resend returns the first run; `attempt: 2` starts a second one. While paid edits
are closed on the server, both calls throw a `ClipwrightApiError` of kind
`editing_closed`, which is not retried.

`quoteCandidate(runId, request)` prices a shot candidate for nothing,
`createCandidate(runId, request)` makes it and `listCandidates(runId)` lists the
candidates of the run's family. A candidate is one picture or clip for one
shot, to keep or discard in a revision; the request is
`{ shot_id, operation, take }`. A delivered candidate is charged its one unit
whether it is kept or discarded; one that fails is charged nothing, even when
its paid work was already done. The idempotency key comes from the run and the
request, so a resend returns the first run and `take: 2` makes another one.
While shot candidates are closed on the server, the three calls throw a
`ClipwrightApiError` of kind `editing_closed`.

`listUploads()` lists the account's uploads that a revision still takes, newest
first and one per picture. Each carries a freshly signed `url` and
`usable_until`: its creation plus 30 days of storage, less a two-hour margin.
Free.

Requires `CLIPWRIGHT_CLIENT_ID`, or a writable `~/.clipwright/` for the SDK to
create one on first use. It fails loudly rather than generating a throwaway id,
because a per-process id would disable duplicate protection without saying so.

## Deadlines cancel the request (behaviour change)

`fetch` has no default timeout in Node, so until this release a connection that
was accepted and then went silent — a proxy dying between you and the API — hung
forever. `maxWaitMs` did not save you: it was checked *between* status polls, so
control never came back to it.

Two deadlines now abort the request itself, not just the wait:

- `maxWaitMs` (per `makeUgc` call, default 10 min) bounds the whole call,
  including the request in flight when it expires.
- `requestTimeoutMs` (per client, default 30 s) bounds every single request.

```ts
const client = new ClipwrightClient({
  apiKey: process.env.CLIPWRIGHT_API_KEY!,
  requestTimeoutMs: 60_000,
});
```

**What changes for you:** a call that used to hang now rejects. A `makeUgc`
whose polling is cut short still throws the same timeout error, naming the run
so you can pick it up later with `getRun`. A **start** request aborted mid-flight
throws `ClipwrightResponseError` with `mayHaveTakenEffect: true` and
`deliveryConfirmed: false` — the run may exist and may be charged, so check your
recent runs instead of retrying with a fresh idempotency key. Requests on the
free paths (`quoteUgc`, `listVoices`, `getRun`) reject with a `TimeoutError`
`DOMException`; retrying them is safe.

Raise `requestTimeoutMs` if you sit behind a slow proxy; it must stay positive,
and a non-positive or non-finite value is rejected loudly rather than replaced
with the default.

## Changelog

What changed in each release, and what was removed, is in `CHANGELOG.md` inside
this package. Read its **Breaking:** entries before upgrading.
