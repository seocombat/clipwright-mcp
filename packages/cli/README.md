# @clipwright/cli

Command-line client for the [Clipwright](https://clipwright.io/?ref=npm) UGC and faceless
video API.

```bash
export CLIPWRIGHT_API_KEY=cw_...

npx -y -p @clipwright/cli clipwright quote --script "Hello from Clipwright."
npx -y -p @clipwright/cli clipwright make  --script "Hello from Clipwright."
```

The package installs the same program under two names, `clipwright` and
`clipwright-cli`. An unrelated npm package also called `clipwright` ships a binary
under the short name, so installing both in one project leaves only one of them in
`node_modules/.bin` — silently. Use `clipwright-cli` where that matters. The commands
above name the package with `-p`, so they resolve here either way.

Recipes, each a prompt an agent turned into a video with the call it sent and
the price, are in the [`@clipwright/mcp-server` README](https://www.npmjs.com/package/@clipwright/mcp-server).

| Command | What it does |
| --- | --- |
| `quote --script <text>` | Estimates the credit cost. Spends nothing. |
| `make --script <text>` | Renders a clip and waits for it. **Costs credits.** Prints the video URL to stdout, progress and warnings to stderr. |
| `upload <path>` | Uploads a local PNG/JPEG and prints the https url to pass as `--image`. Free. |
| `runs <id>` | Prints the state of one run. |
| `voices` | Lists voices for `--voice` on `make`: the presets, the voices of `gemini-3.8-flash-tts`, then the catalog. `--skill make_faceless` lists the narration voices for `make-faceless` instead. Narrow it with `--language`, `--gender`, `--age`, `--use-case` and `--model`. Free. |
| `actors` | Lists the actors this account can use: the Clipwright catalog and your own. Free. |
| `quote-actor` | Estimates the cost of a personal actor. Spends nothing. |
| `create-actor` | Creates a personal actor from a description. **Costs credits** — one charge per requested format. Prints the run; follow it with `runs <id>`. |
| `quote-faceless` | Estimates the cost of a faceless video. Spends nothing. |
| `make-faceless` | Starts a faceless video: narration over an opening animated clip and image scenes. **Costs credits.** Prints the run; follow it with `runs <id>`. |
| `delete-actor <id>` | Deletes a personal actor of this account. Videos already made with it stay as they are. Free. |
| `shots <run>` | Lists the shots of a finished video: span, kind, start of the description and preview link of each. Free. |
| `edit-show <run>` | Prints the draft of an edit of a run as JSON. Version 0 means nothing is stored. Free. |
| `edit-save <run> --file <path>` | Saves the draft from a file `edit-show` printed. Charges nothing and renders nothing. |
| `revise-quote <run>` | Prices a revision of a faceless video and prints the quote as JSON. Spends nothing. |
| `revise <run>` | Starts a revision: a new run that renders the video again with the shots you change. **Costs credits.** Prints the run; follow it with `runs <id>`. |
| `candidate-quote <run>` | Prices a shot candidate, one picture or clip for one shot, and prints the quote as JSON. Spends nothing. |
| `candidate <run>` | Prints the quote of a shot candidate; with `--yes` makes it. **Costs credits.** Prints the run; follow it with `runs <id>`. |
| `candidates <run>` | Lists the shot candidates of a video's family as JSON, with state, charge and preview. Free. |
| `uploads` | Lists your uploads that a revision still takes as JSON, newest first, each with a fresh url and `usable_until`. Free. |
| `workflows` | Public workflow methods and availability as JSON. Free. |
| `workflow-show <method>` | One method's rules, requirements and limitations as JSON. Free. |
| `plan-create --file <path>` | Store `{ document }` without starting a run. Free. |
| `plan-show <plan>` | Print the current owned plan and revision as JSON. Free. |
| `plan-save <plan> --file <path>` | Save `{ base_version, document }` or the complete plan-show output for this plan. Free. |
| `plan-approve <plan> --file <path>` | Explicitly approve `{ revision, content_digest }`. Free; starts no run. |
| `plan-quote <plan>` | Print the approved plan's quote as JSON. Free. |
| `plan-run <plan> --file <path>` | Start one explicitly keyed paid workflow and print its receipt and native run immediately. |

## Workflow files and explicit purchases

The four native methods are `ugc-product-intro`, `ugc-faq-answer`,
`faceless-explainer` and `product-image-story`, subject to their executor's
configuration, qualification and activation. `website-proof-demo` and
`kinetic-launch` remain `execution_blocked` with reasons.

Workflow commands print JSON to stdout; API refusal messages, including all
issues and warnings, go to stderr. Files must be valid UTF-8 JSON and at most
1 MiB before parsing. Documents have a separate 256000 JSON-byte limit.
Unknown write fields are refused; accepted raw narration is preserved.

Start with a method's complete example, then edit its brief and evidence to
match your intent. Preserve the method/capability pins and accepted raw script:

```bash
clipwright workflow-show faceless-explainer > method.json
jq '{document: {v: 1, method: {method_id: .descriptor.id, version: .descriptor.version, content_digest: .descriptor.content_digest, capability_digest: .capabilities.content_digest}, brief: .descriptor.example.brief, beats: .descriptor.example.beats, claims: [], assets: []}}' method.json > create.json
```

Inspect the plan's readiness issues and warnings before choosing its exact
revision for approval:

```bash
clipwright plan-create --file create.json > plan.json
jq '{revision, content_digest}' plan.json > approval.json
clipwright plan-approve wfp_example --file approval.json
clipwright plan-quote wfp_example > quote.json
```

Replace `wfp_example` with the returned plan id. After accepting the quoted
price, choose one stable key for this purchase and extract exactly the launch
fields. Do not send the whole quote as the launch file:

```bash
jq '{revision, content_digest, semantic_input_digest, quote_id, idempotency_key: "workflow-example:1"}' quote.json > launch.json
clipwright plan-run wfp_example --file launch.json
clipwright runs run_example
```

Use the returned run id in `runs`. The launch does not wait for the video.
If its answer is uncertain, keep and explicitly resend the original file and
key to recover that purchase; a new key can pay twice. No workflow command
automatically approves, quotes, launches or selects a new attempt.

`plan-show wfp_example > edited.json` produces a file you can edit and pass to
`plan-save wfp_example --file edited.json`. The CLI requires its original plan
id, takes its revision as the base version, and validates the original document
strictly. Future document fields survive reading and cause an unsupported
save to fail before fetch. A repeated explicit save after a lost answer returns
the already-saved current revision; a different current document conflicts.

`runs` appends optional workflow JSON with the purchased plan and available
artifact/placement evidence. It keeps native state and warnings. Missing proof
is explicit `null` with a validation issue; `[]` means verified no placements.
Historical evidence does not renew a download URL, and
`creative_acceptance: "not_reviewed"` is separate from technical delivery.
Original product images use owned upload ids, digests and nonoverlapping
word/quote anchors in supported IMAGE shots; the generated opener is
illustrative. Required unsupported layouts or unproven protected placement
are refused. See the [workflow API contract](https://clipwright.io/docs).

## Native video commands

`quote` and `make` take the actor's photo as `--image <url>` or `--image-file <path>`
(uploaded first, then passed on), plus `--aspect-ratio 9:16|1:1|16:9` and
`--resolution 720p|1080p|4k`. Pass `--aspect-ratio` explicitly with a picture:
without it a landscape photo renders vertical, with a warning.

Pick a voice with `--voice <name>` from that catalog, or `--voice-id <id>` for a
vendor voice outside it (a cloned one, for instance). Set neither and the voice
follows the actor's gender: `sarah` for a woman, `george` for a man. The gender
comes from the `--actor-id` catalog entry, or from `--actor-gender female|male`
next to `--image`. The default actor speaks `george`. `--image` without
`--actor-gender` also gets `george`, and the response warns about it.
`--actor-gender` with `--actor-id` is refused. `voices` prints a `sample:` link under
each voice: play it before you pay for a render, and reuse the same name next time.
`--language` filters by a voice's native language; any voice speaks any supported
language.

The voice decides the speech model. The Russian presets `owner_ru_clone` and
`daria_ru_female` and the catalog voices named `ru_*` speak `eleven_v4`; every other
preset and catalog voice speaks `eleven_v3`. A `--voice-id` voice speaks `eleven_v4` when
the script is mostly Cyrillic and `eleven_v3` otherwise. `--tts-model` overrides the
choice: `eleven_flash_v2_5` and `eleven_turbo_v2_5` cost less but misread Russian stress
marks. In a Russian script, mark stress with a capital vowel inside the word: `потОм`.
`eleven_v4`, `eleven_v3` and `gemini-3.8-flash-tts` read it as stress. `eleven_v4` and
`gemini-3.8-flash-tts` give no pause for a `<break time="…" />` tag: the tag is cut from
the text, and the response warns about it.

`gemini-3.8-flash-tts` speaks only its own thirty voices: `voices --model
gemini-3.8-flash-tts` lists them. Naming one (`--voice kore`) selects that model without
`--tts-model`; `--tts-model gemini-3.8-flash-tts` without `--voice` speaks `kore` for a
woman and `charon` otherwise. A preset, a catalog voice, `--voice-id` and `--captions`
are refused with it before any charge. Its voices have a sample in English, and
`voices --language ru` links the Russian one.

`quote-faceless` and `make-faceless` take the narration as `--script <text>`,
`--script-file <path>` or `--brief <text>` (a short description the narration is
written from), plus a required `--duration <seconds>` from 30 to 90. The video
ends with the narration, runs at least 25 seconds and may exceed the selection
by up to a quarter, never beyond 90 seconds; a video more than 5 seconds longer
says so in `warnings[]`. A script is accepted when its estimated length is 21
seconds to the selection plus 5, at most 90. The charge follows the delivered duration and never exceeds the quote;
the minimum remains 200 base credits plus 150 for the opening clip.
Captions are on; `--no-captions`
turns them off. `--style-reference <url>` and `--character-reference <url>` take
public https images. `--voice <name>` picks the narration voice: take a name
from `voices --skill make_faceless`, where each line shows the voice's language
and gender. Without it the narration is read by `narrator_en_wise_lady`. A
`make` voice such as `george` and an unknown name are refused before any
charge. Quote first: both commands take the same flags, so the
quote prices exactly the request `make-faceless` would send.

`shots <run>` prints text: the line of the run, whether it can be edited and
until when its media are stored, then one line per shot with a preview link
under it. The link points at a large source file; the command prints it and
downloads nothing. A description or a link the API did not give is printed as
`withheld` or `none`. A run with no shots to show prints the reason and exits
with code 0.

`edit-show <run>` writes only the draft's JSON to stdout, so you can keep it in
a file, change the `document` and pass the file to `edit-save`; the version and
the issues of the draft go to stderr. `edit-save <run> --file <path>` reads
`version` and `document` from that file, ignores its other keys and sends them
as the base version and the document. A file of another shape is refused before
any request. When the save is refused because the draft has another version,
the command reads the draft once. If the draft already holds your document one
version later, an earlier send went through and the save is reported as done.
Otherwise it reports the conflict with the stored version: run `edit-show`
again and apply your change to that draft. Write the new draft to another file
than the one you pass with `--file`.

`revise-quote` and `revise` take one of two inputs: `--shot <id>` with one of
`--retake`, `--new-picture <description>` or `--animate [motion]`, or
`--document <path>`, a file `edit-show` printed whose edited `document` is the
whole revision. A revision that delivers is charged its quoted total; one that
fails is charged nothing, even when its paid work was already done. The same
request sent again returns the run it started; `--retry 2` starts a second
revision. While paid edits are closed on the server, both commands answer
`editing_disabled`.

`candidate-quote` and `candidate` take `--shot <id>` with one of `--retake`,
`--new-picture <description>` or `--animate [motion]`, and `--take <n>`, 1 by
default. `candidate` prints the price first and starts nothing without `--yes`.
A delivered candidate is charged its one unit whether it is kept or discarded;
one that fails is charged nothing, even when its paid work was already done.
The same request and take sent again return the run they started; `--take 2`
makes another candidate, charged again. While shot candidates are closed on the
server, the three commands answer `editing_disabled`.

`make` retries are explicit: `--retry 2` deliberately starts a *new* run for the
same script. Without it a repeated call returns the run you already paid for,
because every request carries an idempotency key derived from the input and from
this installation's id. A non-numeric `--retry` is rejected rather than coerced:
the value ends up in that key, so a silent `NaN` would buy you a second render.

Set `CLIPWRIGHT_CLIENT_ID` to a stable per-install value, or leave `~/.clipwright/`
writable so the client can create one on first use. It refuses to invent a
throwaway id, because a per-process id would disable duplicate protection
silently — and the duplicate it fails to catch is a second paid render.

`CLIPWRIGHT_API_URL` overrides the API base URL; the default points at
production.

## Changelog

What changed in each release, and what was removed, is in `CHANGELOG.md` inside
this package. Read its **Breaking:** entries before upgrading.
