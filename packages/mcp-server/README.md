# @clipwright/mcp-server

Your coding agent writes the script; [Clipwright](https://clipwright.io) renders
a short vertical video of an actor speaking it, 1080×1920 by default. The agent
asks for a free quote before it spends anything, and whatever the API cannot
honor comes back in `warnings[]` instead of being dropped silently.

The agent gets a `run_id` at once and polls until the video URL is ready.
Clipwright returns the file; it does not publish anywhere. Quotes, voices,
actors and the account balance are free. Renders spend credits: an account opened
by signing up starts with none, so buy a pack at [clipwright.io/pricing](https://clipwright.io/pricing)
before the first one.

## Install

```bash
claude mcp add clipwright -e CLIPWRIGHT_API_KEY=cw_... -- npx -y -p @clipwright/mcp-server clipwright-mcp
```

Put your own key in place of `cw_...`. The command is one line and gives the
shell nothing to expand, so bash, zsh and PowerShell run it alike. It needs
Node.js 20 or newer.

Any MCP host works — the server speaks JSON-RPC over stdio.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `CLIPWRIGHT_API_KEY` | yes | Your `cw_*` token. The process exits immediately without it. |
| `CLIPWRIGHT_CLIENT_ID` | recommended | Identifies this **installation** and enters the idempotency key, so two installations never collapse into one run. Left unset, the server keeps one in `~/.clipwright/client-id`, which suits a single laptop. Set it yourself where a home directory is shared, cloned or read-only — containers, CI, copied images — as `SKILL.md` §2 explains. |
| `CLIPWRIGHT_API_URL` | no | Defaults to the hosted API. |

## Tools

- `list_voices` — voices for `voice`: the presets and the catalog, with
  filters by language, gender, age, use case and model, and a short audio
  sample where the voice has one. Free, spends no credits.
- `list_actors` — ready-made faces with stable ids and verified formats. Free.
- `quote_ugc` — estimated duration and price, plus a warning when `make_ugc`
  with the same input would be refused for money or access. Free.
- `get_account` — balance, debt and holds of the account. Free.
- `make_ugc` — **renders a clip; this is the call that costs money.** Returns a
  `run_id` immediately instead of blocking, because a render takes minutes.
- `get_run` — status of a run. Free; poll it every few seconds.
- `upload_image` — a local PNG/JPEG → signed https url to pass as `image`. Free;
  20 per day, the url lives 24 hours. Set `aspect_ratio` explicitly afterwards.
- `quote_actor` — price of a personal actor before creating one. Free.
- `create_actor` — **creates a personal actor from a description; this costs
  money.** Each requested format is a separate charged image. Returns a `run_id`
  immediately; poll `get_run` until `succeeded`, then pass `created_actor.actor_id`
  to `make_ugc` as `actor_id`.
- `delete_actor` — removes a personal actor of this account. Videos already made
  with it stay as they are. Free.
- `get_actor_defaults`, `set_actor_defaults` — read and save an actor's B-roll
  default. It is stored only: today's talking-actor videos do not use it. Free.

Call `quote_ugc` before `make_ugc`: the quote is where the contract tells you
what it will and will not honor. Anything the API cannot deliver comes back in
`warnings[]` rather than being dropped silently, and unsupported fields are
rejected up front instead of being accepted and ignored.

Bumping the `attempt` field starts a **new paid render**. It is the way to retry
a failed run on purpose, not a free refresh.

`SKILL.md` ships inside the package with the full operating instructions, and
`CHANGELOG.md` next to it says what changed in each release and what was removed.

## Privacy

The server sends your script, chosen options and any uploaded image to the
Clipwright API to quote and render the video. How that data is handled:
[clipwright.io/privacy](https://clipwright.io/privacy). Documentation:
[clipwright.io/docs](https://clipwright.io/docs).
