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
  FEEDBACK_KINDS,
  type FeedbackKind,
  FAILED_STATE,
  MODEL_VOICE_MODEL,
  PUBLIC_APP_BASE_URL,
  RESOLUTIONS,
  REVISION_CHARGE_TEXT,
  type RevisionRequest,
  TTS_MODELS,
  UPLOAD_MAX_BYTES,
  type UploadResponse,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
  VOICE_SKILLS,
  sniffUploadMediaType,
  type AspectRatio,
  type CatalogGender,
  type CatalogLanguage,
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

async function uploadFile(path: string): Promise<UploadResponse> {
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
  return upload;
}

interface SourceOptions {
  actorId?: string;
  actorGender?: "female" | "male";
  image?: string;
  imageFile?: string;
  aspectRatio?: AspectRatio;
  resolution?: (typeof RESOLUTIONS)[number];
}

async function resolveImage(opts: SourceOptions): Promise<string | undefined> {
  return opts.imageFile ? (await uploadFile(opts.imageFile)).url : opts.image;
}

function withSourceOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--actor-id <id>", "saved actor from the actors catalog").conflicts(["image", "imageFile", "person", "actorGender"]),
    )
    .addOption(
      new Option("--image <url>", "public https url of the actor's photo").conflicts("imageFile"),
    )
    .option("--image-file <path>", "local PNG/JPEG: uploaded first (POST /v1/uploads), then used as --image")
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

const parseWholeNumber = (flag: string) => (raw: string): number => {
  const parsed = Number.parseInt(raw, 10);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(parsed)) {
    console.error(`${flag} expects a whole number of 1 or more, got ${raw}`);
    process.exit(1);
  }
  return parsed;
};
const parseRetry = parseWholeNumber("--retry");

const maxCreditsOption = (): Option => new Option("--max-credits <n>",
  "the most credits this call may cost; a call that reserves more is refused and nothing is charged").argParser((raw: string): number => {
  const parsed = Number.parseInt(raw, 10);
  if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(parsed)) {
    console.error(`--max-credits expects a whole number of 0 or more, got ${raw}`);
    process.exit(1);
  }
  return parsed;
});
const ceilingOf = (opts: { maxCredits?: number }): { max_credits?: number } =>
  opts.maxCredits === undefined ? {} : { max_credits: opts.maxCredits };

program
  .command("upload <path>")
  .description("upload a local PNG/JPEG and print the https url to pass as --image")
  .option("--json", "print upload_id, content_digest and the full upload metadata as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const upload = await uploadFile(path);
    console.log(opts.json ? JSON.stringify(upload, null, 2) : upload.url);
  });

program
  .command("uploads")
  .description("list your uploads a revision still takes, newest first, each with a fresh url and its usable_until; free")
  .action(async () => {
    console.log(JSON.stringify(await client().listUploads(), null, 2));
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
  .option("--captions", "burn in word-synced captions")
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
  .addOption(maxCreditsOption())
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
        maxCredits?: number;
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
          ...ceilingOf(opts),
        },
        { attempt: opts.retry },
        (r) => console.error(`state: ${r.state}`),
      );
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

function sameDocument(stored: RunEditRead["document"], sent: unknown): boolean {
  const read = editDocumentRead.safeParse(sent);
  return read.success && isDeepStrictEqual(stored, read.data);
}

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

const withReviseOptions = (command: Command): Command =>
  command
    .addOption(new Option("--shot <id>", "the shot to generate anew, with one of --retake, --new-picture or --animate")
      .conflicts("document"))
    .addOption(new Option("--retake", "generate the shot again from its own description").conflicts(["newPicture", "animate", "document"]))
    .addOption(new Option("--new-picture <description>", "draw a new picture for the shot from this description")
      .conflicts(["animate", "document"]))
    .addOption(new Option("--animate [motion]", "turn the opening picture into a clip, with this motion if given").conflicts("document"))
    .option("--document <path>", "the file edit-show prints: its document, edited, is the whole revision");

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
  .addOption(maxCreditsOption())
  .action(async (run: string, opts: ReviseOptions & { retry?: number; maxCredits?: number }) => {
    const request: RevisionRequest = { ...revisionInput(opts), ...ceilingOf(opts) };
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

const withCandidateOptions = (command: Command): Command =>
  command
    .option("--shot <id>", "the shot to make a candidate for, with one of --retake, --new-picture or --animate")
    .addOption(new Option("--retake", "generate the shot again from its own description").conflicts(["newPicture", "animate"]))
    .addOption(new Option("--new-picture <description>", "draw a new picture for the shot from this description").conflicts("animate"))
    .option("--animate [motion]", "turn the opening picture into a clip, with this motion if given")
    .option("--take <n>", "take number, 1 by default: the same request and take return the first candidate; " +
      "another take makes another one, charged again", parseWholeNumber("--take"));

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
  .addOption(maxCreditsOption())
  .action(async (run: string, opts: CandidateOptions & { yes?: boolean; maxCredits?: number }) => {
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
      created = await client().createCandidate(run, { ...request, ...ceilingOf(opts) });
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
  styleReference?: string;
}

const withActorOptions = (command: Command): Command =>
  command
    .requiredOption("--name <text>", "name shown in the actor list")
    .requiredOption("--description <text>", "words describing a fictional adult")
    .addOption(
      new Option("--gender <gender>", "the actor's gender").choices([...ACTOR_GENDERS_ACCEPTED]).makeOptionMandatory(),
    )
    .requiredOption("--age <years>", "approximate age in years")
    .addOption(new Option("--quality <quality>", "image quality").choices([...ACTOR_QUALITIES_ACCEPTED]))
    .option("--aspects <list>", `comma-separated formats to create (${ASPECT_RATIOS.join(",")})`)
    .option("--style-reference <asset_id>", "image asset whose set, light, camera angle, shot size (chest-up, waist-up or full height) and clothing the portrait follows, with a new face");

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
    ...(opts.styleReference === undefined ? {} : { style_reference: { asset_id: opts.styleReference } }),
  };
}

withActorOptions(
  program.command("quote-actor").description("estimate credits for a personal actor without spending them"),
).action(async (opts: ActorOptions) => {
  console.log(JSON.stringify(await client().quoteActor(actorInput(opts)), null, 2));
});

withActorOptions(
  program.command("create-actor").description("create a personal actor from a description (paid)"),
).addOption(maxCreditsOption()).action(async (opts: ActorOptions & { maxCredits?: number }) => {
  console.log(JSON.stringify(await client().createActor({ ...actorInput(opts), ...ceilingOf(opts) }), null, 2));
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
  .addOption(maxCreditsOption())
  .action(async (opts: FacelessOptions & { retry?: number; maxCredits?: number }) => {
    const run = await client().startFaceless({ ...facelessInput(opts), ...ceilingOf(opts) }, { attempt: opts.retry });
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

program
  .command("feedback")
  .description("tell Clipwright what is missing, confusing, wrong or slow; we read every one (free)")
  .addOption(new Option("--kind <kind>", "what kind of feedback").choices(FEEDBACK_KINDS).makeOptionMandatory())
  .requiredOption("--text <text>", "what you wanted, what you tried and what came back")
  .option("--run <id>", "the run it is about")
  .action(async (opts: { kind: FeedbackKind; text: string; run?: string }) => {
    const answer = await client().sendFeedback({ kind: opts.kind, text: opts.text, ...(opts.run === undefined ? {} : { run_id: opts.run }) });
    console.log(JSON.stringify(answer, null, 2));
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

registerWorkflowCommands(program, client);
export { program };

const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return true;
  }
};

if (isDirectRun()) run();

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

  if (error instanceof ClipwrightResponseError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const schema = formatSchemaError(error);
  if (schema !== undefined) {
    console.error(schema);
    process.exitCode = 1;
    return;
  }

  throw error;
});
}
