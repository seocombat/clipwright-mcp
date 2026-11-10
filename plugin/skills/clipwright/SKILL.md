---
name: clipwright
description: Use when the user asks for a UGC ad, a talking-presenter video for a product, TikTok, Reels or Shorts hooks, a faceless explainer, a single AI image or clip, or a remake of an ad they liked, made through Clipwright. Covers signing in, the three choices the user makes, a quote before every paid step, and the closing report with the bill.
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

Every paid tool has a free quote. Call the quote before every paid step, show
the user the credits, and start the paid call only after they agree. Each
tool's description names the arguments it takes. Take prices from the quote or
from `list_prices`, never from memory: they change.

| What | Free quote | Paid call |
|---|---|---|
| Short UGC video with a presenter | `quote_ugc` | `make_ugc` |
| Faceless video (narration over pictures) | `quote_faceless` | `make_faceless` |
| A drawn explainer film, tier `standard` or `pro` | `quote_faceless` | `make_faceless` with `format: "explainer"` |
| One image | `quote_image` | `generate_image` |
| One silent clip | `quote_video` | `generate_video` |
| A custom presenter | `quote_actor` | `create_actor` |
| A reading of a reference ad | `quote_analysis` | `analyze_reference` |
| A creator's latest 12 videos with x to their median | `quote_creator_profile` | `analyze_creator` |
| Reels that took off on a topic | `quote_trends` | `find_trends` |
| A revision of a faceless video | `quote_revision` | `revise_run` |
| A new picture or clip for one shot | `quote_candidate` | `create_candidate` |
| A plan from a workflow method | `quote_workflow_plan` | `run_workflow_plan` |

Before choosing a model for an image or a clip, call `list_generation_models`:
it names the formats, lengths and credits each model takes. `list_voices`,
`list_actors`, `list_prices` and `get_account` are free too.

## Three choices the user makes

Before a paid presenter video, stop three times and let the user choose. Offer
a few options, mark the one you recommend, and do not pick for them. Skip a stop
only when the brief already answers it.

1. **Presenter.** Show two or three actors from `list_actors` with their
   previews. A new presenter comes from `create_actor`, which draws a fictional
   adult from a description; it takes no photo of a real person. A photo the
   user owns can serve one video as `image` in `make_ugc`: pass a public https
   url, or the url `upload_image` returns.
2. **Voice.** Play the `preview_url` of two or three voices from `list_voices`
   instead of describing them. Keep any voice the user names.
3. **Hook.** Write five to ten opening lines for the first three seconds and let
   the user pick one to three. Quote each picked script with `quote_ugc`.

## A product link in the brief

Clipwright takes no product URL. Read the page with your own web tools, write
the script from the claims the page makes, and quote it. To put the product in
the presenter's hands, save its picture as an image asset with `create_asset`
(the user must hold the rights), then derive a presenter holding it with
`create_actor` and `from_actor_id`.

## A reference ad

`analyze_reference` reads an ad the user liked into a profile of its beats,
graphics, captions and pacing. Pass an Instagram or TikTok link as
`source_url`; a YouTube link is refused, so save that MP4 as an asset with
`create_asset` and `kind: "video"` and pass its `asset_id`. It costs credits,
so quote it with `quote_analysis` first, and poll `get_reference_analysis`. `plan_reference_remake` then lays the
accepted script on the reference beats as a workflow plan, free; its warnings
name what the plan does not reproduce.

## Captions

`make_ugc` draws word-timed captions only with `captions: true`. Ask the user
whether they want them before the quote. If they do, offer three or four styles
that fit the video, one line each from the `caption_style` description, and link
https://clipwright.io/captions, where every style plays on the same clip. When
the user gave a reference video, take the style closest to its captions.
`caption_emphasis` marks key words from the script.

## After the paid call

A paid call returns a `run_id` at once. Poll `get_run` until `state` is
`succeeded` or `failed`; the file link is in the result. Read `warnings[]` and
pass anything there on to the user: Clipwright reports what it could not honor
instead of dropping it silently.

Keep the `run_id` of an image: `generate_video` can start from it as the first
frame.

Some answers are wrong without an error: an omitted `aspect_ratio` follows the
photo's shape, `person` chooses no face, and `make_faceless` without `voice`
narrates in English. https://clipwright.io/skill.md lists each such trap; read
it before the first paid call.

Any account can order an explainer film. `standard` (the default) is 700 credits
for a film up to 60 seconds plus 12 a second over, `pro` is 1200 plus 20; the
quote names both, so show them and let the user pick. A film takes about half an
hour, one at a time per account. A busy service answers `explainer_busy` with
`Retry-After`: wait that long and try again.

## The closing report

End every job with a short report:

- the link to each file, and its `run_id` for a later revision;
- `warnings[]` from each run, word for word;
- the bill: one line per paid call with its quote and its `credits_charged`
  (`get_run` for a run, `get_reference_analysis` for an analysis), and the total;
- what you could not verify yourself. Lip-sync, voice likeness and
  pronunciation are judged by ear and eye, so ask the user to watch the video
  before using it.
