# @clipwright/cli

Command-line client for the [Clipwright](https://clipwright.io) UGC video API.

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

| Command | What it does |
| --- | --- |
| `quote --script <text>` | Estimates the credit cost. Spends nothing. |
| `make --script <text>` | Renders a clip and waits for it. **Costs credits.** Prints the video URL to stdout, progress and warnings to stderr. |
| `upload <path>` | Uploads a local PNG/JPEG and prints the https url to pass as `--image`. Free. |
| `runs <id>` | Prints the state of one run. |
| `voices` | Lists voices for `--voice`: the presets, then the catalog. Narrow it with `--language`, `--gender`, `--age`, `--use-case` and `--model`. Free. |
| `actors` | Lists the actors this account can use: the Clipwright catalog and your own. Free. |
| `quote-actor` | Estimates the cost of a personal actor. Spends nothing. |
| `create-actor` | Creates a personal actor from a description. **Costs credits** — one charge per requested format. Prints the run; follow it with `runs <id>`. |
| `delete-actor <id>` | Deletes a personal actor of this account. Videos already made with it stay as they are. Free. |

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

Every preset and catalog voice speaks `eleven_v3`. `--tts-model` overrides it with
`eleven_flash_v2_5` or `eleven_turbo_v2_5`, which cost less but misread Russian stress
marks. In a Russian script, mark stress with a capital vowel inside the word: `потОм`.

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
