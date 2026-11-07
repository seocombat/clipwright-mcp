# Changelog

The four client packages — `@clipwright/core`, `@clipwright/sdk`,
`@clipwright/cli` and `@clipwright/mcp-server` — are released together and always
share one version, so each section below covers all four. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The HTTP API reports its
contract version in the `X-Clipwright-Contract` response header and in the
`contract_version` field of a quote. Entries marked **Breaking:** require a change
on the client side. Entries marked *Server-side* changed the API itself: every
client version sees them from the day the API was deployed, not from the package
release they are listed under.

Entries marked *Dashboard:* changed the web app (the dashboard or a public page of the site)
and no package. This file is also the public changelog at /changelog, so they are listed here:
a customer reading it should not miss what appeared in the product. Like *Server-side* entries,
they are live from the day the web app was deployed, not from the package release they are
listed under.

## [Unreleased]

## [0.44.0] - 2026-11-07

### Added

- `make_faceless` takes `music`, `"auto"` or `{ mood }`: a music track under the voice for 60 credits, on the quote
  and charged only when the delivered video carries it. When a track cannot be added, the video is delivered
  without it and `warnings[]` says so (#1063).
- *Server-side:* `make_faceless` draws `scenes` on the script's words, as `make_ugc` does: 25 credits for each scene
  the delivered video draws (#1147). *Dashboard:* /pricing lists the scene line.
- `make_faceless` templates can show your own image or video asset in a slot (`asset_id`, `rights_confirmed`), and a
  shot can start from your image asset (`shots[].asset_id`). The clip is priced as before; your picture is not
  charged.

## [0.43.1] - 2026-11-07

### Fixed

- `make_faceless` and `quote_faceless` describe `shots` as 1 to 10, the number the API takes (#1214).
- *Server-side:* `list_prices` lists music under the voice on `make_ugc`: 60 credits per track, only when you ask for it
  (#1215). *Dashboard:* /pricing shows the same line.

## [0.43.0] - 2026-11-07

### Added

- `find_trends` cards say why a reel made the list (#1200). Each card has `reasons[]` with 1 to 3 signals, strongest
  first. It also compares the reel's comments with the creator's usual rate (`creator_comment_rate`,
  `comment_rate_x`) and its views with creators of a similar size (`size_norm_views`, `x_size_norm`). A null field is
  named in `warnings[]`. Reading a search takes `sort` (`best`, `x`, `x_size_norm`, `views`, `views_per_hour`,
  `comment_rate`, `comment_rate_x`) at no charge. The price is unchanged.
- The brand kit keeps a script `voice` (#1203): who speaks to whom, tone, sign-off, caption call to action, banned
  phrases, preferred format and a second language. `plan_reference_remake`, `make_ugc` and `make_faceless` apply it,
  and each change is named in `warnings[]` on the quote. A call's own `audience` wins for that call. `extract_brand`
  and `analyze_creator` propose a voice; nothing is saved until you save it with `brand_kit`. *Dashboard:* a Brand
  page shows the design and edits the voice.
- `generate_video` takes `camera: "turntable"` (#1186): a product turns on the spot. Pass the same picture as the first
  and the last frame for a clip that loops. The server instructions describe a product turntable and a recurring
  mascot. Prices are unchanged.
- `get_run` returns `video` with the width and height measured from the delivered file (#1188). *Dashboard:* Runs and
  Assets show it as 720p, 1080p or 4K.

### Changed

- *Server-side:* `make_faceless` fits up to ten action shots on any selected length (#1197).
- *Server-side:* faceless captions hide while a scene or a template covers their band (#1206).
- *Server-side:* videos in the `film` and `glass` motion styles render faster; frames look the same (#1187).
- *Server-side:* `plan_reference_remake` keeps the phone card you asked for. A line edit that puts a phone card on the
  call's own words is refused, and the refusal names that edit (#1205).

### Fixed

- *Server-side:* a run that stopped before its video was ordered no longer names the video vendor as the cause (#1206).

## [0.42.0] - 2026-11-07

### Added

- `cast` on live shots (#1192): a `talking_action` or `action` shot of `make_ugc`, and `plan_reference_remake`, take up
  to 3 pictures of the people in the scene, each with a `role` and what that person does. Each face holds across the
  shots of one setup. The pictures are your own picture assets with rights confirmed. Prices are unchanged.

### Changed

- *Server-side:* a full-frame stop move (smash title, colour block, colour sweep) plays its own length, as `list_moves`
  `seconds` shows, and the presenter fills the rest of its words (#1196). A picture or card the reference flashed for
  about a second covers only the words that time takes.
- *Server-side:* the presenter is never cropped tighter than the actor's portrait holds sharp; the quote names the face
  height it will draw (#1196).
- *Server-side:* captions hide while a scene drawn over the presenter sits on their band, as they already did under
  templates (#1190).
- *Server-side:* `plan_reference_remake` never compiles a plan its quote would refuse: past the limit of presenter
  takes it drops live shots, the shortest first, and names each one in the plan (#1197). A video insert covers only
  the words its length fits, and the plan names the cut.
- *Server-side:* shorter warnings (#1198): each reference beat is named once, your line edits fold into one line, the
  pronunciation note appears only when the script carries a stress mark, and a failed run says where it stopped.

### Fixed

- *Server-side:* `find_trends` reads an Instagram reel's views from the same counter as its creator's median, so its
  `x_median` is no longer understated (#1199).
- *Server-side:* the first click of a checklist plays on its word; a pause after a sentence where a clip meets the
  presenter is trimmed; a picture's zoom next to a full-frame card is kept (#1196, #1198).

## [0.41.0] - 2026-11-07

### Changed

- Higher limits on creative input (#1192), so a video can follow a long reference and rework it. Prices are unchanged.
  `make_ugc`: up to 16 live shots with `action` and `setup` up to 2,000 characters, 16 presenter appearances between
  inserts, 99 inserts, 40 templates, 40 moves (anchor quote up to 2,000 characters), 12 scenes (`brief` up to 2,000,
  `text` up to 200), 30 overlays with 3 on screen at once, 15 layout windows, 60 framing changes, 20 segments with 10
  actor segments, 60 caption emphases of up to 120 characters, a call of up to 30 lines, 5,000 characters and about
  120 s, an interview of up to 30 turns and 16 takes, 20 gaze changes, 20 motion style spans, `person` up to 2,000
  characters and a music `mood` up to 400. One video renders at most 16 presenter takes, and a live shot in the middle
  of speech can make up to three; a video whose pictures, videos and takes do not fit is refused before any charge,
  with the number that fits. `plan_reference_remake`: 50 review notes, 60 assets and 60 line edits with
  quotes up to 2,000 characters, a `site` up to 64, and a reference profile of up to 120 beats; a scene's brief is no
  longer cut. `make_faceless`: `character_details` up to 2,000 characters, 60 scene images, 100 transition points, a
  `brief` up to 10,000 characters, and up to 10 action shots with an `action` up to 1,500 characters; a run asks only
  as many shots as fit its length, and more are refused before any charge with the number that fits.
  `generate_image` and `generate_video`: `prompt` up to 5,000 characters. `create_actor`: `description` and `setting`
  up to 2,000 characters, a held object up to 1,000.
- `create_actor` combines more of its fields (#1192). With `from_actor_id`, `description` now changes the view's look,
  clothing and pose (gender and age stay the source actor's), and `style_reference` puts the source actor's face into
  the photo's scene, pose, clothing and shot size; a view that looks like a person in the photo is refused at no
  charge. A new actor from words or a style reference takes `holding` and `setting` too.

## [0.40.0] - 2026-11-06

### Added

- *Server-side:* `find_trends` searches TikTok and Instagram together by default (#1154): `platform` takes `mix`
  (the default), `tiktok` or `instagram`, and a mix ranks up to 10 reels per platform in one list, each with its
  `platform`. Each reel also carries `views_per_hour`, `x_preliminary` (under 48 hours old), `new_creator` (a creator
  median under 1,000: no medal, ranked by views per hour), `late_takeoff` and `comment_rate`. `language` filters the
  TikTok reels only. The price stays 20 credits; a mix that reaches only one platform answers its reels with a warning
  and is charged.

- *Server-side:* `find_trends` finds reels that took off on a topic (#921): keywords on TikTok or Instagram, reels
  posted within `posted_within_days` (90 by default), up to 10 reels, one per creator, ranked by `x_median`, the
  reel's views over its creator's median views, with views, date, length, link, creator and caption. `quote_trends`
  prices it first; an unfinished answer is read by repeating the call, free, or over REST with
  `GET /v1/trend-searches/{id}`. The answer carries a ready table in `display_markdown`. 20 credits
  once it succeeds; a search that finds no reel costs nothing, and the same query within an hour answers free.

- *Server-side:* `plan_reference_remake` revises a plan (#921): with `plan_id`, `base_version` and the user's
  `review_notes` it compiles the revised script as the next revision of the same plan. The revision starts as a draft
  and needs its own `approve_workflow_plan`; only an approved revision quotes and runs. The notes stay on the plan in
  `brief.review_notes`.

- *Server-side:* `make_ugc` takes `scenes`: up to three graphics made for your video from your words, for what no
  template draws, each over the presenter or on the full frame while its words are spoken. A scene costs 25 credits,
  on its own quote line, and is charged only when it is drawn in the delivered video; one that does not pass our check
  is left out, named in `warnings[]` and not charged. A finished video lists each drawn template and scene in
  `final_output.elements` with its `origin`, `library` or `generated`. Available once the server switches it on.

- *Server-side:* `make_ugc` live shots take `transition`: `flash` (white), `light_leak` (warm) or `whoosh` (a cut with a
  whoosh sound) on the cuts into and out of the shot; `cut`, the default, keeps a plain cut. A flash plays the `flash`
  sound and a light leak or a whoosh the `whoosh` sound, as `template_sounds` names them. A reference remake now cuts
  from a live hook shot to the presenter on a flash, unless `add_moves` is `false` (#1129).

- *Server-side:* three new `templates` kinds, full frame: `chart` (a bar or line chart of 2–6 points, each landing on its
  quote with its value counting up), `race` (a ranked bar race: bars move to each round's values and swap places by rank
  on its quote) and `hand_title` (a title written out by hand, then a marker stroke on chosen words on its quote; also
  over the presenter in the caption spot).

- *Server-side:* five `templates` kinds move more: `chat_window` takes `answer`, streamed in word by word, and a `table`
  that opens row by row; `notification` takes a `stack` of up to two more cards, each dropping in on top on its quote;
  `terminal` takes a `diff` whose removed lines collapse in red as its added lines open in green; `lower_third` takes
  `style` (`clean_bar`, `side_rule`, `soft_pill`, `mask_reveal`); `compare` takes `reveal: "wipe"`, a wipe to a divider
  in the middle. Every kind draws its corners at your `design`'s corner style. Earlier requests draw as before.

- *Server-side:* `design` on `make_ugc` and `quote_ugc`: your brand's colours by role (background, cards, text, accent,
  text on accent), fonts, a logo asset, corner style and motion character. Templates, the end card and the caption
  highlight draw in it; text that would read under 4.5:1 on its fill is refused with the nearest readable shade, and a
  quote shows the design it will use. `POST /v1/brand/extract` (`extract_brand`) reads a public site into a proposed
  design for you to confirm; `GET`/`POST /v1/brand-kit` (`brand_kit`) saves one design on the account, used by every
  video that names none, so a series keeps one look. All free.

- *Server-side:* six new `templates` kinds for any `make_ugc` script run: `chat_window` (a prompt typing in, then reply
  cards, with optional zoom cuts), `video_grid` (2x2 or 3x1 tiles of your video assets popping in turn), `word_title`
  (a title shown word by word as it is spoken), `phone_screen` (a phone whose screen goes locked, playing, liked, with
  a counter, a timer and tags), `terminal` (a command typing in, then a checked status line) and `pointer_chips` (chips
  joined by lines to points of the frame). `caption_emphasis` takes the new look `box`: the quote on a soft box of the
  caption's accent colour. Prices are unchanged.

- *Server-side:* `DELETE /v1/runs/{id}/media`, the MCP tool `delete_run_media` and `deleteRunMedia()` in the SDK
  delete the files of a finished run: its video, image or clip and its preview stop opening at once and are erased
  from storage after 7 days. The run, its history and its charge stay. A run still going answers `run_not_finished`;
  files another unfinished run uses answer `run_media_in_use`. *Dashboard:* Delete on a video in Runs and Assets and
  on an image or clip in Assets; the row stays, marked deleted.
- *Server-side:* deleting the files of an `analyze_reference` run deletes the analysis too, at once: its profile,
  transcript, post metrics and frames are gone, `get_reference_analysis` answers it as deleted, and analyzing the same
  video again starts a new paid analysis.
- *Server-side:* `DELETE /v1/uploads/{id}`, the MCP tool `delete_upload` and `deleteUpload()` in the SDK delete an
  upload: no call takes it from then on, and its file is erased from storage after 7 days. An upload an unfinished run
  uses answers `upload_in_use`.
- *Server-side:* `DELETE /v1/creator-profiles/{id}`, the MCP tool `delete_creator_profile` and `deleteCreatorProfile()`
  in the SDK delete a finished creator profile at once; the run that made it and its charge stay.
- A delete that must wait while we are required to keep the data answers `deletion_held` and deletes nothing.
- *Server-side:* `create_actor` and `quote_actor` take `portrait: { asset_id }`: your own image asset, within 2% of 9:16
  and with confirmed rights, becomes a personal actor next to `gender` and `approximate_age`. The portrait itself costs
  nothing; each other format edited from it is charged as usual. An image without exactly one face, or with the face cut
  off, too small or too large, is refused at no charge. The actor works as `actor_id` in `make_ugc`, `quote_ugc` and
  `plan_reference_remake`.
- `make_ugc` picture inserts take `motion`: `{ kind: "scroll", direction: "down" | "up" }` scrolls a tall picture end
  to end at the full width of its box or the frame, and `{ kind: "pan", direction: "left" | "right" }` pans a wide one
  at its full height. A picture that is not taller or wider than its place fills it still, and `warnings[]` says so.
- `fit: auto` places a picture by its own shape: in its `box` or the whole frame, whichever cuts less of it (a move
  out of the box is named in `warnings[]`). A picture that loses more than 8% when filling scrolls or pans end to end
  instead, so all of it shows, in place of its `image_motion` zoom; it shows whole over a blurred copy of itself only
  when less than a quarter of it would be on screen at once. A reference remake's screenshots now fill the frame and
  scroll or pan instead of sitting small over a blurred copy.
- *Server-side:* a `make_faceless` video's closing picture zooms out to the whole picture, unless it is one of your
  `scene_images`, which keeps its pan.
- `make_faceless` plays sounds from the `make_ugc` library: a flash cut plays the `flash` sound and a light leak the
  `whoosh` sound, each peaking on its cut. `edit_sounds: true` adds a low sound on every scene change, and
  `template_sounds` picks the `flash`, `whoosh` and `edit` names (`list_template_sounds`) or mutes them all with `false`.
  The price does not change (#1067).
- `create_actor` and `quote_actor` take `style_reference: { asset_id }`, a PNG or JPEG image asset of your account
  (rights confirmed). The new chest-up portrait follows the photo's set, light, camera angle and clothing, while the
  face is new and comes from `description`. A portrait that looks like a person in the photo fails with
  `actor_resembles_reference` and costs nothing; a photo without a person is fine. The price is the same. The CLI
  takes `--style-reference <asset_id>` (#975).

### Changed

- **Breaking:** *Server-side:* `resolution` of `make_ugc`, `quote_ugc` and a workflow plan's format takes `720p` or
  `1080p`; 4k is no longer offered (#1189). A request for `4k` is refused with a 400, "4k is not offered; use 1080p",
  before any charge. The CLI's `--resolution` takes the same two values.

- *Server-side:* `create_actor` at `quality: high` now draws a more natural portrait: real skin texture, a relaxed face
  and the look of a phone video frame; with `style_reference` it keeps that photo's shot, from close-up to a wider
  frame with hands. The high portrait costs 45 credits; other formats and views of an existing actor keep their
  prices (#1101).
- *Server-side:* every `create_actor` image, at both qualities, gets a light finish before it is published: slightly
  softer detail and fine grain, so the actor reads as filmed rather than rendered (#1101).
- *MCP:* the server's instructions now ask your agent to start a video from a bare product, link or script with a
  reel that already works in your niche: it breaks the reel down with `analyze_reference` and shows you a script on
  its hook, structure and pacing before any paid video. A set of several videos varies angle, hook, actor, voice,
  setting and format, never repeats an opening line, and is shown to you before the first paid run. Captions are
  recommended in a style that reads on a phone (#921, #1109).
- *Server-side:* finished videos and uploads are now kept for 365 days instead of 30, and a video can be edited for a
  year after it finishes, until the day before its file is removed. An upload's `usable_until` moves out accordingly.
  `UPLOAD_OBJECT_RETENTION_DAYS` is now 365 (#1092).
- *Dashboard:* Assets → Videos lists every finished video of the account; a video past its storage period stays on
  the list, marked deleted, under the "Deleted" filter (#1092).

- *Server-side:* full-frame `terminal`, `chat_window`, `quote`, `phone_screen`, `video_grid` and `compare` templates now
  fill most of a vertical frame's width, with text a phone can read. `size: large` draws larger text and `small` a
  narrower card; `compare`, `phone_screen` and `video_grid` already fill the frame at medium, so at `large` they stay
  that size and `warnings[]` says so. A `quote` sits on a card. Every full-frame template draws its card from its first frame, and a `word_title`
  shows its first entry from its first frame, so a full frame is never an empty screen (#1128, #1129).

- *Server-side:* a `make_faceless` brief without `transitions` now gets a flash on every scene change, with its sound;
  `transitions: false` keeps plain cuts. A request that names its transitions, and every script, draws what it asks
  for as before (#1067).

- The MCP tool list is 10 KB smaller, so a client that shows no tools for a list near 100 KB lists them all. `quote_ugc`
  describes its fields in fewer words, and `caption_style` links https://clipwright.io/captions for the look of each
  style. Every tool keeps its fields and the values they take (#1045).

- *Server-side:* `generate_video` with `kling-3.0` at 720p costs 12 credits a second instead of 11. A clip admitted
  before the change keeps the price it was quoted.

- *Server-side:* an account runs up to three reference analyses at once, so a batch of reels no longer waits for
  each one in turn. Two starts of the same reel by its full link, or of the same asset, in the same mode still give
  one analysis and one charge (#1042).
- *Server-side:* `warnings[]` no longer lists timing adjustments too small to see, such as a boundary moved to the
  nearest frame. An explicit `broll_policy` gets no warning when the video shows your media, and one short line when
  it shows none (#1047).
- *Server-side:* an analysis of a public Instagram or TikTok video by its full link that we already made answers in
  seconds, at the same price, with the video's views, likes and comments read fresh. Its `warnings[]` says how old the
  analysis is (#1043).
- *Server-side:* the `edit` sound library adds three short whooshes, `air_whoosh`, `swing` and `swipe`, which play
  well under the others. `air_whoosh` is the new default for `edit_sounds`; `swell_hit` and the rest stay selectable
  with `template_sounds.edit`. A reference remake no longer turns `edit_sounds` on by itself: the plan names the
  reference's whooshes and clicks, and `plan_reference_remake` with `edit_sounds: true` adds a sound on every cut
  (#1076).

- *Server-side:* a failed run's `warnings[]` now lists only what explains the failure and its charge, not notes about
  a video it never delivered. The recovered-voice note is one short line, and a take delivered without captions and
  graphics says so plainly and that it is charged as usual (#1066).
- *Server-side:* a reference remake no longer keeps the presenter on screen where the reference cuts away from them.
  A split or picture there fills the frame; a beat with no media of its own takes a picture the other beats leave
  over, or a full-frame title card of its words. A demo beat with no picture left says in `warnings[]` to pass one
  more (#1060).

### Fixed

- *Server-side:* captions in the `minimalist` (`minimal`), `youtube`, `plottwist`, `promo`, `lecture`, `highlighter`,
  `studio`, `broadcast`, `lyrics` and `bubblegum` styles draw larger, so a vertical video's captions read on a phone;
  `youtube`, `minimalist`, `lecture`, `studio`, `broadcast` and `lyrics` show four words at a time (`youtube` keeps five in 16:9) (#1111).
- *Server-side:* a `make_faceless` video made from a `brief` now lands near the `duration_seconds` you picked; a
  30 s brief could come back at 36 s with a length warning. A video from your own `script` still runs as long as
  its narration takes (#1048).
- *Server-side:* a 30 s `make_faceless` video from a `brief` that lists several points could fail with
  `story_not_planned` before any media was made. Such briefs now plan within their length (#1083).
- *Server-side:* `pause_trim` now shortens the pause after every sentence to the length you ask for; a remake
  could keep 0.4–0.6 s of silence after each sentence. A pause that cannot be cut cleanly is named in
  `warnings[]` (#1052).
- *Dashboard:* long presenter videos and remakes show a preview (#1050).
- *Server-side:* a split layout window centres the presenter's face in the presenter's part of the frame, so a large
  `media_share` no longer cuts the face off. When that part is too small for the face, the media gets the largest share
  that keeps the face whole, and `warnings[]` says so (#1053).

## [0.39.0] - 2026-11-03

### Added

- `make_ugc` picture inserts take `fit`: `cover` (the default, as before) fills the frame and cuts the picture's edges,
  `contain` shows the whole picture over a blurred copy of itself, and `auto` shows it whole when filling would cut off
  more than 30% of it, which `warnings[]` names. An insert also takes `box`, its own place inside the frame in shares
  of the frame. Split layout windows take `media_side` (`top` or `bottom`, the default) and `media_share`, the share of
  the height the media takes (0.3 to 0.7, 0.5 by default).
- A reference remake draws a split screen and a full-frame picture where the reference showed them: the split's media on
  the reference's side at its share of the height, a picture in its measured box when that is smaller than the frame. Its
  pictures use `fit: auto`, so a landscape screenshot stays whole. What the remake still draws differently is named in
  the plan.

- *Server-side:* `get_account` and `GET /v1/account` carry `support_replies`: up to 10 of our replies to this
  account's support requests and `send_feedback`, newest first. A reply to feedback carries the `feedback_id` that
  `send_feedback` returned as its `request_id`. Clients from this release read the field; older ones ignore it.
- *Dashboard:* Support → Your requests shows the start of each request's text, with the full text on hover or
  expand, and our reply under each answered request.

- *Server-side:* `quote_analysis` and a succeeded reference analysis carry `repeat_note`, also shown in its `display_markdown`:
  asking again for the same asset or the same reel by its full link, in the same mode, is free and answers at once, with no
  time limit; a short vm.tiktok.com link never repeats.
- *Server-side:* `GET /v1/runs/{id}?wait_seconds=N` (up to 50) holds the answer until the run succeeds or fails,
  the wait ends or the client disconnects. `getRun(id, { wait_seconds, signal })` in the SDK passes it on (#1036).

### Changed

- *Server-side:* `workflow.approved_plan` in `GET /v1/runs/{id}` and `get_run` leaves out `brief.reference_profile`,
  so polling a remake no longer repeats up to 35 KB of reference analysis. What the plan does not reproduce from the
  reference stays in `warnings`; `GET /v1/workflow-plans/{id}` returns the full current revision. The field is
  optional, so earlier clients read the answer unchanged (#1035).

- *Server-side:* An account that has not bought credits yet keeps up to 1 GB in its asset library; its first credit
  purchase raises the ceiling to 20 GB. Assets already stored above 1 GB stay; only new ones are refused, and
  `asset_cap_exceeded` names the account's ceiling. The 2,000-asset and 100-a-day caps are unchanged (#1009).
- *Server-side:* a full reference analysis of a reel with on-screen graphics finishes sooner.

### Fixed

- MCP: the paid tools (`make_ugc`, `make_faceless`, `analyze_reference`, `generate_image`, `generate_video`,
  `create_actor`, `create_candidate`, `revise_run`) list every input field with its type in `tools/list`. A client
  that builds its arguments from the schema sent untyped values before, so `make_faceless` refused a numeric
  `duration_seconds` that arrived as a string. The allowed values and the field descriptions stay on the matching
  quote tool. The hosted server at mcp.clipwright.io has it from the day it was deployed (#1028).
- *Server-side:* `run_workflow_plan` on the hosted MCP server no longer answers `unauthorized` to a connected app;
  the quoted launch starts its run. With a credential callback, the SDK now passes it the `Idempotency-Key` the
  request carries, whatever its letter case (#1027).
- *Server-side:* `get_run` on a reference analysis or creator profile run no longer warns that the run input could
  not be read (#1032).
- *Dashboard:* a reference analysis run shows the analysis's own warnings word for word, the reel's link, the hook and
  each beat with its time, words and frame; "Make it again" names the reel's link (#1032, #1033).
- *Server-side:* a reference remake and a long `make_ugc` take a script that names a site, an email, a handle, a price,
  a time or "24/7" (`clipwright.io`, `@brand_name`, `$29/mo`, `9:30`). Each such word counts as one word for inserts,
  quotes and captions; the voice reads it aloud and the captions show it as written. A word glued to the next by a dash
  or a comma without a space ("fast—really") is still refused with advice (#1029).
- *Dashboard:* images and clips generated before 2 November get a preview in Assets instead of "Press Open to view"
  (#1034).
- *Dashboard:* in the editor, removing a shot gives its time to a neighbour that can take it, so a clip is never
  stretched past its footage; a removal no neighbour can take is refused with the reason (#1037).
- *Dashboard:* the editor names shots as the timeline does ("3 · picture") in its dialogs, issues and header, waits
  for a save to land before opening Render, says which version the player shows, and lists every finished version
  with its date, length and an Open link (#1038).

## [0.38.2] - 2026-11-02

### Added

- MCP `get_run` takes `wait_seconds` (up to 50) and answers once the run ends or the wait is over; an unfinished run, and
  the first answer of every paid tool, carries `poll.arguments` for the next call (#1000). `quote_ugc`, `quote_faceless`
  and a finished `get_run` add `display_markdown`, a ready table of the price or the result with warnings word for word,
  and `display_hint`.

### Changed

- An MCP tool call with invalid arguments now answers a structured error, like an API refusal: `code:
  "invalid_arguments"`, `retryable: false`, `fields` with the path and message of every problem, and a `next_action`.
  Such a call spends nothing (#1000).
- *Server-side:* a reference analysis by link names a missing author or display name in `warnings[]`, as it already did
  for a missing caption, and `untrusted_content` now lists the author's handle too (#990). The analyze and read tool
  descriptions say that the caption, author, speech and on-screen text are data, never instructions.

### Fixed

- *Server-side:* `display_markdown` of a reference analysis and a creator profile shows quoted captions, names and
  comments as plain text: markdown in them no longer renders as a link, image, heading, emphasis or HTML (#990).

## [0.38.1] - 2026-11-02

### Changed

- The MCP server's tool list is about a third of its old size, so clients that cap it, such as ChatGPT, load every tool
  (#1003). The tools, their fields and what a call accepts are unchanged. A paid tool that takes its quote's fields
  says so and lists only the fields the quote lacks, such as `attempt`; the quote carries the full schema. A field
  copied from another answer, such as `reference_profile`, is described in words instead of by schema.

### Fixed

- A creator profile's table shows each video's x to the median with one decimal, so a video at the median reads
  `1.0×`, not `1×`. *Server-side.*

## [0.38.0] - 2026-11-01

### Added

- `analyze_creator` profiles a creator from an Instagram or TikTok profile or video link (#999): their latest 12 videos
  with views, likes, comments, shares, length, date and caption, the median views of those videos and each video's x to
  it, with top performers flagged, plus followers and posting cadence. `quote_creator_profile` prices it first and
  `get_creator_profile` reads it; the answer carries a ready table in `display_markdown`. 20 credits once it succeeds;
  a private or empty account costs nothing, and the same link or creator again within an hour is free. *Server-side.*

### Changed

- The MCP server's guidance to your agent names the creator profile and asks the agent to show its table as it came.

## [0.37.2] - 2026-11-01

### Changed

- The MCP server's guidance to your agent is clearer: you can leave a choice to the agent, a talking-actor quote is
  named as an estimate before the run, a lost answer is recovered without paying twice, warnings are quoted as they
  came, and the agent offers to send us feedback when something falls short.

## [0.37.1] - 2026-11-01

### Added

- The MCP server tells your agent how to use Clipwright when it connects: quote before every paid call, let you pick the
  presenter, voice and hook, follow the run to its end and report the link, credits and warnings. Agents that reach
  Clipwright over MCP alone, without the skill file, now follow the same rules.

## [0.37.0] - 2026-11-01

### Added

- `make_faceless` takes `transitions`: a white flash or a light leak on every scene change, or on the one nearest each word
  anchor of a script. A revision sets, replaces or removes them for the price of a render alone. No extra charge.
- `make_ugc` places layers where you say, not on a fixed spot (#973). An overlay or a template takes `place`: anchored
  to the frame, the presenter's face, the captions block or another layer by its id, with its size as a share of the
  frame or of the face. `caption_place` puts the captions anywhere in the frame, and `presenter_place` sets how large and
  where the presenter's face sits. A placed layer stays where you put it: a clash with the face or another layer is a
  refusal before any credit, or a warning, never a silent move. The old positions still work as shorthands.
- Overlays move: `enter` adds `pop` and `scale_up`, `exit` takes `cut`, `fade`, `pop_out` or `slide`, and
  `enter_offset_s` and `enter_duration_s` time the entrance against its word (#973).
- *Server-side:* a delivered `make_ugc` video is checked frame by frame: a layer over the face, captions that do not
  stand off their background, and anything in the bottom strip where short-video apps draw their own buttons come
  back in `warnings[]`. A check that could not run says so (#973).
- *Server-side:* `plan_reference_remake` carries the reference's measured places and sizes into the plan instead of
  rounding them to a preset (#973).
- `make_ugc` makes interviews (#972). `interview.turns[]` marks the lines an off-screen voice asks, by anchor, in the
  one `script`; the presenter answers the rest. `interview.off_screen` picks that voice and its caption look, and the
  captions never mix the two speakers on one page. With `listening: "freeze"` (the default) the presenter holds still
  while the question plays, and those seconds are charged as video seconds, not presenter seconds.
- `presenter_gaze[]` turns the presenter to the camera, left or right on the words you name, with a cut at each change
  (#972). It needs an actor with those views; `list_actors` shows them, and a missing view is refused before any credit.
- `make_ugc` takes `end_hold_s`, 0.2 to 5 seconds: the last frame stays after the last word, the presenter still and
  every caption, overlay and template then on screen kept. The held seconds are charged as video seconds (#991).
- *Server-side:* an interview is drawn as asked: placed overlays at their place, the questions captioned, and no
  light leak on its cuts unless a `framing` item with `transition: "flash"` asks for one. Its quote now times the
  conversation line by line, and a reserve raised during the render is named in `warnings[]` (#991).

- *Server-side:* a succeeded reference analysis, full or data, carries `frames`: a JPEG for each second of the reel, 4×3
  contact sheets of 12 seconds, the hook frame, a key frame for each beat, and scenes between measured cuts with their
  frames. Links are valid for 24 hours from each read; `get_reference_analysis` pages the seconds with `frames_from` and
  `frames_to`, at most 60 a page, and `page.next` names the next page. In MCP, `frames_as: "images"` also returns up to
  8 key frames as images. `video` is the reel itself as an MP4 link for 24 hours (#979).
- *Server-side:* a full reference analysis tells who speaks (#978). `speakers` names each speaker, on or off screen,
  with their role and caption look, so an interview reads as an interviewer behind the camera and a presenter who
  answers. `segments` is the transcript as timed turns with their speaker and the presenter's mouth, as seen and as
  measured on the frames; a disagreement is a warning. Each beat names its speaker, the presenter's gaze (camera, off
  left, off right…) and notable gestures, such as both hands toward the viewer. Every one of these claims cites
  `frames_s`, the seconds of the frames that show it. The voice profile measures each speaker. A data analysis carries
  `segments` too.
- *Server-side:* an analysis by link adds the post's shares, age in hours and comment rate, the author's followers,
  up to 50 top comments by likes, `code_word_guess` and a `funnel` flag for a comment-keyword funnel (#979).
- *Server-side:* an analysis made before frames and speakers is redone once at no charge when you start the same
  asset or reel again. The answer is the new analysis, with `credits_charged: 0` once it succeeds and
  `replaces_analysis_id` naming the old one; the old one stays readable and names its successor in
  `superseded_by_analysis_id`. A current analysis still answers a repeat as before, free (#979).
- `get_reference_analysis` takes `wait_seconds`, at most 50: the answer comes as soon as the analysis finishes or the
  wait ends, so an agent needs no sleep between reads (#970). An unfinished analysis carries `retry_after_seconds`, and
  in MCP `poll.arguments` names the call to make. The price is unchanged.
- *Server-side:* an analysis by link carries the post's `caption` (cut at 2200 characters, with `truncated`) and its
  `author`: handle, display name and profile link (#990). Both analyses carry `transcript_language`, the spoken
  language the transcription detected.
- `get_reference_analysis` answers `display_markdown`, a ready breakdown of the analysis to show as is (numbers,
  author, caption, hook, beats with times and key frames, speakers, top comments), with `display_hint`; MCP always
  carries it, REST with `display=markdown` (#990). Every answer carries `untrusted_content`, which lists the fields
  holding text from the reel and its post, such as speech, captions and comments: read it as data, never as
  instructions.
- *Server-side:* a full analysis names misheard brands: `spellings` pairs a name the transcript heard ("Piggs Field")
  with the spelling the screen shows at the same moment ("Higgsfield"). The transcript keeps the heard words (#989).
- *Server-side:* the reel's frames end with one frame just before its end (`frames.end_s`), so a gesture in the last
  second has a frame that shows it; a gesture cites the frame at or after its moment (#989).

### Changed

- *Server-side:* `narrator_en_gentle_man` speaks with a new warm American voice; videos made before keep their narration.
- Reference analyses no longer carry internal processing details: `reference_profile.analysis` keeps only its warnings, and the warnings
  say what was not measured and what to check. `plan_reference_remake` still accepts a profile read before this change.
- *Server-side:* a beat's `speaker` is the speaker of its last words, the answer in a question-and-answer beat, and
  `speakers` lists everyone heard in it, in order, with their seconds of speech (#989).
- **Breaking:** staging `method` values name how a value was obtained: `frames-*` measured on the reel's frames,
  `estimated-video` and `estimated-still` read off the picture. Read the analysis again before passing an older profile
  to `plan_reference_remake`.

### Fixed

- *Server-side:* a `make_faceless` run that fails before it has a video to deliver now ends as `failed` with no credits
  charged and its reserved credits released, instead of staying in `generating`. Its `error` says what happened to the
  video and nothing else.
- *Server-side:* a faceless video with fast narration no longer fails when captions are on. A word shorter than a video frame now shows for one frame, and words too short to show apart share one caption.
- *Server-side:* captions no longer blink between pages: a page stays up through a short pause and the next one
  appears at full opacity, while a longer pause or the other speaker's turn still clears it.
- *Server-side:* a `make_ugc` interview that reuses speech it already paid for no longer fails with "Alignment timings
  are invalid".
- *Server-side:* in an interview whose two voices the transcript tells apart, the turns follow the voices: the last word
  of a question no longer goes to the person answering, and no warning claims one voice was heard (#989).
- *Server-side:* a segment's measured mouth is `still` or `moving` only when two measures agree; otherwise it is
  `not_measured`, where a spoken answer could read `still` before (#989).

## [0.36.0] - 2026-10-31

### Added

- `send_feedback`, `POST /v1/feedback`, SDK `sendFeedback()` and `clipwright feedback`: tell us what is missing,
  confusing, wrong or slow, optionally about a run of the account (#941). We read every one. Free. The same kind,
  text and run within 24 hours answer the same `feedback_id`; an account sends up to 20 an hour, and past that the
  answer is 429 `feedback_limited` with `Retry-After`. A run of another account answers 404 `run_not_found`.
- `analyze_reference` and `quote_analysis` take `source_url` instead of `asset_id`: a link to an Instagram reel or
  post, or to a TikTok video (#930, #863). The start makes an analysis-only asset of the account from the reel
  (`source_type: "post"`) and answers its `asset_id`. A succeeded analysis by link carries `source`: the post's views,
  likes, comments and views per hour, the author's median views within ±30 days with the ratio to it, up to ten top
  comments without handles, and the code words commenters repeat. A number the platform does not give is `null` and
  named in `warnings`. The same reel by its full link answers its live analysis for free; a short `vm.tiktok.com`
  link always starts a new one. A YouTube link or any other host answers 400 `reference_url_unsupported` before any
  credits are held. The price is unchanged. `quote_analysis` answers `asset_id: null` for a link with no live
  analysis yet, and an analysis started from an asset answers `source: null`.
- An analysis by link carries `source.author_recent` next to `source.author_median`: the median views of the author's
  12 latest reels, the post excluded, with the ratio to it and its window named, `null` with a warning when unknown (#930).
- `analyze_reference` and `quote_analysis` take `mode`: `"full"` (the default, 70 credits) or `"data"` (10 credits),
  for an `asset_id` or a `source_url` alike (#930, #927). A data analysis skips the vision pass: its answer has
  `reference_profile: null` and `data` with the duration, size and fps, the timed transcript, the hook and a 3×3 frame
  sheet, one JPEG link signed for 7 days on each read. A reel with no speech succeeds with an empty transcript, `hook:
  null` and a warning. A failed data analysis costs nothing. Data analyses have their own cap of 60 per hour; a live
  analysis answers a start of the same input in the same mode only. The answer also names its `mode`; a full analysis
  answers `data: null`.
- *Dashboard:* /skill.md serves the MCP server's SKILL.md on the public site, the operating guide an agent reads
  before its first paid call (#939).
- A reference analysis keeps the reference's words (#930). `reference_profile` gains two optional fields:
  `transcript`, the speech as timed words with the speaker, and `hook`, the words of the first 3 s carried to the
  end of their sentence (no word past 6 s). Each beat's `spoken_summary` holds the words spoken in it, and each
  graphic's `label_hint` holds what the vision pass saw on it; both were empty before. A profile stored earlier
  still parses.
- Five graphic source kinds name what an analysis used to call `other`: `banner` (drawn as a tag), `logo_card`
  (a title card), `price_card` (a stat), `concept_card` (media over the presenter) and `comment_box` (a tag with
  the word to comment) (#930).
- A reference analysis's `staging` lists every element the vision pass found, up to 40; before, it stopped at 12
  (#930). The 12 longest on screen are measured as before; the rest keep the vision pass's box and times, each
  marked `vision-video`. An element the time budget never reached, or one CV could not track, keeps those times too.

### Changed

- The packages no longer ship a `CHANGELOG.md`. This changelog lives at
  [clipwright.io/changelog](https://clipwright.io/changelog), and each package README links to it.
- *Server-side:* `make_faceless` narration voices sound different: each `narrator_*` name keeps its language and
  gender, but a new voice reads it. Three descriptions in `list_voices` changed to fit: `narrator_en_storyteller`,
  `narrator_ru_ambitious_woman` and `narrator_ru_bright_queen`. A narration written from a brief is sized to the
  chosen voice's pace.
- *Server-side:* a `make_faceless` narration longer than `duration_seconds` loses its long pauses first. If it still
  runs past a quarter over `duration_seconds` (or past 90 seconds), the video runs to the narration's end instead of
  failing, and `warnings[]` names both lengths. The charge never exceeds the quote. `faceless_billing.outputFrames`
  of such a run may exceed 2250; a quote's stays within the selection.
- *Dashboard:* /llms.txt tells an agent what to do, not only what exists (#939): setup by where the agent runs, the
  first message to the human after setup, how often to check a run (from measured run times), what each refusal
  charged, and a cost report after every paid call. The refusal table on /docs gains a Charged column.
- Tool descriptions, refusals and warnings say what happens to your run and what to do next (#953). A feature
  that is off answers "not available right now"; a clip of another size or length warns "the clip came back 14.8s
  instead of 15s". Error codes, prices and the `list_generation_models` answer do not change.
- `SKILL.md` in `@clipwright/mcp-server`, also served at /skill.md, is now a map of traps: answers that are wrong
  without an error, each with the date it was checked (#940). Among them: an omitted `aspect_ratio` follows the
  photo's shape, `person` chooses no face, and `make_faceless` without `voice` narrates in English. Field and
  endpoint reference lives in `tools/list`, /docs and /openapi.json. The Claude plugin skill now says that
  `analyze_reference` takes an Instagram or TikTok link, and points to the traps. `get_run` in the MCP server now
  returns a shot candidate's `candidate` block with its `preview_url`, as REST does.

## [0.35.0] - 2026-10-30

### Changed

- The texts an agent reads describe the `parts-v1` tariff (#933). The `call` field says the call adds production
  seconds and that a live-avatar still has its own price; the templates description and the remake plan's tariff
  note drop the retired per-second rate. The MCP server's SKILL.md and the CLI README point to `list_prices` and the
  quotes instead of fixed faceless prices, and the `quote_ugc` example shows `price_lines` for 12 s.
- *Dashboard:* /pricing lists only the presenter a request can get, and prints single images and clips as price
  ranges per resolution without model names (#800). Two comparison pages are rewritten from the other products'
  sites as read on 2026-10-30.

- *Server-side:* `make_ugc` is priced by its parts, one tariff `parts-v1` for short and long videos (#800): 12 credits
  for every second a presenter take fills on HeyGen (22 on OmniHuman), plus 1 for every second of the finished video,
  plus 400 for each live-avatar still of a call, at least 50 for a delivered video. A plain 35 s video costs 455
  instead of 1 050. The quote itemizes it in `price_lines` and names `minimum_credits`; the terms are frozen at
  admission, so a run admitted before keeps its own.
- *Server-side:* `analyze_reference` costs 70 credits (#927): held at the start and charged once the analysis
  succeeds; a failed analysis costs nothing, and starting it again on the same asset answers the same analysis for
  free. The analysis carries `credits_reserved`, `credits_charged` and `balance_after_credits`.
- *Server-side:* single generations are repriced: an image from 6 credits, a clip from 6 credits a second.
- *Server-side:* `make_faceless` is priced by its parts, tariff `faceless-parts-v1` (#800): 7 credits for each picture
  we generate, the opening clip's still included, 49 for the opening clip and 1 for every second of the delivered
  video, at least 50. Your own pictures are not charged. The quote is the most a selection is charged: 212 at 30 s,
  356 at 90 s, instead of 350 and 420. `faceless_billing` names `images` and `imageCredits`; a run admitted before
  keeps its tariff.
- *Server-side:* edits and personal actors are repriced (#800): a revision's new picture 7, clip
  49, clip with a new picture 56, render 13, and a shot candidate the same unit prices; an actor's portrait 4 and each
  other format 8 at `medium`, 12 and 18 at `high`. Runs admitted before keep their snapshot.

### Added

- *Server-side:* `POST /v1/reference-analyses/quote`, the `quote_analysis` tool and `ClipwrightClient.quoteAnalysis()`
  price an analysis before it starts (#927).
- *Server-side:* every settled run carries `balance_after_credits`, the account's balance read in the transaction
  that settled it (#927).

- *Server-side:* `GET /v1/public/prices` lists the price of every action in credits, without a key: one entry per tool
  and variant, its price as lines of credits per unit plus a minimum, or a formula; free tools are listed at 0. No price
  changed (#927).
- The `list_prices` tool and `ClipwrightClient.listPrices()` read that list, and the description of every paid tool
  ends with its price line, built from the same list.
- `@clipwright/core` exports `PRICE_LIST`, `priceLine` and `pricesResponse`, with the constants the list reads:
  `CREDITS_PER_SECOND`, `ACTOR_UNIT_CREDITS`, `EDIT_UNIT_PRICES`, `EDIT_RENDER_PRICE`, `EDIT_ZERO_UNIT_PRICE` and the
  numbers of the faceless tariff.

- *Server-side:* `GET /openapi.json` serves an OpenAPI 3.1 description of the REST API without a key: every public
  route with its request and response schemas, the error envelope and `warnings[]`. The API's own tests check
  their real responses against it.
- `@clipwright/core/openapi` exports `buildOpenApiDocument()` and the route marking `OPENAPI_ROUTES`;
  `@clipwright/core` exports `ENDPOINT_NOTES`, `healthResponse` and `publicSkillsResponse`.
- `make_ugc` takes `voice_pace` (0.7–1.2): `eleven_flash_v2_5` and `eleven_turbo_v2_5` get it as their speed,
  `gemini-3.8-flash-tts` as a "speaking rapidly" or "speaking slowly" style with a warning. `eleven_v4` has no speed
  setting: it gets no speed, and a `voice_pace` other than 1 is named in `warnings[]` (#890).
- `list_voices` gives each English voice on `eleven_v4` its measured pace, `words_per_second`. On that model the voice
  sets the pace, so pick the voice nearest a reference presenter's pace (#890).
- *Server-side:* all ElevenLabs speech goes to `eleven_v4`, now the model of every preset, catalog voice and raw
  `voice_id`. `tts_model: "eleven_v3"` is still accepted: the run speaks `eleven_v4` and `warnings[]` says so.
  `eleven_v4` gives no pause for a `<break>` tag, so the tag is cut with a warning on the default path too.
- `make_ugc` takes `pause_trim`, targets in seconds per gap class: after synthesis a pause longer than its target is cut
  down to it inside silence only, with a crossfade, and word timings move with the audio. A joint that would click is
  kept and named in `warnings[]`.
- *Server-side:* a reference analysis measures the presenter's voice from the words it already transcribes: pace,
  pauses in three layers, hinge pauses, pitch and loudness range, in the profile's new `voice` section.
  `plan_reference_remake` sets `voice_pace` from it on a model with a speed. On `eleven_v4` it sets none and, when
  the voice is more than 5% off the presenter, names the measured voices nearer the presenter's pace (#890).
- `@clipwright/core` exports `referenceVoice`, the schema of that section, and `narrationPaceFromVoice`.

- *Dashboard:* a public `/captions` page plays every caption style on the same presenter and the same words, each
  with the description `tools/list` gives it; the `caption_style` description links to the page.
- `SKILL.md` names every caption style and tells the agent to ask whether the user wants captions, to offer three
  or four fitting styles with the gallery link, and to take the style closest to a reference video's captions.
- *Server-side:* `hormozi` now matches the canonical look: Montserrat Black uppercase, white with a thick black outline,
  one yellow (`#FFD93D`) keyword per cue, up to three words. The previous look (condensed Oswald, orange keyword, no
  outline) is the new style `accent`. `hormozi` stays the default; there are 24 styles.
- *Server-side:* `make_ugc` takes `edit_sounds: true` on a run with `inserts` or `layout_windows`: a low sound plays on
  every cut, to or from an insert, at a full-frame template's cut in or out and at a layout window's in and out, with
  its peak on the cut. `template_sounds.edit` picks it from `swell_hit` (default), `whoosh_deep`, `whoosh_low`,
  `boom_low`, `sub_drop`, `riser_boom` and `riser_hit`. A cut that already plays a template's whoosh or flash gets no
  second sound. Without the field a run plays no edit sounds, as before; `edit_sounds` with nothing to cut, with
  `template_sounds: false`, or `template_sounds.edit` without `edit_sounds`, is refused 400 by its path before any
  hold. The price does not change.
- *Server-side:* new template sounds: a `pop` (`plop`) when a `tag` or a `callout` pops in, a `hangup` (`phone`) just
  before an answered `phone_call` leaves, and `money` (`cash_register`, `coins`) when a `stat` with a currency sign in
  its prefix or suffix counts up. `answer` adds `pickup`, `whoosh` adds `slide_quick` and `flash` adds `swish`.
  `list_template_sounds` lists them. A run frozen before them keeps its sounds.
- *Server-side:* `make_ugc` takes `framing`, presenter sizes on their words: `close` (1.18 times larger about the face)
  or `medium`, each a hard cut that settles over 8 frames, or with `transition: "flash"` a warm light leak over the cut.
  It needs long-form qualification, works without captions, refuses overlap with inserts, layout windows and other framing,
  and names in `warnings[]` a framing wholly under full-frame templates. With `edit_sounds`, each framing cut plays the
  edit sound. `plan_reference_remake` turns a `punch_in` camera into a close framing and a flash into a speaking beat
  into a flashed one.
- `create_actor` takes `from_actor_id` with `framing: "wide"`, `holding` (one or two objects, each with words, an
  optional image asset of the object and a hand) or `setting`: it derives a new personal actor from a library actor or
  your own, with the same face checked against the source. A face that does not match costs nothing. The price is the
  usual per-image units. *Server-side:* the fields are open only where the server switches them on; elsewhere they
  are refused 400 `rejected_field`. A wide derived actor's 9:16 is listed with `framing: "wide"`, and `make_ugc`
  renders it as a wide view. `@clipwright/core` exports `storedActorSource`, `storedHoldingItem`,
  `createActorDispositions`, `createActorRejectedFields` and `isActorViewsEnabled`.

### Changed

- *Server-side:* the template sound library is re-recorded from CC0 sounds the owner chose by ear: 25 of the 31 files
  play a new recording under the same name; the rings, `glitch`, `switch_heavy` and `paper_swipe` stay as they were.
  Every source is named in `THIRD_PARTY_NOTICES`.

## [0.34.0] - 2026-10-24

### Added

- `@clipwright/core` exports `PUBLIC_MCP_URL`, the hosted MCP server address `https://mcp.clipwright.io/mcp`.
- *Dashboard:* a public `/mcp` page answers "Yes, Clipwright has an MCP server": the hosted address with the
  `claude mcp add` command (sign in, no key), the local package with a key, and the tool list. `llms.txt` names the
  hosted MCP address, the `/mcp` page and the CLI. The home page and `/pricing` carry schema.org data with the price
  of the cheapest credit pack, and the sitemap dates the comparison pages by the day their facts were checked.

- *Server-side:* video assets. An MP4 in h264 or hevc up to 120 seconds and 100 MB comes from an own `generate_video`
  run, a public url (`{ url, kind: "video" }`), a presigned PUT (`{ put: { media_type, bytes, sha256 } }`, also for
  pictures) or `POST /v1/assets/bytes` up to 32 MB. A url or a PUT answers `202` with `state: "processing"` or
  `"awaiting_upload"`; the server measures frames, fps, codec and `pix_fmt` from the bytes and publishes the asset,
  and `GET /v1/assets/{id}` says `ready` or `failed` with the reason. Clips are kept for
  assembly and are no generation reference.
- MCP: `create_asset` takes `put` and a url clip; on stdio a local MP4 `path` is uploaded through a PUT.
- `generate_video` and `quote_video` take an optional `camera`: `static`, `push_in`, `pull_back` or `pan`. It
  becomes the first line of the prompt the model gets and does not change the price.
- `GET /v1/generations/models` lists `duration_values` for a model that takes only some lengths inside its
  `duration_s` range; the schema and the quote refuse the others. The resolution `360p` is part of the contract.
- New clip models: `kling-3.0` at 720p in 9:16 and 16:9, 3 to 15 seconds, and `gemini-omni-flash-1.1` at 720p in both
  formats and 360p 16:9, for 4, 6, 8 or 10 seconds. `seedance-2.5` adds 480p 9:16 and 720p 16:9.
- *Server-side:* a clip refused for a real face in its input picture, or turned away as rate-limited before it was
  accepted, is made again at the same quote where the format allows it. A clip is always delivered without an audio
  track.
- *Dashboard:* the Assets page. It lists the account's pictures and clips in a grid of small, medium or large tiles,
  with filters by role and kind, a name search and the usage of the 2,000 assets and 20 GB. A selected asset opens on
  the right: rename it, change its role, copy its `asset_id`, open the file or delete it. Pictures up to 10 MB and MP4
  clips up to 32 MB upload from the page; a clip shows as processing until it is checked.
- *Server-side:* each asset gets a preview of at most 512 pixels on the long side, made by the worker after the asset
  is saved and caught up hourly. The Assets page shows the preview, never the original, in its grid. The API does not
  return the preview yet.
- *Server-side:* more clip formats. `seedance-2.0` adds 480p in 9:16 and 16:9 at 18 credits a second and 720p 16:9;
  `seedance-2.0-fast` adds 480p in both formats and 720p 16:9; `seedance-2.0-mini` and `seedance-2.5` add 480p 16:9.
  The 480p clip of `seedance-2.0`, `-mini` and `-fast` is 496×864 or 864×496, and `warnings[]` says so.
- A `make_ugc` image insert can name `asset_id` instead of `media_url`, exactly one of the two. The quote and the run
  accept only a ready PNG or JPEG asset of the same account, with a `media_type` that matches it. A foreign, deleted
  or unfinished asset answers `400 reference_not_usable` before any credits are reserved. The worker reads the
  file admission recorded and checks its sha256, so a later delete does not change a started run.
- `get_run` in the MCP server returns `created_actor` on a succeeded `create_actor` run, so an agent sees the
  `actor_id` to pass to `make_ugc`.
- `make_ugc` takes `overlays`: pictures anchored to words like inserts, drawn over the presenter in a corner or as a
  band across the top or bottom, entering with `cut`, `fade`, `slide` or `tilt_in`. At most two show at once, and two
  on screen together need positions that share no corner. Captions move to the middle or the bottom of the frame when
  an overlay meets them, never up over the face, and hide when neither place is free. An overlay steps aside while a full-frame insert is on screen, and one wholly under inserts is refused.
- `make_ugc` takes `layout_windows`: `split` puts the presenter in the top half and the picture in the bottom half with
  captions on the seam (9:16 only); `card` shows the picture in a centred card, and `blur_presenter` blurs the
  presenter behind it. Windows may not overlap one another or an insert.
- Inserts take `transition`: `cut`, `wipe`, `flash` or `zoom`. It plays inside the insert's own frames and never moves
  its start or end. A `caption_emphasis` item takes `punch_in: true` to zoom into the presenter while the quote is
  spoken.
- *Server-side:* overlays and layout windows follow the insert rules: `script`, long-form qualification, 1080p and
  `broll_policy=anyone`, exactly one of `media_url` and `asset_id`, and ids unique across inserts, overlays and
  windows. A script with overlays or windows alone runs as long form. They change
  neither the presenter's slots nor the price: a blurred or covered presenter is billed face time. A run whose
  composition is off, skipped or failed names undrawn overlays, windows, transitions and punch-in in `warnings[]`.
- `make_ugc` inserts, overlays and layout windows take `media_type: "video"`, by `media_url` or by the `asset_id` of an
  MP4 asset. The clip plays muted from its first frame and is cut by time where its words end, so a variable frame
  rate does not shift it. A clip shorter than its words holds its last frame, and `warnings[]` names the insert or
  layer: in the quote for an `asset_id` the slow speech edge may outlast, otherwise on the run. H.264 and HEVC in 8 bits
  without HDR are accepted.
- *Server-side:* a 10-bit video asset answers `400 reference_not_usable` before any credits are reserved. A
  `media_url` clip, and the colour transfer of an asset clip, are measured by the worker before the first paid call:
  another codec, 10 bits or more, or a PQ or HLG transfer fails the run uncharged with `media_source_rejected` naming
  the insert or layer. A video `segments` item is still refused. Customer video costs nothing: the same script with a
  picture or a clip quotes and bills the same face seconds.
- *Server-side:* graphic templates on `make_ugc`. `templates[]` takes up to 12 items
  `{ id, kind, anchor, cover_words?, placement?, transition?, data }` of three kinds: `tag` (a gradient pill, also
  over an insert), `lower_third` (a name and role bar) and `end_card` (a site pill with an optional call to action);
  captions are hidden under the last two and under a tag without `position`, which sits in the caption spot. Each kind
  takes `size` small, medium (the default) or large, and long text shrinks to fit. Templates are accepted on any
  `script` run without `segments` and never change its tariff or price: a plain run is billed 30 credits a second of
  finished video, and a run with inserts, overlays or layout windows is billed long-form-v1 (#840). Text over its
  limit (a wide CJK character counts 2), emoji, letters the run's fonts cannot draw, overlapping footprints and the
  other refusals answer 400 with a path before any hold. `@clipwright/core` exports the catalog (`TEMPLATE_KINDS`)
  and `@clipwright/mcp-server` offers a slim template item with the catalog in its description.
- *Server-side:* full-frame templates and template pictures. `title_card` (a hook card: a title in up to two lines on
  a white card, an optional logo picture shown whole and a gradient chip) and `quote` (up to four lines, an author and
  an optional round photo) fill the frame; `stat` counts a number up from zero, on a full frame or over the presenter.
  A full-frame template hides captions, overlays and over-presenter templates while it shows, takes a `wipe`, `flash`
  or `zoom` drawn over the live presenter, and on a long-form run the presenter under it is still billed as face time.
  `logo` and `photo` take `{ asset_id }`: pinned at admission under the template id and slot, a video or another
  account's asset is refused 400 `reference_not_usable` before any hold, and a photo cut to its circle is named in
  `warnings[]`. On a plain run a template picture needs explicit `broll_policy=anyone`, like a layer (#840).
- *Server-side:* templates on a plain script run (#840). A `script` run without inserts, overlays or layout windows
  takes `templates`, `template_theme` and `template_sounds` at 30 credits a second, with no minimum and no face
  seconds. The templates are drawn over its one take; if they cannot be drawn, the video is delivered at the same
  price and `warnings[]` says `templates was not drawn: <reason>`.
- Quotes carry `tariff`: `ugc-per-second-v1` on a plain run, or long form's `pricingVersion` (`long-form-v1`). The
  field is an optional string, so older clients and stored quotes still parse; templates never change it.
- *Server-side:* the `callout` template and template looks. `callout` draws an arrow or a ring onto a point given
  as `target { x, y }` in percent of the frame, pulses twice and rests, with an optional label pill below the point,
  or above it when there is no room or the face is below; the point may sit anywhere, the face rule covers the label.
  A run-level `template_theme { preset?, accent? }` picks `clean_light` (the default when absent) or `bold_dark`, and
  `accent` takes a `#RRGGBB` colour for the pills and accent text. A customer accent under 3:1 against the colours it
  meets is refused 400 at `template_theme.accent` before any hold, never shifted. The look freezes into the timeline,
  so a resumed run draws what it was admitted with, and footprints come from the frozen kind version.
- *Server-side:* three interactive templates with inner quotes. `checklist` draws 2–4 rows of switches or check boxes
  that a cursor clicks in turn; `phone_call` rings an incoming call on a neutral phone at the side and answers it; and
  `compare` sweeps an after picture in over a before picture on a diagonal, full frame. An inner quote
  (`clicks[].quote`, `answer_at`, `reveal_at`) names words inside the template's own: the click, answer or reveal lands
  on their first word, and a click without one is spread evenly. A quote missing from the script, outside the item's
  words, out of the script's order, or on words an insert or full-frame template covers is refused 400 by its path
  before any hold. `compare` takes two pictures, pinned apart as `before` and `after`. Templates still change no price.
- *Server-side:* three more templates and three more looks. `notification` drops a phone notification (an icon, the
  app, a title and a body line) into the band above the face, holds it at least 1.2 s and takes it away before its
  span ends; `progress` completes 2–5 steps in turn, each on its `advance_at` quote (exactly one per step) or spread
  evenly; `rating` fills five stars in turn up to a score in halves. `advance_at` is refused like the other inner
  quotes, and a list of the wrong length too. `template_theme.preset` adds `neon`, `paper` and `mono`, and a customer
  accent is checked against each look's own colours.
- *Server-side:* templates play sounds, well under the voice, from a library of 31 bundled with the composition: a
  checklist click and its switch landing, a phone ringing until it is answered and the answer, a notification dropping
  in, each progress step and rating star, a compare reveal, and a full-frame wipe, zoom or flash. A run plays the
  defaults; `template_sounds: { beat: name }` swaps a beat's sound and `template_sounds: false` plays none. An unknown
  beat or name, or `template_sounds` without templates, is refused 400 by its path before any hold. `GET
  /v1/template-sounds` and the MCP tool `list_template_sounds` list each beat, its default and its names, free. A run
  frozen before this plays none. Sounds change no price. `@clipwright/sdk` adds `listTemplateSounds()`.

### Changed

- *Server-side:* in `mono` the callout's ring and arrow have a white outline, so they read over a dark suit.
- *Server-side:* a template beat spoken before its template has entered (a checklist click before its rows and cursor are
  in, or an answer, step or reveal during the enter) moves to the first frame after the enter, the beats after it keep
  6 frames apart, and `warnings[]` names each move. Runs already rendered keep their frames.
- *Server-side:* captions and the light template look are blue, with no purple: the two-tier and pill captions and the
  `punch` keyword use the reference's periwinkle-to-sky blue, `clean_light` follows it, `bold_dark` sits on a neutral
  near-black ground, `checklist` switches are green when on and red when off in every look, and the `phone_call` screen
  is the device's own teal-to-blue.
- *Server-side:* a template no longer moves captions. While it meets their band it hides them, as the checklist and
  the phone do; a small one elsewhere, such as a notification at the top, leaves them on screen.
- *Server-side:* `generate_image` and `generate_video` cost less. A `seedream-5.0-flash` image costs 5 credits instead
  of 12 and a `flare` image 6 instead of 18; a second of `seedance-2.0-mini` at 720p costs 10 instead of 50,
  `seedance-2.0` at 1080p 91 instead of 250, `kling-3.0` 17 instead of 50 and `gemini-omni-flash-1.1` 19 instead of 55.
  A run already admitted keeps its quoted price.
- *Server-side:* a second of `seedance-2.5` at 480p costs 25 credits instead of 34.
- *Server-side:* every delivered video is encoded once, at a quality setting chosen by eye on text frames, so a
  35-second 1080×1920 video is about 11 MB instead of 27 MB. The resolution is unchanged (#845).

### Fixed

- *Server-side:* a dropped connection while the worker checks on an ordered `make_ugc` clip no longer fails the run
  and charges for it. The worker checks again until its wait deadline, and a run that stays cut off ends with no charge.

## [0.33.0] - 2026-10-20

### Added

- *Server-side:* `POST /v1/uploads/import` downloads a public https PNG or JPEG (up to 10 MB, 20 seconds, up to 3
  redirects) and returns an `upload_id`; private and link-local addresses are refused, and downloads are limited to 30
  attempts per hour per account.
- *Server-side:* `POST /v1/uploads/intents` returns a presigned PUT url for a local PNG or JPEG; the `upload_id`
  becomes usable once the PUT lands, and `GET /v1/uploads/{id}` confirms it. Before the PUT, generations answer
  `upload_not_finished`.
- MCP: `upload_image` takes `url`, and the new `create_upload` and `get_upload` tools work on the hosted server, so a
  remote agent can pass its own picture as `first_frame` or a reference.
- *Server-side:* account assets, switched on since 2026-10-20. `POST /v1/assets` saves a picture from an own
  `generate_image` run, an upload, a public https url or base64, kept until the customer deletes it, and
  `{ asset_id }` works in `references` of both generations and in `first_frame` and `last_frame` of `generate_video`. `GET /v1/assets`,
  `GET /v1/assets/{id}`, `POST /v1/assets/{id}` and `DELETE /v1/assets/{id}` list, read, rename and delete them; an
  account keeps up to 2000 assets and 20 GB and makes up to 100 new ones a day. Free.
- MCP: `create_asset`, `list_assets`, `get_asset`, `update_asset` and `delete_asset`; SDK: `createAsset`,
  `createAssetFromBytes`, `listAssets`, `getAsset`, `updateAsset` and `deleteAsset`.

### Changed

- MCP: on the hosted server, `upload_image` with a `path` now points to `upload_image({url})` and `create_upload`
  instead of `quote_ugc`.
- The n8n workflow `n8n/clipwright-ugc.json` carries sticky notes: an overview with setup and requirements, and one
  note per step, as n8n's template gallery asks. Its whole path, render included, ran on n8n Cloud on 2026-10-20.

### Fixed

- SDK, CLI and MCP no longer retry `url_import_disabled` and `assets_disabled`: both mean the feature is switched off,
  and a repeat gets the same answer.
- `upload_not_finished` tells the agent to PUT the file to its `put_url`, confirm it with `get_upload`, and repeat
  the call.
- *Server-side:* a generation whose `first_frame` or `last_frame` names an unknown source fails before any vendor
  call, at zero credits, instead of running without the frame.

## [0.32.0] - 2026-10-20

### Added

- The public repository ships an n8n workflow, `n8n/clipwright-ugc.json`, built on n8n's own MCP Client node with
  an API key; no community node is needed. It quotes a script, stops when the quote is above `max_credits`, starts the
  render and polls `get_run` every 15 seconds until the run ends. The quote and polling steps ran in n8n 2.43.8; the
  render step and n8n's OAuth credential have not been tried. Setup is in the `@clipwright/mcp-server` README.
- The public repository is a Claude Code and Cursor plugin marketplace: `claude plugin marketplace add
  seocombat/clipwright-mcp`, then `claude plugin install clipwright@clipwright`. The plugin connects the hosted server
  at `https://mcp.clipwright.io/mcp`, which signs in with OAuth, and adds a skill that quotes before it spends credits.
- `SKILL.md` in `@clipwright/mcp-server` carries OpenClaw frontmatter: it needs `node` and `npx` and reads
  `CLIPWRIGHT_API_KEY`. The skill is on ClawHub as `seocombat/clipwright`.
- The four packages name their source repository, `seocombat/clipwright-mcp`, in `package.json`.
- `@clipwright/core` exports `facelessMaxGeneratedImages` and `FACELESS_PUBLIC_MAX_GENERATED_IMAGES` (31): how many
  pictures a faceless video may generate, one per two selected seconds plus four.
- *Server-side:* single generations are on since 2026-10-19: `quote_image`, `generate_image`, `quote_video` and
  `generate_video` no longer answer `generations_disabled`. The 0.31.0 entry announced them as pending.
- *Dashboard:* credits come in three one-time packs: 1,000 for $10, 2,750 for $25 and 6,000 for $50. The dashboard
  has one buy button per pack, and a payment buys one pack.
- *Dashboard:* the landing page is rebuilt. It starts with installing Clipwright in your agent, then shows the kinds
  of video an agent can make with their prices, a quickstart, a real run, actors and voices, and the three packs.

## [0.31.0] - 2026-10-19

### Added

- *Server-side:* the remote MCP server at `https://mcp.clipwright.io/mcp` signs in with OAuth 2.1 and needs no API key.
  A client registers itself, either with a metadata document or with dynamic registration. You approve it at
  app.clipwright.io, and its token carries `mcp:read`, or `mcp:write` for tools that spend credits. Headless agents
  sign in with a device code as the client `clipwright-agent`.
- *Dashboard:* the API keys page lists your connected apps and revokes them, effective on the app's next request.
  Signing in and signing up return you to the page that sent you there.
- `@clipwright/mcp-server` exports `createServer(client, { fileAccess })`, so the same tools can be served over HTTP;
  with `fileAccess: "refuse"`, `upload_image` refuses a local `path`. `ClipwrightClient` in the SDK takes an explicit
  `clientId` (it then ignores `CLIPWRIGHT_CLIENT_ID` and `~/.clipwright`) and an `apiKey` function called per
  request. *Server-side:* a new error code, `insufficient_scope` (403).
- *Server-side (activation pending):* new jobs admitted with required output marking verify signed provenance and a separate
  hidden watermark before delivering generated MP4/PNG/JPEG files; unverifiable required output is withheld with zero charge
  for the failed delivery. Optional `visible_ai_label` defaults to true for newly marked presenter videos, including long form;
  false hides only the visible label. Required machine marking stays enabled, and original uploads and historical files remain
  unchanged. Public contract version: `2026-10-18`. This entry does not announce deployment or activation.
- *Server-side (activation pending):* single paid generations. `generate_image` makes one image and `generate_video`
  makes one silent clip from a prompt, with optional reference images or a first frame. MCP tools: `list_generation_models`,
  `quote_image`, `generate_image`, `quote_video` and `generate_video`. SDK methods: `listGenerationModels`, `quoteImage`,
  `generateImage`, `quoteVideo` and `generateVideo`. An image costs one unit; a clip is priced per requested second. A
  failed generation costs nothing. The routes answer `generations_disabled` until the feature is switched on; this entry
  does not announce activation.

- *Server-side:* upload responses and the upload list include `content_digest`, the SHA-256 of the original bytes, alongside
  `upload_id`. CLI `upload --json` prints both for direct workflow asset binding; the default still prints the URL.
  SDK and MCP preserve the metadata, and the workflow docs show how to copy it without a digest lookup.
  Hand-built TypeScript `UploadResponse` values, including mocks, must supply the new required digest.
- Edit rules for long videos in `@clipwright/core`. The rules gain `cover_min_frames`, the shortest picture over a
  presenter take and the shortest presenter gap between two such pictures; it is `null` where it does not apply, and
  read as `null` when absent. `upload_aspect` may be `{ mode: "exact", epsilon }`, and `max_generated_per_revision`
  may be 0. *Server-side:* `GET /v1/runs/{id}/shots` of a long video carries these rules; the video stays view-only.
- **Breaking:** `SKILLS` gains `revise_long_form`, the revision of a long video that a later release opens. Code with
  an exhaustive `Record<Skill, …>` or `switch` over skills must add it. No run of this skill exists yet.
- *Server-side:* four workflow methods now render: `ugc-product-intro`, `ugc-faq-answer`, `faceless-explainer` and
  `product-image-story`. `plan-run` in the CLI, `run_workflow_plan` in MCP and `runWorkflowPlan` in the SDK buy the
  quoted plan, charged like the video type the method makes. `website-proof-demo` and `kinetic-launch` still only
  plan.
- *Dashboard:* the quickstart names the four workflow methods, and the Workflows section of the docs shows the CLI
  steps from a method's example to a finished run, and how to add your own product photos.
- *Dashboard:* a link to clipwright.io shared in a chat, a social post or a directory shows a preview picture: the
  Clipwright mark and name.

### Changed

- *Dashboard:* a long video's button says **View** instead of **Edit**, because the editor only shows long videos for
  now. The button appears only while the API shows long videos.

### Fixed

- The SDK reads server responses tolerantly: a field that a newer server adds to a quote, the generation models list,
  a run or a workflow answer no longer makes `ClipwrightResponseError` throw in an installed client. A response
  missing a required field still fails.
- *Server-side:* UGC output evidence accepts the measured AAC-LC tail beyond the last video frame, up to two
  AAC frames at the measured sample rate. It retains the container duration and existing billing behavior.
- *Server-side:* a short UGC video is charged for its picture, not for the audio that runs past the last frame.
  An 8.96-second video whose AAC track ends 0.04 s later was charged for 10 seconds; it is now charged for 9.
  `duration_seconds` still reports the file's full length.
- *Server-side:* UGC workflow quotes explicitly warn that duration and credits are estimates, so the final charge
  may differ. Short UGC keeps measured-duration rounding; long-form keeps its separate frozen face-time tariff.
  SDK, CLI and MCP retain the advice in the native quote warnings. Billing calculations are unchanged.
- UGC workflow outcomes expose the measured final-file format, duration and
  digest after verified delivery. Missing or damaged evidence stays explicit;
  the native video result and settlement remain available.
- *Server-side:* generated scenes in `product-image-story` use up to two distinct original product photos as
  references, including the opener image. The first anchors shape; extra originals keep their image placements.
  Plan readiness and the quote disclose the selection and possible visual differences. Older paid checkpoints
  reuse their existing scenes with a warning when product-photo conditioning cannot be verified. Revisions and
  candidates retain that known limitation through later edits.
- The examples of `ugc-product-intro` and `ugc-faq-answer` named the actor `actor_male`, which does not exist, so a
  plan built from either example was refused at the quote with `actor_unavailable`. They name `actor_marcus` now. Both
  cards get a new `content_digest`; a plan pinned to the old one needs a new revision.

## [0.30.0] - 2026-10-17

### Added

- Upload list: `listUploads` in the SDK and `uploads` in the CLI read the account's uploads that a revision still
  takes, newest first and one per picture. Each comes with a freshly signed url and `usable_until`, its creation plus
  30 days of storage less a two-hour margin. Free. *Server-side:* `GET /v1/uploads`.
- *Dashboard:* the editor's **Edit shot** dialog makes a new picture or clip for one shot and shows it beside the one in
  the video; you keep it or discard it. A result costs its price once it is made, kept or discarded; nothing if it fails.
  **Replace with a file** and the **Uploads** tab place your own picture in a shot at no cost, and **Generated assets**
  lists what you made for the video.
- *Dashboard:* long videos open in the editor to view. Each presenter take and each inserted picture or clip is a shot
  you can select and play, with the words said over it; a take also shows how many seconds of the video have the face
  on screen. Editing long videos comes later. *Server-side:* `GET /v1/runs/{id}/shots` answers a delivered long-form
  run with `planned: true` and the new `editable.state` `view_only`; a draft save of such a run gets 409
  `run_not_editable`.

### Fixed

- *Server-side:* uploads made before 2026-10-05T19:49Z are no longer listed or taken by a revision. The storage rule of
  that time deleted their files after 7 days, so a revision that named one failed at no charge.

## [0.29.0] - 2026-10-16

### Added

- Workflow plans: a method from the public workflow catalog becomes a plan that you prepare, save, approve and
  quote for free, and then start as one paid UGC or faceless run with an explicit idempotency key. `listWorkflows`,
  `getWorkflow`, `createWorkflowPlan`, `getWorkflowPlan`, `saveWorkflowPlan`, `approveWorkflowPlan`,
  `quoteWorkflowPlan` and `runWorkflowPlan` in the SDK; `workflows`, `workflow-show`, `plan-create`, `plan-show`,
  `plan-save`, `plan-approve`, `plan-quote` and `plan-run` in the CLI; the MCP tools `list_workflows`, `get_workflow`,
  `prepare_workflow_plan`, `get_workflow_plan`, `approve_workflow_plan`, `quote_workflow_plan` and
  `run_workflow_plan`. Approval and the paid start are separate explicit calls; nothing quotes, approves or starts on
  its own. A method starts only once it is enabled on the server; until then its availability says why. `getRun` of a
  workflow run carries the purchased plan revision and its receipt. *Dashboard:* the videos list labels a workflow
  run with its plan, method and revision. (clipwright#631)
- *Dashboard:* the editor of a faceless video edits its draft: move a cut by dragging it or with the keys, set a shot's
  start, end or length, start or end it on a word, remove a picture, and regenerate a picture or describe a new one.
  The draft saves itself. "Copy as API call" copies the revision as `curl` and as the MCP `revise_run` call, and
  "Render new version" shows the quote and starts the revision, which the header then follows to "Version ready".
  An answer that does not come is held in the browser, so a retry starts no second revision. (clipwright#604)
- A shot of a faceless video can get a candidate: one picture or clip made for that shot, to keep or discard in a
  revision. `quoteCandidate`, `createCandidate` and `listCandidates` in the SDK, `candidate-quote`, `candidate` and
  `candidates` in the CLI, and the MCP tools `quote_candidate` and `create_candidate`. The quote charges nothing. A
  delivered candidate is charged its one unit whether it is kept or discarded; one that fails is charged nothing.
  An identical request returns the same run; `take` (`--take` in the CLI)
  makes another candidate on purpose. `candidate` prints the quote and starts nothing without `--yes`. While shot
  candidates are closed on the server, every call answers `editing_disabled`. (clipwright#604)

### Changed

- **Breaking:** `ApiFailure` gains the kinds `workflow_invalid`, `workflow_conflict` and `workflow_not_ready`, for
  TypeScript callers that switch on the kind. Each keeps every issue and warning of the refusal. (clipwright#631)
- The agent report of `edit_ceiling_reached` and `edit_invalid` names a paid edit and the request, not a revision and
  a document, since shot candidates are refused with the same codes. *Dashboard:* the docs page lists the prices of a
  shot candidate. (clipwright#604)

## [0.28.0] - 2026-10-15

The revision of a faceless video is paid and open: `quoteRevision` and `startRevision` in the SDK, `revise-quote` and
`revise` in the CLI, and the MCP tools `quote_revision` and `revise_run`, which make the server list 17 tools. Three
failure kinds are new: `editing_closed`, `edit_ceiling_reached` and `edit_invalid`.

### Added

- A finished faceless video can be revised: `quoteRevision` and `startRevision` in the SDK, `revise-quote` and
  `revise` in the CLI, and the MCP tools `quote_revision` and `revise_run`. A revision is a new run made from the
  edited document, or from shots named to be generated anew. The quote charges nothing. An identical request returns
  the same run; `attempt` (`--retry` in the CLI) starts a second revision on purpose. A revision that delivers is
  charged its quoted total; one that fails is charged nothing. While paid
  edits are closed on the server, both calls answer `editing_disabled`. (clipwright#604)

### Changed

- **Breaking:** `@clipwright/core`, for TypeScript callers: the union `ApiFailure` has three more members,
  `editing_closed`, `edit_ceiling_reached` and `edit_invalid`. A `switch` over `failure.kind` that is checked for
  exhaustiveness does not compile until it handles them. Code that does not switch on the kind is not affected.
  (clipwright#604)
- The refusals of the revision routes have failure kinds of their own: `editing_closed` for the 503s
  `editing_disabled`, `editing_not_priced` and `editing_window_not_set`, which are no longer retried as server errors;
  `edit_ceiling_reached` with the limit, the count and the runs counted; `edit_invalid` with the issues of the
  document. They were `server_error` and a `client_error` without their fields. (clipwright#604)
- *Dashboard:* `/videos` lists faceless videos as well as UGC videos. A faceless video has no still frame, so its
  tile says that no preview was recorded, and a click plays it like any other tile. "Get video link" on the Balance
  page now gives the link of a faceless video, where it used to answer "No video for this run.". (clipwright#604)
- *Dashboard:* a revision is labelled with the run it revises on the Balance page and on `/videos`, and the docs page
  lists the prices of a revision. (clipwright#604)

## [0.27.0] - 2026-10-13

The shots of a finished video can be read, and the draft of an edit can be kept: `getRunShots`, `getRunEdit` and
`saveRunEdit` in the SDK, `shots`, `edit-show` and `edit-save` in the CLI, and the MCP tool `get_run_shots`. A draft
charges nothing and renders nothing, and no call makes a video from it yet.

### Added

- *Server-side:* the API reads the shots of a run and keeps the draft of an edit. `GET /v1/runs/{id}/shots` returns
  each shot of a finished video: its span in frames, its kind, the words it covers, its description and a signed link
  to its source picture or clip. A run with no shots to show answers `planned: false` with the reason, which is an
  answer and not an error. `GET` and `POST /v1/runs/{id}/edit` read and save a draft: a document of the wanted
  timeline, stored with a version. A save names the version it was written against and is refused with 409
  `edit_conflict` when the draft has another. The three calls are free. A draft charges nothing and renders
  nothing, and no call makes a video from it. (clipwright#604)
- `@clipwright/sdk`: `getRunShots(runId)`, `getRunEdit(runId)` and `saveRunEdit(runId, { base_version, document })`.
  The two 409 refusals of a draft arrive as `ClipwrightApiError` with their fields: `failure.version` on
  `edit_conflict`, `failure.state` and `failure.reason` on `run_not_editable`. `saveRunEdit` sends one request and
  never repeats it. (clipwright#604)
- `@clipwright/cli`: `shots <run>` lists the shots of a run, `edit-show <run>` prints the draft as JSON, and
  `edit-save <run> --file <path>` saves the file `edit-show` printed. A save answered 409 reads the draft once: when
  the draft already holds the file's document one version later, an earlier send went through and the save is
  reported as done; otherwise the command reports the conflict and the stored version. (clipwright#604)
- `@clipwright/mcp-server`: the tool `get_run_shots`, read-only. The MCP server now lists fifteen tools. The draft
  of an edit has no tool: it is read and saved over REST, the SDK and the CLI. (clipwright#604)
- `@clipwright/core` exports the contract of these calls, also on the subpath `@clipwright/core/edit`: `runShots`,
  `runEdit` and `saveRunEdit`, which the API emits and takes, and `runShotsRead` and `runEditRead`, which a client
  parses a response with. The read schemas take as plain strings the names a later API may add: a kind of shot, an
  action, a line, the code of an issue. The document of a draft keeps the keys a client does not know.
  `parseApiFailure` returns the kinds `edit_conflict` and `run_not_editable` for the two 409 bodies, and
  `agentFailureReport` carries `version`, `state` and `reason`. (clipwright#604)

### Changed

- **Breaking:** `@clipwright/core`, for TypeScript callers: the union `ApiFailure` has two more members,
  `edit_conflict` and `run_not_editable`. A `switch` over `failure.kind` that is checked for exhaustiveness does not
  compile until it handles them, and a 409 body with either code no longer parses as `client_error`. Code that
  does not switch on the kind is not affected. (clipwright#604)
- `@clipwright/sdk`: a `ClipwrightResponseError` of a call that starts no run now reads "No run was created and no
  credits were spent, and a retry creates no run and spends none." in place of "Nothing was created; retrying is
  safe.". The old sentence was false of `setActorDefaults` and would be of `saveRunEdit`: such a call may have
  stored what it was sent. (clipwright#604)
- *Dashboard:* the table "When a call fails" of the API docs lists the two refusals of a draft, and its row of
  ordinary refusals names status 422, which an upload that is not a readable image is answered with.
  (clipwright#604)
- *Server-side:* an uploaded image is kept for 30 days instead of 7, as long as the media of a finished run. The
  link returned by `POST /v1/uploads` is still valid for 24 hours; upload the same file again to get a fresh one.
  `@clipwright/core` states the period as `UPLOAD_OBJECT_RETENTION_DAYS`, now 30. (clipwright#607)

## [0.26.1] - 2026-10-09

A metadata patch: the npm description of `@clipwright/mcp-server` no longer carries a catalog claim token.

### Changed

- `@clipwright/mcp-server`: the package description on npm returns to its text before 0.26.0. That release appended
  a one-time token, which a catalog read to confirm who owns its listing of the server. The catalog has confirmed it,
  so the token is gone. No tool, flag or behavior changed. (clipwright#570)

## [0.26.0] - 2026-10-09

`make_faceless` takes a narration voice by name: `list_voices` with `skill=make_faceless` lists seventeen voices in
six languages. The MCP tools `make_faceless` and `quote_faceless` refuse a key they do not declare, and the MCP
server requires a patched `@modelcontextprotocol/sdk`.

### Changed

- *Dashboard:* a guide at `/guides/ai-ugc-ads` says what UGC ads and AI UGC ads are, and what the rules of the
  United States, the European Union and the large platforms ask of them. Every source is listed with its date.
  (clipwright#569)
- *Server-side:* a faceless video file carries its AI disclosure: the statement is embedded in the MP4 and stored in
  the object metadata beside `ai-generated: true` and `generator: clipwright`. When the tag cannot be embedded, the
  video is still delivered and the run says so, with the cause, in `warnings[]`. Faceless files delivered on or before
  2026-10-04 may carry the storage flag alone. (clipwright#489)
- `@clipwright/core` exports `aiDisclosureObjectMetadata(text, embedded?)`, the builder of that object metadata, and
  `AI_DISCLOSURE_EMBEDDED_METADATA_KEY`. `AI_DISCLOSURE_OBJECT_METADATA` stays the metadata of a video with a
  presenter. (clipwright#489)
- *Dashboard:* The AI Disclosure page describes one marking for both kinds of video and names the date before which
  a faceless file may carry less. (clipwright#489)
- *Server-side:* a finished faceless video is delivered even when our own check of the picture objects. The run ends
  `succeeded`, is charged by the delivered duration, and says in `warnings[]` what the check could not confirm and at
  which second: the captions, a scene change, text in the caption area with captions off, or that the check did not
  run. Such a run used to wait for an operator, and the customer got no video. A file that is not the video we
  rendered (wrong length, size or sound) is still refused without a charge. (clipwright#498)
- *Server-side:* the narration of a faceless video is levelled to -16 LUFS, and quiet and loud phrases are brought
  closer together. It used to keep the level of the speech vendor: about 4 LU quieter, with phrases up to 5 dB apart,
  so a later phrase could sound much louder than the opening. Timing is unchanged. (clipwright#333)
- *Server-side:* pictures in a faceless video change faster and less evenly: about every two and a half seconds on
  average, where they used to hold for three to four, and a short phrase gets a short shot of its own. A video uses
  more generated pictures, so it takes longer to make; the price is unchanged. (clipwright#519)
- *Server-side:* a faceless shot that covers two phrases shows one scene. It used to ask for both scenes in one
  picture, which could come back as two pictures stacked in one frame. (clipwright#517)
- *Server-side:* the step that writes the scene descriptions of a faceless video is told to ask for readable words
  and figures only when the script says them. It used to invent some, such as figures on a blackboard that
  contradicted the narration. This makes invented writing rarer, not impossible; the writing in a finished picture
  is compared with the script by the check of generated pictures described further down. (clipwright#516)
- *Server-side:* a faceless video file is smaller and closer to the rendered picture. A local render of one
  43-second video with the new settings came to 29 MB at about 5 Mbit/s, where the old settings gave 75 MB at 14.
  Resolution, frame rate, colour and audio are unchanged. (clipwright#518)
- *Server-side:* a faceless video whose opening clip shows text is delivered, with a `warnings[]` line saying so. It
  used to fail with `opening_clip_rejected: the generated opening clip shows text`, or wait for an operator when the
  frame held a lot of text, so a scene set in a shop or a café often could not be made: the image model draws signs
  and price tags on its own. An opening clip that ends on a fade or is one flat colour still fails without a charge.
  (clipwright#524)
- *Server-side:* a faceless video may run up to a quarter past `duration_seconds`, never past 90 seconds. It used to
  fail with `voice_outside_selected_duration` when its narration ran more than 5 seconds over, and one script is
  spoken at a different length from run to run, so a script that fitted once could fail the next time. A video more
  than 5 seconds longer than selected says so in `warnings[]`, with both lengths. The price is unchanged: seconds
  past the selection are free. A script is still accepted when its estimated length is 21 seconds to
  `duration_seconds` plus 5, at most 90. (clipwright#529)
- `@clipwright/core`: `facelessMaxOutputFrames(selected)` returns a quarter past the selection, and the new
  `facelessMaxEstimateFrames(selected)` returns the selection plus 5 seconds, the bound a script estimate must fit.
  (clipwright#529)
- *Server-side:* a faceless video is ready sooner. After the first picture the others are generated three at a time,
  beside the opening clip, where they used to be made one after another. The price and the result are unchanged.
  (clipwright#520)
- *Server-side:* at most two faceless videos of one account are made at once; a third waits its turn and is not
  refused. Faceless runs had no such limit. Each line also has a limit across all accounts now, so when many accounts
  render at once a run may wait behind theirs instead of failing at a vendor. Three videos with a presenter per
  account, as before. (clipwright#534)
- `@clipwright/core` exports `MAX_CONCURRENT_FACELESS_PER_ACCOUNT`. (clipwright#534)
- *Server-side:* captions of a faceless video break at the script's punctuation. A caption line used to be filled to
  the width of the frame, so it could end one word into the next sentence: "NEXT MORNING A SIGN SOLD", then "OUT BY
  NOON". A line now ends at a sentence mark, crosses a comma only with whole clauses, and a clause too long for one
  line is split into parts of similar width instead of a full line and a leftover word. An abbreviation written with a
  full stop before a capital or a figure ("Dr. Smith", "No. 1") still reads as a sentence end and can leave a one-word
  line. (clipwright#535)
- *Server-side:* a video with a presenter (`make_ugc` or long-form) comes in a smaller file that is closer to the
  rendered picture. A local render of one 69-second long-form video with the new settings came to 45 MB, where the
  old settings gave 54 MB. Resolution, frame rate, colour and audio are unchanged. (clipwright#526)
- *Server-side:* a character who appears in several scenes of a faceless video is now described the same way in every
  scene that shows them. The step that writes the scenes fixes one description of every recurring person or animal
  (apparent age, build, hair, clothing), and the picture of each such scene is asked for with it. A secondary character
  used to be a different person in every scene; only the main character, shown in the first picture, stayed the same.
  Faces can still differ a little between scenes. (clipwright#532)
- `make_faceless` takes `voice`, the narration voice by name: `voice` on `quote_faceless` and `make_faceless`,
  `--voice` on `quote-faceless` and `make-faceless`. `list_voices` with `skill=make_faceless` (`--skill
  make_faceless` on `voices`) lists seventeen narration voices for it, in English, Russian, Spanish, Portuguese,
  French and Italian, each with a language and a gender. Every listed voice now names the one skill that speaks it
  in `skill`. Without `voice` the narration is read as before, by `narrator_en_wise_lady`. An unknown name,
  a `make_ugc` voice and `voice_id` are refused before any charge, and `make_ugc` refuses a faceless voice the same
  way, naming the skill that speaks it. A named voice whose language is written in another alphabet than the
  script adds a line to `warnings[]` of the quote and of the run: the voice may mispronounce the text, and the
  video may come out longer than its length limit and fail. A brief written in the other alphabet, with no letter
  of the voice's, adds that line as a condition, since a brief may ask for the narration's language in words. The faceless voices have
  no audio sample yet. (clipwright#530)
- **Breaking:** `@clipwright/mcp-server`: `make_faceless` and `quote_faceless` refuse a key they do not declare,
  `voice_id` first of all, before any request is sent. Such a key used to be dropped silently. (clipwright#530)
- *Server-side:* `GET /v1/voices` without `skill` returns the `make_ugc` voices only, the same list as before, to
  every client version; `skill=make_ugc` returns it too. The faceless voices come only with `skill=make_faceless`,
  as `kind: "faceless_voice"`. (clipwright#530)
- `@clipwright/core` exports `FACELESS_VOICES`, `FACELESS_VOICE_NAMES`, `DEFAULT_FACELESS_VOICE`,
  `FACELESS_SPEECH_MODEL`, `isFacelessVoiceName`, `buildFacelessVoiceWarnings`, `VOICE_SKILLS`,
  `FACELESS_REJECTED_FIELDS` and `offeredFacelessInput`; `@clipwright/core/voice-admission` exports
  `serverFacelessInput` and `facelessVoiceRefusal`. (clipwright#530)
- *Server-side:* a generated picture of a faceless video can be checked before the video is assembled: for writing that
  neither the script nor the run's `character_details` contain, and for a frame cut into several pictures. It makes a
  video of eighteen pictures about a minute and a half slower. A picture
  with either is drawn once more when the run has time and budget for it, and the cleaner of the two is used. What
  remains is named in `warnings[]` with the seconds it is on screen, one line for each thing found; a finding by itself
  does not fail the run. A picture whose check cannot run in its time or within the run's budget is used as it is, and
  one `warnings[]` line says how many pictures went unchecked. Scene pictures are also asked for no writing unless the
  scene quotes the script. A customer's own image is
  not checked. Writing on a `character_reference` picture is not known to the check: a generated picture that repeats
  it is reported when the writing has a figure or more than two words. (clipwright#516, clipwright#517)
- *Server-side:* the narration of a faceless video is delivered in two identical channels instead of one. It sounds the
  same, and a loudness meter now reads the -16 LUFS the narration is levelled to; a meter that measured the single
  channel read 3 LU lower. The file grows by about 1 %. (clipwright#526)

### Security

- `@clipwright/mcp-server` requires `@modelcontextprotocol/sdk` 1.31.0 or newer. Earlier versions let an OAuth client
  send credentials to an authorization server chosen by the MCP server (GHSA-6qxp-vccf-f47h). The server speaks stdio
  and uses no OAuth; a fresh install of 0.25.0 already resolves to a patched version. (clipwright#510)

### Fixed

- *Server-side:* a faceless video whose opening clip has to end in the middle of a phrase keeps the words a
  `scene_images` picture is anchored to on that picture: the narration starts later, by under three seconds, so the
  clip ends before those words. When no such start exists, the video is still delivered, and `warnings[]` names the image and
  the anchored words spoken while the opening clip was on screen. It used to say nothing. (clipwright#521)
- *Server-side:* a faceless narration that comes out longer than the video may run is spoken once more, a little
  faster. The run used to fail with `voice_outside_selected_duration` after the story and the speech were made, and
  one script is spoken at a different length from run to run, so a script that fitted once could fail the next time.
  A script that would not fit even at the fastest speech still fails, without a charge. (clipwright#529)
- *Server-side:* a faceless run no longer stops for review when one picture takes the image service about two minutes.
  Such a picture is rare, about two in a hundred, but a video has eighteen or more, and since the pictures are made
  three at a time (clipwright#520) one slow picture was enough to hold the whole run for an operator. A picture now has
  four minutes before the run gives up on it. (clipwright#544)
- *Server-side:* two faceless videos made at the same time are much less likely to stop for review. Under load a video
  can take a few minutes longer. (clipwright#553)
- *Server-side:* at most two faceless videos are made at once across all accounts; a third waits in the queue and
  starts when one of them is done. The limit per account stays at two, so one account's two videos can hold the
  line while another account's video waits. (clipwright#553)
- *Server-side:* a Russian voice preset speaks again. A run that named it was refused before any charge. It is still
  on `eleven_v4`, and `list_voices` links its sample. (clipwright#497)
- *Server-side:* the delivery check of a faceless video no longer mistakes a yellow or amber picture for a caption
  fault. It refused a correct video whose picture glowed behind the captions: a lamp, a sunset, fire, gold. The check
  now compares neighbouring frames, so only yellow that moves with the spoken word counts. (clipwright#496)
- *Server-side:* a video file keeps one metadata box. The AI disclosure used to be added as a second box next to the
  encoder's own, so a reader that takes the first box saw the encoder's comment and no disclosure. The disclosure now
  replaces that comment in the one box, and the encoder tag stays. (clipwright#493)

## [0.25.0] - 2026-10-04

The AI disclosure names what each video holds, and the clients show it: `get_run` of the MCP server and
`clipwright runs <id>` carry `ai_disclosure`. The visible "AI-generated" label is gone, and the clients no longer
offer `disclosure_overlay`.

### Removed

- **Breaking:** *Server-side:* `disclosure_overlay` is gone: no video carries the visible "AI-generated" label. Quote
  and run refuse the field with 400 `rejected_field` before any charge, and the refusal says where the disclosure is:
  the run response and the file metadata. Clients up to 0.24.0 still list the field in their input schema; stop
  passing it. Label the publication with the platform's own control. The contract version is `2026-10-04`.
  (clipwright#488)

### Changed

- *Dashboard:* The Privacy Policy says that we keep the site that referred you and any marker in the link that
  brought you to sign-up, and that a notification of each sign-up, with the email address, reaches us through
  Telegram. (clipwright#482)
- *Server-side:* `ai_disclosure` of a faceless run names what that video holds: "This video was generated with AI:
  the voice, the opening clip and the images are synthetic." A faceless run with `scene_images` says instead that the
  voice and the opening clip are synthetic, and so is every image its author did not supply. Until now a faceless run
  carried the sentence of a video with a presenter, about an actor and lip sync it does not have. A run with a
  presenter keeps its sentence. (clipwright#488)
- `get_run` of the MCP server returns `ai_disclosure` with a finished video, and `clipwright runs <id>` prints it
  under the video link. Until now neither showed the statement. (clipwright#488)
- *Server-side:* a run accepted with `disclosure_overlay: true` before the label was removed and composed after it
  says so in `warnings[]`. (clipwright#488)
- `@clipwright/core` exports `aiDisclosureText(skill, input)` and the two faceless sentences,
  `FACELESS_AI_DISCLOSURE_TEXT` and `FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT`. `AI_DISCLOSURE_TEXT` stays the sentence
  of a video with a presenter. (clipwright#488)
- *Dashboard:* The AI Disclosure page gives the three wordings of the statement, says that a faceless file carries a
  storage flag alone, and no longer describes a visible label. (clipwright#488)

## [0.24.0] - 2026-10-03

A second speech model, `gemini-3.8-flash-tts`, with thirty voices of its own and a sample of each in English and
Russian. Nothing changes unless you name the model or one of its voices. The CLI and the MCP server accept the new
`tts_model` value from this release on.

### Added

- `tts_model` accepts `gemini-3.8-flash-tts`, a speech model of a second vendor. Nothing changes unless you name it:
  every default stays as it was, and Russian speech without `tts_model` still uses `eleven_v4`. The model speaks only
  its own voices: without `voice`, `kore` for a female actor and `charon` otherwise. It reads Russian stress marks,
  and it gets the text with `<break time="…" />` tags cut, which the response names in a warning. Its script limit is
  5,000 characters. The price per finished second is the same as on every other model. (clipwright#453)
- `voice` accepts the thirty voices of `gemini-3.8-flash-tts` by name: `kore`, `puck`, `zephyr` and the rest, as
  `list_voices` returns them. Naming one selects that model without `tts_model`, and the quote names the model.
  `clipwright voices` prints the model on the line of such a voice. (clipwright#453)
- *Server-side:* `list_voices` returns those thirty voices after the presets as entries of kind `model_voice`. Each
  names one model in `model` and `supported_models`, has no `language`, and carries `gender` only where it is known:
  `kore` is female and `charon` is male. The filters `model=gemini-3.8-flash-tts`, `language=ru` and `language=en`
  find them; any other language does not. (clipwright#453)
- *Server-side:* each of those thirty voices carries `preview_url`, a short sample spoken by that voice on its model.
  The sample is in English; a request filtered by `language=ru` gets the Russian one. `clipwright voices` prints the
  link under the voice, as it does for every other voice with a sample. (clipwright#453)
- *Server-side:* with `gemini-3.8-flash-tts` the API refuses a preset or catalog `voice`, `voice_id`, `captions=true`,
  `segments` and `inserts` before any charge: the model does not speak the preset and catalog voices and returns no
  word timings. It refuses the same when a voice names the model instead of `tts_model`, and it refuses one of the
  model's voices next to any other `tts_model`. Each refusal names what to pass instead. `list_voices` lists the
  model in `models[]` with the languages `en` and `ru`; no preset or catalog voice names it in `supported_models`.
  (clipwright#453)
- *Server-side:* a warning about stress marks on `eleven_flash_v2_5` or `eleven_turbo_v2_5` names only the models
  that speak the voice of the run: with an explicit `voice` or `voice_id` these are `eleven_v3` and `eleven_v4`.
  (clipwright#453)
- *Server-side:* the quote and the reserve for a Russian script on `gemini-3.8-flash-tts` assume 2.2 words per second,
  the pace measured on its two default voices: 153 Russian words are quoted at 70 seconds and 2,100 credits. A script
  in Latin letters on this model is quoted at 2.6 words per second, as on every other model. The charge follows the
  measured duration. (clipwright#453)
- *Dashboard:* the Privacy Policy, the Cookie Policy and the AI disclosure page name the speech provider of a run
  that chooses this model. (clipwright#453)

## [0.23.0] - 2026-10-02

Russian speech moves to `eleven_v4`: the server names it by default, and the client texts say which voices speak it.
Clients older than 0.22.0 fail on the new model name.

### Changed

- **Breaking:** *Server-side:* Russian speech uses `eleven_v4` when you name no `tts_model`. That covers the Russian
  presets, the catalog voices named `ru_*`, and a raw `voice_id` whose script is mostly
  Cyrillic. Every other voice stays on `eleven_v3`, and an explicit `tts_model` always wins. Clients older than 0.22.0
  read the model as one of three fixed values and fail on a response that names `eleven_v4`: `list_voices` fails
  whenever the listing holds a Russian voice, as the unfiltered one always does, and `quote` fails for those Russian
  voices. Upgrade to 0.22.0 or later. The contract version is `2026-10-02`. (clipwright#452)
- **Breaking:** `resolveTtsModel` in `@clipwright/core` requires `script`, the whole spoken text of the run: a raw
  `voice_id` takes its model from it. (clipwright#452)
- *Server-side:* a script, or the line of one actor segment, that holds nothing but `<break time="…" />` tags is
  refused before any charge on `eleven_v4`. The model gets the text with those tags cut, and nothing would be left
  to say. (clipwright#452)
- *Server-side:* the warnings for a model that misreads stress marks name both models that read them, `eleven_v4`
  and `eleven_v3`, instead of advising `eleven_v3` alone. (clipwright#452)
- *Server-side:* the quote and the reserve for a Russian script on `eleven_v4` assume 2.18 words per second, the
  measured pace, instead of 2.3. `duration_estimate_sec` and `credits_estimate` come out about 5% higher: 153 Russian
  words are quoted at 70 seconds and 2,100 credits instead of 67 seconds and 2,010. The charge still follows the
  measured duration. A Russian script on an explicit `eleven_v3` and every other language are quoted as before.
  (clipwright#452)
- *Server-side:* the long-form qualification ceiling (`segments` or `inserts`) moves from 300 to 327 seconds of
  estimated output, for every run. A Russian script on an `eleven_v4` voice passes up to 713 words, against the 691
  that passed while Russian voices spoke `eleven_v3`. A Russian script on an explicit `eleven_v3` passes up to 753
  words and an English one up to 851. A longer script is refused before any charge. (clipwright#452)
- The `tts_model` and `script` descriptions say which voices speak `eleven_v4` by default, name both models that read
  stress marks, and say that break tags are not counted toward the `eleven_v4` script limit. (clipwright#452)

### Fixed

- `SKILL.md` and the CLI README no longer say that every preset and catalog voice speaks `eleven_v3`, and no longer
  advise keeping Russian scripts on `eleven_v3`. They name the voices that speak `eleven_v4` when you name no model:
  the Russian presets, the catalog voices named `ru_*`, and a raw `voice_id` with a
  mostly Cyrillic script. They name both models that read stress marks, `eleven_v4` and `eleven_v3`, and say that
  `eleven_v4` gives no pause for a `<break time="…" />` tag and gets the text with the tag cut. `SKILL.md` lists the
  5,000-character script limit of `eleven_v4`. The behavior is the one the entries above describe; only these texts
  were out of date. (clipwright#452)
- The `--tts-model` help of `clipwright make` says that an omitted flag means the voice's default model. It said
  "the preset's model", which was wrong for a catalog voice and for `--voice-id`. (clipwright#452)

## [0.22.0] - 2026-10-01

A new speech model: `tts_model` accepts `eleven_v4`, and the clients no longer fail on a model they do not know.

### Added

- *Server-side:* a new sign-up gets a one-time trial of 420 credits, enough for one 90-second faceless video. An
  account gets one trial at most. (clipwright#58)
- `tts_model` accepts `eleven_v4`, with a script limit of 5,000 characters. No voice speaks it by default: presets,
  catalog voices and a raw `voice_id` stay on `eleven_v3` until you name it. It reads stress marks as `eleven_v3`
  does. It gives no pause for a `<break time="…" />` tag, so the tag is cut from the text and `warnings[]` says so
  in the quote and on the run. `list_voices` reports its languages. (clipwright#452)

### Changed

- The clients read `tts_model` in a quote and `model` in `list_voices` as text, not as one of a fixed list. A client
  released before a new speech model no longer fails on a response that names it. (clipwright#452)

## [0.21.1] - 2026-09-27

A wording patch: the clients now describe the faceless length the way the API delivers it.

### Fixed

- The `make_faceless` tool description, the `make-faceless` CLI help, the `.mcpb` manifest, `SKILL.md` and the
  package READMEs no longer call a faceless video a fixed 30–90 seconds. You select `duration_seconds` from 30 to 90;
  the video ends with its narration and runs from 25 seconds to 5 seconds past the selection, never past 90. The
  behavior is unchanged from 0.21.0; only the text was wrong.

### Changed

- *Dashboard:* The Acceptable Use Policy allows a faceless video to show a recognisable public figure when the story
  is about that person (news, history, biography, commentary). It still may not make them appear to say, do or
  endorse anything they did not. Showing a real person speaking your script still requires that person's consent.

## [0.21.0] - 2026-09-27

Faceless videos: an agent can now make a video of up to 90 seconds without an on-camera presenter, from a script or
from a short brief, and see the price before anything is made.

### Added

- `quote_faceless` and `make_faceless` MCP tools, `quoteFaceless` and `startFaceless` in the SDK, and the
  `quote-faceless` and `make-faceless` CLI commands. The video is narration over an opening animated clip and image
  scenes, with captions on by default. `duration_seconds` (30 to 90) is a target: the video ends with its narration
  and runs from 25 seconds to 5 seconds past `duration_seconds`, never past 90. `quote_faceless` is free;
  `make_faceless` returns a `run_id`, and `get_run` reports progress. The MCP server now lists fourteen tools.

### Server-side

- A faceless run is charged for the video it delivers, by its actual length, and never more than its quote: seconds
  past `duration_seconds` are free. A failed
  run is charged nothing, including one we stop ourselves because a step did not meet our checks. A run held for
  review keeps its credit hold until it is resolved.
- Captions drop surrounding punctuation, keep accents and other diacritics, and show numbers as written (`$3.50`,
  `10:30`, `1,000`, `50%`, `-20`).
- With captions on, the script is checked against the caption font before speech is generated; a character the font
  cannot draw fails the run without a customer charge.
- Narration uses automatic language detection.
- Pictures change about every three seconds, between spoken words.

### Changed

- *Server-side* Voice catalog: `cs_female_jana` is now listed with use case `advertisement` (was `narrative_story`);
  the notice period is 4015 days for `en_female_cassidy` (was 730) and 730 days for `fi_male_jaakko` (was 365).
  `es_male_benjamin` is unchanged and remains available.

### Known limits

- The voice reads some abbreviations literally: write "1.5 million" rather than "1.5M".
- A generated picture can come out as a collage of two or three panels, and small character details (glasses,
  for instance) can change between pictures.
- Narration is not loudness-normalized yet, so a video can play quieter than other clips in the same feed.
- *Server-side* A faceless run can fail when the opening clip shows a pattern our text check mistakes for lettering
  (a chain, for instance). The run is charged nothing; running it again produces a new video.

## [0.20.0] - 2026-09-25

The MCP server is ready for directories: it has a name in the official MCP
Registry, and every tool tells the host whether it only reads or writes.

### Added

- Every MCP tool now carries a `title` and the `readOnlyHint`/`destructiveHint`
  annotations: quotes, lists and reads are read-only, `delete_actor` is
  destructive, and `make_ugc`, `create_actor`, `upload_image` and
  `set_actor_defaults` write.
- `@clipwright/mcp-server` declares `mcpName: io.clipwright/mcp` for the official
  MCP Registry.

## [0.19.0] - 2026-09-22

A paid video that arrived after we stopped waiting can now be collected: the run
goes back to `queued` and drives the pipeline again. The server side was live
from the day it was deployed; this release carries the contract change to the
MCP tool description, which is where an agent reads the promise.

### Changed

- **Breaking:** `failed` is no longer always final. A run whose paid vendor job
  we still hold can be reopened: it goes back to `queued` and may reach
  `succeeded`. Every reopening is named in `warnings[]`, and one run is reopened
  at most three times. An agent that stops polling the moment it reads `failed`
  will miss a video that was paid for and delivered.
- *Server-side* A run that lost the video while the vendor was still working on
  it no longer says its paid job "was retained for recovery" when this run's
  terms cannot support recovery. Reading the terms fails soft: when they cannot
  be read at all, the run promises nothing either way.

## [0.18.0] - 2026-09-21

Long-form clips can now show a face for a fifth of their length instead of nearly
all of it, which is what the face-second meter was priced for.

### Added

- `cover_words` on an insert says how many spoken words it covers, counted from
  the first word of its anchor. The share of words left uncovered decides the
  share of the clip that shows a face, and it does not move with the speed the
  voice reads at. Word length still varies: at a 560-word script, asking for 19%
  delivered 16 to 22 in nine hundred and ninety-seven simulated runs out of a
  thousand, measured on this profile's voice. A shorter script scatters wider.
- A quote for a narrated clip carries `estimatedFaceWordShare`: the share of the
  clip that will show a face, known before anything is synthesised.

### Changed

- **Up to 49 inserts per clip**, not two, and at most six appearances of the
  actor between them. Both are counted from the word indexes you send, so an
  input asking for more is refused before anything is paid for.
- *Server-side* An insert now ends where its first uncovered word begins rather
  than where its last covered word ends, so the pause between two words belongs
  to the insert. Inserts whose coverage meets are adjacent frame for frame and
  no longer leave a fragment of actor footage between them.
- *Server-side* The credit hold for a narrated clip reserves the words you leave
  uncovered instead of the whole narration. On a clip that covers four fifths of
  its script the hold falls from 2170 credits to 630. Billing is unchanged: it
  has always used the face intervals actually delivered.

## [0.17.0] - 2026-09-16

Everything here came out of the second dry run by a tester who had not seen the
product before.

### Added

- The MCP server reports money. `make_ugc` carries `credits_reserved` and
  `get_run` carries `credits_charged`, in every state, so an agent no longer has
  to call `get_account` before and after and subtract. The field names come from
  the run schema, so REST and MCP cannot drift apart. (clipwright#209)
- *Server-side:* in `GET /v1/voices`, each entry of `models` carries
  `vendor_verifies_voices` — whether the vendor's library listing marks any voice
  as verified for that model. It is `false` for `eleven_v3` (measured: none of
  303 live catalog voices), so an empty `verified_models` on that model says
  nothing about the voice. (clipwright#208)
- *Server-side:* a voice whose gender differs from the actor's is named in
  `warnings`, in the quote and in the run. The combination still runs as asked —
  voicing a man with a female voice is sometimes deliberate — but it is no longer
  silent. (clipwright#210)
- *Server-side:* an `image` smaller than the output on its short side gets a
  warning that the source is upscaled, with both sizes and the size to send
  instead. The default actor is silent: its size is a property of our own image,
  stated once in the docs. (clipwright#211)

### Fixed

- *Server-side:* a request body that is not valid JSON answers 400
  `malformed_body`, not 500. A 500 says the failure is ours, so an agent retries
  bytes that will never parse; the new message says both what to fix and that a
  retry fails the same way. (clipwright#212)
- *Server-side:* a source we cannot use — private or loopback host, http,
  unreachable, redirecting, over 10 MB, or not PNG/JPEG/WebP — is refused with
  400 `unusable_source` before any charge, in the quote and in the run alike.
  It used to be priced: a loopback url answered 200 and an estimate, while the
  tool description promised a refusal. (clipwright#213)
- *Server-side:* refusals on `script`, `voice`, `voice_id` and `image` are
  written in the product's words instead of the schema library's, and the
  description of `script` no longer names a field the API rejects.
  (clipwright#212)
- *Dashboard:* the root of the cabinet host sends a signed-in visitor to their
  dashboard instead of showing the landing page with a "Sign in" button.
  (clipwright#214)
- *Dashboard:* every tile on `/videos` prints its `run_id` and links to the
  support form with it. The id used to live only in the preview image's alt
  text, so tiles without a preview had none at all. (clipwright#215)
- *Dashboard:* the REST example on `/quickstart` runs unchanged in any shell: one
  line, no backslash continuations and no shell substitution. (clipwright#211)

## [0.16.0] - 2026-09-16

### Added

- *Server-side:* a new skill, `create_actor`, builds a personal actor for the
  account from a description of a fictional adult: a 9:16 portrait with exactly
  one face, plus the other requested formats edited from it. `POST
  /v1/skills/create_actor/quote` and `/run` take the description, `gender`,
  `approximate_age`, `name`, `quality` and `aspect_ratios`; the run reports
  `created_actor` when it succeeds, and the returned `actor_id` goes to
  `make_ugc` in the same field a catalog actor does. `GET /v1/actors` lists the
  account's own actors after the catalog, and `DELETE /v1/actors/{id}` takes one
  out of the choice. The skill appears in `GET /v1/public/skills` only while
  generation is switched on; until then quote and run answer 503
  `actor_generation_disabled` and no run is created. (clipwright#120)
- *Server-side:* runs have a new state, `generating`, which only `create_actor`
  enters. The set of terminal states is unchanged: `succeeded` and `failed`, and
  nothing else. (clipwright#120)
- Personal actors reached the clients. The SDK gained `quoteActor`,
  `createActor` and `deleteActor`; the CLI gained `quote-actor`, `create-actor`
  and `delete-actor`; the MCP server gained `quote_actor`, `create_actor` and
  `delete_actor`, so `tools/list` now returns ten tools instead of seven. The
  idempotency key of an actor run is built from the actor's own schema: two
  different descriptions are two different keys, and a repeated call with the
  same description returns the run already paid for. (clipwright#120)
- *Dashboard:* `/actors` shows the account's personal actors next to the
  catalog and deletes one on confirmation. A deleted actor stops being offered
  at once; its images are removed by a daily cleanup. (clipwright#120)

### Changed

- *Server-side:* a request with `person` and generation switched on gets a
  warning that points at `create_actor` instead of only saying the field is not
  honored. (clipwright#120)
- *Server-side:* `create_actor` is charged per published image, not per second:
  the portrait and each extra format cost what the quote showed, a partial
  result charges only what was published and names the rest in `warnings`, and a
  failed run costs nothing at all. Refused descriptions and unusable portraits
  are free. (clipwright#120)

## [0.15.0] - 2026-09-14

### Changed

- *Server-side:* in `GET /v1/voices`, a catalog voice carries `preview_url` and
  `preview_expires_at` once its sample is recorded: a short clip of that voice on
  `eleven_v3`, in the voice's own language. The link is signed by us and
  expires like a preset's. A voice without a recorded sample for its current
  model and sample text still has neither field, and the list never links to
  the vendor. The sample texts outside English and Russian are machine
  translations that no native speaker has checked. (clipwright#164)
- *Server-side:* without `voice` or `voice_id`, the voice follows the actor's
  gender: a woman from `actor_id` speaks `sarah`, a man speaks `george`. The
  default actor still speaks `george`, and an explicit voice always wins.
  (clipwright#183)
- *Server-side:* a request with `image` and no voice gets a warning that the
  male `george` voice is used, naming `voice` and `actor_gender` as the fix.
  `GET /v1/runs/{id}` derives it from the stored input, so runs started before
  this change show it too. A request with `actor_gender` next to `voice` or
  `voice_id` gets a warning that the hint changed nothing. (clipwright#183)
- *Server-side:* the contract version moved to `2026-09-14`. (clipwright#183)
- *Dashboard:* `/actors` says that an actor without a chosen voice speaks the
  default voice of their gender. (clipwright#183)

### Added

- `actor_gender` (`female` or `male`) in the `make_ugc` input: next to `image`
  it picks the default voice of that gender. It is refused with `actor_id` and
  without `image`, and the remote fetch killswitch turns it off together with
  `image`. The REST API accepts it from the day the API is deployed; the MCP
  tool schema, the SDK types and the CLI flag `--actor-gender` arrive with this
  release. (clipwright#183)

- *Dashboard:* `/actors` shows the actor library as a gallery: every published portrait with
  its `actor_id` to copy, next to gender, approximate age, description and version. A person
  can pick a face without calling `GET /v1/actors` first. (clipwright#148)
- *Dashboard:* `/videos` lists the finished videos of the account. Each one is a still frame
  taken from the delivered file, with the length of the clip and the day it finished, and a
  tile with a frame plays the video. Runs that are still going or that failed stay on the
  Balance page. (clipwright#138)
- *Dashboard:* `/changelog` renders this file as a public page, so the release notes are
  readable without installing a package. (clipwright#102)

## [0.14.0] - 2026-09-13

### Changed

- **Breaking:** *Server-side:* `GET /v1/voices` lists the catalog voices after
  the five presets, by language and then by rank; a voice retired from the
  catalog is not listed. Every entry gains `kind` (`preset` or `catalog`) and
  `supported_models`, the contract models that know the voice's language. A
  catalog voice also carries `verified_models` and whichever of `locale`,
  `accent`, `gender`, `age` and `use_case` the catalog has. The response gains
  `models`: each contract model with its `char_limit` and `languages`. Only a
  preset carries `preview_url`; a catalog voice has no sample yet. Clients
  0.11.0 and 0.12.0 cannot read this response and fail in `listVoices()`,
  `list_voices` and `clipwright voices`: upgrade to 0.13.0 or later. The
  contract version moved to `2026-09-13.2`. (clipwright#164)
- *Server-side:* `GET /v1/voices` takes the filters `language`, `gender`, `age`,
  `use_case` and `model`. `model` keeps the voices whose language the model
  knows. A voice without a label matches no value of that filter. An unknown
  value gets 400 `invalid_request` that names the allowed values, and an
  unknown query key gets 400 `unknown_field`; neither returns an empty list.
  (clipwright#164)
- `listVoices()` takes the same filters as an object, MCP `list_voices` as
  arguments, and `clipwright voices` as `--language`, `--gender`, `--age`,
  `--use-case` and `--model`. `clipwright voices` prints age and use case next
  to language and gender, and cuts a description longer than 100 characters.
  (clipwright#164)

### Added

- `@clipwright/core` exports `voicesQuery`, `voicesQueryShape`, `VoicesQuery`
  and `VOICES_QUERY_FIELDS`. `unknownFields` takes an optional list of accepted
  keys, and `UnknownFieldHit.suggestion` is typed `string`. The subpath
  `@clipwright/core/voice-listing` exports `listVoices`, `serverVoicesQuery`
  and `serverVoicesQueryFor`. (clipwright#164)

## [0.13.0] - 2026-09-13

### Changed

- `listVoices()`, MCP `list_voices` and `clipwright voices` accept a voice name
  outside the five presets, a `gender` other than `female` or `male`, a voice
  without `language`, and the new optional fields `kind`, `locale`, `accent`,
  `age`, `use_case`, `supported_models` and `verified_models`, plus a top-level
  `models` list. Unknown keys are dropped, as before. Until now the first such
  voice made all three fail. (clipwright#164)
- A voice name the client does not know goes to the API, which decides.
  `clipwright make --voice` checks only the form of the name: letters, digits,
  `_` and `-`, up to 64 characters. The SDK and MCP `make_ugc` no longer refuse
  such a name before sending it. In `tools/list`, `voice` is a string with a
  pattern instead of an enum of preset names. The API itself is unchanged: a
  name that is not a preset still gets 400 `invalid_request` with the same
  message, before any charge. (clipwright#164)
- In `VoiceCatalogEntry`, `name` and `gender` are typed `string`, and
  `language` is optional. In `MakeUgcInputArgs`, `voice` is typed `string`.
  (clipwright#164)
- *Server-side:* quote and run accept a voice from the catalog by its name, as
  well as a preset. A catalog voice speaks `eleven_v3` unless `tts_model` names
  another model, and its script limit follows that model: 5,001 characters
  without `tts_model` get 400 before any charge, as with a preset. A name that
  is neither a preset nor a catalog voice gets 400 `invalid_request` that says
  the voice is unknown; a voice retired from the catalog gets 400 that says it
  was retired. Both point to `list_voices`. The language of a voice limits
  nothing: any catalog voice speaks any language. A run already stored with a
  voice that was later retired still reads, with its warnings.
  (clipwright#164)

### Added

- `@clipwright/core` exports `VOICE_NAME_PATTERN`, `isVoicePresetName`,
  `serverUgcInputWith` and `voiceModelEntry`. The subpath
  `@clipwright/core/voice-admission` exports `serverUgcInput`, which checks a
  voice name against the catalog, and `catalogVoiceRefusal`. The catalog stays
  out of the main entry point. (clipwright#164)

## [0.12.0] - 2026-09-13

### Changed

- **Breaking:** *Server-side:* quote and run refuse a key that is not part of
  the contract with 400 `unknown_field`, before any charge. Such keys were
  dropped silently before, so a misspelled field fell back to its default:
  `aspectRatio: "16:9"` rendered 9:16 without a warning. `fields` names each
  unknown key, and the message suggests the matching field (`aspect_ratio`).
  Fix the key name. The contract version moved to `2026-09-13`.
  (clipwright#166)
- *Server-side:* the duration estimate for a Cyrillic script uses 2.3 words a
  second instead of 2.6, measured on `eleven_v3`. A Russian script now
  quotes and reserves about 13% more credits, closer to what the run is
  charged. Other scripts keep 2.6. (clipwright#164)
- A stress mark (U+0301) at the start of a word is no longer counted as its
  first letter, so a capital right after the mark stays a capital. A capital
  vowel later in the same word still marks stress. (clipwright#164)
- Each package ships this changelog as `CHANGELOG.md`. (clipwright#102)

### Added

- Quote returns `tts_model`, the speech model the run will use.
  (clipwright#164)
- `@clipwright/core` exports `unknownFields`, `unknownFieldError`,
  `unknownFieldBody` and `ACCEPTED_UGC_FIELDS`, and `unknown_field` is part of
  `API_ERROR_CODES`. (clipwright#166)

### Fixed

- *Server-side:* a body with an empty key name gets 400 `unknown_field`
  instead of 500 `internal_error`. (clipwright#167)

## [0.11.0] - 2026-09-13

### Removed

- **Breaking:** `eleven_multilingual_v2` is no longer a valid `tts_model`. Quote
  and run refuse it with 400 before any charge. Pass `eleven_v3`,
  `eleven_flash_v2_5` or `eleven_turbo_v2_5`, or omit the field. Runs stored with
  the old value still read. (clipwright#145)

### Changed

- **Breaking:** every voice preset and a raw `voice_id` now speak on `eleven_v3`.
  Before, four of five presets and a raw `voice_id` used `eleven_multilingual_v2`,
  with a 10,000-character script ceiling. The default ceiling is now 5,000
  characters. A script of 5,001–10,000 characters that passed before is refused;
  send it with `tts_model: "eleven_flash_v2_5"` or `"eleven_turbo_v2_5"` (10,000
  each). The refusal names these models when the script fits them. The voices
  sound different, and the samples from `list_voices` were re-recorded.
  (clipwright#145)
- **Breaking:** on `eleven_v3`, a single capital vowel after the first letter of a
  Cyrillic word marks stress: `потОм` is sent as `пото́м` (lowercase vowel plus
  U+0301). A script that used such a capital for another reason is now spoken
  differently; write that word in lowercase. A capital at the start of a word, a
  word in capitals, and a word with a second capital stay as written. Stress marks
  count toward the character limit. (clipwright#145)
- The contract version moved from `2026-08` to `2026-09`. (clipwright#145)

### Added

- `tts_model` accepts `eleven_flash_v2_5` and `eleven_turbo_v2_5`, 10,000
  characters each. (clipwright#145)
- *Server-side:* quote and run return a warning when a script with stress marks or
  in Cyrillic goes to a 2.5 model. The default path stays silent. (clipwright#145)
- `@clipwright/core` exports the stress helpers (`STRESS_MARK`,
  `stressMarksFromCapitals`, `speechTextFor`) and the run preflight schema
  (`runPreflight`, `parseRunPreflight`). (clipwright#145, clipwright#146)

### Fixed

- *Server-side:* for a body with `image`, the 202 response of a run and the quote
  now return the same `warnings[]`. Warnings that depend on a network probe no
  longer disappear when a run fails. (clipwright#146)

## [0.10.0] - 2026-09-11

### Added

- MCP tool `get_account`, SDK `getAccount()` and CLI `clipwright account`. All
  three read `GET /v1/account` (balance, debt, holds, grants) and spend nothing.
  (clipwright#135)
- *Server-side:* quote adds a warning when a run with the same input would be
  refused with `account_not_admitted`, `debt_outstanding` or
  `insufficient_credits`. The warning carries the same numbers as the refusal.
  (clipwright#134)
- `@clipwright/core` exports `API_ENDPOINTS`, `QUICKSTART_ENDPOINTS`,
  `endpointLabel` and `NODE_MIN_MAJOR` (the Node.js major the clients require).
  (clipwright#135, clipwright#129)

### Fixed

- *Server-side:* the `error` of a failed run in `GET /v1/runs/{id}` no longer
  contains stack frames or internal file paths. (clipwright#133)
- *Server-side:* when our wait for the avatar vendor times out, the run is charged
  nothing, and its warning says what happened. (clipwright#150)

## [0.9.0] - 2026-09-09

### Added

- Each voice in `GET /v1/voices`, `list_voices` and `listVoices()` carries
  `preview_url` and `preview_expires_at`: a signed link to a sample recorded with
  that voice and its model. The link is valid for one hour. A voice without a
  sample has neither field. A 0.8.0 client drops both fields. (clipwright#147)
- CLI `clipwright voices` prints the sample link on its own line. (clipwright#147)

## [0.8.0] - 2026-09-09

### Added

- Actor library: `GET /v1/actors`, MCP tool `list_actors`, SDK `listActors()` and
  CLI `clipwright actors`. Each actor has a stable `actor_id`, a name, a gender,
  an approximate age, a version and verified image variants. (clipwright#120)
- `actor_id` input on quote and run, and CLI `--actor-id` on `make` and `quote`.
  Do not combine it with `image` or `person`. (clipwright#120)
- Quote and run responses carry `actor`: the selected `actor_id`, `version` and
  `gender`; `{gender}` for the default actor; `null` when you pass your own
  `image`. (clipwright#64, clipwright#120)

## [0.7.0] - 2026-09-09

### Removed

- **Breaking:** `daily_remaining_credits` is gone from `GET /v1/account` and from
  the `account` schema in `@clipwright/core`. The per-account daily spend cap it
  reported was removed. A client that read the field now gets `undefined`; read
  `balance_credits`, and `debt_credits` for a block. The contract version was not
  moved for this change: it stayed `2026-08` until 0.11.0, so the header gave no
  signal. (clipwright#139)
- **Breaking:** `@clipwright/core` no longer exports `MAX_SCRIPT_WORDS` or
  `SCRIPT_SECONDS_BASIS`. Code that imports them fails; use `TTS_MODEL_CHAR_CAP`
  or `MAX_SCRIPT_CHARS`. (clipwright#128)
- *Server-side:* the refusal `daily_cap_exceeded` is no longer produced. Runs
  refused before keep it in their history. (clipwright#139)
- *Server-side:* the refusal `global_cap_exceeded` is no longer produced.
  (clipwright#141)

### Changed

- The 180-word script ceiling is replaced by a character limit per speech model:
  `eleven_v3` 5,000, `eleven_multilingual_v2` 10,000. Length is counted as
  JavaScript `.length`, spaces and audio tags included; an emoji may count as two.
  Longer scripts than before are accepted. The refusal text changed from
  `script is ~N words; ceiling is 180 words` to
  `script has N characters; <model> allows at most N characters`; update code
  that matches on it. (clipwright#128)
- **Breaking:** *Server-side:* quote and run refuse a script whose text contains
  U+FFFD with 400 `script_encoding_lost`, before any charge. Such a script was
  accepted before and billed for about a second of speech. The bytes were lost
  before the request left the client: send the script as valid UTF-8.
  (clipwright#131)
- *Server-side:* a run whose speech is impossibly short for its script fails with
  `speech_too_short_for_script` and is charged nothing, instead of succeeding.
  Retrying rarely helps. (clipwright#131)
- *Server-side:* a new sign-up gets an admitted account with zero credits, so it
  is no longer refused with `account_not_admitted` until the owner admits it.
  (clipwright#112)

## [0.6.0] - 2026-09-06

### Added

- `@clipwright/cli` installs a second binary, `clipwright-cli`, next to
  `clipwright`. An unrelated npm package also ships a `clipwright` binary; the
  second name avoids that collision. `core`, `sdk` and `mcp-server` have no
  changes in this release and moved to keep one version. (clipwright#105)

## [0.5.0] - 2026-09-06

### Added

- `POST /v1/uploads` takes a local PNG or JPEG of up to 10 MB and returns
  `upload_id`, `url`, `media_type`, `bytes`, `width`, `height` and `expires_at`.
  Pass the https `url` as `image`. The url is valid for 24 hours and the object is
  kept for 7 days. An account may upload 20 images a day. New refusal codes:
  `invalid_image`, `unsupported_media_type`, `upload_cap_exceeded`.
  (clipwright#99)
- MCP tool `upload_image`, SDK `uploadImage()`, CLI `clipwright upload <path>`, and
  `--image`, `--image-file`, `--aspect-ratio`, `--resolution` on CLI `make` and
  `quote`. (clipwright#99)
- `tts_model` input (`eleven_v3` or `eleven_multilingual_v2`) and CLI
  `--tts-model`. Without it the preset's model is used. Each voice in the catalog
  names its `model`. A script over the model's character limit (v3 5,000, v2
  10,000) is refused before any charge, in addition to the 180-word ceiling.
  (clipwright#101)
- MCP `tools/list` describes `image`, `aspect_ratio`, `resolution`, `voice` and
  `voice_id`; the descriptions were empty before. (clipwright#99)

### Changed

- *Server-side:* a Russian preset speaks on `eleven_v3`. All presets
  used `eleven_multilingual_v2` before. (clipwright#101)

## [0.4.0] - 2026-08-28

### Changed

- **Breaking:** the default API address in the SDK, CLI and MCP server moved to
  `https://api.clipwright.io`. The old address
  `https://api-production-7e69.up.railway.app` still answers, so older clients
  keep working. If your network allowlists hosts, add `api.clipwright.io`, or pin
  the old address with `CLIPWRIGHT_API_URL` or the SDK `baseUrl` option. (US-613)

## [0.3.0] - 2026-08-28

### Removed

- **Breaking:** `@clipwright/core` no longer exports `MAX_SCRIPT_SECONDS`. Code
  that imports it fails; `SCRIPT_SECONDS_BASIS` holds the value (and was removed
  in turn in 0.7.0).

### Changed

- **Breaking:** the CLI and the MCP server refuse a `CLIPWRIGHT_API_URL` that is
  not `https`. Loopback addresses may stay `http`. Point the variable at an https
  address. (clipwright#85)
- **Breaking:** every URL field of the input is limited to 2,048 characters
  (`MAX_URL_LENGTH`). A longer URL is refused with 400. Pass a URL of at most
  2,048 characters, for example by hosting the file at a shorter address.
  (clipwright#85)
- **Breaking:** SDK requests now have deadlines. `requestTimeoutMs` (per client,
  default 30 s) bounds every request, and `maxWaitMs` (per `makeUgc` call, default
  10 min) bounds the whole call, including the request in flight. A call that used
  to hang now rejects. A start request cut off mid-flight throws
  `ClipwrightResponseError` with `mayHaveTakenEffect: true`: check the run before
  retrying with a new idempotency key. Raise `requestTimeoutMs` behind a slow
  proxy.
- **Breaking:** *Server-side:* a run from an account not admitted to the beta is
  refused with 403 `account_not_admitted` before any charge. Topping up does not
  lift it. The clients parse this refusal from 0.3.0 on. (US-620)
- The voice catalog is in English, and the SDK validates the `GET /v1/voices`
  response. Each voice has `name`, `language`, `gender` and `description`.
  (clipwright#85)
- The MCP server checks the shape of `run_id` in `get_run`. (clipwright#85)
- *Server-side:* the video link in a finished run is signed for 7 days instead of
  1. (clipwright#22)
- *Server-side:* a failed run is charged only if the vendor accepted the work that
  produces the clip. A run that paid only for speech is charged nothing.
  (clipwright#46)
- *Server-side:* credits bought while an account has debt pay the debt first; only
  the rest reaches the balance. (US-611)

### Fixed

- *Server-side:* 401 and validation refusals use the declared error body.
  Validation errors return `invalid_request` and list each problem as
  `field: reason`, up to 12. Before, clients reported these bodies as "not a
  Clipwright error object". (US-616)
- *Server-side:* the 202 response of a run carries its `warnings[]`; it always
  returned an empty list before. (clipwright#64)

## [0.2.0] - 2026-07-29

### Added

- `@clipwright/cli` is published for the first time, under MIT. Commands:
  `quote`, `make`, `runs <id>`, `voices`. `make` takes `--script`, `--person`,
  `--captions`, `--voice`, `--voice-id` and `--retry`. (US-622)
- *Server-side:* `GET /v1/account` returns `account_id`, `balance_credits`,
  `debt_credits`, `holds_credits`, `daily_remaining_credits` and `grants`.
  (US-602)
- `@clipwright/core` exports the refusal schemas and the retry policy:
  `parseApiFailure`, `isRetryableFailure`, `retryDelayMs`, `agentFailureReport`,
  `apiError`, the 402 and 429 bodies, the rate-limit header names, `account` and
  `creditGrant`. (US-622)
- *Server-side:* a service-wide daily spend cap; a run past it is refused with
  `global_cap_exceeded`. (US-603)

### Changed

- **Breaking:** *Server-side:* a run reserves credits before rendering. Without
  enough balance the API answers 402 `insufficient_credits`; with unpaid debt, 402
  `debt_outstanding`, whatever the balance. Buy credits to lift either. (US-602)
- **Breaking:** *Server-side:* rate limits per account: 60 requests a minute for
  starting runs, 300 for quote, voices, run status and account. Over the limit
  the API answers 429 `rate_limited` with `Retry-After` and `X-RateLimit-*`
  headers; wait and repeat the same call. At most 3 renders run at once per
  account; a fourth queues and still returns 202. (US-605)
- **Breaking:** the SDK throws `ClipwrightApiError` or `ClipwrightResponseError`
  (both extend `Error`) instead of a plain `Error`, and reads the status before
  the body. Code that parsed the message text should read the error's status and
  code instead. `makeUgc` now waits out 429 and 5xx while polling; money refusals
  and other 4xx still throw at once. `attempt` must be a positive safe integer and
  is checked before any request. (US-622)
- **Breaking:** MCP tools return a refusal as a JSON report inside the text block,
  with `isError: true`, instead of one sentence. Agents should branch on its
  `retryable` field, not on prose. (US-622)
- The MCP server starts when `~/.clipwright` is read-only; only `make_ugc`
  refuses, naming the variable that fixes it. (US-622)
- `SKILL.md` inside `@clipwright/mcp-server` is in English. (US-622)
- *Server-side:* idempotency keys are scoped to the account, so two accounts can
  use the same key. (US-604)

## [0.1.0] - 2026-07-26

### Added

- First publication of `@clipwright/core`, `@clipwright/sdk` and
  `@clipwright/mcp-server` under MIT. `@clipwright/cli` was not published.
- API: quote (`POST /v1/skills/make_ugc/quote`), run
  (`POST /v1/skills/make_ugc/run`, `Idempotency-Key` required), run status
  (`GET /v1/runs/{id}`), voice catalog (`GET /v1/voices`). Requests carry a
  `cw_*` bearer token. (US-205, US-516, US-550)
- MCP tools `quote_ugc`, `make_ugc`, `get_run`, `list_voices`. `make_ugc` returns
  a `run_id` at once, and the agent polls `get_run`. (US-206, US-512, US-516)
- SDK `ClipwrightClient` with `quoteUgc`, `startUgc`, `makeUgc`, `getRun` and
  `listVoices`. The idempotency key comes from the input and
  `CLIPWRIGHT_CLIENT_ID`; `attempt` starts a deliberate new run. (US-201, US-202)
- Input: `script` (up to 180 words), `voice`, `voice_id`, `image`,
  `aspect_ratio` (default 9:16, 16:9 supported), `resolution`, `captions`,
  `disclosure_overlay`. Parameters that are not honoured come back in
  `warnings[]`; `webhook_url` is refused with 400. (US-533, US-535, US-539)
- Quote returns `credits_estimate`, `duration_estimate_sec`, `warnings`,
  `contract_version`, `source` and `resolved_aspect_ratio`. A source whose aspect
  ratio differs from the request by more than 15% is refused before any charge;
  up to 15% it is snapped with a warning. (US-525)
- Credits: 30 per second of video, reserved at start and charged on the measured
  duration. *Server-side:* a per-account daily spend cap refuses runs with
  `daily_cap_exceeded`. (US-538, US-537)
- Contract version `2026-08` in `X-Clipwright-Contract` and `contract_version`.
  (US-533)
