import { z } from "zod";
import { AD_END_HOLD_WARNING, makeUgcInputShape, mcpCaptionPlace, mcpLiveShots, mcpPresenterGaze, mcpPresenterPlace, mcpUgcCall, mcpUgcInterview, mcpUgcOverlay, mcpUgcScene,
  mcpUgcTemplate } from "./skills.js";
import { MCP_UGC_DESCRIPTIONS } from "./mcp-ugc-descriptions.js";
import { interviewWarnings } from "./ugc-interview.js";
import { commentCtaFitWarnings, MAX_TEMPLATES, mcpTemplateSounds, seriesFitWarnings, templateFaceWarnings, templateMediaOf, templateSceneItems, templateSizeWarnings, type TemplateItem } from "./templates/index.js";
import { framingWarnings } from "./ugc-framing.js";
import { MAX_OVERLAYS, placeWarnings } from "./ugc-layers.js";
import { callWarnings } from "./ugc-call.js";
import { BROLL_POLICY_DESCRIPTION } from "./broll-policy.js";
import { mcpDesign } from "./design.js";
import { MAX_SCENES, SCENES_DISABLED_MESSAGE } from "./ugc-scenes.js";
import { MOTION_STYLE_UNUSED_WARNING, motionStyleAsked, motionStyleHasCanvas } from "./motion-styles.js";
import { AD_PAUSE_TRIM_WARNING } from "./ad-pause-trim.js";
import { BASE_OFFER, type ServiceOffer } from "./service-offer.js";

export const CONTRACT_VERSION = "2026-10-18";
export const CONTRACT_VERSION_HEADER = "X-Clipwright-Contract";

export const BROLL_UNUSED_WARNING = "broll_policy has no effect on this video: it shows none of your media";

export const DESIGN_UNUSED_WARNING = "design has no effect on this video: it has no templates and no captions to draw in it";

function carriesCustomerMedia(input: Readonly<Record<string, unknown>>): boolean {
  const listed = (field: string) => Array.isArray(input[field]) && (input[field] as unknown[]).length > 0;
  return listed("inserts") || listed("overlays") || listed("layout_windows") ||
    (Array.isArray(input.segments) && input.segments.some(segment => (segment as { kind?: unknown }).kind === "media")) ||
    (Array.isArray(input.templates) && templateMediaOf(input.templates as TemplateItem[]).length > 0);
}

export type Disposition =
  | { kind: "stored"; message: string; warning: string }
  | { kind: "implemented"; provenBy: "egress" | "composition" | "finalization" | "admission" }
  | { kind: "rejected"; message: string }
  | {
      kind: "warned";
      warning: string;
      triggersWhen: "present" | "differs-from-default";
    };

export const FIELD_DISPOSITIONS = {
  script: { kind: "implemented", provenBy: "egress" },
  voice: { kind: "implemented", provenBy: "egress" },
  voice_id: { kind: "implemented", provenBy: "egress" },
  tts_model: { kind: "implemented", provenBy: "egress" },
  voice_pace: { kind: "implemented", provenBy: "egress" },
  pause_trim: { kind: "implemented", provenBy: "egress" },
  voice_run_id: { kind: "implemented", provenBy: "egress" },

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
  captions: { kind: "implemented", provenBy: "composition" },
  caption_style: { kind: "implemented", provenBy: "composition" },
  caption_emphasis: { kind: "implemented", provenBy: "composition" },
  caption_mode: { kind: "implemented", provenBy: "composition" },
  caption_position: { kind: "implemented", provenBy: "composition" },
  caption_place: { kind: "implemented", provenBy: "composition" },
  presenter_place: { kind: "implemented", provenBy: "egress" },

  resolution: { kind: "implemented", provenBy: "egress" },
  aspect_ratio: { kind: "implemented", provenBy: "egress" },
  presenter_engine: { kind: "implemented", provenBy: "egress" },

  image: { kind: "implemented", provenBy: "egress" },
  actor_id: { kind: "implemented", provenBy: "egress" },
  presenter_framing: { kind: "implemented", provenBy: "egress" },
  presenter_mic: { kind: "implemented", provenBy: "egress" },
  actor_gender: { kind: "implemented", provenBy: "egress" },
  broll_policy: { kind: "stored", message: BROLL_POLICY_DESCRIPTION, warning: BROLL_UNUSED_WARNING },

  segments: { kind: "implemented", provenBy: "composition" },
  inserts: { kind: "implemented", provenBy: "composition" },
  overlays: { kind: "implemented", provenBy: "composition" },
  layout_windows: { kind: "implemented", provenBy: "composition" },
  framing: { kind: "implemented", provenBy: "composition" },
  templates: { kind: "implemented", provenBy: "composition" },
  template_theme: { kind: "implemented", provenBy: "composition" },
  design: { kind: "implemented", provenBy: "composition" },
  template_sounds: { kind: "implemented", provenBy: "composition" },
  scenes: { kind: "implemented", provenBy: "composition" },
  motion_style: { kind: "implemented", provenBy: "composition" },
  moves: { kind: "implemented", provenBy: "admission" },
  edit_sounds: { kind: "implemented", provenBy: "composition" },
  music: { kind: "implemented", provenBy: "finalization" },
  call: { kind: "implemented", provenBy: "composition" },
  interview: { kind: "implemented", provenBy: "composition" },
  presenter_gaze: { kind: "implemented", provenBy: "egress" },
  end_hold_s: { kind: "implemented", provenBy: "composition" },
  shots: { kind: "implemented", provenBy: "composition" },
  product_asset_id: { kind: "implemented", provenBy: "composition" },
  propose: { kind: "implemented", provenBy: "admission" },
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
  disclosure_overlay: {
    kind: "rejected",
    message:
      "disclosure_overlay is not supported: the visible label was removed. The output is still marked in the run contract and in the file metadata; label the publication with the platform's own control",
  },
  visible_ai_label: { kind: "implemented", provenBy: "finalization" },
  background: { kind: "implemented", provenBy: "composition" },
  max_credits: { kind: "implemented", provenBy: "admission" },

  webhook_url: {
    kind: "rejected",
    message:
      "webhook_url is not supported: no webhook is ever delivered. Poll get_run with the run_id instead",
  },
} as const satisfies Record<keyof typeof makeUgcInputShape, Disposition>;

export const FACELESS_REJECTED_FIELDS = {
  voice_id: {
    kind: "rejected",
    message:
      "voice_id is not accepted by make_faceless: pass voice with a name from list_voices (skill=make_faceless), " +
      "or omit both for the default voice",
  },
} as const satisfies Record<string, Extract<Disposition, { kind: "rejected" }>>;

export type ContractField = keyof typeof FIELD_DISPOSITIONS;

const CONTRACT_FIELDS = Object.keys(makeUgcInputShape) as ContractField[];

export interface ContractFlags {
  longForm: boolean;
  outputMarking?: boolean;
}

export const LIVE_SHOTS_DISABLED_MESSAGE = "shots are not available right now; omit shots and product_asset_id";

const PERSON_WITH_ACTOR_GENERATION: Disposition = {
  kind: "warned",
  warning:
    "person is not honored: this request uses the default actor; create a personal actor from the description with create_actor, then pass its actor_id",
  triggersWhen: "present",
};

export function contractFlagsFor(offer: ServiceOffer): ContractFlags {
  return { longForm: offer.longForm, ...(offer.outputMarking ? { outputMarking: true } : {}) };
}

export const LONG_FORM_DISABLED_MESSAGE =
  "long-form qualification is not available right now; pass script without segments or inserts";

export function legacyCaptionWarnings(input: { captions?: boolean | undefined; caption_style?: string | undefined }): string[] {
  return [
    ...(input.captions === true ? ["captions requested but not rendered in this prototype (stage-B)"] : []),
    ...(input.caption_style !== undefined && input.caption_style !== "hormozi"
      ? ["caption_style is not honored: captions are not rendered in this prototype (stage-B)"] : []),
  ];
}

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

export function compositionLayersNotDrawnWarnings(input: Parameters<typeof compositionLayerFields>[0], reason: string): string[] {
  const fields = compositionLayerFields(input);
  return fields.length ? [`${fields.join(", ")} ${fields.length === 1 ? "was" : "were"} not drawn: ${reason}`] : [];
}

const LONG_FORM_DISABLED: Disposition = { kind: "rejected", message: LONG_FORM_DISABLED_MESSAGE };
const TEMPLATES_DISABLED: Disposition = { kind: "rejected",
  message: "templates are not available right now; omit templates, template_theme and template_sounds" };

export function resolveDispositions(
  flags: ContractFlags,
): Record<ContractField, Disposition> {
  const longForm = flags.longForm;
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
    scenes: longForm ? FIELD_DISPOSITIONS.scenes : { kind: "rejected", message: SCENES_DISABLED_MESSAGE },
    edit_sounds: longForm ? FIELD_DISPOSITIONS.edit_sounds : LONG_FORM_DISABLED,
    call: longForm ? FIELD_DISPOSITIONS.call : LONG_FORM_DISABLED,
    interview: longForm ? FIELD_DISPOSITIONS.interview : LONG_FORM_DISABLED,
    presenter_gaze: longForm ? FIELD_DISPOSITIONS.presenter_gaze : LONG_FORM_DISABLED,
    end_hold_s: longForm ? FIELD_DISPOSITIONS.end_hold_s : LONG_FORM_DISABLED,
    shots: longForm ? FIELD_DISPOSITIONS.shots : { kind: "rejected", message: LIVE_SHOTS_DISABLED_MESSAGE },
    product_asset_id: longForm ? FIELD_DISPOSITIONS.product_asset_id : { kind: "rejected", message: LIVE_SHOTS_DISABLED_MESSAGE },
    person: PERSON_WITH_ACTOR_GENERATION,
    visible_ai_label: flags.outputMarking === true ? FIELD_DISPOSITIONS.visible_ai_label : {
      kind: "rejected", message: "visible_ai_label is not available right now; omit it",
    },
  };
}

export const dispositionsFor = (offer: ServiceOffer): Record<ContractField, Disposition> => resolveDispositions(contractFlagsFor(offer));

const WARNING_DISPOSITIONS = dispositionsFor(BASE_OFFER);

type RejectedField = {
  [K in ContractField]: (typeof FIELD_DISPOSITIONS)[K]["kind"] extends "rejected"
    ? K
    : never;
}[ContractField];

type WarnedField = {
  [K in ContractField]: (typeof FIELD_DISPOSITIONS)[K]["kind"] extends "warned" ? K : never;
}[ContractField];

type OfferedField = Exclude<ContractField, RejectedField>;

export const NOT_HONORED_MARK = "Not honored yet";

const FIELD_DEFAULTS: Partial<Record<ContractField, unknown>> = Object.fromEntries(
  CONTRACT_FIELDS.map((field) => {
    const parsed = makeUgcInputShape[field].safeParse(undefined);
    return [field, parsed.success ? parsed.data : undefined];
  }),
);

export function dispositionNote(field: ContractField): string | null {
  return noteFor(FIELD_DISPOSITIONS[field]);
}

function noteFor(disposition: Disposition): string | null {
  if (disposition.kind === "stored") return disposition.message;
  if (disposition.kind === "rejected") {
    return `REJECTED: ${disposition.message}`;
  }
  if (disposition.kind === "warned") {
    return `${NOT_HONORED_MARK}: ${disposition.warning}`;
  }
  return null;
}

function annotate<K extends ContractField>(field: K): (typeof makeUgcInputShape)[K] {
  const note = dispositionNote(field);
  const schema = makeUgcInputShape[field];
  return (note ? schema.describe(note) : schema) as (typeof makeUgcInputShape)[K];
}

export const annotatedUgcInputShape = Object.fromEntries(
  CONTRACT_FIELDS.map((field) => [field, annotate(field)]),
) as unknown as typeof makeUgcInputShape;

export const offeredUgcInputShape = Object.fromEntries(
  CONTRACT_FIELDS.filter(
    (field) => FIELD_DISPOSITIONS[field].kind !== "rejected",
  ).map((field) => [field, annotate(field)]),
) as unknown as Pick<typeof makeUgcInputShape, OfferedField>;

export const offeredUgcInput = z.object(offeredUgcInputShape);
export type MakeUgcInputArgs = z.input<typeof offeredUgcInput>;

type CompactField = keyof typeof MCP_UGC_DESCRIPTIONS;
const compactFields = Object.keys(MCP_UGC_DESCRIPTIONS) as CompactField[];
const compactlyDescribed = Object.fromEntries(compactFields
  .map((field) => [field, offeredUgcInputShape[field].describe(MCP_UGC_DESCRIPTIONS[field])])) as Pick<typeof offeredUgcInputShape, CompactField>;
export const fieldText = (schema: z.ZodType): string | undefined => {
  const inner = (schema._zod.def as unknown as { innerType?: z.ZodType }).innerType;
  return schema.description ?? (inner === undefined ? undefined : fieldText(inner));
};
export const MCP_UGC_SHORTENED_TEXTS: readonly string[] = compactFields.map((field) => fieldText(offeredUgcInputShape[field]) ?? "");

const mcpOfferedShape = Object.fromEntries(Object.entries(offeredUgcInputShape)
  .filter(([field]) => FIELD_DISPOSITIONS[field as ContractField].kind !== "warned")) as Omit<typeof offeredUgcInputShape, WarnedField>;

export const mcpUgcInputShape = { ...mcpOfferedShape, ...compactlyDescribed,
  overlays: z.array(mcpUgcOverlay).min(1).max(MAX_OVERLAYS).optional().describe(MCP_UGC_DESCRIPTIONS.overlays),
  templates: z.array(mcpUgcTemplate).min(1).max(MAX_TEMPLATES).optional().describe(MCP_UGC_DESCRIPTIONS.templates),
  scenes: z.array(mcpUgcScene).min(1).max(MAX_SCENES).optional().describe(fieldText(offeredUgcInputShape.scenes) ?? ""),
  template_sounds: mcpTemplateSounds.optional(), call: mcpUgcCall.optional(),
  caption_place: mcpCaptionPlace.optional(), presenter_place: mcpPresenterPlace.optional(),
  interview: mcpUgcInterview.optional(), presenter_gaze: mcpPresenterGaze.optional(), shots: mcpLiveShots.optional(),
  design: mcpDesign.optional().describe("Look of templates, end card, caption highlight; absent: brand kit; not with template_theme. " +
    "look, fonts: from brand_kit; palette #RRGGBB.") };

export interface RejectedFieldHit {
  field: ContractField;
  message: string;
}

export function rejectedFields(input: Readonly<Record<string, unknown>>, offer: ServiceOffer = BASE_OFFER): RejectedFieldHit[] {
  const dispositions = dispositionsFor(offer);
  const hits: RejectedFieldHit[] = [];
  for (const field of CONTRACT_FIELDS) {
    const disposition = dispositions[field];
    if (disposition.kind !== "rejected") continue;
    if (input[field] === undefined) continue;
    hits.push({ field, message: disposition.message });
  }
  return hits;
}

export interface UnknownFieldHit {
  field: string;
  suggestion?: string | undefined;
}

const normalizedFieldName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const ACCEPTED_UGC_FIELDS = Object.keys(offeredUgcInputShape);

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

export function dispositionWarnings(
  input: Readonly<Record<string, unknown>>,
): string[] {
  const warnings: string[] = [];
  for (const field of CONTRACT_FIELDS) {
    const disposition = WARNING_DISPOSITIONS[field];
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
  const scene = { templates: Array.isArray(input.templates) ? input.templates as TemplateItem[] : undefined,
    aspect_ratio: typeof input.aspect_ratio === "string" ? input.aspect_ratio : undefined };
  if (input.design !== undefined && input.design_source !== "brand_kit" && !(Array.isArray(input.templates) && input.templates.length > 0) && input.captions !== true) {
    warnings.push(DESIGN_UNUSED_WARNING);
  }
  const styled = { motion_style: input.motion_style as Parameters<typeof motionStyleAsked>[0]["motion_style"],
    design: input.design_source === "brand_kit" ? undefined : input.design as { style?: undefined } | undefined };
  if (motionStyleAsked(styled) && !motionStyleHasCanvas({ captions: input.captions === true, templates: scene.templates,
    scenes: Array.isArray(input.scenes) ? input.scenes : undefined })) warnings.push(MOTION_STYLE_UNUSED_WARNING);
  if (input.pause_trim_source === "ad_default") warnings.push(AD_PAUSE_TRIM_WARNING);
  if (input.end_hold_source === "ad_default") warnings.push(AD_END_HOLD_WARNING);
  warnings.push(...templateFaceWarnings(input), ...templateSizeWarnings(input), ...seriesFitWarnings(input), ...commentCtaFitWarnings(input), ...framingWarnings(input),
    ...callWarnings(input), ...placeWarnings(input, framing => templateSceneItems(scene, framing)), ...interviewWarnings(input));
  return warnings;
}

export const IMPLEMENTED_FIELDS: ContractField[] = CONTRACT_FIELDS.filter(
  (field) => FIELD_DISPOSITIONS[field].kind === "implemented",
);

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
