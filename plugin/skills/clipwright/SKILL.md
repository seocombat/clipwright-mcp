---
name: clipwright
description: Use when the user wants a short video, a faceless explainer, a single AI image or a short clip made through Clipwright. Covers signing in, quoting before spending credits, starting a run and collecting the file.
---

# Clipwright

Clipwright renders video and images on its servers and returns the file. It
does not publish anywhere. This plugin connects the hosted Clipwright MCP
server.

## Sign in

The server needs a Clipwright sign-in before its tools work. In Claude Code run
`/mcp`, choose `clipwright` and approve in the browser. A new account starts with trial
credits; more are sold on the Clipwright pricing page.

## The rule: quote first

Every paid tool has a free quote. Call the quote, show the user the credits,
and start the paid call only after they agree. Each tool's description names
the arguments it takes.

| What | Free quote | Paid call |
|---|---|---|
| Short UGC video with a presenter | `quote_ugc` | `make_ugc` |
| Faceless video (narration over pictures) | `quote_faceless` | `make_faceless` |
| One image | `quote_image` | `generate_image` |
| One silent clip | `quote_video` | `generate_video` |
| A custom presenter | `quote_actor` | `create_actor` |
| A revision of a faceless video | `quote_revision` | `revise_run` |
| A new picture or clip for one shot | `quote_candidate` | `create_candidate` |
| A plan from a workflow method | `quote_workflow_plan` | `run_workflow_plan` |

Before choosing a model for an image or a clip, call `list_generation_models`:
it names the formats, lengths and credits each model takes. `list_voices`,
`list_actors` and `get_account` are free too.

## After the paid call

A paid call returns a `run_id` at once. Poll `get_run` until `state` is
`succeeded` or `failed`; the file link is in the result. Read `warnings[]` and
pass anything there on to the user: Clipwright reports what it could not honor
instead of dropping it silently.

Keep the `run_id` of an image: `generate_video` can start from it as the first
frame.
