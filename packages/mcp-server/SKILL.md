# SKILL.md — installing and operating `clipwright-mcp`

A self-contained guide for an AGENT (or a human in Claude Code) that needs no
spoken help from a developer. Follow the steps in order. Not to be confused with
`apps/web/.claude/skills/*` — those are dashboard skills for the Next.js app and
have nothing to do with the MCP server.

The package `@clipwright/mcp-server` (`bin: clipwright-mcp`) is published to npm
under the MIT license, so you do NOT need the repository to install it — `npx` is
enough. Building from source is kept below as the development path.

What changed in each version — above all what was removed or changed
incompatibly — is in `CHANGELOG.md`, shipped next to this file. Read its
**Breaking:** entries before you move to a newer version.

Four client-side packages — `@clipwright/core`, `@clipwright/sdk`,
`@clipwright/mcp-server` and `@clipwright/cli` — are MIT; the service itself
(REST API, render pipeline, dashboard) is closed. That split is deliberate, not
an oversight: see `LICENSE` in the repository root.

## 1. Installation

### 1.1 From npm — the normal path

```bash
npx -y -p @clipwright/mcp-server@latest clipwright-mcp
```

Expected: the process does NOT exit, prints `clipwright mcp server running on
stdio` to stderr, and hangs waiting for JSON-RPC. That is what a healthy server
looks like, not a freeze. Stop it with `Ctrl+C`.

Exiting immediately with `CLIPWRIGHT_API_KEY env var is required` is also
expected when the key is empty (`src/index.ts`) — it is not a broken build.

Go straight to section 1.3: the host config for this variant differs only in the
command (`npx` instead of `node` with an absolute path); both are shown there.

### 1.2 From source — development only

Requirements: Node ≥24, pnpm (`packageManager: pnpm@11.13.1` in the root
`package.json` — with corepack available: `corepack enable`).

```bash
git clone <repo-url> clipwright   # or use a checkout you already have
cd clipwright
pnpm install
pnpm build          # pnpm -r build — builds every package in topological order
```

If you only need this surface (faster, but `@clipwright/core` and
`@clipwright/sdk` must be built first — `...` pulls them in automatically):

```bash
pnpm --filter @clipwright/mcp-server... build
```

After the build, `packages/mcp-server/dist/index.js` must exist. Check it:

```bash
ls packages/mcp-server/dist/index.js
```

#### Pre-flight check of the built binary

This applies to source builds. Before wiring the server into a host, make sure it
starts at all and does not die on imports:

```bash
CLIPWRIGHT_API_KEY=cw_test node packages/mcp-server/dist/index.js
```

Expected: the process does NOT exit on its own, prints `clipwright mcp server
running on stdio` to stderr, and waits on stdio for JSON-RPC. Stop it with
`Ctrl+C`. If it instead exits immediately with `CLIPWRIGHT_API_KEY env var is
required`, the variable was not passed through (expected behaviour on an empty
key, see `src/index.ts`) — not a bug. If it dies on a module import, the build is
incomplete: go back to step 1.2 and run `pnpm build` from the root rather than a
targeted `--filter`, so `@clipwright/core` and `@clipwright/sdk` are definitely
rebuilt.

### 1.3 Connecting it to an MCP host

Variants A and B below run the server FROM SOURCE and therefore need the ABSOLUTE
path to `dist/index.js`:

```bash
realpath packages/mcp-server/dist/index.js
```

If you installed from npm (section 1.1), you do not need a path — take variant C
at the end of this section; it differs only in `command`/`args`.

**Variant A — `.mcp.json` (project-level host config):**

```json
{
  "mcpServers": {
    "clipwright": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/clipwright/packages/mcp-server/dist/index.js"],
      "env": {
        "CLIPWRIGHT_API_KEY": "cw_...",
        "CLIPWRIGHT_API_URL": "https://api.clipwright.io",
        "CLIPWRIGHT_CLIENT_ID": "<see section 2 — generate BEFORE the first run>"
      }
    }
  }
}
```

**Variant B — `claude mcp add`** (variant A as a single command):

```bash
claude mcp add clipwright \
  -e CLIPWRIGHT_API_KEY=cw_... \
  -e CLIPWRIGHT_API_URL=https://api.clipwright.io \
  -e CLIPWRIGHT_CLIENT_ID="$(node -e "console.log(crypto.randomUUID().replaceAll('-',''))")" \
  -- node /absolute/path/to/clipwright/packages/mcp-server/dist/index.js
```

**Variant C — from npm, without the repository.** Same thing, but the command is
`npx`:

```json
{
  "mcpServers": {
    "clipwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@clipwright/mcp-server@latest", "clipwright-mcp"],
      "env": {
        "CLIPWRIGHT_API_KEY": "cw_...",
        "CLIPWRIGHT_API_URL": "https://api.clipwright.io",
        "CLIPWRIGHT_CLIENT_ID": "<see section 2 — generate BEFORE the first run>"
      }
    }
  }
}
```

As a single command:

```bash
claude mcp add clipwright \
  -e CLIPWRIGHT_API_KEY=cw_... \
  -e CLIPWRIGHT_API_URL=https://api.clipwright.io \
  -e CLIPWRIGHT_CLIENT_ID="$(node -e "console.log(crypto.randomUUID().replaceAll('-',''))")" \
  -- npx -y -p @clipwright/mcp-server@latest clipwright-mcp
```

**`@latest` here is a deliberate choice, not sloppiness.** It pulls a fresh
version on every start: right for a prototype, because the contract still moves
and a client out of sync with the server costs more than an unexpected upgrade.
Once the contract settles, the version should be pinned.

Environment variables:

| Variable | Required | Meaning |
|---|---|---|
| `CLIPWRIGHT_API_KEY` | YES | Bearer token shaped `cw_*`. Without it the process exits immediately with an error (`src/index.ts`). The token is ISSUED TO YOU PERSONALLY: it lives in the `api_tokens` table, is bound to an account, and is revoked independently of anyone else's. Do not forward it — a second person gets their own. What separates people is the ACCOUNT, not the token: accounts cannot see each other's runs, each has its own daily cap and its own idempotency axis, and several tokens on one account share all of it. |
| `CLIPWRIGHT_API_URL` | no | Production URL. Left unset, the SDK supplies `https://api.clipwright.io` itself. Set it explicitly only when you target another environment. |
| `CLIPWRIGHT_CLIENT_ID` | YES (see section 2) | Unique identifier of this INSTALLATION. |

After connecting, restart or reopen the MCP host and confirm that `tools/list`
returns fourteen tools: `make_ugc`, `get_run`, `quote_ugc`, `list_actors`, `list_voices`, `upload_image`, `get_account`,
`create_actor`, `quote_actor`, `delete_actor`, `get_actor_defaults`, `set_actor_defaults`, `quote_faceless`,
`make_faceless`.

## 2. `CLIPWRIGHT_CLIENT_ID` — required, and WHY

**Rule: EVERY installation must get its OWN unique `CLIPWRIGHT_CLIENT_ID` BEFORE
the first `make_ugc` call.** Do not copy the value from another machine, and do
not leave it empty hoping the default will "work out somehow".

### Why this is not optional

The idempotency key the SDK stamps on every paid `POST /v1/skills/make_ugc/run`
is derived deterministically from **the hash of the input** (`script`, `person`,
`image`, … after canonicalisation) **and the client identity**
(`idempotencyKeyFor` in `packages/core/src/idempotency.ts`, used by
`packages/sdk/src/index.ts`). The server deduplicates on that key: if a stored
key matches on `request_hash`, it returns 200 with the run **created by the first
request that used the key**, instead of starting a new paid render.

That is the right behaviour when the SAME user retries — you should not pay twice
for an agent's accidental double click. Its boundaries are these.

Collapsing requires BOTH to match: the account and the `clientId`. Separating
either one is enough.

- **The account separates by construction.** Both the unique index
  (`runs_account_idempotency_key_unique`) and the lookup use the pair
  `(account_id, idempotency_key)`. A run from ANOTHER account can never reach you,
  and nobody can take your key — whatever sits in `CLIPWRIGHT_CLIENT_ID`.
  **The axis is the account, not the token.** A separate token does not by itself
  mean a separate account: several live tokens on one account are normal (laptop,
  CI, smoke script), and they all share one idempotency axis. The account is not
  visible from the token — only the service side knows it, so "is this my own
  account?" is confirmed by whoever issued the token.
- **`clientId` separates within one account.** On its own it comes from
  `~/.clipwright/client-id` and is born random on first run, so two genuinely
  separate installations diverge even without the environment variable. It can
  only match if it was MADE to match: a shared `HOME`, a value copied from
  someone else's machine, an image cloned together with the file.

The dangerous case is exactly the crossing of those two conditions: **one account
AND one `clientId`**. Then a request whose input matches an earlier one — for
example, both people copied a sample from this SKILL.md verbatim — returns 200, a
`run_id` and a playable link. But it is the video rendered for the first person,
presented to the second as their own success. A diagnostic tool would read as
"works" while no paid render ever ran for the second person.

Hence the rule: **a second person gets their own ACCOUNT and a token issued on
it**, and the value of `CLIPWRIGHT_CLIENT_ID` is not copied from anyone's machine.
Setting it explicitly is mandatory wherever the file resolver cannot give a stable
value of its own: a read-only or shared `HOME`, a container from a cloned image,
CI.

### How to set it

An explicit `CLIPWRIGHT_CLIENT_ID` in the host environment (section 1.3, variants
A/B/C) is the most reliable path, because it does not depend on the state of the
file system. The value is any unique string; for consistency with the SDK's own
generator use the same shape (a UUID without dashes). Generate it with Node, not
`uuidgen`: Node is certainly present here, whereas `uuidgen` may be missing on a
bare Linux image — and then the shell silently substitutes an EMPTY string, which
switches off precisely the protection the variable exists for.

```bash
node -e "console.log(crypto.randomUUID().replaceAll('-',''))"
```

If the variable is NOT set, `resolveClientId()` (`packages/sdk/src/client-id.ts`)
falls back to the file `~/.clipwright/client-id`: on first run it generates a
random id and stores it there, then reads it back. That is a workable fallback for
a single installation on a clean machine, but do NOT lean on it as your only
protection when an agent does the install: home directories carried along when
images, containers or dev environments are cloned can take
`~/.clipwright/client-id` with them and produce a collision this fallback will not
notice. When installing by this guide, **always set `CLIPWRIGHT_CLIENT_ID`
explicitly in the host environment** rather than relying on auto-generation.

If neither the variable nor writing the file is possible (read-only `$HOME`),
`resolveClientId()` deliberately THROWS instead of inventing a throwaway id on
every start — a silent fallback would disable deduplication entirely
(`packages/sdk/src/client-id.ts`).

**The server does NOT die in that case, and this is verified by a test run.** The
identity resolves lazily — only on the first `make_ugc`. In an environment where
`~/.clipwright` is not writable the server starts, `tools/list` returns every
tool, and `quote_ugc`, `get_run` and `list_voices` work: they do not need the
identity. Only `make_ugc` refuses, and its refusal names the variable that fixes
it. So the action to take is to set `CLIPWRIGHT_CLIENT_ID` explicitly — not to
hunt for a bug and not to reinstall the package.

## 3. CALL ORDER — `quote_ugc` first, `make_ugc` second

This is not a politeness convention but a mechanism, without which the contract
stays silent about its own decisions.

```
quote_ugc  →  read source / resolved_aspect_ratio / warnings  →  make_ugc  →  get_run (polling)
```

**What `quote_ugc` gives you that nothing else does.** It is free, reserves
nothing, and answers the questions that would otherwise surface only after money
is spent:

| Response field | What it tells you |
|---|---|
| `credits_estimate` | the price — show it to the user BEFORE generating |
| `source` | dimensions of the selected actor variant, a probed `image`, or the default actor (432×768) |
| `actor` | selected `actor_id`, `version` and `gender`; default `{gender}` when no face is selected; `null` for caller-supplied `image` |
| `resolved_aspect_ratio` | the aspect ratio that will ACTUALLY be rendered for this input |
| `tts_model` | the speech model this run will use; the script's character ceiling depends on it |
| `warnings[]` | which of the parameters you passed will not be honoured |
| `contract_version` | which contract version this price was quoted under |

**The verdict of `quote_ugc` and the verdict of `make_ugc` agree by
construction** — both surfaces call the same function. If quote returns 400, the
run returns the same 400; if quote showed `resolved_aspect_ratio: "9:16"` for a
requested `1:1`, then 9:16 is what gets rendered.

**Unknown fields are refused, not ignored.** A key the contract does not have —
`aspectRatio`, `aspect`, `ttsModel` — gets 400 `unknown_field` before any charge.
`fields` names each key, and the message suggests the matching field
(`aspect_ratio`). Until clipwright#166 such keys were dropped silently, so a
misspelled `aspect_ratio` rendered the default 9:16.

**Rejected fields — do not try to pass them.** They are not declared in the tool
schema, and the server answers 400 `rejected_field` before a run is even created:

| Field | Use instead |
|---|---|
| `character` | `actor_id` from `list_actors`, an `image`, or nothing (default actor); `person` does not select a face |
| `webhook_url` | poll `get_run` — webhooks are not delivered at all |
| `segments`, `broll_url` | a single `script`; segmented clips are not available yet |
| `disclosure_overlay` | nothing: the AI disclosure is already in the run response and in the file |
| `image` and `actor_gender` with the killswitch off | omit both — the render runs on the default actor |

**The aspect ratio can be refused.** Requesting `aspect_ratio: "1:1"` without an
`image` or `actor_id` returns a refusal: the default actor is vertical (432×768), and a square
frame could only come from the vendor's centre crop, which we do not do silently.
To get `1:1`, select an actor with a verified square variant or pass an `image`
with a square public https source. An unavailable actor format is refused before payment.

## 4. The tools

Schemas come from the single source of truth `@clipwright/core`
(`packages/core/src/skills.ts`, barrel `packages/core/src/index.ts`); MCP does not
retype them by hand.

### `quote_ugc` — free

The input is `offeredUgcInputShape` (`packages/mcp-server/src/server.ts`), that
is, the contract MINUS the rejected fields: they simply are not there, and listing
them here would mean offering what the server punishes you for (section 3).

`script` (required while `segments` is rejected; length is limited by the resolved
TTS model, as reported by `tools/list`: `eleven_v3` allows 5000 characters,
`eleven_flash_v2_5` and `eleven_turbo_v2_5` allow 10000. Spaces, audio tags and stress
marks count; emoji may count as two characters. There is no word-count limit or fixed
duration implied by it), `tts_model` (every preset and catalog voice speaks `eleven_v3`, the most
expressive model; `eleven_flash_v2_5` and `eleven_turbo_v2_5` cost less and suit
languages other than Russian), optionally `person` OR
`image` (a public `https` URL) with `actor_gender` (`female`/`male`, only next to
`image`), plus `name`, `captions` (defaults to `false` —
**captions are opt-in, ASK THE USER FIRST**), `caption_style`
(`hormozi`/`tiktok`/`minimal`), `look` (`natural`/`commercial`/`raw_iphone`),
`aspect_ratio` (`9:16`/`1:1`, with NO default — silence and an explicit choice
differ), `resolution` (`720p`/`1080p`/`4k`), `voice`/`voice_id`.

**Russian stress marks.** Tell a user who writes in Russian that they can fix stress:
write the stressed vowel as a capital inside a lowercase word — `потОм`, `зАмок` — and
Clipwright sends `eleven_v3` the stress mark U+0301 (`пото́м`). A capital that starts a
word stays a capital, a word with a second capital or an inner capital consonant
(`ВУЗы`, all caps) stays as written, and a U+0301 typed directly is kept. A single
inner capital vowel always reads as stress, so `ЯндексЕда` needs a space. Keep Russian scripts on `eleven_v3`: the 2.5 models misread the mark, so a script
carrying it draws a warning there, and so does any Cyrillic script. Retrying never
fixes stress; only the text does.

The exact list is always available from the tool schema itself: `tools/list` is
generated from the same shape, and fields that are not honoured carry
`NOT HONORED YET` right in their own `description`.

Spends no credits. The response is the raw `quote` in full:

```json
{
  "skill": "make_ugc",
  "credits_estimate": 360,
  "duration_estimate_sec": 12,
  "warnings": []
}
```

`warnings[]` IS present here (passed through unfiltered) — read it: parameters
that will not be honoured (for example, `captions` ignored in this build) are
declared there rather than dropped silently.

**Always call `quote_ugc` first and show the user the price before `make_ugc`**
(the tool description says so in the imperative).

### `make_ugc` — paid, creates a run

The input is the same shape plus `attempt` (an integer ≥1, optional; see section
5). Money: this is ONE paid render per call, unless idempotency deduplication kicks
in (section 2). **The tool does NOT wait for the video** — it starts the run and
returns a `run_id` immediately:

```json
{
  "status": "IN_PROGRESS",
  "run_id": "run_...",
  "state": "queued",
  "video_url": null,
  "warnings": [],
  "next_action": "Video is NOT ready. Call get_run with run_id=run_... again in ~5 seconds. Repeat until state is 'succeeded' or 'failed'. Do NOT tell the user the video is done until you have a video_url."
}
```

The shape is the one `get_run` returns: `make_ugc` calls the same formatter, so
`warnings[]` is declared HERE, on the very first response, and not one poll later
— by then the paid run is already going. Read it: this is where a format snap or
an ignored field is announced.

After that you MUST poll `get_run` with that `run_id` every ~5–10 seconds until it
reaches a terminal state. Do not tell the user the video is ready until you have a
`video_url`.

#### Choosing a voice (`voice` / `voice_id`)

Two mutually exclusive optional fields in the `make_ugc` input:

- `voice` — the `name` of a voice from the free `list_voices` tool: one of the
  presets (`owner_ru_clone`, `sarah`, `george`, `eric`, `daria_ru_female`) or a
  catalog voice. **The recommended path.** Validated at the boundary: an unknown
  or retired name returns 400 immediately and no paid call is made. The two
  refusals differ: a retired voice's message names the date it left the catalog.
- `voice_id` — a **raw ElevenLabs id** (20 characters), an escape hatch for voices
  OUTSIDE the catalog, cloned ones included. It is checked for free against the
  account at the start of the run (not during `quote`): a non-existent id fails the
  run BEFORE any paid call.
- **The default voice follows the actor's gender.** Without `voice` or `voice_id`,
  a woman speaks `sarah` and a man speaks `george`. The gender comes from the
  `actor_id` catalog entry, or from `actor_gender` next to `image`. The default
  actor speaks `george`. An explicit voice always wins.
- **With `image`, pass `actor_gender` or a `voice`.** Clipwright does not detect
  gender from the photo. Without either, the voice is `george` and `warnings[]`
  says so. `actor_gender` next to `actor_id`, or without `image`, returns 400
  before any charge.
- **Read `actor` in the quote before rendering.** It describes the selected
  actor (`null` means the client sent `image`). An explicit voice is used as
  requested whatever the actor's gender; `actor_gender` next to it changes nothing,
  and a warning says so.

**How to pick a voice when the user asks for one:**

1. Call `list_voices` with the filters the user gave: `language`, `gender`,
   `age`, `use_case`. Language is a filter only: any voice speaks any supported
   language, so a Spanish script can use an English voice.
2. Play the `preview_url` of two or three candidates to the user. A catalog
   voice's sample is in its native language.
3. Pass the chosen `name` as `voice` to `quote_ugc` and then `make_ugc`.
4. Next time, reuse that same `name`. A name always means the same voice.

When the user sends a photo and asks for no particular voice, pass the gender of
the person in it as `actor_gender`. Ask the user only when you cannot tell.

For a Russian script, keep `eleven_v3` and mark stress with a capital vowel
(see **Russian stress marks** above).

### `get_run` — status polling

Input: `{ "run_id": "run_..." }`. The response shape is implemented in
`packages/mcp-server/src/format.ts` (`formatGetRun`) and is given below as it
actually is.

**A non-terminal run**
(`queued`/`scripting`/`tts`/`avatar`/`compositing`/`uploading`) carries the stage
in `state`, with `status` always `"IN_PROGRESS"`:

```json
{
  "status": "IN_PROGRESS",
  "run_id": "run_...",
  "state": "avatar",
  "video_url": null,
  "next_action": "Video is NOT ready. Call get_run with run_id=run_... again in ~5 seconds. Repeat until state is 'succeeded' or 'failed'. Do NOT tell the user the video is done until you have a video_url."
}
```

**Terminal success** carries BOTH `status: "SUCCEEDED"` AND `state: "succeeded"`:

```json
{
  "status": "SUCCEEDED",
  "run_id": "run_...",
  "state": "succeeded",
  "video_url": "https://...",
  "duration_seconds": 13.08
}
```

**Terminal failure** carries BOTH `status: "FAILED"` AND `state: "failed"`:

```json
{
  "status": "FAILED",
  "run_id": "run_...",
  "state": "failed",
  "error": "<error text>"
}
```

**`warnings[]` in `get_run`:** every branch of the response (`IN_PROGRESS`,
`SUCCEEDED`, `FAILED`) carries the run's `warnings` — parameters that were not
honoured are always declared, never dropped silently. `make_ugc` shares the
formatter, so its first response carries them too. Read it on the terminal
response without fail: for instance, missing captions in the prototype are
announced exactly there.

**An unknown terminal status on the server** (say a hypothetical `"canceled"` that
is not in `TERMINAL_STATES`) is a deliberate degradation: `isTerminal` returns
`false`, so such a run lands in the `IN_PROGRESS` branch and the agent is told to
keep polling a run that has already finished. That is accepted prototype behaviour
— MCP and the API ship as one version — not a formatter bug.

### `list_actors` — free, no input

Returns the permanent actor catalog from `/v1/actors`, including stable
`actor_id`, version, name, gender, approximate age and verified image formats.
Each variant has dimensions, `preview_url` and `preview_expires_at`. Preview
links expire; retain `actor_id` for reuse and call the catalog again for fresh previews.

Pass `actor_id` to both `quote_ugc` and `make_ugc`. It cannot be combined with
`image` or `person`. An unavailable actor or format returns an error before paid
work; it never substitutes the default face. Existing runs retain the selected
version and image hash even if the catalog changes later.

### `list_voices` — free, optional filters

Returns the voices for the `voice` field of `make_ugc`: the presets first, then
the catalog voices, by language and then by rank. Costs nothing and creates no run.

All filters are optional:

- `language` — the voice's native language. It is a filter, not a limit: any
  voice speaks any supported language.
- `gender` — `female` or `male`.
- `age` and `use_case` — labels as the entries print them, such as `young` or
  `narrative_story`.
- `model` — keeps the voices whose language that speech model supports.

A voice without a label matches no value of that filter. An unknown value is
refused with the allowed values, and an unknown filter name with
`unknown_field`; neither returns an empty list.

Each entry carries `name`, `kind` (`preset` or `catalog`), `language`,
`description`, `model` (its default speech model) and `supported_models`. A
catalog voice also carries `verified_models` and whichever of `locale`,
`accent`, `gender`, `age` and `use_case` the catalog has. The tool returns
`{ "voices": [...] }` only. REST `GET /v1/voices` also returns `models`, and the
script limit of each model is in `tools/list`.

There is still a network call: the tool hits OUR `/v1/voices` and needs a working
`CLIPWRIGHT_API_KEY`, like the other three. Nobody calls the vendor — the list
lives in `@clipwright/core` and the samples in our own bucket, so this surface
needs no vendor key.

Call it before `make_ugc` when the user asks for "a different voice": a voice
name is preferable to a raw `voice_id`, because a name survives a change of
vendor and an identifier does not.

**Let the user HEAR the voice before paying for it.** Every voice with a recorded
sample carries `preview_url`: a short clip spoken by that voice with its own
model, so it matches what the render will sound like. A catalog voice speaks its
sample in its native language. Descriptions convey neither
diction nor accent nor pace; the owner caught a voice-face mismatch by ear, on a
finished clip. Offer the sample whenever the user asks for a different voice.

The link is signed and expires at `preview_expires_at`, an hour out. For a fresh
one call `list_voices` again; never store it. A voice with no sample carries no
`preview_url` at all — the sample does not exist, rather than having been dropped
from the answer.

### `get_account` — free, no input

Returns the body of `GET /v1/account`: `balance_credits`, `debt_credits`,
`holds_credits` and the unexpired `grants`. It costs nothing and creates no run.

- `debt_credits` above zero blocks `make_ugc` with `debt_outstanding`, whatever
  the balance, until the account buys credits.
- With no debt, `balance_credits` is what a new run can spend.
- `holds_credits` are reserved for runs in progress; they settle when those
  runs finish.

`quote_ugc` already warns in `warnings[]` when `make_ugc` with the same input
would be refused for money or access, so a render rarely needs this call first.
Call it when the user asks how many credits are left, or to show the numbers
behind such a warning.

### `quote_faceless` — free, and `make_faceless` — paid, creates a run

A faceless video is 30 to 90 seconds of narration over an opening animated clip
and image scenes, without an on-camera presenter. Captions are on by default; pass
`captions: false` to turn them off.

Give the narration one of two ways, and name which with `input_mode`:

- `input_mode: "script"` with `script` — your exact text is read as written.
  The video ends with the narration, runs at least 25 seconds and may exceed
  `duration_seconds` by up to 5 seconds, never beyond 90 seconds. A script must
  fit this output range. The charge follows the delivered duration and never
  exceeds the quote; the minimum is 200 base credits plus 150 for the opener.
- `input_mode: "brief"` with `brief` — a short description; the narration is
  written from it.

Send exactly one of `script` and `brief`, the one that matches `input_mode`. The
tool schema lists both as optional because MCP cannot express "one or the
other"; the server and this client both refuse a mismatch, and the client
refuses it before any request is sent.

`duration_seconds` (30 to 90, on a 1/25 s frame boundary) is required. Optional:
`style_reference` (a public https image the scenes follow in style),
`character_reference` (a public https image of a person or figure to keep
consistent) and `scene_images` (your own images, each anchored to a word range
or a quote of the narration). An uploaded image must belong to this account.

Call `quote_faceless` first and show the user the price: it spends nothing and
warns when `make_faceless` would be refused for money or access. `make_faceless`
returns a `run_id` at once; poll `get_run` until `succeeded` (with `video_url`)
or `failed`. As with `make_ugc`, a repeated call with the same input returns the
same run, and `attempt` 2, 3, … deliberately starts a new paid one. When
faceless generation is switched off on the server, both tools answer
`paid_render_disabled` and nothing is charged.

## 5. Retrying a failed run is NOT a permanent refusal

If `get_run` returned a terminal `FAILED` and you call `make_ugc` AGAIN with the
SAME input (same `script` and options) and WITHOUT changing `attempt`, the server
returns THAT SAME terminal failed run as it is (same error, same `run_id`) instead
of starting a new paid render. That is idempotency deduplication (section 2), not
a sign that the video is forever out of reach.

**To actually retry, pass `attempt` one higher than before** (the first call is
`attempt=1` by default; the second attempt is `attempt: 2`, the third `attempt: 3`,
and so on). This is the behaviour documented verbatim in the `make_ugc` tool
description:

> "Pass attempt=2,3,… to deliberately start a NEW run for the same input
> (retry after a failure)."

Technically `attempt` does not go into the render request body but into the SDK
options, and becomes a `:N` suffix on the idempotency key — a different suffix
gives a different key, so the server sees a NEW request, which means a new
`run_id` and a new paid vendor call.

Do not confuse this with `CLIPWRIGHT_CLIENT_ID`: `attempt` is the agent's
deliberate "this is a new attempt", while `clientId` is the fixed identity of the
installation and must NOT change between attempts.

### ⚠️ EVERY `attempt` BUMP COSTS MONEY

A new `attempt` is a new run and a **new paid vendor call**, not a free resend.
The loop "failed → bump → failed → bump" burns real credits on every iteration.

So:

- **read the `error` of the failed run before retrying.** Refusals such as
  `rejected_field`, `aspect_conflict` or `script_encoding_lost` are NOT fixed by
  retrying — they are determined by the input, and the next attempt fails the
  same way, only now for money. `script_encoding_lost` in particular cannot be
  fixed at all by sending the same text again: the bytes were lost before the
  request reached us, so re-send the script decoded as UTF-8;
- **`speech_too_short_for_script` is almost never fixed by retrying either.**
  The vendor's pronunciation and stress are determined by the text; only the
  length varies, and only within the vendor's measured spread. A take just under
  the threshold may pass on a second try, but a take far under it will not —
  change the text or the voice instead;
- **bump `attempt` only for a refusal that looks temporary** (vendor timeout, 5xx,
  a dropped connection);
- **no daily cap stands between you and your credits (0.7.0).** Not on your
  account, and not on the service either: `global_cap_exceeded` is no longer
  produced. What still stops a run before any paid call is your own balance, an
  unpaid debt, and our killswitch.

## 5.1. Server refusals are read from fields, not guessed (0.2.0)

Since 0.2.0 an API refusal carries structured fields instead of one free-form
sentence. It still arrives the way every tool result does — as JSON **inside the
text block**, with `isError: true`:

```ts
{ content: [{ type: "text", text: "{\"status\":\"FAILED\", …}" }], isError: true }
```

So `JSON.parse(content[0].text)` first, then read the fields below. Reading
`content[0].balance_credits` gives `undefined`: the numbers are inside the parsed
text, not beside it. Do not relay the raw text to the user and do not guess from
it.

```json
{
  "status": "RETRY_LATER" | "FAILED",
  "code": "rate_limited" | "insufficient_credits" | "debt_outstanding" | "http_503" | …,
  "message": "<human-readable text from the server>",
  "retryable": true | false,
  "next_action": "<what to do right now>",
  "retry_after_seconds": 7,
  "balance_credits": 3,
  "required_credits": 8,
  "debt_credits": 120
}
```

Numeric fields appear only where the refusal actually has them:

| Field | Appears on |
| --- | --- |
| `retry_after_seconds` | `rate_limited`, and any `http_5xx` where the server named a pause |
| `limit`, `window_seconds` | only when the 429 body followed the Clipwright contract; a 429 whose body did not carries neither |
| `balance_credits`, `required_credits` | `insufficient_credits` only |
| `debt_credits` | `debt_outstanding` only |

Treat every one of them as optional and read what is there. In particular, do not
expect balance numbers on `debt_outstanding`: that refusal reports the debt, and
the balance is not what blocks the run.

**One rule: look at `retryable`.**

- `retryable: true` (`rate_limited`, 5xx) — wait `retry_after_seconds` and repeat
  **THE SAME call with the same arguments**. Do not bump `attempt`: this is not a
  failed run but a refused request, and a new `attempt` would mean a second paid
  render (section 5).
- `retryable: false` (`insufficient_credits`, `debt_outstanding`,
  `account_not_admitted`, other 4xx) — **stop and tell the human**. A repeat
  gives the same answer while eating into the rate limit. For money refusals,
  quote the NUMBERS: "the account has 3 credits, this needs 8" — without them the
  human cannot tell how much to buy.

`account_not_admitted` (403) is not a money refusal and carries no numbers: the
account has no beta access. Buying credits will not lift it — access is granted
by the operator. Say that, and do not offer to top up.

Do NOT promise a position in line or an upcoming batch. The refusal says one
thing only: this account has no access right now. An account whose access was
REVOKED gets the same 403, and promising it a turn would be a lie at the worst
possible moment.

The two money codes are cured the same way — buy credits — but they must not be
conflated, because they describe different situations. `insufficient_credits`
means the balance is too small for this run. `debt_outstanding` means the account
owes credits, and it can owe them while still holding a balance, so telling the
human "you do not have enough credits" would be false. Credits bought while a
debt stands clear the debt first and only then reach the balance. Clearing the
debt lifts this particular refusal and nothing else: the run still needs enough
credits of its own, so a purchase equal to the debt clears it and adds nothing to
the balance. Quote the debt figure, and say that credits go to the debt first: a
purchase adds to the balance only the part that exceeds the debt. Whether the
human has to buy more than the debt depends on what the balance already holds,
and this refusal does not say — the balance is not what blocks the run.

Do not read a source into the refusal. A `429` or a `5xx` can come from the
Clipwright API itself or from anything between you and it, and the fields above
cannot tell you which — so the report does not claim one, and neither should you
when relaying it. What is certain is the code and what to do about it.

About `429` specifically: it does **not** mean no run was created. The rate limit
sits in front of the handler, so a repeat carrying an already-used idempotency key
gets one too. Retry with THE SAME key — a new key is a new paid render.

**Nobody waits on your behalf here — you do the polling.** `get_run` makes one
call and hands you whatever came back, refusals included. So a `429` on a status
check is yours to sit out: wait `retry_after_seconds`, then call `get_run` again
with the same `run_id`. Do not treat it as a failed run and do not start a new
one — the run is already running and already paid for.

(The SDK's own `makeUgc` does wait these out internally, which is why the CLI and
direct SDK users never see them. The MCP tools are deliberately thin: `make_ugc`
returns as soon as the run starts, so a long render never blocks your turn.)

## 6. On failure — plain curl as a diagnosis splitter

If the MCP path does not get you to a playable video, hit the same public REST
directly with curl, bypassing MCP, SDK and CLI entirely. If curl gets through, the
packaging layer is at fault; if it does not, production or the network is.

**Two commands, no repository needed** (the package is installed from npm and
carries no scripts):

```bash
TOKEN=cw_...                       # the same value as CLIPWRIGHT_API_KEY, section 1.3
API=https://api.clipwright.io

# 1. Start a run. The idempotency key is required and must be UNIQUE per call:
#    a repeated key returns the earlier run instead of a new one (section 2).
#    Generate it with Node, not uuidgen: Node is certainly here (the package is
#    installed via npx), while uuidgen may be missing on a bare Linux image — and
#    then the shell silently substitutes an empty string, the key becomes
#    constant, and a second run returns the earlier one, ruining exactly the
#    diagnosis you started it for.
curl -sS -X POST "$API/v1/skills/make_ugc/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cw-$(node -e 'process.stdout.write(crypto.randomUUID())')" \
  -d '{"script":"Hello! This is a test line."}'

# 2. Poll until terminal, every ~5–10 s.
curl -sS "$API/v1/runs/<run_id>" -H "Authorization: Bearer $TOKEN"
```

Reading the result:

- **curl reaches `succeeded` with its own `run_id` and a playable link, but MCP
  does not:** the root cause is in the MCP packaging layer (build, host config,
  environment — section 1), not in the REST API and not in access or the token.
- **curl fails too:** the problem is not MCP. Check `$TOKEN` from the commands
  above (shaped `cw_*`, not truncated when copied), network access to `$API`, and —
  for the cloned-run story — that `CLIPWRIGHT_CLIENT_ID` really is unique on this
  machine (section 2). If you get a 200 with a `run_id` that is not yours in
  substance, that is the symptom of the collapse described in section 2 on the MCP
  path; curl (which uses its own random `Idempotency-Key` per call) will not
  reproduce it directly, but it is worth checking separately via `get_run` on that
  `run_id`.

The second request above — `GET /v1/runs/{id}` — is free: you can poll an existing
run as often as you like without making a new paid call.

## The whole sequence (what must reproduce)

1. Install the server: `npx -y -p @clipwright/mcp-server@latest clipwright-mcp`
   starts and prints `running on stdio` (section 1.1). From source:
   `pnpm install && pnpm build` in the repository root, then `dist/index.js`
   exists.
2. Generate a unique `CLIPWRIGHT_CLIENT_ID` (section 2) and put it, together with
   `CLIPWRIGHT_API_KEY`, into the MCP host config (section 1.3).
3. Restart the host and confirm `tools/list` returns 4 tools (`make_ugc`,
   `quote_ugc`, `get_run`, `list_voices`).
4. `quote_ugc` with a script → show the price AND read `source`,
   `resolved_aspect_ratio`, `warnings[]` (section 3).
5. `make_ugc` → get a `run_id` immediately.
6. `get_run` every ~5–10 s, reading `state` along the way and `status` + `state` on
   the terminal response, until `SUCCEEDED` (`video_url`) or `FAILED` (`error`).
7. On failure — the same two curl commands from section 6 to split the diagnosis.

### If you are a second user evaluating the product

You have one task: **reach a playable video using this file, without spoken help
from the owner.** What is being tested is the completeness of the guide, not you —
so do not ask, write down where you got stuck.

Before you start, make sure of two different things.

1. **The token was issued on YOUR account, not merely as a separate token.** The
   idempotency axis is `account_id`, and one account can hold several live tokens.
   Your own account means another person's run cannot reach you at all. You cannot
   check this from your side: the account behind a token is visible only to the
   service. So the confirmation that the token was issued on a SEPARATE account
   comes WITH the token — it is part of handing it over, not a question for the
   owner. If it did not come, that is a gap in the instructions: write it down and
   move on, no need to ask.
2. **`CLIPWRIGHT_CLIENT_ID` was not copied from anyone's machine** (section 2). It
   matters WITHIN an account: if you and the owner ended up on one account (even
   under different tokens) AND your `clientId` matched, the server returns THE
   OWNER'S RUN with a 200 and a playable link — a false success that looks more
   convincing than a real one. It can match through a shared `HOME`, a copied
   value, or a cloned image; a genuinely separate installation has its own even
   without the environment variable.

Tell two classes of failure apart, because they are fixed differently:

- **`rejected_field`, `unknown_field`, `aspect_conflict`** — a contract doing its job, not a
  defect. Read the error text: it names both the reason and the replacement;
- **everything else** (timeout, 5xx, empty response, tool not found) — a candidate
  for a real defect. Here, run the same two curl commands from section 6: if curl
  reaches a playable link and MCP does not, the cause is in the MCP packaging
  layer, and that should be written down separately from the rest.
