#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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
  PUBLIC_APP_BASE_URL,
  RESOLUTIONS,
  TTS_MODELS,
  UPLOAD_MAX_BYTES,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
  sniffUploadMediaType,
  type AspectRatio,
  type CatalogGender,
  type CatalogLanguage,
  type Resolution,
  type TtsModelId,
} from "@clipwright/core";
import { ClipwrightApiError, ClipwrightClient, ClipwrightResponseError } from "@clipwright/sdk";

import { formatApiError, formatRun, formatSchemaError, formatVoices } from "./format.js";

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

/** --retry is an attempt NUMBER, parsed strictly: the value enters the */
/** idempotency key, so a lenient parse could buy a second render. */
function parseRetry(raw: string): number {
  // Same bound as the SDK's `attemptSuffix`: a leading `[1-9]` rejects zero,
  // `isSafeInteger` rejects values too large to stay distinct.
  const parsed = Number.parseInt(raw, 10);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(parsed)) {
    console.error(`--retry expects a whole number of 1 or more, got ${raw}`);
    process.exit(1);
  }
  return parsed;
}

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
    new Option("--tts-model <model>", "speech model; omitted = the preset's model").choices(
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
}

/** Faceless options shared by quote and make, so the quote prices what gets made. */
const withFacelessOptions = (command: Command): Command =>
  command
    .addOption(new Option("--script <text>", "narration, read as written").conflicts(["scriptFile", "brief"]))
    .addOption(new Option("--script-file <path>", "read the narration from a file").conflicts("brief"))
    .option("--brief <text>", "what the video is about; the narration is written from it")
    .requiredOption("--duration <seconds>", "target length, 30 to 90 seconds")
    .option("--no-captions", "turn off burned-in captions (on by default)")
    .option("--style-reference <url>", "public https image whose visual style the scenes follow")
    .option("--character-reference <url>", "public https image of a person or figure to keep across scenes");

function facelessInput(opts: FacelessOptions): MakeFacelessInputArgs {
  const common = {
    duration_seconds: Number(opts.duration),
    captions: opts.captions,
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
  program.command("make-faceless").description("start a 30-90 second faceless video (paid); prints the run"),
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
}

program
  .command("voices")
  .description("list voices for --voice on make: presets, then the catalog")
  .addOption(
    new Option("--language <code>", "native language of the voice (a filter, not a limit)").choices(
      CATALOG_LANGUAGES,
    ),
  )
  .addOption(new Option("--gender <gender>", "gender label of the voice").choices(CATALOG_GENDERS))
  .option("--age <label>", "age label as voices prints it, e.g. young")
  .option("--use-case <label>", "use case label as voices prints it, e.g. narrative_story")
  .addOption(
    new Option("--model <model>", "only voices whose language this speech model supports").choices(TTS_MODELS),
  )
  .action(async (opts: VoicesOptions) => {
    const voices = await client().listVoices({
      language: opts.language,
      gender: opts.gender,
      age: opts.age,
      use_case: opts.useCase,
      model: opts.model,
    });
    console.log(formatVoices(voices));
  });

/** Exported so tests can drive the program; autorun happens only when this */
/** module is the process entry point, so importing it runs nothing. */
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
