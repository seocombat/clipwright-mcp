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
  neither the script nor the run's `character_details` contain, and for a frame cut into several pictures. The check
  sits behind a server switch, which was turned on after its first production run had been read; that run, of eighteen
  pictures, took a minute and a half longer than the same video unchecked. A picture
  with either is drawn once more when the run has time and budget for it, and the cleaner of the two is used. What
  remains is named in `warnings[]` with the seconds it is on screen, one line for each thing found; a finding by itself
  does not fail the run. A picture whose check cannot run in its time or within the run's budget is used as it is, and
  one `warnings[]` line says how many pictures went unchecked. The check is a paid step like the others: when its cost
  cannot be established, the run waits for an operator. Scene pictures are also asked for no writing unless the scene
  quotes the script, which removed invented signs and figures from 10 of 10 test pictures. A customer's own image is
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
- *Server-side:* two faceless videos made at the same time are much less likely to stop for review. To record what a
  picture cost we ask the image service, which answers only a few such questions a minute; with two videos in work it
  refused some, and a picture with no recorded cost held the whole run for an operator. A refused question now waits
  as long as the service asks and is put again. Under load a video can take a few minutes longer; the limit itself
  stays, so several videos at once can still meet it. (clipwright#553)
- *Server-side:* at most two faceless videos are made at once across all accounts; a third waits in the queue and
  starts when one of them is done. Three at once asked the image service for more cost records than it answers, and
  two of the three stopped for review. The limit per account stays at two, so one account's two videos can hold the
  line while another account's video waits. (clipwright#553)
- *Server-side:* the voice preset `owner_ru_clone` speaks again. The cloned voice behind it was replaced at the
  vendor, and a run that named the preset was refused before any charge. The preset now maps to the new voice, still
  on `eleven_v4`, and `list_voices` links a sample spoken by it. (clipwright#497)
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

- **Breaking:** *Server-side:* Russian speech uses `eleven_v4` when you name no `tts_model`. That covers the presets
  `owner_ru_clone` and `daria_ru_female`, the catalog voices named `ru_*`, and a raw `voice_id` whose script is mostly
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
  the presets `owner_ru_clone` and `daria_ru_female`, the catalog voices named `ru_*`, and a raw `voice_id` with a
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
- *Server-side* A recovered delivery is written to the ledger under its own
  reason, `run_recovered_delivery`, because the vendor spend was already counted
  on the day the run first failed.

### Operations

- Migration 0036 adds `recovery_attempt` and `recovery_reopened_at` to `runs`,
  and both are read on the main render path. **Apply the migration before
  deploying any service**: an early deploy fails every `make_ugc` run, not one
  feature. Order forward is migration, api, worker, web; backwards it is worker
  and api first, then drop the columns.

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
- *Server-side:* the refusal `global_cap_exceeded` is no longer produced. The
  service-wide daily spend cap became an internal alert. (clipwright#141)

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

- *Server-side:* the `owner_ru_clone` preset speaks on `eleven_v3`. All presets
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
