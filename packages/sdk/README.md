# @clipwright/sdk

TypeScript client for the [Clipwright](https://clipwright.io/?ref=npm) UGC and faceless
video API.

```ts
import { ClipwrightClient } from "@clipwright/sdk";

const client = new ClipwrightClient({ apiKey: process.env.CLIPWRIGHT_API_KEY! });

const quote = await client.quoteUgc({ script: "Hello from Clipwright." });
const run = await client.makeUgc({ script: "Hello from Clipwright." });
```

`makeUgc` renders a clip and **costs money**; `quoteUgc` does not. Every call
carries an idempotency key derived from the input and from this installation's
id, so a retried request returns the original run instead of paying twice. Pass
`idempotencyKey` explicitly when you deliberately want a fresh run.

`quoteFaceless(input)` prices a faceless video for a `duration_seconds` of 30 to 90
(the delivered video runs from 25 seconds to 5 seconds past it, never past 90, and
never costs more than the quote), and
`startFaceless(input, { attempt })` starts it and returns the run at once; poll
`getRun` until it succeeds. The input names its source with `input_mode`:
`{ input_mode: "script", script, duration_seconds }` reads your text as written,
`{ input_mode: "brief", brief, duration_seconds }` writes the narration from a
short description. Captions are on unless `captions: false`. Both methods
refuse a mismatched `script`/`brief` before sending anything.

`listVoices({ language, gender, age, use_case, model })` returns the voices for
`voice`, each filter optional. It is free. A voice with a sample carries a
`preview_url` that expires in an hour. Pass a voice's `name` as `voice`;
`language` is a filter only, since any voice speaks any supported language.

The list holds the presets, the thirty voices of the speech model
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
