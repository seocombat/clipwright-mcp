# @clipwright/mcp-server

Your coding agent writes the script; [Clipwright](https://clipwright.io/?ref=npm) renders
a short vertical video of an actor speaking it, 1080×1920 by default. It also
makes faceless videos of up to 90 seconds from a script or a short brief: narration
over an opening animated clip and image scenes, with no on-camera presenter. The agent
asks for a free quote before it spends anything, and whatever the API cannot
honor comes back in `warnings[]` instead of being dropped silently.

The agent gets a `run_id` at once and polls until the video URL is ready.
Clipwright returns the file; it does not publish anywhere. Quotes, voices,
actors and the account balance are free. Renders spend credits: an account opened
by signing up starts with 420 trial credits, enough for one 90-second faceless video. Buy more at
[clipwright.io/pricing](https://clipwright.io/pricing?ref=npm).

## Install

There are two ways to connect: the hosted server at
`https://mcp.clipwright.io/mcp`, or this package run locally over stdio. Both
serve the same tools.

### Hosted server, no key

Add the URL to your client. On first use the client opens a browser, you sign
in to Clipwright and approve the app. **Claude Code and the device-code flow
below were verified live on 2026-10-18;** the other commands come from each
client's own documentation and have not been tried with Clipwright yet.

- **Claude Code** (verified live): `claude mcp add --transport http clipwright https://mcp.clipwright.io/mcp`,
  then run `/mcp` in a session and sign in.
- **Claude.ai and Claude Desktop:** Customize → Connectors → Add custom
  connector, then paste the URL.
- **ChatGPT:** add the URL as the remote MCP server of a plugin, as OpenAI's
  guide "Connect and test your plugin" describes; ChatGPT signs in with OAuth.
- **Cursor:** in `~/.cursor/mcp.json`,
  `{"mcpServers": {"clipwright": {"url": "https://mcp.clipwright.io/mcp"}}}`.
- **VS Code:** in `.mcp.json` at the workspace root,
  `{"mcpServers": {"clipwright": {"type": "http", "url": "https://mcp.clipwright.io/mcp"}}}`.
- **Gemini CLI:** `gemini mcp add --transport http clipwright https://mcp.clipwright.io/mcp`,
  then `/mcp auth clipwright`.
- **Codex:** `codex mcp add clipwright --url https://mcp.clipwright.io/mcp`,
  then `codex mcp login clipwright`.

The approval page lists the permissions the app asks for. There are two:

- `mcp:read` — the tools marked read-only: account, runs, shots, voices,
  actors, workflows and quotes.
- `mcp:write` — every other tool. Some start paid runs and **spend credits**;
  the rest change the account (actors, uploads, workflow plans).

A connection without `mcp:write` gets `403 insufficient_scope` from those
tools, and nothing is charged. Only an admitted account can approve.

To disconnect an app, open [app.clipwright.io/api-keys](https://app.clipwright.io/api-keys),
find it under **Connected apps** and revoke it. Its next request gets `401`. A
connection lasts 90 days from approval; after that the app asks you to sign in
again.

On the hosted server `upload_image` cannot read a file on your machine. Pass a
public https URL as `upload_image({url})` and the server downloads it, or call
`create_upload` and PUT the file to the returned `put_url` with curl. Either
way you get an `upload_id` for `first_frame`, `last_frame` and `references`.

**An agent with no browser** signs in with a device code and the first-party
client `clipwright-agent` (verified live 2026-10-18):

```bash
curl -s https://mcp.clipwright.io/device/auth -d client_id=clipwright-agent \
  --data-urlencode "scope=mcp:read mcp:write offline_access" \
  --data-urlencode "resource=https://mcp.clipwright.io/mcp"
```

Open `verification_uri` (`https://mcp.clipwright.io/device`) on any device,
enter `user_code`, sign in and approve; the approval page repeats the code.
Meanwhile poll `POST https://mcp.clipwright.io/token` with
`grant_type=urn:ietf:params:oauth:grant-type:device_code`, the `device_code`
and `client_id=clipwright-agent`, no more often than every 5 seconds: a faster
poll gets `slow_down`. Send the `access_token` as `Authorization: Bearer` to
`/mcp`; it lasts an hour. Renew it with `grant_type=refresh_token` and keep the
newest refresh token each time. The device flow is open to this client only.

### Hosted server with a `cw_*` key

For CI and scripts, send a key instead of signing in. A key holds both
permissions.

```bash
claude mcp add --transport http clipwright https://mcp.clipwright.io/mcp --header "Authorization: Bearer cw_..."
```

### n8n

n8n's built-in **MCP Client** node calls one tool per node:

- **Server Transport:** HTTP Streamable; **MCP Endpoint URL:** `https://mcp.clipwright.io/mcp`.
- **Authentication:** Bearer Auth, with a credential whose token is your `cw_...` key.
- **Tool:** pick from the list, for example `quote_ugc`; **Input Mode:** JSON.

Verified live on 2026-10-20 with self-hosted n8n 2.43.8: `get_account`,
`quote_ugc` and `get_run` returned through the node. A workflow to import,
`n8n/clipwright-ugc.json` in [seocombat/clipwright-mcp](https://github.com/seocombat/clipwright-mcp),
quotes a script, stops when the quote is above `max_credits`, starts `make_ugc`
and polls `get_run` every 15 seconds. The whole workflow ran on n8n Cloud on
2026-10-20 and returned a 1080×1920 MP4 in about three minutes. n8n's OAuth
credential has not been run against Clipwright yet.

### Local server over stdio

```bash
claude mcp add clipwright -e CLIPWRIGHT_API_KEY=cw_... -- npx -y -p @clipwright/mcp-server clipwright-mcp
```

Put your own key in place of `cw_...`. The command is one line and gives the
shell nothing to expand, so bash, zsh and PowerShell run it alike. It needs
Node.js 20 or newer.

Any MCP host works — the local server speaks JSON-RPC over stdio. Issue keys at
[app.clipwright.io/api-keys](https://app.clipwright.io/api-keys).

## Environment

These variables configure the local server.

| Variable | Required | Meaning |
|---|---|---|
| `CLIPWRIGHT_API_KEY` | yes | Your `cw_*` token. The process exits immediately without it. |
| `CLIPWRIGHT_CLIENT_ID` | recommended | Identifies this **installation** and enters the idempotency key, so two installations never collapse into one run. Left unset, the server keeps one in `~/.clipwright/client-id`, which suits a single laptop. Set it yourself where a home directory is shared, cloned or read-only — containers, CI, copied images — as `SKILL.md` §2 explains. |
| `CLIPWRIGHT_API_URL` | no | Defaults to the hosted API. |

## Tools

- `list_workflows` — read workflow methods and current availability. Free.
- `get_workflow` — read one method's required inputs, script rules, evidence and limitations. Free.
- `prepare_workflow_plan` — create with a complete document, or save with both `plan_id` and `base_version`. Free; starts no run.
- `get_workflow_plan` — read the current owned plan, revision and readiness. Free.
- `approve_workflow_plan` — explicitly approve a chosen revision and content digest. Free; starts no run.
- `quote_workflow_plan` — quote the approved revision without spending credits.
- `run_workflow_plan` — start a paid workflow using its exact quote fields and an explicit idempotency key. Returns its receipt and run id immediately; poll `get_run`. Recover an uncertain purchase with the original request and key.
- `list_voices` — voices for `voice`: the presets, the thirty voices of the
  speech model `gemini-3.8-flash-tts` and the catalog for `make_ugc`, with
  filters by language, gender, age, use case and model, and a short audio
  sample where the voice has one. The seventeen narration voices of
  `make_faceless` are listed with `skill: "make_faceless"`. Free, spends no
  credits.
- `list_actors` — ready-made faces with stable ids and verified formats. Free.
- `quote_ugc` — estimated duration and price, plus a warning when `make_ugc`
  with the same input would be refused for money or access. Free.
- `get_account` — balance, debt and holds of the account. Free.
- `make_ugc` — **renders a clip; this is the call that costs money.** Returns a
  `run_id` immediately instead of blocking, because a render takes minutes.
- `get_run` — status of a run. Free; poll it every few seconds.
- `get_run_shots` — the shots of a finished video: the span, kind, description
  and preview link of each, with the narration words and their timing. Free and
  read-only. A run with no shots to show answers with the reason instead.
- `quote_revision` — price of a revision of a faceless video: what it would
  change and what it costs. Free.
- `revise_run` — **starts a revision: a new run that renders the video again
  with the shots you change; this costs money.** Pass `changes` (a shot and what
  to generate for it) or the whole edited `document`. A revision that delivers
  is charged its quoted total; one that fails is charged nothing, even when its
  paid work was already done. An identical request returns the same run;
  `attempt` starts a second one on purpose. Returns a `run_id` immediately; poll
  `get_run` until `succeeded`.
- `quote_candidate` — price of a shot candidate of a faceless video: one picture
  or clip made for one shot, to keep or discard in a revision. Free.
- `create_candidate` — **makes a shot candidate; this costs money.** Pass the
  shot and the operation to generate for it. A delivered candidate is charged
  its one unit whether it is kept or discarded; one that fails is charged
  nothing, even when its paid work was already done. An identical request
  returns the same run; `take` makes another candidate on purpose. Returns a
  `run_id` immediately; poll `get_run` until `succeeded`.
- `list_generation_models` — the models of single generations with their
  measured shapes and credits per image or per second. Free.
- `quote_image`, `quote_video` — price of one image or one clip. Free.
- `generate_image`, `generate_video` — **make one image or one silent clip;
  this costs money.** One that fails is charged nothing, even when the vendor
  was already paid. An identical request returns the same run; `attempt` starts
  another on purpose. Poll `get_run`; `generation.url` is the file.
- `upload_image` — a PNG/JPEG from a local `path` or a public https `url` →
  `upload_id` and a signed https url to pass as `image`. Free; 20 per day, at
  most 30 url downloads per hour, the url lives 24 hours. Set `aspect_ratio`
  explicitly afterwards.
- `create_upload` — a presigned PUT for a local PNG/JPEG when the server is
  remote: PUT the file with curl, then use the `upload_id`. Free.
- `get_upload` — one upload with a fresh url, its size and `usable_until`;
  after `create_upload` it confirms the PUT. Free.
- `create_asset` — save a picture as an account asset, kept until you delete
  it: from a `run_id`, an `upload_id`, a public `url` or `base64`, and a local
  `path` on stdio. Your own material needs `rights_confirmed: true` once. Free;
  2000 assets and 20 GB per account, 100 new ones per day.
- `list_assets`, `get_asset` — the account's assets with fresh urls and the
  usage of the caps. Free.
- `update_asset` — rename an asset or change its role. Free.
- `delete_asset` — delete an asset; a daily cleanup removes its file once 7 days
  have passed. Free.
- `quote_actor` — price of a personal actor before creating one. Free.
- `create_actor` — **creates a personal actor from a description; this costs
  money.** Each requested format is a separate charged image. Returns a `run_id`
  immediately; poll `get_run` until `succeeded`, then pass `created_actor.actor_id`
  to `make_ugc` as `actor_id`.
- `quote_faceless` — price of a faceless video before making one. Free.
- `make_faceless` — **makes a faceless video from your script or from a short
  brief; this costs money.** You pick 30 to 90 seconds; the video ends with its
  narration, from 25 seconds to a quarter past your pick (never past 90), and
  costs at most the quote. Narration plays over an opening
  animated clip and image scenes, with captions on by default. `voice` picks
  the narration voice by name. Returns a
  `run_id` immediately; poll `get_run` until `succeeded`.
- `delete_actor` — removes a personal actor of this account. Videos already made
  with it stay as they are. Free.
- `get_actor_defaults`, `set_actor_defaults` — read and save an actor's B-roll
  default. It is stored only: today's talking-actor videos do not use it. Free.

Call `quote_ugc` before `make_ugc`: the quote is where the contract tells you
what it will and will not honor. Anything the API cannot deliver comes back in
`warnings[]` rather than being dropped silently, and unsupported fields are
rejected up front instead of being accepted and ignored.

Bumping the `attempt` field starts a **new paid render**. It is the way to retry
a failed run on purpose, not a free refresh. For faceless videos `attempt`
belongs to `make_faceless`: a quote takes none, and `quote_faceless` refuses it.

`SKILL.md` ships inside the package with the full operating instructions, and
`CHANGELOG.md` next to it says what changed in each release and what was removed.

## Privacy

The server sends your script or brief, chosen options and any uploaded image to the
Clipwright API to quote and render the video. How that data is handled:
[clipwright.io/privacy](https://clipwright.io/privacy). Documentation:
[clipwright.io/docs](https://clipwright.io/docs?ref=npm).
