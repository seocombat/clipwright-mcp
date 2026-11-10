import { z } from "zod";
import { makeUgcInputShape, mcpCaptionPlace, mcpLiveShots, mcpPresenterGaze, mcpPresenterPlace, mcpUgcCall, mcpUgcInterview, mcpUgcOverlay, mcpUgcScene,
  mcpUgcTemplate } from "./skills.js";
import { MCP_UGC_DESCRIPTIONS } from "./mcp-ugc-descriptions.js";
import { interviewWarnings } from "./ugc-interview.js";
import { MAX_TEMPLATES, mcpTemplateSounds, templateFaceWarnings, templateMediaOf, templateSceneItems, templateSizeWarnings, type TemplateItem } from "./templates/index.js";
import { framingWarnings } from "./ugc-framing.js";
import { MAX_OVERLAYS, placeWarnings } from "./ugc-layers.js";
import { callWarnings } from "./ugc-call.js";
import { BROLL_POLICY_DESCRIPTION } from "./broll-policy.js";
import { mcpDesign } from "./design.js";
import { isMusicEnabled, MUSIC_DISABLED_MESSAGE } from "./music.js";
import { MAX_SCENES, SCENES_DISABLED_MESSAGE } from "./ugc-scenes.js";
import { MOTION_STYLE_UNUSED_WARNING, motionStyleAsked, motionStyleHasCanvas } from "./motion-styles.js";
import { AD_PAUSE_TRIM_WARNING } from "./ad-pause-trim.js";

/** Disposition registry for `make_ugc` input fields: every field must have a recorded */
/** decision. The type guards completeness; tests at each effect boundary prove truth. */

/** Public header/quote version: optional visible_ai_label and new-run marking admission policy. */
/** Internal marking policy/profile identifiers are versioned separately. */
export const CONTRACT_VERSION = "2026-10-18";
export const CONTRACT_VERSION_HEADER = "X-Clipwright-Contract";

/** An explicit `broll_policy` on a run that shows none of the customer's media. */
export const BROLL_UNUSED_WARNING = "broll_policy has no effect on this video: it shows none of your media";

export const DESIGN_UNUSED_WARNING = "design has no effect on this video: it has no templates and no captions to draw in it";

/** The customer's media `broll_policy` lets in: segments, inserts, overlays, windows and template pictures. */
function carriesCustomerMedia(input: Readonly<Record<string, unknown>>): boolean {
  const listed = (field: string) => Array.isArray(input[field]) && (input[field] as unknown[]).length > 0;
  return listed("inserts") || listed("overlays") || listed("layout_windows") ||
    (Array.isArray(input.segments) && input.segments.some(segment => (segment as { kind?: unknown }).kind === "media")) ||
    (Array.isArray(input.templates) && templateMediaOf(input.templates as TemplateItem[]).length > 0);
}

/** `implemented`: reaches the vendor, composition tree, or final output processing; `rejected`: 400 before any run or reserve; */
/** `warned`: accepted with a `warnings[]` entry. `triggersWhen` keeps defaulted fields quiet on the happy path. */
export type Disposition =
  | { kind: "stored"; message: string; warning: string } // Gates the customer's media; `warning` only on a run without it (#1047).
  | { kind: "implemented"; provenBy: "egress" | "composition" | "finalization" | "admission" }
  | { kind: "rejected"; message: string }
  | {
      kind: "warned";
      warning: string;
      triggersWhen: "present" | "differs-from-default";
    };

/** `satisfies` guards completeness; `as const` keeps literal types, from which the rejected */
/** set is derived below instead of being listed by hand. */
export const FIELD_DISPOSITIONS = {
  script: { kind: "implemented", provenBy: "egress" },
  voice: { kind: "implemented", provenBy: "egress" },
  voice_id: { kind: "implemented", provenBy: "egress" },
  tts_model: { kind: "implemented", provenBy: "egress" },
  // Speed models get it as speed; eleven_v4 drops it and Gemini gets a style hint, both with a warning (#890; egress tests).
  voice_pace: { kind: "implemented", provenBy: "egress" },
  // The trimmed take is what the avatar vendor receives; a skipped joint or a take without timings is named in warnings[].
  pause_trim: { kind: "implemented", provenBy: "egress" },

  // Fields that do not reach the render and are reported as not honored.
  person: {
    kind: "warned",
    warning:
      "person is not honored yet: this request uses the default actor; choose actor_id from list_actors or provide image to select a different face",
    triggersWhen: "present",
  },
  name: {
    kind: "warned",
    warning: "name is not honored yet: it does not reach the renderer",
    triggersWhen: "present",
  },
  look: {
    kind: "warned",
    warning: "look is not honored yet: it does not reach the renderer",
    triggersWhen: "differs-from-default",
  },
  // Drawn by composition; with composition off the run names the undrawn captions in its warnings.
  captions: { kind: "implemented", provenBy: "composition" },
  caption_style: { kind: "implemented", provenBy: "composition" },
  caption_emphasis: { kind: "implemented", provenBy: "composition" },
  caption_mode: { kind: "implemented", provenBy: "composition" },
  caption_position: { kind: "implemented", provenBy: "composition" },
  // Pinned captions: overlays never move them (#973 S2).
  caption_place: { kind: "implemented", provenBy: "composition" },
  // Frames the actor's portrait before the vendor; a face it cannot reach is named in warnings[] (#973 S2b).
  presenter_place: { kind: "implemented", provenBy: "egress" },

  // Both reach the vendor from the request; egress tests require each offered resolution
  // to produce its own request body.
  resolution: { kind: "implemented", provenBy: "egress" },
  aspect_ratio: { kind: "implemented", provenBy: "egress" },

  // Gated by `CLIPWRIGHT_REMOTE_FETCH`: `resolveDispositions` rejects it when the flag is off.
  image: { kind: "implemented", provenBy: "egress" },
  actor_id: { kind: "implemented", provenBy: "egress" },
  // Picks the actor's wide view for the vendor; a request without one renders close and says so in warnings[] (#884 S5d).
  presenter_framing: { kind: "implemented", provenBy: "egress" },
  // Picks the actor's view with a handheld mic the same way.
  presenter_mic: { kind: "implemented", provenBy: "egress" },
  actor_gender: { kind: "implemented", provenBy: "egress" },
  broll_policy: { kind: "stored", message: BROLL_POLICY_DESCRIPTION, warning: BROLL_UNUSED_WARNING },

  // Offered to clients; long-form qualification gates admission below.
  segments: { kind: "implemented", provenBy: "composition" },
  inserts: { kind: "implemented", provenBy: "composition" },
  overlays: { kind: "implemented", provenBy: "composition" },
  layout_windows: { kind: "implemented", provenBy: "composition" },
  framing: { kind: "implemented", provenBy: "composition" },
  templates: { kind: "implemented", provenBy: "composition" },
  template_theme: { kind: "implemented", provenBy: "composition" },
  // The run's DNA (#1122): the templates' look, the end card and the caption accent.
  design: { kind: "implemented", provenBy: "composition" },
  template_sounds: { kind: "implemented", provenBy: "composition" },
  // Authored for the run, checked and drawn beside templates; one that fails is left out and named (#1107), gated by its switch.
  scenes: { kind: "implemented", provenBy: "composition" },
  // Captions, templates and scenes drawn in the style, words switched with the style's cut (#1123), gated by its switch.
  motion_style: { kind: "implemented", provenBy: "composition" },
  // Catalogue moves (#1175): admission turns each into the layer above that draws it, or names it in warnings[]; the render sees only those layers.
  moves: { kind: "implemented", provenBy: "admission" },
  edit_sounds: { kind: "implemented", provenBy: "composition" },
  // Mixed under the voice before marking, gated by its switch; a delivered video without it names why (#1063).
  music: { kind: "implemented", provenBy: "finalization" },
  // Mixed into the narration and rung by the phone over the hold (#857 S5).
  call: { kind: "implemented", provenBy: "composition" },
  // One conversation voiced, the presenter frozen over the off-screen lines and captioned by speaker (#972).
  interview: { kind: "implemented", provenBy: "composition" },
  // Picks the actor's view with that gaze for each take (#972).
  presenter_gaze: { kind: "implemented", provenBy: "egress" },
  // The last frame held after the last word, the presenter frozen under the layers then on screen (#991).
  end_hold_s: { kind: "implemented", provenBy: "composition" },
  // Each shot drawn by its kind's engine and cut into the timeline as an actor take (#1103), gated by its switch.
  shots: { kind: "implemented", provenBy: "composition" },
  product_asset_id: { kind: "implemented", provenBy: "composition" },
  character: {
    kind: "rejected",
    message:
      "character is not supported: saved characters do not exist yet. Describe the actor with `person` instead, or omit it to use the default actor",
  },
  broll_url: {
    kind: "rejected",
    message:
      "broll_url is not supported yet: b-roll requires segmented composition. Omit it",
  },
  // The visible label is gone (clipwright#488); the refusal says where the disclosure lives.
  disclosure_overlay: {
    kind: "rejected",
    message:
      "disclosure_overlay is not supported: the visible label was removed. The output is still marked in the run contract and in the file metadata; label the publication with the platform's own control",
  },
  // Applied to the completed video before the invisible mark and C2PA signature.
  visible_ai_label: { kind: "implemented", provenBy: "finalization" },
  // Applied by composition and gated by `CLIPWRIGHT_COMPOSE`, like `image` is gated
  // by `CLIPWRIGHT_REMOTE_FETCH`.
  background: { kind: "implemented", provenBy: "composition" },

  // Only a synchronous refusal reaches the caller: a subscriber stops polling, and
  // `warnings[]` arrive through the very `get_run` channel it abandoned.
  webhook_url: {
    kind: "rejected",
    message:
      "webhook_url is not supported: no webhook is ever delivered. Poll get_run with the run_id instead",
  },
} as const satisfies Record<keyof typeof makeUgcInputShape, Disposition>;

/** `make_faceless` fields refused by name: its input schema keeps the key and answers with this reason. */
export const FACELESS_REJECTED_FIELDS = {
  voice_id: {
    kind: "rejected",
    message:
      "voice_id is not accepted by make_faceless: pass voice with a name from list_voices (skill=make_faceless), " +
      "or omit both for the default voice",
  },
} as const satisfies Record<string, Extract<Disposition, { kind: "rejected" }>>;

export type ContractField = keyof typeof FIELD_DISPOSITIONS;

/** Input fields in shape declaration order: a deterministic walk of the registry. */
const CONTRACT_FIELDS = Object.keys(makeUgcInputShape) as ContractField[];

/** Operational switches that change a field's disposition without a code change. A disabled */
/** switch must reject the field, not accept and ignore it. */
export interface ContractFlags {
  remoteFetch: boolean;
  /** Composition stage (`CLIPWRIGHT_COMPOSE`). */
  compose: boolean;
  /** Personal actor generation; absent means off. */
  actorGeneration?: boolean;
  longForm?: boolean;
  outputMarking?: boolean;
  /** Music under the voice; absent means off. */
  music?: boolean;
  /** Live shots (#1103); absent means off. */
  liveShots?: boolean;
  /** Scenes made for the run (#1107); absent means off. */
  scenes?: boolean;
  /** Motion styles (#1123); absent means off. */
  motionStyles?: boolean;
}

/** Motion styles have their own switch and draw only where composition does (#1123). */
export function isMotionStylesEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_MOTION_STYLES === "1" && env.CLIPWRIGHT_COMPOSE === "1";
}
export const MOTION_STYLES_DISABLED_MESSAGE = "motion_style is not available right now; omit motion_style";

/** Scenes ride on long-form and have their own switch (#1107). */
export function isScenesEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_SCENES === "1" && isLongFormQualificationEnabled(env);
}

/** Live shots ride on long-form and have their own switch (#1103). */
export function isLiveShotsEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_LIVE_SHOTS === "1" && isLongFormQualificationEnabled(env);
}
export const LIVE_SHOTS_DISABLED_MESSAGE = "shots are not available right now; omit shots and product_asset_id";

/** `create_actor` is open only with the fetch surface: a personal actor cannot render without it. */
export function isActorGenerationEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_ACTOR_GENERATION === "1" && env.CLIPWRIGHT_REMOTE_FETCH === "1";
}

/** An actor derived from an actor (#898) rides on generation and has its own switch. */
export function isActorViewsEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_ACTOR_VIEWS === "1" && isActorGenerationEnabled(env);
}

/** `create_actor` builds a face from words, so with generation on the advice points there. */
const PERSON_WITH_ACTOR_GENERATION: Disposition = {
  kind: "warned",
  warning:
    "person is not honored: this request uses the default actor; create a personal actor from the description with create_actor, then pass its actor_id",
  triggersWhen: "present",
};

/** Flags from the environment, read once per process: a flag changes only on restart, */
/** and `tools/list` must not flicker between calls. */
export function contractFlagsFromEnv(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): ContractFlags {
  return {
    remoteFetch: env.CLIPWRIGHT_REMOTE_FETCH === "1",
    compose: env.CLIPWRIGHT_COMPOSE === "1",
    longForm: isLongFormQualificationEnabled(env),
    ...(env.CLIPWRIGHT_OUTPUT_MARKING === "1" ? { outputMarking: true } : {}),
    ...(isMusicEnabled(env) ? { music: true } : {}),
    ...(isLiveShotsEnabled(env) ? { liveShots: true } : {}),
    ...(isScenesEnabled(env) ? { scenes: true } : {}),
    ...(isMotionStylesEnabled(env) ? { motionStyles: true } : {}),
  };
}

export function isLongFormQualificationEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_LONG_FORM_QUALIFICATION === "1" &&
    env.CLIPWRIGHT_COMPOSE === "1" && env.CLIPWRIGHT_REMOTE_FETCH === "1";
}

export const LONG_FORM_DISABLED_MESSAGE =
  "long-form qualification is not available right now; pass script without segments or inserts";

const REMOTE_FETCH_DISABLED: Disposition = {
  kind: "rejected",
  message:
    "image is temporarily disabled (remote media fetch is off); omit it to render with the default actor",
};

/** Refusal for `background` when the composition stage is off. */
const COMPOSE_DISABLED: Disposition = {
  kind: "rejected",
  message:
    "background is not available right now. Request an aspect_ratio close to your image instead",
};

/** A run stored before captions were drawn (no `composition_version`) keeps the lines it was admitted with. */
export function legacyCaptionWarnings(input: { captions?: boolean | undefined; caption_style?: string | undefined }): string[] {
  return [
    ...(input.captions === true ? ["captions requested but not rendered in this prototype (stage-B)"] : []),
    ...(input.caption_style !== undefined && input.caption_style !== "hormozi"
      ? ["caption_style is not honored: captions are not rendered in this prototype (stage-B)"] : []),
  ];
}

/** Captions a version-2 run asked for and could not draw with composition off; written by the run. */
export const CAPTIONS_COMPOSE_DISABLED_WARNING = "captions were not drawn: composition is not available right now";

/** The composition-only parts a run asked for (#778 S2b): a render without composition names them instead of dropping them. */
export function compositionLayerFields(input: {
  overlays?: unknown; layout_windows?: unknown; framing?: unknown; templates?: unknown; scenes?: unknown; motion_style?: unknown;
  inserts?: readonly { transition?: string | undefined; retime?: unknown }[] | undefined;
  caption_emphasis?: readonly (string | { punch_in?: boolean | undefined })[] | undefined; edit_sounds?: boolean | undefined;
}): string[] {
  return [
    ...(input.overlays !== undefined ? ["overlays"] : []),
    ...(input.layout_windows !== undefined ? ["layout_windows"] : []),
    ...(input.framing !== undefined ? ["framing"] : []),
    ...(input.templates !== undefined ? ["templates"] : []),
    ...(input.scenes !== undefined ? ["scenes"] : []),
    ...(input.motion_style !== undefined ? ["motion_style"] : []),
    ...(input.inserts?.some(insert => insert.transition !== undefined && insert.transition !== "cut") ? ["transition"] : []),
    ...(input.inserts?.some(insert => insert.retime !== undefined) ? ["retime"] : []),
    ...(input.caption_emphasis?.some(item => typeof item !== "string" && item.punch_in === true) ? ["punch_in"] : []),
    ...(input.edit_sounds === true ? ["edit_sounds"] : []),
  ];
}

/** The warning that names undrawn composition-only parts, or none. */
export function compositionLayersNotDrawnWarnings(input: Parameters<typeof compositionLayerFields>[0], reason: string): string[] {
  const fields = compositionLayerFields(input);
  return fields.length ? [`${fields.join(", ")} ${fields.length === 1 ? "was" : "were"} not drawn: ${reason}`] : [];
}

/** Long-form prerequisites in ONE expression for all its fields: two copies could */
/** open `segments` while `inserts` stay closed. */
function longFormReady(flags: ContractFlags): boolean {
  return flags.longForm === true && flags.remoteFetch && flags.compose;
}

const LONG_FORM_DISABLED: Disposition = { kind: "rejected", message: LONG_FORM_DISABLED_MESSAGE };
/** Templates draw on a plain run too, so their refusal names them and not the long-form fix (#840 D6). */
const TEMPLATES_DISABLED: Disposition = { kind: "rejected",
  message: "templates are not available right now; omit templates, template_theme and template_sounds" };

/** Dispositions with flags applied: the base table says what the code can do, this */
/** says what it offers right now. */
export function resolveDispositions(
  flags: ContractFlags,
): Record<ContractField, Disposition> {
  const longForm = longFormReady(flags);
  return {
    ...FIELD_DISPOSITIONS,
    segments: longForm ? FIELD_DISPOSITIONS.segments : LONG_FORM_DISABLED,
    inserts: longForm ? FIELD_DISPOSITIONS.inserts : LONG_FORM_DISABLED,
    overlays: longForm ? FIELD_DISPOSITIONS.overlays : LONG_FORM_DISABLED,
    layout_windows: longForm ? FIELD_DISPOSITIONS.layout_windows : LONG_FORM_DISABLED,
    framing: longForm ? FIELD_DISPOSITIONS.framing : LONG_FORM_DISABLED,
    templates: longForm ? FIELD_DISPOSITIONS.templates : TEMPLATES_DISABLED,
    template_theme: longForm ? FIELD_DISPOSITIONS.template_theme : TEMPLATES_DISABLED,
    template_sounds: longForm ? FIELD_DISPOSITIONS.template_sounds : TEMPLATES_DISABLED,
    scenes: longForm && flags.scenes === true ? FIELD_DISPOSITIONS.scenes : { kind: "rejected", message: SCENES_DISABLED_MESSAGE },
    motion_style: flags.compose && flags.motionStyles === true ? FIELD_DISPOSITIONS.motion_style
      : { kind: "rejected", message: MOTION_STYLES_DISABLED_MESSAGE },
    edit_sounds: longForm ? FIELD_DISPOSITIONS.edit_sounds : LONG_FORM_DISABLED,
    call: longForm ? FIELD_DISPOSITIONS.call : LONG_FORM_DISABLED,
    interview: longForm ? FIELD_DISPOSITIONS.interview : LONG_FORM_DISABLED,
    presenter_gaze: longForm ? FIELD_DISPOSITIONS.presenter_gaze : LONG_FORM_DISABLED,
    end_hold_s: longForm ? FIELD_DISPOSITIONS.end_hold_s : LONG_FORM_DISABLED,
    shots: longForm && flags.liveShots === true ? FIELD_DISPOSITIONS.shots : { kind: "rejected", message: LIVE_SHOTS_DISABLED_MESSAGE },
    product_asset_id: longForm && flags.liveShots === true ? FIELD_DISPOSITIONS.product_asset_id
      : { kind: "rejected", message: LIVE_SHOTS_DISABLED_MESSAGE },
    person: flags.actorGeneration === true ? PERSON_WITH_ACTOR_GENERATION : FIELD_DISPOSITIONS.person,
    image: flags.remoteFetch ? FIELD_DISPOSITIONS.image : REMOTE_FETCH_DISABLED,
    actor_id: flags.remoteFetch ? FIELD_DISPOSITIONS.actor_id : {
      kind: "rejected", message: "actor_id is temporarily disabled (remote media fetch is off); omit it to use the default actor",
    },
    // A face hint for `image` means nothing without `image`, so it switches off with it.
    actor_gender: flags.remoteFetch ? FIELD_DISPOSITIONS.actor_gender : {
      kind: "rejected", message: "actor_gender is temporarily disabled together with image (remote media fetch is off); omit both to use the default actor",
    },
    // With composition off nothing can apply a background, so the field is rejected.
    background: flags.compose ? FIELD_DISPOSITIONS.background : COMPOSE_DISABLED,
    visible_ai_label: flags.outputMarking === true ? FIELD_DISPOSITIONS.visible_ai_label : {
      kind: "rejected", message: "visible_ai_label is not available right now; omit it",
    },
    music: flags.music === true ? FIELD_DISPOSITIONS.music : { kind: "rejected", message: MUSIC_DISABLED_MESSAGE },
  };
}

/** The process's effective table, from which every surface is built: `FIELD_DISPOSITIONS` */
/** with the flags applied. */
export const EFFECTIVE_DISPOSITIONS = resolveDispositions({
  ...contractFlagsFromEnv(),
  actorGeneration: isActorGenerationEnabled(),
});

type RejectedField = {
  [K in ContractField]: (typeof FIELD_DISPOSITIONS)[K]["kind"] extends "rejected"
    ? K
    : never;
}[ContractField];

/** Offered fields come from the base table, in types and values alike: a field switched off */
/** is a temporary state, not the shape of the contract. */
type OfferedField = Exclude<ContractField, RejectedField>;

/** A field's default, taken from the schema itself: a second list of defaults would drift. */
const FIELD_DEFAULTS: Partial<Record<ContractField, unknown>> = Object.fromEntries(
  CONTRACT_FIELDS.map((field) => {
    const parsed = makeUgcInputShape[field].safeParse(undefined);
    return [field, parsed.success ? parsed.data : undefined];
  }),
);

/** Disposition note for the JSON Schema `description`, from the base table: the schema */
/** belongs to the client, the flags to the server, whose 400 text names emergency refusals. */
export function dispositionNote(field: ContractField): string | null {
  return noteFor(FIELD_DISPOSITIONS[field]);
}

function noteFor(disposition: Disposition): string | null {
  if (disposition.kind === "stored") return disposition.message;
  if (disposition.kind === "rejected") {
    return `REJECTED: ${disposition.message}`;
  }
  if (disposition.kind === "warned") {
    return `NOT HONORED YET: ${disposition.warning}`;
  }
  return null;
}

function annotate<K extends ContractField>(field: K): (typeof makeUgcInputShape)[K] {
  const note = dispositionNote(field);
  const schema = makeUgcInputShape[field];
  return (note ? schema.describe(note) : schema) as (typeof makeUgcInputShape)[K];
}

// The MCP server runs on the user's machine, so its env is the client's. What is offered
// comes from the base table; what is accepted right now comes from the effective one.

/** Full input shape where every unhonored field carries its reason. For surfaces that list */
/** all fields; offer fields to callers from `offeredUgcInputShape` instead. */
export const annotatedUgcInputShape = Object.fromEntries(
  CONTRACT_FIELDS.map((field) => [field, annotate(field)]),
) as unknown as typeof makeUgcInputShape;

/** Offered input surface = full shape minus rejected fields, so no schema offers a field */
/** that then gets a 400. Derived from the registry, so one line moves a field. */
export const offeredUgcInputShape = Object.fromEntries(
  CONTRACT_FIELDS.filter(
    (field) => FIELD_DISPOSITIONS[field].kind !== "rejected",
  ).map((field) => [field, annotate(field)]),
) as unknown as Pick<typeof makeUgcInputShape, OfferedField>;

/** Input type for SDK/CLI/MCP, from the offered shape. Separate from `MakeUgcInput` (the */
/** `z.infer` output, where defaults are required) so callers need not fill every field. */
export const offeredUgcInput = z.object(offeredUgcInputShape);
export type MakeUgcInputArgs = z.input<typeof offeredUgcInput>;

type CompactField = keyof typeof MCP_UGC_DESCRIPTIONS;
const compactFields = Object.keys(MCP_UGC_DESCRIPTIONS) as CompactField[];
const compactlyDescribed = Object.fromEntries(compactFields
  .map((field) => [field, offeredUgcInputShape[field].describe(MCP_UGC_DESCRIPTIONS[field])])) as Pick<typeof offeredUgcInputShape, CompactField>;
/** A field's text, also when it sits on the schema an optional or a default wraps. */
export const fieldText = (schema: z.ZodType): string | undefined => {
  const inner = (schema._zod.def as unknown as { innerType?: z.ZodType }).innerType;
  return schema.description ?? (inner === undefined ? undefined : fieldText(inner));
};
/** The full texts quote_ugc says in shorter words; another tool's field with the same text needs none of its own. */
export const MCP_UGC_SHORTENED_TEXTS: readonly string[] = compactFields.map((field) => fieldText(offeredUgcInputShape[field]) ?? "");

/** The MCP offer: the same fields with the slim template and overlay items and shorter texts, which keep tools/list small (#778 S3, D3; #973 S1; #1045). */
export const mcpUgcInputShape = { ...offeredUgcInputShape, ...compactlyDescribed,
  overlays: z.array(mcpUgcOverlay).min(1).max(MAX_OVERLAYS).optional().describe(MCP_UGC_DESCRIPTIONS.overlays),
  templates: z.array(mcpUgcTemplate).min(1).max(MAX_TEMPLATES).optional().describe(MCP_UGC_DESCRIPTIONS.templates),
  scenes: z.array(mcpUgcScene).min(1).max(MAX_SCENES).optional().describe(fieldText(offeredUgcInputShape.scenes) ?? ""),
  template_sounds: mcpTemplateSounds.optional(), call: mcpUgcCall.optional(),
  caption_place: mcpCaptionPlace.optional(), presenter_place: mcpPresenterPlace.optional(),
  interview: mcpUgcInterview.optional(), presenter_gaze: mcpPresenterGaze.optional(), shots: mcpLiveShots.optional(),
  design: mcpDesign.optional().describe("Look of templates, end card, caption highlight; absent: brand kit; not with template_theme. " +
    "look, fonts: from brand_kit; palette #RRGGBB.") };

/** One rejected field found in the input: its name and the refusal reason. */
export interface RejectedFieldHit {
  field: ContractField;
  message: string;
}

/** Rejected fields present in the input. Called by the API (400 before a run or a */
/** reserve), by MCP and by the SDK. */
export function rejectedFields(
  input: Readonly<Record<string, unknown>>,
): RejectedFieldHit[] {
  const hits: RejectedFieldHit[] = [];
  for (const field of CONTRACT_FIELDS) {
    const disposition = EFFECTIVE_DISPOSITIONS[field];
    if (disposition.kind !== "rejected") continue;
    if (input[field] === undefined) continue;
    hits.push({ field, message: disposition.message });
  }
  return hits;
}

/** A body key outside the contract and the field it resembles, if any. */
export interface UnknownFieldHit {
  field: string;
  suggestion?: string | undefined;
}

const normalizedFieldName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fields offered to the client; rejected ones are not listed. */
export const ACCEPTED_UGC_FIELDS = Object.keys(offeredUgcInputShape);

/** Keys outside `fields` (the contract by default). Rejected contract fields are not */
/** included: `rejectedFields` names them with their reason. */
export function unknownFields(raw: unknown, fields: readonly string[] = CONTRACT_FIELDS): UnknownFieldHit[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const known = new Set<string>(fields);
  return Object.keys(raw)
    .filter((key) => !known.has(key))
    .map((field) => ({
      field,
      suggestion: fields.find(
        (candidate) => normalizedFieldName(candidate) === normalizedFieldName(field),
      ),
    }));
}

/** Registry warnings for a parsed run input; defaults are filled in, so `===` tells silence */
/** from an explicit different value. Dynamic warnings come from their own generators. */
export function dispositionWarnings(
  input: Readonly<Record<string, unknown>>,
): string[] {
  const warnings: string[] = [];
  for (const field of CONTRACT_FIELDS) {
    const disposition = EFFECTIVE_DISPOSITIONS[field];
    if (disposition.kind === "stored" && input[field] !== undefined && !carriesCustomerMedia(input)) {
      warnings.push(disposition.warning);
    }
    if (disposition.kind !== "warned") continue;

    const value = input[field];
    if (value === undefined) continue;
    if (
      disposition.triggersWhen === "differs-from-default" &&
      value === FIELD_DEFAULTS[field]
    ) {
      continue;
    }
    warnings.push(disposition.warning);
  }
  // A template asked onto the face is drawn there and named, on the quote, the run and its record alike (#778 S3).
  const scene = { templates: Array.isArray(input.templates) ? input.templates as TemplateItem[] : undefined,
    aspect_ratio: typeof input.aspect_ratio === "string" ? input.aspect_ratio : undefined };
  // A kit the account saved is not this video's request: only a design the call named is said to go unused.
  if (input.design !== undefined && input.design_source !== "brand_kit" && !(Array.isArray(input.templates) && input.templates.length > 0) && input.captions !== true) {
    warnings.push(DESIGN_UNUSED_WARNING);
  }
  // A style the call named (a kit's style is the account's, not this video's request) dresses only what is drawn (#1123).
  const styled = { motion_style: input.motion_style as Parameters<typeof motionStyleAsked>[0]["motion_style"],
    design: input.design_source === "brand_kit" ? undefined : input.design as { style?: undefined } | undefined };
  if (motionStyleAsked(styled) && !motionStyleHasCanvas({ captions: input.captions === true, templates: scene.templates,
    scenes: Array.isArray(input.scenes) ? input.scenes : undefined })) warnings.push(MOTION_STYLE_UNUSED_WARNING);
  if (input.pause_trim_source === "ad_default") warnings.push(AD_PAUSE_TRIM_WARNING);
  warnings.push(...templateFaceWarnings(input), ...templateSizeWarnings(input), ...framingWarnings(input), ...callWarnings(input),
    ...placeWarnings(input, framing => templateSceneItems(scene, framing)), ...interviewWarnings(input));
  return warnings;
}

/** Fields with an `implemented` disposition, input to the coverage meta-tests. From the */
/** base table: proof belongs to the code, and switching a field off does not revoke it. */
export const IMPLEMENTED_FIELDS: ContractField[] = CONTRACT_FIELDS.filter(
  (field) => FIELD_DISPOSITIONS[field].kind === "implemented",
);

/** Separate effect boundaries: outgoing vendor requests, composition trees, and final */
/** output processing each have their own behavior tests and coverage meta-test. */
export const EGRESS_PROVEN_FIELDS: ContractField[] = CONTRACT_FIELDS.filter((field) => {
  const disposition = FIELD_DISPOSITIONS[field];
  return disposition.kind === "implemented" && disposition.provenBy === "egress";
});

export const COMPOSITION_PROVEN_FIELDS: ContractField[] = CONTRACT_FIELDS.filter(
  (field) => {
    const disposition = FIELD_DISPOSITIONS[field];
    return disposition.kind === "implemented" && disposition.provenBy === "composition";
  },
);

/** A field the request resolves into other fields before any run exists, so no later stage sees it. */
export const ADMISSION_PROVEN_FIELDS: ContractField[] = CONTRACT_FIELDS.filter((field) => {
  const disposition = FIELD_DISPOSITIONS[field];
  return disposition.kind === "implemented" && disposition.provenBy === "admission";
});

export const FINALIZATION_PROVEN_FIELDS: ContractField[] = CONTRACT_FIELDS.filter(
  (field) => {
    const disposition = FIELD_DISPOSITIONS[field];
    return disposition.kind === "implemented" && disposition.provenBy === "finalization";
  },
);
