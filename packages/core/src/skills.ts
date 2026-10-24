import { z } from "zod";
import { ASSET_KINDS, ASSET_MEDIA_TYPES, assetId } from "./asset-identity.js";
import { longFormQuoteSchema } from "./long-form-pricing.js";
import { RESOLVED_TIMELINE_MAX_SLOTS } from "./long-form-profile.js";
import { brollPolicy } from "./broll-policy.js";
import { countWords } from "./pacing.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import { INSERT_TRANSITIONS, LAYER_ENTERS, layerRefusals, LAYOUT_WINDOW_KINDS, MAX_LAYOUT_WINDOWS, MAX_OVERLAYS,
  OVERLAY_POSITIONS } from "./ugc-layers.js";
import { MAX_TEMPLATE_MEDIA, MAX_TEMPLATES, TEMPLATE_KIND_IDS, TEMPLATE_PLACEMENTS, templateCatalogText, templateRefusals, templateSounds, templateTheme } from "./templates/index.js";
import { callout } from "./templates/callout.js";
import { checklist } from "./templates/checklist.js";
import { compare } from "./templates/compare.js";
import { endCard } from "./templates/end-card.js";
import { lowerThird } from "./templates/lower-third.js";
import { notification } from "./templates/notification.js";
import { phoneCall } from "./templates/phone-call.js";
import { progress } from "./templates/progress.js";
import { quote } from "./templates/quote.js";
import { rating } from "./templates/rating.js";
import { stat } from "./templates/stat.js";
import { tag } from "./templates/tag.js";
import { titleCard } from "./templates/title-card.js";
import {
  cutToNothingError,
  DEFAULT_TTS_MODEL,
  GOOGLE_TTS_MODEL,
  isModelVoiceName,
  MODEL_DEFAULT_VOICE_BY_GENDER,
  MODEL_VOICE_MODEL,
  resolveTtsModel,
  RUSSIAN_TTS_MODEL,
  MAX_SCRIPT_CHARS,
  SCRIPT_LENGTH_DESCRIPTION,
  speaksOwnVoices,
  STRESS_MARKING_DESCRIPTION,
  ttsScriptLimitError,
  TTS_MODELS,
  isVoicePresetName,
  VOICE_ID_PATTERN,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
} from "./voices.js";

/** Caption looks the renderer draws, each a fixed font, colours, placement and word animation. */
export const CAPTION_PRESETS = {
  hormozi: "the default: condensed bold uppercase, two to four white words per cue mid-lower in the frame, one keyword per cue in " +
    "orange (the emphasised words, or else the cue's longest word that is not a stop-word); Latin and Cyrillic in one font",
  tiktok: "bold rounded uppercase, one or two words at a time; the spoken word turns yellow and grows",
  youtube: "clean bold sans-serif, five words on a dark rounded box near the bottom; words fade in, the spoken word in red",
  instagram: "comic uppercase with a pink outline, two words at a time; the spoken word pops in orange",
  minimalist: "plain sans-serif, five words on a half-transparent dark band, gentle fade",
  neon: "cyan uppercase with a magenta outline, two words at a time; the spoken word pops in white",
  genz: "large comic uppercase, one word at a time, slamming in with a pink highlight",
  campfire: "rounded comic uppercase, three words; spoken words light up gold and stay lit",
  midnight: "spooky uppercase, two words, slow fade; the spoken word in red",
  plottwist: "heavy sans-serif, three words; the spoken word turns sky blue and grows",
  headline: "tall condensed uppercase on a solid black band, three words; the spoken word scales up in yellow",
  promo: "heavy sans-serif on a blue pill, three words; the spoken word pops in yellow",
  lecture: "readable sans-serif, six words on a dark rounded box; the spoken word in green",
  highlighter: "heavy sans-serif, four words; spoken words turn lime and stay lit",
  studio: "sans-serif, seven words typed in on a blurred dark box; the spoken word in amber",
  broadcast: "outlined sans-serif, eight words low in the frame; the spoken word in pale yellow",
  arcade: "blocky yellow uppercase, two words; the spoken word bounces in white",
  clutch: "brush uppercase, one word at a time, slamming in green",
  bubblegum: "rounded display letters with a pink outline, two words; the spoken word bounces in yellow",
  crayon: "marker handwriting with a navy outline, two words; the spoken word pops in orange",
  lyrics: "handwritten script, five words; spoken words light up pink and stay lit",
  bassdrop: "outlined display uppercase, one word at a time, scaling in orange",
  punch: "mid-frame setup and punch: a small white lead-in line over one or two large blue glowing keywords; other words small and white",
} as const;
export type CaptionPresetId = keyof typeof CAPTION_PRESETS;
export const CAPTION_PRESET_IDS = Object.keys(CAPTION_PRESETS) as CaptionPresetId[];

/** An earlier style name kept valid. */
export const CAPTION_STYLE_ALIASES = { minimal: "minimalist" } as const satisfies Record<string, CaptionPresetId>;
export const CAPTION_STYLES = [...CAPTION_PRESET_IDS, ...Object.keys(CAPTION_STYLE_ALIASES) as (keyof typeof CAPTION_STYLE_ALIASES)[]] as
  [CaptionPresetId | keyof typeof CAPTION_STYLE_ALIASES, ...(CaptionPresetId | keyof typeof CAPTION_STYLE_ALIASES)[]];
export type CaptionStyleName = (typeof CAPTION_STYLES)[number];

/** The preset a style name draws: an alias resolves to its preset. */
export function captionPresetOf(style: CaptionStyleName): CaptionPresetId {
  return style in CAPTION_STYLE_ALIASES ? CAPTION_STYLE_ALIASES[style as keyof typeof CAPTION_STYLE_ALIASES] : style as CaptionPresetId;
}

const CAPTION_STYLE_DESCRIPTION = "Caption look when captions=true. " +
  CAPTION_PRESET_IDS.map((id) => `${id}: ${CAPTION_PRESETS[id]}.`).join(" ") +
  " Alias: minimal draws minimalist. A font that cannot draw the script's letters is replaced by a plain sans-serif.";

export const MAX_CAPTION_EMPHASIS = 20;
export const MAX_CAPTION_EMPHASIS_CHARS = 40;

/** `full` captions every spoken word; `highlights` only the windows around `caption_emphasis` quotes. */
export const CAPTION_MODES = ["full", "highlights"] as const;
export type CaptionMode = (typeof CAPTION_MODES)[number];
/** `punch`: a small lead-in line over the quote as a large glowing keyword; `pill`: the quote alone in a rounded pill; */
/** `color`: the quote in the style's accent colour, same size. */
export const CAPTION_EMPHASIS_LOOKS = ["punch", "pill", "color"] as const;
export type CaptionEmphasisLook = (typeof CAPTION_EMPHASIS_LOOKS)[number];

const emphasisQuote = z.string().min(1).max(MAX_CAPTION_EMPHASIS_CHARS).refine((text) => text.trim().length > 0);
export const captionEmphasisItem = z.union([emphasisQuote,
  z.object({ quote: emphasisQuote, look: z.enum(CAPTION_EMPHASIS_LOOKS).optional(),
    punch_in: z.boolean().optional().describe("Long form only: zoom into the presenter while the quote is spoken. " +
      "Drawn only where captions are drawn and the presenter is on screen; otherwise warnings[] names it.") }).strict()]);
export type CaptionEmphasisItem = z.infer<typeof captionEmphasisItem>;

/** An emphasis item as quote, look and punch-in; a plain string, or an object without a look, takes the preset's look. */
export function captionEmphasisOf(item: CaptionEmphasisItem): { quote: string; look: CaptionEmphasisLook | undefined; punchIn?: true } {
  return typeof item === "string" ? { quote: item, look: undefined }
    : { quote: item.quote, look: item.look, ...(item.punch_in === true ? { punchIn: true as const } : {}) };
}

/** Composition semantics of a run, written at admission: 2 draws captions and crops pictures */
/** to fill the frame; a run stored without it keeps the earlier render, so it re-renders the same. */
export const UGC_COMPOSITION_VERSION = 2;

export function compositionVersionOf(storedInput: unknown): 1 | 2 {
  return storedInput !== null && typeof storedInput === "object" &&
    (storedInput as { composition_version?: unknown }).composition_version === UGC_COMPOSITION_VERSION ? 2 : 1;
}
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
export const SKILLS = ["make_ugc", "create_actor", "make_faceless", "edit_shot", "revise_long_form", "generate_image", "generate_video"] as const;
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
  "Start a paid finished faceless video from a script or brief. You select 30–90 seconds; " +
  "the video ends with its narration, runs at least 25 seconds and at most a quarter past the selection, never beyond 90. " +
  "The video has an opening animated clip and image scenes. Captions are on by default and can be turned off.";

/** How to call `make_faceless` over MCP, kept apart from the REST description. */
export const MAKE_FACELESS_AGENT_PROTOCOL =
  "Call quote_faceless first and show the user the price. This does NOT wait for the video: it " +
  "starts the run and returns a run_id IMMEDIATELY. Then poll get_run with that run_id until the " +
  "state is 'succeeded' (video_url) or 'failed'. Pass attempt=2,3,… to deliberately start a NEW " +
  "run for the same input.";


const IMAGE_MOTION_DESCRIPTION = "Optional picture zoom. A picture always fills the frame, cut to its shape when the shapes differ " +
  "(warnings[] names the share cut). amount is the zoom beyond filling: in grows from 1 to 1+amount, out shrinks from 1+amount to 1. No motion by default.";

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
  }).optional().describe(IMAGE_MOTION_DESCRIPTION),
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

const insertId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const wordAnchor = z.union([
  z.object({ startWord: z.number().int().nonnegative(), endWord: z.number().int().positive() })
    .strict().refine(range => range.endWord > range.startWord, { message: "endWord must be greater than startWord" }),
  z.object({ quote: z.string().min(1).max(MAX_SCRIPT_CHARS).refine(text => text.trim().length > 0),
    occurrence: z.number().int().nonnegative().optional() }).strict(),
]);
const mediaSource = {
  media_url: z.string().url().max(MAX_URL_LENGTH).startsWith("https://").optional()
    .describe("Public https URL of the media. Pass exactly one of media_url or asset_id."),
  media_type: z.enum(["image", "video"])
    .describe("image (PNG or JPEG) or video (MP4, H.264 or HEVC, 8-bit SDR). A video plays muted from its first frame and is cut where its words end; " +
      "one shorter than its words holds its last frame, and warnings[] names it."),
};
const hasOneSource = (item: { media_url?: string | undefined; asset_id?: string | undefined }) =>
  (item.media_url === undefined) !== (item.asset_id === undefined);
const ONE_SOURCE: { path: PropertyKey[]; message: string } = { path: ["media_url"], message: "pass exactly one of media_url or asset_id" };

export const ugcInsert = z.object({
  id: insertId,
  media_url: mediaSource.media_url,
  asset_id: assetId.optional()
    .describe("A ready PNG or JPEG image or MP4 video from your own assets (list_assets), instead of media_url. Pass exactly one of the two; " +
      "media_type must match the asset's kind."),
  media_type: mediaSource.media_type,
  anchor: wordAnchor,
  cover_words: z.number().int().positive().max(10000).optional()
    .describe("How many spoken words this insert covers, counted from the first word of its anchor. " +
      "Omitted means the anchored words only. The insert ends where the first uncovered word begins, " +
      "so inserts whose coverage meets are adjacent frame for frame and leave no actor shot between them."),
  image_motion: z.object({ direction: z.enum(["in", "out"]), amount: z.number().min(0).lt(1) }).strict().optional()
    .describe(IMAGE_MOTION_DESCRIPTION),
  transition: z.enum(INSERT_TRANSITIONS).optional()
    .describe("How the insert comes in and goes out: cut (default), wipe (slides across the presenter), flash (a white flash on the cut) " +
      "or zoom (eases in from a closer framing). It never moves the insert's start or end."),
}).strict().refine(insert => insert.image_motion === undefined || insert.media_type === "image", {
  path: ["image_motion"], message: "image_motion requires media_type=image",
}).refine(hasOneSource, ONE_SOURCE);
export type UgcInsert = z.infer<typeof ugcInsert>;

const layerMedia = {
  id: insertId.describe("Unique across inserts, overlays and layout_windows."),
  ...mediaSource,
  asset_id: assetId.optional()
    .describe("A ready PNG or JPEG image or MP4 video from your own assets (list_assets), instead of media_url. Pass exactly one of the two; " +
      "media_type must match the asset's kind."),
  anchor: wordAnchor.describe("The words it starts on, as an insert anchor: { startWord, endWord } or { quote, occurrence? }."),
  cover_words: z.number().int().positive().max(10000).optional()
    .describe("How many spoken words it stays on screen, counted from the first word of its anchor. Omitted means the anchored words only."),
  enter: z.enum(LAYER_ENTERS).optional()
    .describe("How it appears: cut (default), fade, slide (in from the nearest edge) or tilt_in. It leaves with a cut."),
};

/** Media drawn over the visible presenter at a fixed place; the presenter stays on screen and is billed. */
export const ugcOverlay = z.object({
  ...layerMedia,
  position: z.enum(OVERLAY_POSITIONS).describe("A corner (top_left, top_right, bottom_left, bottom_right), or a band across the top or bottom."),
}).strict().refine(hasOneSource, ONE_SOURCE);
export type UgcOverlay = z.infer<typeof ugcOverlay>;

/** A reframing of the presenter: split shares a 9:16 frame with the media, card shows the media in a centred card. */
export const ugcLayoutWindow = z.object({
  ...layerMedia,
  layout: z.enum(LAYOUT_WINDOW_KINDS).describe("split: presenter in the top half, media in the bottom half, captions on the seam (9:16 only). " +
    "card: the media in a centred card over the presenter."),
  blur_presenter: z.boolean().optional().describe("Card only: blur the presenter behind the card."),
}).strict().refine(hasOneSource, ONE_SOURCE).refine(layout => layout.blur_presenter === undefined || layout.layout === "card", {
  path: ["blur_presenter"], message: "blur_presenter works on a card window only",
});
export type UgcLayoutWindow = z.infer<typeof ugcLayoutWindow>;

const templateEnvelope = {
  id: insertId.describe("Unique across inserts, overlays, layout_windows and templates."),
  anchor: layerMedia.anchor,
  cover_words: layerMedia.cover_words,
  placement: z.enum(TEMPLATE_PLACEMENTS).optional().describe("over (drawn over the presenter) or full (fills the frame); omitted means the " +
    "kind's first placement, and a kind takes only the placements its catalog line names."),
  transition: z.enum(INSERT_TRANSITIONS).optional().describe("Full placement only, as an insert's transition."),
};
const templateItem = <K extends string, D extends z.ZodObject>(kind: { kind: K; data: D }) =>
  z.object({ ...templateEnvelope, kind: z.literal(kind.kind), data: kind.data }).strict();
/** A graphic template (#778 S3): REST and the SDK take the strict union, `data` checked by `kind`. */
export const ugcTemplate = z.discriminatedUnion("kind", [templateItem({ ...tag, kind: "tag" as const }),
  templateItem({ ...lowerThird, kind: "lower_third" as const }), templateItem({ ...endCard, kind: "end_card" as const }),
  templateItem({ ...titleCard, kind: "title_card" as const }), templateItem({ ...quote, kind: "quote" as const }), templateItem({ ...stat, kind: "stat" as const }),
  templateItem({ ...callout, kind: "callout" as const }), templateItem({ ...checklist, kind: "checklist" as const }),
  templateItem({ ...phoneCall, kind: "phone_call" as const }), templateItem({ ...compare, kind: "compare" as const }),
  templateItem({ ...notification, kind: "notification" as const }), templateItem({ ...progress, kind: "progress" as const }),
  templateItem({ ...rating, kind: "rating" as const })]);
export type UgcTemplate = z.infer<typeof ugcTemplate>;
/** The slim MCP item: `data` is any object here, the catalog sits in the description and the server checks it strictly (D3). */
export const mcpUgcTemplate = z.object({ ...templateEnvelope, kind: z.enum(TEMPLATE_KIND_IDS),
  data: z.record(z.string(), z.unknown()).describe("The kind's fields, as its catalog line in templates names them.") }).strict();
export const TEMPLATES_DESCRIPTION = templateCatalogText();

/** What admission pins for an `asset_id` insert; the worker reads this key and checks this hash, never the asset row.
 * Server-only: it lives at the top of the stored input, and a public body naming it is refused as an unknown field. */
export const pinnedInsertAsset = z.object({
  insert_id: insertId,
  /** A template's media slot; ids refuse `.`, so `<id>.<slot>` keys never meet an overlay's (A1). */
  slot: z.string().regex(/^[a-z][a-z_]{0,31}$/).optional(),
  asset_id: assetId,
  key: z.string().min(1).max(1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  kind: z.enum(ASSET_KINDS),
  media_type: z.enum(ASSET_MEDIA_TYPES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_frames: z.number().int().positive().optional(),
  fps: z.number().int().positive().optional(),
  codec: z.string().min(1).optional(),
  pix_fmt: z.string().min(1).optional(),
}).strict();
export type PinnedInsertAsset = z.infer<typeof pinnedInsertAsset>;

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
    }).optional().describe("Text-anchored image or video inserts over full narration, each covering cover_words spoken words from its anchor; " +
      "requires long-form qualification on the server, 1080p and explicit broll_policy=anyone. Captions draw over inserts."),
  overlays: z.array(ugcOverlay).min(1).max(MAX_OVERLAYS).optional()
    .describe("Text-anchored images or videos over the visible presenter, in a corner or a band at the top or bottom. At most 2 on screen at once, " +
      "and two on screen together need positions that do not share a corner. Captions move to the middle or bottom third when an overlay " +
      "meets them, never up over the face, and hide while neither is free. An overlay is not drawn while a full-frame insert is on screen. Same requirements as inserts: script, " +
      "long-form qualification on the server, 1080p and explicit broll_policy=anyone. The presenter stays on screen, so the price does not change."),
  layout_windows: z.array(ugcLayoutWindow).min(1).max(MAX_LAYOUT_WINDOWS).optional()
    .describe("Text-anchored reframings of the presenter: split (9:16 only) or card. Windows may not overlap one another or an insert. " +
      "Same requirements as inserts. A covered or blurred presenter is still delivered vendor work and is billed as face time."),
  templates: z.array(ugcTemplate).min(1).max(MAX_TEMPLATES).optional().describe(TEMPLATES_DESCRIPTION),
  template_theme: templateTheme.optional().describe("The look of every template in the run: a preset and an optional accent; only with templates."),
  template_sounds: templateSounds.optional(),
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
        `gender (female: sarah, male: george; on ${GOOGLE_TTS_MODEL}: ${MODEL_DEFAULT_VOICE_BY_GENDER.female} and ` +
        `${MODEL_DEFAULT_VOICE_BY_GENDER.male}). Refused with actor_id (its gender is known) and without ` +
        "image. An explicit voice or voice_id wins and the response warns that actor_gender changed nothing.",
    ),
  character: z.string().regex(/^char_[a-zA-Z0-9]+$/).optional(),
  name: z.string().max(100).optional(),
  broll_url: z.string().url().max(MAX_URL_LENGTH).optional(),
  broll_policy: brollPolicy.optional(),
  captions: z.boolean().default(false).describe(
    "Burn word-timed captions into the video, over the presenter and over inserts. Not available with segments.",
  ),
  caption_style: z.enum(CAPTION_STYLES).default("hormozi").describe(CAPTION_STYLE_DESCRIPTION),
  caption_emphasis: z.array(captionEmphasisItem)
    .min(1).max(MAX_CAPTION_EMPHASIS).optional().describe(
      "Key words or short phrases to emphasise, each quoted from script and matched as an insert quote is (case and punctuation " +
      "ignored). An item is the quote, or { quote, look }: look punch shows a small lead-in line from the same sentence over the " +
      "quote as a large glowing keyword, look pill shows the quote alone in a rounded pill, look color shows it in the accent " +
      "colour at the same size. Without a look, punch draws punch, hormozi draws color, and other presets draw the quote larger " +
      "in their highlight colour. Every occurrence is emphasised. Requires " +
      "captions=true and script; a quote absent from script is refused before any charge.",
    ),
  caption_mode: z.enum(CAPTION_MODES).optional().describe(
    "full (default when omitted): every spoken word is captioned. highlights: captions appear only around caption_emphasis " +
    "quotes (lead-in, quote, short tail) and nowhere else; requires caption_emphasis. In both modes captions are hidden while a " +
    "full-frame insert is on screen or a template meets their band.",
  ),
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
        `${MODEL_VOICE_MODEL} speaks only its own voices (kind model_voice in list_voices, such as ` +
        `${MODEL_DEFAULT_VOICE_BY_GENDER.female}): naming one selects that model, and a voice is refused with a ` +
        "tts_model that does not speak it, before any charge. " +
        "Mutually exclusive with voice_id.",
    ),
  voice_id: z
    .string({ error: "voice_id must be a vendor voice id, as a string" })
    .regex(VOICE_ID_PATTERN, "voice_id is not a vendor voice id: 16 to 32 letters and digits")
    .optional()
    .describe(
      "Raw vendor voice id (16–32 letters and digits) for a voice outside the catalog. Checked " +
        `lazily: an unknown id fails the run, not the request. Refused with tts_model=${GOOGLE_TTS_MODEL}. ` +
        "Mutually exclusive with voice.",
    ),
  tts_model: z
    .enum(TTS_MODELS)
    .optional()
    .describe(
      `Speech model: ${TTS_MODELS.join(" | ")}. Omitted means the model of the chosen voice ` +
        `(list_voices shows it): ${RUSSIAN_TTS_MODEL} for the Russian presets and for catalog voices named ru_*, ` +
        `${MODEL_VOICE_MODEL} for its own voices, ` +
        `${DEFAULT_TTS_MODEL} for every other preset and catalog voice. A raw voice_id speaks ${RUSSIAN_TTS_MODEL} ` +
        `when the script is mostly Cyrillic and ${DEFAULT_TTS_MODEL} otherwise. An explicit tts_model always wins. ` +
        `eleven_v4, eleven_v3 and ${GOOGLE_TTS_MODEL} read stress marks ` +
        "(a capital vowel inside a Russian word, \"потОм\", becomes one; see script); " +
        "eleven_flash_v2_5 and eleven_turbo_v2_5 are cheaper alternatives for languages other than " +
        `Russian. ${GOOGLE_TTS_MODEL} speaks only its own voices (list_voices with model=${GOOGLE_TTS_MODEL}; without ` +
        `voice, ${MODEL_DEFAULT_VOICE_BY_GENDER.female} for a female actor and ${MODEL_DEFAULT_VOICE_BY_GENDER.male} otherwise) ` +
        "and returns no word timings: a preset or catalog voice, voice_id, captions=true, " +
        "segments and inserts are refused with it before any charge. Audio tags in square brackets are an " +
        "eleven_v3 and eleven_v4 convention and are not measured on it. " + SCRIPT_LENGTH_DESCRIPTION,
    ),
  webhook_url: z.string().url().max(MAX_URL_LENGTH).optional(),
  /** Removed visible label (clipwright#488). The key stays in the shape so that the refusal */
  /** names its reason instead of answering `unknown_field`. */
  disclosure_overlay: z.boolean().optional(),
  visible_ai_label: z.boolean().optional().describe(
    "Visible AI label for newly marked presenter videos, including long form; defaults to true in the server admission policy. " +
    "False hides only the visible label and does not disable invisible marking or signed provenance. " +
    "Historical outputs are unchanged.",
  ),
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
  .superRefine((v, context) => {
    if (v.overlays === undefined && v.layout_windows === undefined) return;
    if (v.script === undefined || v.segments !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [v.overlays === undefined ? "layout_windows" : "overlays"],
        message: "overlays and layout_windows require script and cannot be combined with segments" });
      return;
    }
    for (const refusal of layerRefusals({ ...v, script: v.script })) context.addIssue({ code: z.ZodIssueCode.custom, ...refusal });
  })
  // Template refusals sit in the schema, so REST, quote_ugc and MCP refuse alike before any hold (D4, A9).
  .superRefine((v, context) => {
    for (const refusal of templateRefusals(v)) context.addIssue({ code: z.ZodIssueCode.custom, ...refusal });
  })
  .refine(v => !v.captions || v.segments === undefined, {
    path: ["captions"], message: "captions are not available with segments: pass script, with inserts for cutaways, or captions=false",
  })
  .superRefine((v, context) => {
    if (v.caption_mode === "highlights" && (!v.captions || v.caption_emphasis === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["caption_mode"],
        message: "caption_mode=highlights requires captions=true and caption_emphasis: highlights are drawn only around the quotes you emphasise" });
    }
    if (v.caption_emphasis === undefined) return;
    if (!v.captions || v.script === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["caption_emphasis"],
        message: "caption_emphasis requires captions=true and script: it marks words of the burned captions" });
      return;
    }
    const tokens = lexicalTokens(v.script);
    for (const [index, item] of v.caption_emphasis.entries()) {
      const { quote } = captionEmphasisOf(item);
      if (quoteOccurrences(tokens, quote).length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["caption_emphasis", index],
          message: `caption_emphasis "${quote}" does not occur in script: quote words exactly as the script spells them` });
      }
    }
  })
  .superRefine((v, context) => {
    for (const refusal of speechModelRefusals(v)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [refusal.field], message: refusal.message });
    }
  })
  // The character cap depends on the model; refused here, before any reserve or vendor call.
  // Only the server knows the model of a voice unknown to the client, and checks it there.
  .refine(
    // The client does not know an `actor_id`'s gender; today's preset models do not depend on it.
    (v) => modelUnknownToClient(v) || speechTextRefusal(v) === undefined,
    {
    path: ["script"],
    error: (issue) => speechTextRefusal(issue.input as SpeechTextInput)!,
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

type SpeechTextInput = SpokenTextInput &
  Omit<Parameters<typeof resolveTtsModel>[0], "script"> & { actor_gender?: "female" | "male" | undefined };

/** Why the run's model refuses the text: the cap on the whole of it, then each spoken unit */
/** left with no words. The model is read from the joined text, as the worker reads it. */
function speechTextRefusal(input: SpeechTextInput): string | undefined {
  const text = spokenTextOf(input);
  const model = resolveTtsModel({ ...input, script: text }, input.actor_gender);
  return ttsScriptLimitError(text, model) ?? spokenUnitsOf(input).map((unit) => cutToNothingError(unit, model)).find(Boolean);
}

function modelUnknownToClient(v: { voice?: string | undefined; tts_model?: string | undefined }): boolean {
  return v.tts_model === undefined && v.voice !== undefined && !isVoicePresetName(v.voice) && !isModelVoiceName(v.voice);
}

export interface SpeechModelRefusal {
  field: "voice" | "voice_id" | "captions" | "segments" | "inserts" | "overlays" | "layout_windows";
  message: string;
}

/** What a model with its own voices and no word timings refuses, each line naming what to pass instead. */
/** One list for the input schema and for the worker's check before its first paid step. */
export function speechModelRefusals(input: {
  tts_model?: string | undefined;
  voice?: string | undefined;
  voice_id?: string | undefined;
  captions?: boolean | undefined;
  segments?: unknown;
  inserts?: unknown;
  overlays?: unknown;
  layout_windows?: unknown;
}): SpeechModelRefusal[] {
  // The model the voice name selects, by the function quote and the worker call; a script never decides it.
  const model = input.tts_model ?? resolveTtsModel({ voice: input.voice, script: "" });
  const ownVoice = input.voice !== undefined && isModelVoiceName(input.voice);
  if (!speaksOwnVoices(model)) {
    if (!ownVoice) return [];
    return [{
      field: "voice",
      message: `voice "${input.voice}" is a voice of ${MODEL_VOICE_MODEL} and is not spoken by ${model}: omit tts_model to speak it ` +
        `with ${MODEL_VOICE_MODEL}, or choose a voice from list_voices with model=${model}`,
    }];
  }
  const ownVoices = `from list_voices with model=${model}`;
  const defaultVoice = "to get the model's default voice for the actor's gender";
  // With tts_model named too, a voice of another model alone would be refused against that tts_model.
  const dropModel = input.tts_model === undefined ? "" : " and omit tts_model";
  const otherModel = ownVoice ? `or choose a voice of another speech model from list_voices${dropModel}` : "or choose another tts_model";
  const candidates: [SpeechModelRefusal["field"], boolean, string][] = [
    ["voice", input.voice !== undefined && !ownVoice,
      `voice "${input.voice}" is not spoken by ${model}: choose one of its voices ${ownVoices}, omit voice ${defaultVoice}, ${otherModel}`],
    ["voice_id", input.voice_id !== undefined,
      `voice_id is not accepted with ${model}: pass voice with a name ${ownVoices}, omit voice_id ${defaultVoice}, ${otherModel}`],
    ["captions", input.captions === true,
      `captions are not available with ${model}: it returns no word timings; pass captions=false`],
    ["segments", input.segments !== undefined,
      `segments are not available with ${model}: pass script for a single take, ${otherModel}`],
    ["inserts", input.inserts !== undefined,
      `inserts are not available with ${model}: it returns no word timings to anchor them; omit inserts, ${otherModel}`],
    ["overlays", input.overlays !== undefined,
      `overlays are not available with ${model}: it returns no word timings to anchor them; omit overlays, ${otherModel}`],
    ["layout_windows", input.layout_windows !== undefined,
      `layout_windows are not available with ${model}: it returns no word timings to anchor them; omit layout_windows, ${otherModel}`],
  ];
  return candidates.filter(([, refused]) => refused).map(([field, , message]) => ({ field, message }));
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
        speechTextRefusal(v) === undefined,
      {
        path: ["script"],
        error: (issue) => speechTextRefusal(issue.input as SpeechTextInput)!,
      },
    );
}

/** A stored run input already passed admission; a model or cap change must not make an */
/** old run unreadable. The snapshot keeps the actor's gender. */
export const storedUgcInput = z.object({
  ...makeUgcInputShape,
  tts_model: z.string().optional(),
  actor_snapshot: z.object({ gender: z.enum(["female", "male"]).optional() }).optional(),
  insert_assets: z.array(pinnedInsertAsset).min(1).max(MAX_INSERTS + MAX_OVERLAYS + MAX_LAYOUT_WINDOWS + MAX_TEMPLATE_MEDIA).optional(),
  composition_version: z.literal(UGC_COMPOSITION_VERSION).optional(),
});

/** Whether a run takes the narrated long-form path: one script with inserts, overlays or layout windows. */
export function isNarratedUgcInput(input: { segments?: unknown; inserts?: unknown; overlays?: unknown; layout_windows?: unknown }): boolean {
  return input.segments === undefined && (input.inserts !== undefined || input.overlays !== undefined || input.layout_windows !== undefined);
}

/** The pinned asset of an `asset_id` insert, overlay, layout window or template slot in a stored input; a public input has none. */
export function pinnedInsertAssetOf(input: object, insertId: string, slot?: string): PinnedInsertAsset | undefined {
  const pinned = (input as { insert_assets?: readonly PinnedInsertAsset[] }).insert_assets;
  return pinned?.find(asset => asset.insert_id === insertId && asset.slot === slot);
}

/** The minimum the spoken text is derived from: the script itself or the segments. */
export interface SpokenTextInput {
  script?: string | undefined;
  segments?: readonly UgcSegment[] | undefined;
}

/** What the worker voices apart: the script, or each actor segment's line. */
function spokenUnitsOf(input: SpokenTextInput): string[] {
  if (input.script !== undefined) return [input.script];
  return (input.segments ?? [])
    .filter((segment) => segment.kind === "actor")
    .map((segment) => segment.script ?? "");
}

/** Joins the spoken text without checks: the shared base for gates and the helper. */
function spokenTextOf(input: SpokenTextInput): string {
  return spokenUnitsOf(input).join(" ");
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

/** A plain run's tariff: 30 credits per second of finished video, known by the absence of `run_billing_terms` (#840 D2). */
export const UGC_PER_SECOND_TARIFF = "ugc-per-second-v1";

export const quoteResponse = z.object({
  long_form_pricing: longFormQuoteSchema.optional(),
  /** The tariff the run is admitted at: `ugc-per-second-v1`, or long form's `pricingVersion` (#840 D3). A string, not an enum: a */
  /** tariff the client does not know yet must not break `quote`; optional, so a quote stored before it still reads. */
  tariff: z.string().min(1).max(200).optional(),
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
  /** A string, not an enum: a model the client does not know yet must not break `quote`. */
  tts_model: z.string().min(1),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;
