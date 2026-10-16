#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { Command, Option } from "commander";
import {
  ACTOR_GENDERS_ACCEPTED,
  ACTOR_QUALITIES_ACCEPTED,
  apiBaseUrlFromEnv,
  ASPECT_RATIOS,
  type CreateActorInputArgs,
  type MakeFacelessInputArgs,
  CATALOG_GENDERS,
  CATALOG_LANGUAGES,
  CANDIDATE_CHARGE_TEXT,
  type CandidateRequest,
  DEFAULT_FACELESS_VOICE,
  editDocumentRead,
  FAILED_STATE,
  MODEL_VOICE_MODEL,
  PUBLIC_APP_BASE_URL,
  RESOLUTIONS,
  REVISION_CHARGE_TEXT,
  type RevisionRequest,
  TTS_MODELS,
  UPLOAD_MAX_BYTES,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
  VOICE_SKILLS,
  sniffUploadMediaType,
  type AspectRatio,
  type CatalogGender,
  type CatalogLanguage,
  type Resolution,
  type TtsModelId,
  type VoiceSkill,
} from "@clipwright/core";
import {
  ClipwrightApiError,
  ClipwrightClient,
  ClipwrightResponseError,
  type RunEditRead,
  type RunRead,
  type SaveRunEditArgs,
} from "@clipwright/sdk";

import {
  formatApiError,
  formatDraftNotes,
  formatRun,
  formatRunShots,
  formatSchemaError,
  formatVoices,
} from "./format.js";
import { registerWorkflowCommands, WorkflowFileError } from './workflows.js';

// Version from the manifest: a literal drifts, and a JSON import breaks `rootDir`.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();
program.name("clipwright").description("UGC video platform CLI").version(version);

function client(): ClipwrightClient {
  const apiKey = process.env.CLIPWRIGHT_API_KEY;
  if (!apiKey) {
    console.error(
      `CLIPWRIGHT_API_KEY is not set. Create a key at ${PUBLIC_APP_BASE_URL}/api-keys, ` +
        "then export it: export CLIPWRIGHT_API_KEY=cw_...",
    );
    process.exit(1);
  }
  let baseUrl: string | undefined;
  try {
    baseUrl = apiBaseUrlFromEnv(process.env.CLIPWRIGHT_API_URL);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  return new ClipwrightClient({ apiKey, baseUrl });
}

/** Reads the file and checks its signature BEFORE the network; extensions are not trusted. */
async function uploadFile(path: string): Promise<string> {
  const bytes = new Uint8Array(readFileSync(path));
  const mediaType = sniffUploadMediaType(bytes);
  if (mediaType === null) {
    console.error(`${path} is not a PNG or JPEG file (checked by signature, not by extension)`);
    process.exit(1);
  }
  if (bytes.byteLength > UPLOAD_MAX_BYTES) {
    console.error(`${path} is ${bytes.byteLength} bytes; the ceiling is ${UPLOAD_MAX_BYTES}`);
    process.exit(1);
  }
  const upload = await client().uploadImage(bytes, mediaType);
  console.error(
    `uploaded ${upload.width}x${upload.height} ${upload.media_type}; url expires ${upload.expires_at}`,
  );
  return upload.url;
}

interface SourceOptions {
  actorId?: string;
  actorGender?: "female" | "male";
  image?: string;
  imageFile?: string;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
}

async function resolveImage(opts: SourceOptions): Promise<string | undefined> {
  return opts.imageFile ? uploadFile(opts.imageFile) : opts.image;
}

/** Image and format options shared by `quote` and `make`, so the quote sees the render's source. */
function withSourceOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--actor-id <id>", "saved actor from the actors catalog").conflicts(["image", "imageFile", "person", "actorGender"]),
    )
    .addOption(
      new Option("--image <url>", "public https url of the actor's photo").conflicts("imageFile"),
    )
    .option("--image-file <path>", "local PNG/JPEG: uploaded first (POST /v1/uploads), then used as --image")
    // Commander cannot express "only with --image"; the schema rejects it before the network.
    .addOption(
      new Option("--actor-gender <gender>", "gender of the face in --image; picks the default voice of that gender")
        .choices(["female", "male"])
        .conflicts("actorId"),
    )
    .addOption(
      new Option("--aspect-ratio <ratio>", "output format; pass it explicitly with a picture").choices(
        ASPECT_RATIOS,
      ),
    )
    .addOption(new Option("--resolution <size>", "output resolution").choices(RESOLUTIONS));
}

/** --retry and --take are NUMBERS, parsed strictly: the value enters the */
/** idempotency key, so a lenient parse could buy a second render. */
const parseWholeNumber = (flag: string) => (raw: string): number => {
  // Same bound as the SDK's `attemptSuffix`: a leading `[1-9]` rejects zero,
  // `isSafeInteger` rejects values too large to stay distinct.
  const parsed = Number.parseInt(raw, 10);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(parsed)) {
    console.error(`${flag} expects a whole number of 1 or more, got ${raw}`);
    process.exit(1);
  }
  return parsed;
};
const parseRetry = parseWholeNumber("--retry");

program
  .command("upload <path>")
  .description("upload a local PNG/JPEG and print the https url to pass as --image")
  .action(async (path: string) => {
    console.log(await uploadFile(path));
  });

withSourceOptions(
  program
    .command("quote")
    .description("estimate credits for a script without spending them")
    .requiredOption("--script <text>", "the spoken script"),
).action(async (opts: { script: string } & SourceOptions) => {
  const quote = await client().quoteUgc({
    script: opts.script,
    actor_id: opts.actorId,
    actor_gender: opts.actorGender,
    image: await resolveImage(opts),
    aspect_ratio: opts.aspectRatio,
    resolution: opts.resolution,
  });
  console.log(JSON.stringify(quote, null, 2));
});

withSourceOptions(
  program
    .command("make")
    .description("generate a UGC video and wait for the result")
    .requiredOption("--script <text>", "the spoken script"),
)
  .option("--person <description>", "who says it, in words")
  // No `--character`: the server rejects that field, so offering it would invite a 400.
  .option("--captions", "burn in word-synced captions")
  // Only the name's shape is checked here; the server knows the catalog and
  // answers 400 before reserving credits.
  .option("--voice <name>",
    `voice name from "clipwright voices" (presets: ${VOICE_PRESET_NAMES.join(", ")})`,
    (raw) => {
      if (!VOICE_NAME_PATTERN.test(raw)) {
        console.error(
          `--voice expects a voice name (letters, digits, "_" or "-"), got ${JSON.stringify(raw)}; ` +
            'run "clipwright voices" for the catalog',
        );
        process.exit(1);
      }
      return raw;
    },
  )
  // Commander catches the conflict, so the user gets "incompatible flags"
  // instead of a schema error.
  .addOption(
    new Option(
      "--voice-id <id>",
      "raw vendor voice id, for voices outside the catalog",
    ).conflicts("voice"),
  )
  .addOption(
    new Option("--tts-model <model>", "speech model; omitted = the voice's default model").choices(
      TTS_MODELS,
    ),
  )
  .option("--retry <n>", "retry attempt number (forces a fresh run)", parseRetry)
  .action(
    async (
      opts: {
        script: string;
        person?: string;
        captions?: boolean;
        voice?: string;
        voiceId?: string;
        ttsModel?: TtsModelId;
        retry?: number;
      } & SourceOptions,
    ) => {
      const run = await client().makeUgc(
        {
          script: opts.script,
          actor_id: opts.actorId,
          actor_gender: opts.actorGender,
          person: opts.person,
          image: await resolveImage(opts),
          aspect_ratio: opts.aspectRatio,
          resolution: opts.resolution,
          captions: opts.captions ?? false,
          voice: opts.voice,
          voice_id: opts.voiceId,
          tts_model: opts.ttsModel,
        },
        { attempt: opts.retry },
        (r) => console.error(`state: ${r.state}`),
      );
      // Warnings go to stderr, the URL to stdout: visible to the human, kept
      // out of the pipe that reads the URL.
      for (const warning of run.warnings) {
        console.error(`warning: ${warning}`);
      }
      console.log(run.final_output?.video_url);
    },
  );

program
  .command("runs <id>")
  .description("check the status of a run")
  .action(async (id: string) => {
    const run = await client().getRun(id);
    console.log(formatRun(run));
  });

program
  .command("shots <run>")
  .description("list the shots of a run: span, kind, description and preview link of each (free)")
  .action(async (run: string) => {
    console.log(formatRunShots(await client().getRunShots(run)));
  });

/** Only the JSON goes to stdout, so it can be kept in a file and passed to `edit-save`. */
function printDraft(draft: RunEditRead): void {
  for (const line of formatDraftNotes(draft)) console.error(line);
  console.log(JSON.stringify(draft, null, 2));
}

program
  .command("edit-show <run>")
  .description("print the draft of a run's edit as JSON; version 0 means nothing is stored (free)")
  .action(async (run: string) => {
    printDraft(await client().getRunEdit(run));
  });

type DraftFile = { version: number; document: SaveRunEditArgs["document"] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads the file `edit-show` wrote. Anything else is refused here, before any request. */
function readDraftFile(path: string): DraftFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`${path} cannot be read as JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const file = isRecord(parsed) ? parsed : {};
  const { version, document } = file;
  const missing = [
    ...(typeof version === "number" && Number.isSafeInteger(version) && version >= 0
      ? []
      : ["version (a whole number, 0 or more)"]),
    ...(isRecord(document) ? [] : ["document (an object)"]),
  ];
  if (missing.length > 0) {
    console.error(
      `${path} is not a draft as "clipwright edit-show" prints it: it lacks ${missing.join(" and ")}. ` +
        "Nothing was sent.",
    );
    process.exit(1);
  }
  return { version: version as number, document: document as DraftFile["document"] };
}

/** Whether the stored document is the sent one. The sent one is read by the schema the stored one came */
/** through, so a default the server filled in is no difference; past that the comparison is exact, key order aside. */
function sameDocument(stored: RunEditRead["document"], sent: unknown): boolean {
  const read = editDocumentRead.safeParse(sent);
  return read.success && isDeepStrictEqual(stored, read.data);
}

/** A save answered `edit_conflict`. One read tells a draft that already holds this document, */
/** stored by an earlier send whose answer was lost, from a draft that moved on. */
async function settleConflict(
  sdk: ClipwrightClient,
  run: string,
  sent: DraftFile,
  storedVersion: number,
): Promise<RunEditRead> {
  let stored: RunEditRead;
  try {
    stored = await sdk.getRunEdit(run);
  } catch (error) {
    console.error(
      `conflict: the draft is at version ${storedVersion}, and the file was written against version ` +
        `${sent.version}. Whether the draft already holds this document could not be checked: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        `Run "clipwright edit-show ${run}" and compare.`,
    );
    process.exit(1);
  }
  if (stored.version === sent.version + 1 && sameDocument(stored.document, sent.document)) {
    console.error(
      `saved: the draft already holds this document at version ${stored.version}; ` +
        "an earlier save of it went through.",
    );
    return stored;
  }
  console.error(
    `conflict: the draft is at version ${stored.version}, and the file was written against version ` +
      `${sent.version}. Nothing was stored. Run "clipwright edit-show ${run}" again, apply your change ` +
      "to that draft and save it.",
  );
  process.exit(1);
}

program
  .command("edit-save <run>")
  .description("save the draft of a run's edit from a file; charges nothing and renders nothing")
  .requiredOption("--file <path>", "JSON with `version` and `document`, as edit-show prints it")
  .action(async (run: string, opts: { file: string }) => {
    const file = readDraftFile(opts.file);
    const sdk = client();
    let saved: RunEditRead;
    try {
      saved = await sdk.saveRunEdit(run, { base_version: file.version, document: file.document });
    } catch (error) {
      if (!(error instanceof ClipwrightApiError) || error.failure.kind !== "edit_conflict") throw error;
      saved = await settleConflict(sdk, run, file, error.failure.version);
    }
    printDraft(saved);
  });

interface ReviseOptions {
  shot?: string;
  retake?: boolean;
  newPicture?: string;
  animate?: string | boolean;
  document?: string;
}

const GENERATE_FLAGS = ["retake", "newPicture", "animate"] as const;

/** Revision input shared by quote and start, so the quote prices what is started: one shot to generate, or a document. */
const withReviseOptions = (command: Command): Command =>
  command
    .addOption(new Option("--shot <id>", "the shot to generate anew, with one of --retake, --new-picture or --animate")
      .conflicts("document"))
    .addOption(new Option("--retake", "generate the shot again from its own description").conflicts(["newPicture", "animate", "document"]))
    .addOption(new Option("--new-picture <description>", "draw a new picture for the shot from this description")
      .conflicts(["animate", "document"]))
    .addOption(new Option("--animate [motion]", "turn the opening picture into a clip, with this motion if given").conflicts("document"))
    .option("--document <path>", "the file edit-show prints: its document, edited, is the whole revision");

/** The request a revision sends, built here and refused before any request when the flags or the file name none. */
function revisionInput(opts: ReviseOptions): RevisionRequest {
  if (opts.document !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(opts.document, "utf8"));
    } catch (error) {
      console.error(`${opts.document} cannot be read as JSON: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
    const document = isRecord(parsed) ? parsed.document : undefined;
    if (!isRecord(document)) {
      console.error(`${opts.document} is not a draft as "clipwright edit-show" prints it: it lacks document (an object). ` +
        "Nothing was sent.");
      process.exit(1);
    }
    return { document } as RevisionRequest;
  }
  const chosen = GENERATE_FLAGS.filter((flag) => opts[flag] !== undefined);
  if (opts.shot === undefined || chosen.length !== 1) {
    console.error("pass --shot <id> with one of --retake, --new-picture or --animate, or --document <path>. Nothing was sent.");
    process.exit(1);
  }
  const operation = opts.retake === true ? { mode: "retake" as const }
    : opts.newPicture !== undefined ? { mode: "new_picture" as const, description: opts.newPicture }
    : { mode: "animate" as const, ...(typeof opts.animate === "string" ? { motion: opts.animate } : {}) };
  return { changes: [{ shot_id: opts.shot, operation }] };
}

withReviseOptions(
  program.command("revise-quote <run>")
    .description(`price a revision of a run without spending credits; prints the quote as JSON. ${REVISION_CHARGE_TEXT}`),
).action(async (run: string, opts: ReviseOptions) => {
  console.log(JSON.stringify(await client().quoteRevision(run, revisionInput(opts)), null, 2));
});

withReviseOptions(
  program.command("revise <run>")
    .description(`start a revision of a run (paid): a new run, editable in its turn; prints the run. ${REVISION_CHARGE_TEXT}`),
)
  .option("--retry <n>", "attempt number: the same request with another number starts another revision", parseRetry)
  .action(async (run: string, opts: ReviseOptions & { retry?: number }) => {
    const request = revisionInput(opts);
    let started: RunRead;
    try {
      started = await client().startRevision(run, request, { attempt: opts.retry });
    } catch (error) {
      if (!(error instanceof ClipwrightApiError)) throw error;
      const failure = error.failure;
      if (failure.kind === "edit_ceiling_reached") {
        console.error(formatApiError(error));
        if (failure.limit === "in_flight") {
          for (const id of failure.runIds) console.error(`running: ${id}; follow it with "clipwright runs ${id}"`);
        } else {
          console.error(`${failure.counted} of ${failure.allowed} revisions of ${failure.rootRunId} are counted; ask support to raise the limit.`);
        }
        process.exit(1);
      }
      // The source is resolved before a resent key is replayed, so a `--shot` resend of a source past its media meets this.
      if (failure.kind === "run_not_editable" && "changes" in request) {
        console.error(formatApiError(error));
        console.error('if you started this revision before, find it with "clipwright runs"');
        process.exit(1);
      }
      throw error;
    }
    console.log(JSON.stringify(started, null, 2));
    if (started.state === FAILED_STATE) {
      console.error(`run ${started.run_id} is ${started.state}; to try again, pass --retry ${(opts.retry ?? 1) + 1}`);
      process.exit(1);
    }
    console.error(`follow it with "clipwright runs ${started.run_id}"`);
  });

interface CandidateOptions {
  shot?: string;
  retake?: boolean;
  newPicture?: string;
  animate?: string | boolean;
  take?: number;
}

/** Candidate input shared by quote and start, so the quote prices what is started: one shot, one operation, one take. */
const withCandidateOptions = (command: Command): Command =>
  command
    .option("--shot <id>", "the shot to make a candidate for, with one of --retake, --new-picture or --animate")
    .addOption(new Option("--retake", "generate the shot again from its own description").conflicts(["newPicture", "animate"]))
    .addOption(new Option("--new-picture <description>", "draw a new picture for the shot from this description").conflicts("animate"))
    .option("--animate [motion]", "turn the opening picture into a clip, with this motion if given")
    .option("--take <n>", "take number, 1 by default: the same request and take return the first candidate; " +
      "another take makes another one, charged again", parseWholeNumber("--take"));

/** The request a candidate sends, built here and refused before any request when the flags name no shot or operation. */
function candidateInput(opts: CandidateOptions): CandidateRequest {
  const chosen = GENERATE_FLAGS.filter((flag) => opts[flag] !== undefined);
  if (opts.shot === undefined || chosen.length !== 1) {
    console.error("pass --shot <id> with one of --retake, --new-picture or --animate. Nothing was sent.");
    process.exit(1);
  }
  const operation = opts.retake === true ? { mode: "retake" as const }
    : opts.newPicture !== undefined ? { mode: "new_picture" as const, description: opts.newPicture }
    : { mode: "animate" as const, ...(typeof opts.animate === "string" ? { motion: opts.animate } : {}) };
  return { shot_id: opts.shot, operation, take: opts.take ?? 1 };
}

withCandidateOptions(
  program.command("candidate-quote <run>")
    .description(`price a shot candidate of a run without spending credits; prints the quote as JSON. ${CANDIDATE_CHARGE_TEXT}`),
).action(async (run: string, opts: CandidateOptions) => {
  console.log(JSON.stringify(await client().quoteCandidate(run, candidateInput(opts)), null, 2));
});

withCandidateOptions(
  program.command("candidate <run>")
    .description("make a shot candidate of a run (paid): one picture or clip for one shot, to keep or discard in a revision; " +
      `prints the quote, then with --yes starts it and prints the run. ${CANDIDATE_CHARGE_TEXT}`),
)
  .option("--yes", "start the candidate after printing its quote; without it nothing is started")
  .action(async (run: string, opts: CandidateOptions & { yes?: boolean }) => {
    const request = candidateInput(opts);
    const quote = await client().quoteCandidate(run, request);
    console.error(`candidate of shot ${quote.shot_id} (${quote.unit}, take ${request.take}): ${quote.credits} credits; ` +
      `usable in a revision until ${quote.usable_until}`);
    for (const warning of quote.warnings) console.error(`warning: ${warning}`);
    if (opts.yes !== true) {
      console.error("Nothing was started; pass --yes to start it.");
      process.exit(1);
    }
    let created: RunRead;
    try {
      created = await client().createCandidate(run, request);
    } catch (error) {
      if (!(error instanceof ClipwrightApiError)) throw error;
      const failure = error.failure;
      if (failure.kind === "edit_ceiling_reached") {
        console.error(formatApiError(error));
        if (failure.limit === "in_flight") {
          for (const id of failure.runIds) console.error(`running: ${id}; follow it with "clipwright runs ${id}"`);
        } else {
          console.error(`${failure.counted} of ${failure.allowed} candidates of ${failure.rootRunId} are counted; ` +
            "no candidate of it can start, and support cannot raise this limit yet.");
        }
        process.exit(1);
      }
      // The source is resolved before a resent key is replayed, so a resend after the source's media are gone meets this.
      if (failure.kind === "run_not_editable") {
        console.error(formatApiError(error));
        console.error(`if you made this candidate before, find it with "clipwright candidates ${run}"`);
        process.exit(1);
      }
      throw error;
    }
    console.log(JSON.stringify(created, null, 2));
    if (created.state === FAILED_STATE) {
      console.error(`run ${created.run_id} is ${created.state}; to try again, pass --take ${request.take + 1}`);
      process.exit(1);
    }
    console.error(`follow it with "clipwright runs ${created.run_id}"; once it succeeded, "clipwright candidates ${run}" shows its preview`);
  });

program.command("candidates <run>")
  .description("list the shot candidates of a run's family, oldest first, with state, charge and preview; free")
  .action(async (run: string) => {
    console.log(JSON.stringify(await client().listCandidates(run), null, 2));
  });

program.command("actors").description("list saved actors and verified formats").action(async () => {
  console.log(JSON.stringify({ actors: await client().listActors() }, null, 2));
});

interface ActorOptions {
  name: string;
  description: string;
  gender: string;
  age: string;
  quality?: string;
  aspects?: string;
}

/** Actor options shared by quote and create, so the quote prices what gets created. */
const withActorOptions = (command: Command): Command =>
  command
    .requiredOption("--name <text>", "name shown in the actor list")
    .requiredOption("--description <text>", "words describing a fictional adult")
    .addOption(
      new Option("--gender <gender>", "the actor's gender").choices([...ACTOR_GENDERS_ACCEPTED]).makeOptionMandatory(),
    )
    .requiredOption("--age <years>", "approximate age in years")
    .addOption(new Option("--quality <quality>", "image quality").choices([...ACTOR_QUALITIES_ACCEPTED]))
    .option("--aspects <list>", `comma-separated formats to create (${ASPECT_RATIOS.join(",")})`);

function actorInput(opts: ActorOptions): CreateActorInputArgs {
  const aspects = opts.aspects?.split(",").map((one) => one.trim()).filter((one) => one !== "");
  return {
    name: opts.name,
    description: opts.description,
    gender: opts.gender as CreateActorInputArgs["gender"],
    approximate_age: Number(opts.age),
    ...(opts.quality === undefined ? {} : { quality: opts.quality as CreateActorInputArgs["quality"] }),
    ...(aspects === undefined || aspects.length === 0
      ? {}
      : { aspect_ratios: aspects as CreateActorInputArgs["aspect_ratios"] }),
  };
}

withActorOptions(
  program.command("quote-actor").description("estimate credits for a personal actor without spending them"),
).action(async (opts: ActorOptions) => {
  console.log(JSON.stringify(await client().quoteActor(actorInput(opts)), null, 2));
});

withActorOptions(
  program.command("create-actor").description("create a personal actor from a description (paid)"),
).action(async (opts: ActorOptions) => {
  console.log(JSON.stringify(await client().createActor(actorInput(opts)), null, 2));
});

interface FacelessOptions {
  script?: string;
  scriptFile?: string;
  brief?: string;
  duration: string;
  captions: boolean;
  styleReference?: string;
  characterReference?: string;
  voice?: string;
}

/** Faceless options shared by quote and make, so the quote prices what gets made. */
const withFacelessOptions = (command: Command): Command =>
  command
    .addOption(new Option("--script <text>", "narration, read as written").conflicts(["scriptFile", "brief"]))
    .addOption(new Option("--script-file <path>", "read the narration from a file").conflicts("brief"))
    .option("--brief <text>", "what the video is about; the narration is written from it")
    .requiredOption("--duration <seconds>", "target length, 30 to 90 seconds")
    .option("--no-captions", "turn off burned-in captions (on by default)")
    .option("--voice <name>",
      `narration voice from "clipwright voices --skill make_faceless"; omitted = ${DEFAULT_FACELESS_VOICE}`)
    .option("--style-reference <url>", "public https image whose visual style the scenes follow")
    .option("--character-reference <url>", "public https image of a person or figure to keep across scenes");

function facelessInput(opts: FacelessOptions): MakeFacelessInputArgs {
  const common = {
    duration_seconds: Number(opts.duration),
    captions: opts.captions,
    ...(opts.voice === undefined ? {} : { voice: opts.voice }),
    ...(opts.styleReference === undefined ? {} : { style_reference: opts.styleReference }),
    ...(opts.characterReference === undefined ? {} : { character_reference: opts.characterReference }),
  };
  if (opts.brief !== undefined) return { ...common, input_mode: "brief", brief: opts.brief };
  const script = opts.scriptFile === undefined ? opts.script : readFileSync(opts.scriptFile, "utf8");
  if (script === undefined) {
    console.error("pass one of --script, --script-file or --brief");
    process.exit(1);
  }
  return { ...common, input_mode: "script", script };
}

withFacelessOptions(
  program.command("quote-faceless").description("estimate credits for a faceless video without spending them"),
).action(async (opts: FacelessOptions) => {
  console.log(JSON.stringify(await client().quoteFaceless(facelessInput(opts)), null, 2));
});

withFacelessOptions(
  program.command("make-faceless").description("start a faceless video (paid); ends with its narration, 25 s to duration + 25%; prints the run"),
)
  .option("--retry <n>", "retry attempt number (forces a fresh run)", parseRetry)
  .action(async (opts: FacelessOptions & { retry?: number }) => {
    const run = await client().startFaceless(facelessInput(opts), { attempt: opts.retry });
    console.log(JSON.stringify(run, null, 2));
  });

program
  .command("delete-actor <id>")
  .description("delete a personal actor of this account")
  .action(async (id: string) => {
    await client().deleteActor(id);
    console.log(JSON.stringify({ deleted: id }, null, 2));
  });

program
  .command("account")
  .description("show the account's balance, debt and holds (free)")
  .action(async () => {
    console.log(JSON.stringify(await client().getAccount(), null, 2));
  });

interface VoicesOptions {
  language?: CatalogLanguage;
  gender?: CatalogGender;
  age?: string;
  useCase?: string;
  model?: TtsModelId;
  skill?: VoiceSkill;
}

program
  .command("voices")
  .description(
    `list voices for --voice on make: presets, the voices of ${MODEL_VOICE_MODEL}, then the catalog; ` +
      "--skill make_faceless lists the narration voices for make-faceless instead",
  )
  .addOption(
    new Option(
      "--language <code>",
      `native language of the voice (a filter, not a limit); a ${MODEL_VOICE_MODEL} voice has none: en and ru find it and pick its sample`,
    ).choices(CATALOG_LANGUAGES),
  )
  .addOption(new Option("--gender <gender>", "gender label of the voice").choices(CATALOG_GENDERS))
  .option("--age <label>", "age label as voices prints it, e.g. young")
  .option("--use-case <label>", "use case label as voices prints it, e.g. narrative_story")
  .addOption(
    new Option(
      "--model <model>",
      "only voices this speech model speaks: presets and catalog voices whose language it supports, or its own voices",
    ).choices(TTS_MODELS),
  )
  .addOption(
    new Option("--skill <skill>", "the skill whose voices to list: make_ugc for make (the default), make_faceless for make-faceless")
      .choices(VOICE_SKILLS),
  )
  .action(async (opts: VoicesOptions) => {
    const voices = await client().listVoices({
      language: opts.language,
      gender: opts.gender,
      age: opts.age,
      use_case: opts.useCase,
      model: opts.model,
      skill: opts.skill,
    });
    console.log(formatVoices(voices));
  });

/** Exported so tests can drive the program; autorun happens only when this */
/** module is the process entry point, so importing it runs nothing. */
registerWorkflowCommands(program, client);
export { program };

const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  // Real paths, not URL strings: npm installs `bin` as a symlink, and Node
  // resolves the main module to the real file.
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    // Unresolvable path (file removed mid-run): assume a direct run, since a
    // silent CLI is worse than an extra run.
    return true;
  }
};

if (isDirectRun()) run();

/** API refusals print as an answer, not a stack; network and other errors */
/** still throw, since their stack is the useful part. */
function run(): void {
  program.parseAsync().catch((error: unknown) => {
  if (error instanceof WorkflowFileError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof ClipwrightApiError) {
    console.error(formatApiError(error));
    process.exitCode = 1;
    return;
  }

  // A broken server response is NOT an input error: after `POST /run` the run
  // may be charged, and the class's own message says so.
  if (error instanceof ClipwrightResponseError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  // A schema refusal is an answer to the user too, not our bug.
  const schema = formatSchemaError(error);
  if (schema !== undefined) {
    console.error(schema);
    process.exitCode = 1;
    return;
  }

  throw error;
});
}
