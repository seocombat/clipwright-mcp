import { z } from "zod";
import { longFormQuoteSchema } from "./long-form-pricing.js";
import { RESOLVED_TIMELINE_MAX_SLOTS } from "./long-form-profile.js";
import { brollPolicy } from "./broll-policy.js";
import { countWords } from "./pacing.js";
import {
  resolveTtsModel,
  MAX_SCRIPT_CHARS,
  SCRIPT_LENGTH_DESCRIPTION,
  STRESS_MARKING_DESCRIPTION,
  ttsScriptLimitError,
  TTS_MODELS,
  isVoicePresetName,
  VOICE_ID_PATTERN,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
} from "./voices.js";

export const CAPTION_STYLES = ["hormozi", "tiktok", "minimal"] as const;
export const LOOKS = ["natural", "commercial", "raw_iphone"] as const;
/** Public formats = formats MEASURED live, not the vendor docs: declaring more would */
/** accept values the pipeline later rejects. */
export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Output resolution, as the vendor accepts it (720p: 720×1280, 1080p: 1080×1920, 4k: 2160×3840 */
/** at 9:16). Resolution does not change the price; dev uses 720p for download size only. */
export const RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** The 1080×1920 default is a product promise; only dev, where nothing is published, */
/** may lower it. */
export const DEFAULT_RESOLUTION: Resolution = "1080p";
export const DEV_RESOLUTION: Resolution = "720p";

/** Resolution of a run: an explicit client choice beats any default, or dev would */
/** silently replace what the user asked for. */
export function resolveResolution(
  requested: Resolution | undefined,
  isDev: boolean,
): Resolution {
  if (requested) return requested;
  return isDev ? DEV_RESOLUTION : DEFAULT_RESOLUTION;
}

/** Length cap for ANY URL from a foreign body; without it the field takes the whole */
/** body cap. The value is the upper bound any browser and CDN handles. */
export const MAX_URL_LENGTH = 2048;

/** Skills in the shared run namespace. `runs.skill` is text, so it is read through `parseSkill`. */
export const SKILLS = ["make_ugc", "create_actor", "make_faceless"] as const;
export type Skill = (typeof SKILLS)[number];

export function parseSkill(value: unknown): Skill | null {
  return SKILLS.find((skill) => skill === value) ?? null;
}

/** What `make_ugc` does: one text for both contract surfaces, the public REST catalog */
/** and MCP `tools/list`, so they never describe different skills. */
export const MAKE_UGC_DESCRIPTION =
  "Start generation of a lip-synced UGC video. Give a script within the selected speech model's text limit; the actor comes " +
  "from actor_id (a saved actor from list_actors) or image, otherwise the default actor is used. Format and resolution follow the request and " +
  "the source, defaulting to 1080x1920. Captions are OPT-IN: ask the user first. Fields the " +
  "renderer does not honor yet carry a NOT HONORED YET note in their own description — read " +
  "it instead of guessing.";

/** How to CALL the skill over MCP. Kept apart from the description: neighboring tool */
/** names and polling are protocol details not meant for the REST catalog. */
export const MAKE_UGC_AGENT_PROTOCOL =
  "Call quote_ugc before generating and show the cost. This does NOT wait for the video: it " +
  "starts the run and returns a run_id IMMEDIATELY. You MUST then poll get_run with that " +
  "run_id until the state is 'succeeded' (video_url) or 'failed'. A 'failed' run whose paid " +
  "vendor job we still hold can go back to 'queued' and reach 'succeeded' later; whenever that " +
  "happens it is named in warnings[]. Pass attempt=2,3,… to " +
  "deliberately start a NEW run for the same input (retry after a failure).";

export const MAKE_FACELESS_DESCRIPTION =
  "Start a paid 30–90 second finished faceless video from a script or brief. " +
  "The video has an opening animated clip and image scenes. Captions are on by default and can be turned off.";

/** How to call `make_faceless` over MCP, kept apart from the REST description. */
export const MAKE_FACELESS_AGENT_PROTOCOL =
  "Call quote_faceless first and show the user the price. This does NOT wait for the video: it " +
  "starts the run and returns a run_id IMMEDIATELY. Then poll get_run with that run_id until the " +
  "state is 'succeeded' (video_url) or 'failed'. Pass attempt=2,3,… to deliberately start a NEW " +
  "run for the same input.";


/** One clip segment. `segments` makes `script` optional, changing `required[]` in `tools/list`, */
/** so the shape was declared once up front instead of changing the public form later. */
export const ugcSegment = z.object({
  kind: z.enum(["actor", "media"]),
  /** The actor's line. Absent on a `media` segment, where a neighboring actor speaks. */
  script: z.string().min(1).max(MAX_SCRIPT_CHARS).optional(),
  /** Full-frame cutaway. Required on `media`, forbidden on `actor`. */
  media_url: z.string().url().max(MAX_URL_LENGTH).optional(),
  media_type: z.enum(["image", "video"]).optional()
    .describe("Explicit media source type; omission means video, regardless of URL suffix. Availability follows the segments field."),
  duration_seconds: z.number().positive().optional()
    .describe("Required for an image segment; its display duration in seconds. Not accepted for actor or video segments."),
  image_motion: z.object({
    direction: z.enum(["in", "out"]),
    amount: z.number().min(0).lt(1),
  }).optional().describe("Optional image zoom: amount is the fractional reduction from fully contained size. No motion by default; no foreground crop."),
}).superRefine((segment, context) => {
  if (segment.kind === "actor") {
    for (const field of ["media_type", "duration_seconds", "image_motion"] as const) {
      if (segment[field] !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is only accepted on media segments` });
    }
  } else if (segment.media_type === "image") {
    if (segment.duration_seconds === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duration_seconds"], message: "image segment requires duration_seconds" });
  } else {
    for (const field of ["duration_seconds", "image_motion"] as const) {
      if (segment[field] !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} requires media_type=image` });
    }
  }
});
export type UgcSegment = z.infer<typeof ugcSegment>;

export const ugcInsert = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  media_url: z.string().url().max(MAX_URL_LENGTH).startsWith("https://"),
  media_type: z.enum(["image", "video"]),
  anchor: z.union([
    z.object({ startWord: z.number().int().nonnegative(), endWord: z.number().int().positive() })
      .strict().refine(range => range.endWord > range.startWord, { message: "endWord must be greater than startWord" }),
    z.object({ quote: z.string().min(1).max(MAX_SCRIPT_CHARS).refine(text => text.trim().length > 0),
      occurrence: z.number().int().nonnegative().optional() }).strict(),
  ]),
  cover_words: z.number().int().positive().max(10000).optional()
    .describe("How many spoken words this insert covers, counted from the first word of its anchor. " +
      "Omitted means the anchored words only. The insert ends where the first uncovered word begins, " +
      "so inserts whose coverage meets are adjacent frame for frame and leave no actor shot between them."),
  image_motion: z.object({ direction: z.enum(["in", "out"]), amount: z.number().min(0).lt(1) }).strict().optional(),
}).strict().refine(insert => insert.image_motion === undefined || insert.media_type === "image", {
  path: ["image_motion"], message: "image_motion requires media_type=image",
});
export type UgcInsert = z.infer<typeof ugcInsert>;

/** Actor segment cap: a limit on ONE run, not on daily spend. */
export const MAX_ACTOR_SEGMENTS = 3;
export const MAX_SEGMENTS = 5;

/** Narrated-path caps differ because a media shot costs nothing and an actor shot does: */
/** as many inserts as the timeline holds. */
export const MAX_INSERTS = Math.floor((RESOLVED_TIMELINE_MAX_SLOTS - 1) / 2);
export const MAX_NARRATED_ACTOR_SHOTS = 6;

export const actorId = z.string().regex(/^actor_[a-z0-9][a-z0-9_-]{0,63}$/);

export const makeUgcInputShape = {
  // Exactly one of `script | segments` must be present, enforced by `.refine` below;
  // JSON Schema cannot express that via `required[]`, so the description says it.
  script: z
    .string({ error: "script must be the text the actor says, as a string" })
    .min(1, "script is empty: pass the words the actor says")
    .max(MAX_SCRIPT_CHARS, `script is longer than ${MAX_SCRIPT_CHARS} characters`)
    .optional()
    .describe(
      "The words the actor says; required unless segments supplies the spoken text. " +
        "Segments and text-anchored inserts require long-form qualification on the server. " +
        `${SCRIPT_LENGTH_DESCRIPTION} ${STRESS_MARKING_DESCRIPTION}`,
    ),
  segments: z.array(ugcSegment).min(1).max(MAX_SEGMENTS).optional()
    .describe("Ordered actor and image segments; requires long-form qualification on the server, captions=false and 1080p. Image media requires explicit broll_policy=anyone."),
  inserts: z.array(ugcInsert).min(1).max(MAX_INSERTS)
    .refine(inserts => new Set(inserts.map(insert => insert.id)).size === inserts.length, {
      message: "insert IDs must be unique",
    }).optional().describe("Text-anchored image inserts over full narration, each covering cover_words spoken words from its anchor; " +
      "requires long-form qualification on the server, captions=false, 1080p and explicit broll_policy=anyone."),
  person: z.string().min(1).max(500).optional(),
  actor_id: actorId
    .optional()
    .describe(
      "Saved Clipwright actor ID from list_actors. Choose actor_id, image, or person; do not combine them. " +
        "Without voice or voice_id the voice follows the actor's gender. Do not combine with actor_gender.",
    ),
  // https URLs only: the vendor takes URLs, and storage URLs are never passed to vendors,
  // so a `data:` URI is refused on input rather than accepted and dropped.
  image: z
    .string({ error: "image must be the https url of the photo, as a string" })
    .url("image is not a url: pass the https address of the photo, or upload it first")
    .startsWith("https://", "image must start with https:// — http sources are refused before any charge")
    .max(MAX_URL_LENGTH, `image url is longer than ${MAX_URL_LENGTH} characters`)
    .optional()
    .describe(
      "Public https url of the actor's photo (PNG, JPEG or WebP, up to 10 MB). A file on disk goes " +
        "through upload_image (POST /v1/uploads) first — pass the url it returns. A source we cannot " +
        "use — private or loopback host, http, unreachable, redirecting, over 10 MB, or not one of " +
        "those image types — is refused (unusable_source) before any charge. We do not detect the " +
        "face's gender: pass actor_gender or voice, or the default male voice is used with a warning.",
    ),
  // No .default(): silence differs from a hint, and silence gets a warning.
  actor_gender: z
    .enum(["female", "male"])
    .optional()
    .describe(
      "Gender of the face in image: female | male. Only with image: picks the default voice of that " +
        "gender (female: sarah, male: george). Refused with actor_id (its gender is known) and without " +
        "image. An explicit voice or voice_id wins and the response warns that actor_gender changed nothing.",
    ),
  character: z.string().regex(/^char_[a-zA-Z0-9]+$/).optional(),
  name: z.string().max(100).optional(),
  broll_url: z.string().url().max(MAX_URL_LENGTH).optional(),
  broll_policy: brollPolicy.optional(),
  captions: z.boolean().default(false),
  caption_style: z.enum(CAPTION_STYLES).default("hormozi"),
  look: z.enum(LOOKS).default("natural"),
  // No .default(), so the resolver tells silence (snap with a warning) from an explicit
  // choice (refused on conflict). DEFAULT_ASPECT_RATIO (aspect.ts) fills it in.
  aspect_ratio: z
    .enum(ASPECT_RATIOS)
    .optional()
    .describe(
      `Output format: ${ASPECT_RATIOS.join(" | ")}. Omitted means 9:16, and a source of another shape ` +
        "is snapped to 9:16 with a warning — pass it explicitly whenever you pass image. A mismatch " +
        "above 15% between the request and the source is refused (aspect_conflict) before any charge.",
    ),
  // No .default(): resolveResolution() fills it, since the default depends on the
  // environment, which the schema must not know.
  resolution: z
    .enum(RESOLUTIONS)
    .optional()
    .describe(
      `Output resolution: ${RESOLUTIONS.join(" | ")} (short side 720 / 1080 / 2160 px). Omitted means 1080p.`,
    ),
  // No .default(), like resolution: an explicit voice differs from silence. `voice` is a
  // name form checked by `serverUgcInput`; `voice_id` is a raw vendor id.
  voice: z
    .string({ error: "voice must be a voice name from list_voices, as a string" })
    .regex(VOICE_NAME_PATTERN, "voice is not a voice name: take one from list_voices, or pass voice_id")
    .optional()
    .describe(
      `Voice name from list_voices. Curated presets: ${VOICE_PRESET_NAMES.join(" | ")} ` +
        "(owner_ru_clone is the Russian cloned voice). The API refuses a name list_voices does not " +
        "return, before any charge. Omitted means the default voice for the actor's gender: the " +
        "gender of actor_id, actor_gender with image, or george for the default actor and for image " +
        "without actor_gender. " +
        "Mutually exclusive with voice_id.",
    ),
  voice_id: z
    .string({ error: "voice_id must be a vendor voice id, as a string" })
    .regex(VOICE_ID_PATTERN, "voice_id is not a vendor voice id: 16 to 32 letters and digits")
    .optional()
    .describe(
      "Raw vendor voice id (16–32 letters and digits) for a voice outside the catalog. Checked " +
        "lazily: an unknown id fails the run, not the request. Mutually exclusive with voice.",
    ),
  tts_model: z
    .enum(TTS_MODELS)
    .optional()
    .describe(
      `Speech model: ${TTS_MODELS.join(" | ")}. Omitted means the model of the chosen preset ` +
        "(list_voices shows it; every preset speaks eleven_v3) or eleven_v3 for a raw voice_id. " +
        "eleven_v3 is the most expressive and the only one that reads stress marks " +
        "(a capital vowel inside a Russian word, \"потОм\", becomes one; see script); " +
        "eleven_flash_v2_5 and eleven_turbo_v2_5 are cheaper alternatives for languages other than " +
        "Russian. " + SCRIPT_LENGTH_DESCRIPTION,
    ),
  webhook_url: z.string().url().max(MAX_URL_LENGTH).optional(),
  /** Visible "made with AI" overlay, OPT-IN: disclosure rests on contract fields and file */
  /** metadata. Burning it in needs composition (gated by `CLIPWRIGHT_COMPOSE`). */
  disclosure_overlay: z.boolean().optional(),
  /** How to fill a frame the clip does not cover. No `.default()`: absence means no layout */
  /** is needed. `contain` fits whole, `white` pads white, `blur` fills with the blurred frame. */
  background: z.enum(["white", "blur", "contain"]).optional(),
} as const;

/** Agent retry parameter: the attempt NUMBER. Kept apart from `makeUgcInputShape` because it */
/** is a skill input (the `:N` idempotency-key suffix in the SDK), not a render parameter. */
export const agentRetryShape = { attempt: z.number().int().min(1).optional() } as const;

// Shared REST/MCP/SDK schema: actor_id, person and image are mutually exclusive.
// The registry rejects character; person is accepted with a warning.
export const makeUgcInput = z
  .object(makeUgcInputShape)
  // Exactly one of script | segments: with neither there is nothing to render; with
  // both, silently picking one would be a silent substitution.
  .refine((v) => (v.script === undefined) !== (v.segments === undefined), {
    message: "pass exactly one of script | segments",
  })
  .refine(v => v.inserts === undefined || (v.script !== undefined && v.segments === undefined), {
    path: ["inserts"], message: "inserts requires script and cannot be combined with segments",
  })
  // The character cap depends on the model; refused here, before any reserve or vendor call.
  // Only the server knows the model of a voice unknown to the client, and checks it there.
  .refine(
    // The client does not know an `actor_id`'s gender; today's preset models do not depend on it.
    (v) =>
      modelUnknownToClient(v) ||
      ttsScriptLimitError(spokenTextOf(v), resolveTtsModel(v, v.actor_gender)) === undefined,
    {
    path: ["script"],
    error: (issue) => {
      const input = issue.input as SpokenTextInput & ModelInput;
      return ttsScriptLimitError(spokenTextOf(input), resolveTtsModel(input, input.actor_gender))!;
    },
  })
  .refine(
    (v) => [v.actor_id, v.person, v.image].filter(Boolean).length <= 1,
    { message: "pass at most one of actor_id | person | image; use list_actors to select a saved actor" },
  )
  .refine((v) => v.actor_gender === undefined || v.actor_id === undefined, {
    path: ["actor_gender"],
    message: "actor_gender cannot be combined with actor_id: the saved actor's gender is already known; omit actor_gender",
  })
  .refine((v) => v.actor_gender === undefined || v.actor_id !== undefined || v.image !== undefined, {
    path: ["actor_gender"],
    message: "actor_gender requires image: it describes the face in your photo; omit it, or pass image",
  })
  // List-wide limits and per-role required fields are checked here.
  // Image type, duration and motion are checked by ugcSegment.
  .refine((v) => v.segments === undefined || v.segments.some((s) => s.kind === "actor"), {
    message: "segments must contain at least one actor segment: nobody speaks otherwise",
  })
  .refine(
    (v) =>
      v.segments === undefined ||
      v.segments.filter((s) => s.kind === "actor").length <= MAX_ACTOR_SEGMENTS,
    {
      // A per-run limit, not a daily spend cap: confusing the two would promise a
      // protection this number does not give.
      message: `at most ${MAX_ACTOR_SEGMENTS} actor segments per clip`,
    },
  )
  .refine(
    (v) =>
      v.segments === undefined ||
      v.segments.every((s) => s.kind !== "actor" || s.script !== undefined),
    { message: "actor segment requires `script`: it is the line to be spoken" },
  )
  .refine(
    (v) =>
      v.segments === undefined ||
      v.segments.every((s) => s.kind !== "actor" || s.media_url === undefined),
    { message: "actor segment must not carry `media_url`: use a media segment for footage" },
  )
  .refine(
    (v) =>
      v.segments === undefined ||
      v.segments.every((s) => s.kind !== "media" || s.media_url !== undefined),
    { message: "media segment requires `media_url`: there is no footage to show otherwise" },
  )
  // One voice selector at most; checked here, not in the shape, since .refine drops .shape.
  // With both omitted the resolver picks a voice by the actor's gender (`resolveVoiceSelection`).
  .refine(
    (v) => !(v.voice !== undefined && v.voice_id !== undefined),
    { message: "pass at most one of voice | voice_id" },
  )
  // Length includes whitespace; a nonempty string can still have no speech.
  .refine((v) => v.segments !== undefined || countWords(v.script ?? "") >= 1, {
    message: "script has 0 speakable words",
  });

type ModelInput = Parameters<typeof resolveTtsModel>[0] & { actor_gender?: "female" | "male" | undefined };

function modelUnknownToClient(v: { voice?: string | undefined; tts_model?: string | undefined }): boolean {
  return v.tts_model === undefined && v.voice !== undefined && !isVoicePresetName(v.voice);
}

/** API input: the server's `voiceRefusal` checks the voice name. The catalog is not imported */
/** here, since clients read this barrel; the server uses `@clipwright/core/voice-admission`. */
export function serverUgcInputWith(voiceRefusal: (voice: string) => string | undefined) {
  return makeUgcInput
    .refine((v) => v.voice === undefined || voiceRefusal(v.voice) === undefined, {
      path: ["voice"],
      error: (issue) => voiceRefusal((issue.input as { voice: string }).voice)!,
    })
    // The cap the client skipped: the server knows the model of an admitted catalog voice.
    .refine(
      (v) =>
        !modelUnknownToClient(v) ||
        voiceRefusal(v.voice!) !== undefined ||
        ttsScriptLimitError(spokenTextOf(v), resolveTtsModel(v, v.actor_gender)) === undefined,
      {
        path: ["script"],
        error: (issue) => {
          const input = issue.input as SpokenTextInput & ModelInput;
          return ttsScriptLimitError(spokenTextOf(input), resolveTtsModel(input, input.actor_gender))!;
        },
      },
    );
}

/** A stored run input already passed admission; a model or cap change must not make an */
/** old run unreadable. The snapshot keeps the actor's gender. */
export const storedUgcInput = z.object({
  ...makeUgcInputShape,
  tts_model: z.string().optional(),
  actor_snapshot: z.object({ gender: z.enum(["female", "male"]).optional() }).optional(),
});

/** The minimum the spoken text is derived from: the script itself or the segments. */
export interface SpokenTextInput {
  script?: string | undefined;
  segments?: readonly UgcSegment[] | undefined;
}

/** Joins the spoken text without checks: the shared base for gates and the helper. */
function spokenTextOf(input: SpokenTextInput): string {
  if (input.script !== undefined) return input.script;
  return (input.segments ?? [])
    .filter((segment) => segment.kind === "actor")
    .map((segment) => segment.script ?? "")
    .join(" ");
}

/** The ONLY place where "script or joined segments" becomes a `string`. The non-empty */
/** check lives here, restoring the guard before the paid TTS call that the schema no longer holds. */
export function resolvedScript(input: SpokenTextInput): string {
  const text = spokenTextOf(input);
  if (countWords(text) < 1) {
    throw new Error("no speakable script: pass script or segments with actor lines");
  }
  return text;
}

export type MakeUgcInput = z.infer<typeof makeUgcInput>;

// The INPUT type (`MakeUgcInputArgs`) lives in `contract-dispositions.ts`: it comes from the
// OFFERED shape, so SDK autocomplete does not show rejected fields.

export const quoteResponse = z.object({
  long_form_pricing: longFormQuoteSchema.optional(),
  skill: z.string(),
  credits_estimate: z.number().int().nonnegative(),
  duration_estimate_sec: z.number().positive(),
  // Unhonored parameters are declared up front, never silently ignored.
  warnings: z.array(z.string()).default([]),
  // The contract version sits in the response too, so an agent reading the quote
  // sees which contract the price was given under.
  contract_version: z.string(),
  /** What we know about the frame source. `null` only when `image` was given but probing */
  /** failed; without `image` the default actor's dimensions are reported. */
  source: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
      aspect_ratio: z.string(),
    })
    .nullable(),
  /** Who is in the frame; `null` for a client `image`. */
  actor: z
    .object({
      gender: z.enum(["female", "male"]),
      actor_id: actorId.optional(),
      version: z.number().int().positive().optional(),
    })
    .nullable(),
  /** The format that will actually be rendered for this input. */
  resolved_aspect_ratio: z.enum(ASPECT_RATIOS),
  tts_model: z.enum(TTS_MODELS),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;
