import { z } from "zod";
import {
  ACTOR_DEFAULT_QUALITY,
  ACTOR_QUALITIES_ACCEPTED,
  ACTOR_QUALITIES_KNOWN,
  type ActorQuality,
  type ActorQualityAccepted,
} from "./actor-qualities.js";
import {
  ACTOR_AGE_FLOOR,
  ACTOR_ASPECTS_KNOWN,
  ACTOR_DESCRIPTION_MAX_CHARS,
  ACTOR_GENDERS_ACCEPTED,
  ACTOR_GENDERS_KNOWN,
  ACTOR_HOLDING_DESCRIPTION_MAX_CHARS,
  ACTOR_HOLDING_MAX_ITEMS,
  ACTOR_MAX_AGE,
  ACTOR_MIN_AGE,
  ACTOR_NAME_MAX_CHARS,
  ACTOR_SETTING_MAX_CHARS,
} from "./actor-bounds.js";
import { assetId } from "./asset-identity.js";
import { actorId, ASPECT_RATIOS, type AspectRatio } from "./skills.js";

/** Personal actors of an account. */

export { ACTOR_DEFAULT_QUALITY, ACTOR_QUALITIES_ACCEPTED, ACTOR_QUALITIES_KNOWN } from "./actor-qualities.js";
export type { ActorQuality, ActorQualityAccepted } from "./actor-qualities.js";
export {
  ACTOR_AGE_FLOOR,
  ACTOR_ASPECTS_KNOWN,
  ACTOR_DESCRIPTION_MAX_CHARS,
  ACTOR_GENDERS_ACCEPTED,
  ACTOR_GENDERS_KNOWN,
  ACTOR_HOLDING_DESCRIPTION_MAX_CHARS,
  ACTOR_HOLDING_MAX_ITEMS,
  ACTOR_MAX_AGE,
  ACTOR_MIN_AGE,
  ACTOR_NAME_MAX_CHARS,
  ACTOR_SETTING_MAX_CHARS,
} from "./actor-bounds.js";
export type { ActorAspectKnown, ActorGender } from "./actor-bounds.js";

export const PERSONAL_ACTOR_ID_PREFIX = "actor_u_";
const PERSONAL_ACTOR_ID_BYTES = 16;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** `actor_u_` plus 26 base32 characters (RFC 4648, lowercase): 128 random bits. */
export const personalActorId = z.string().regex(/^actor_u_[a-z2-7]{26}$/);

export const ACTOR_SCOPES = ["clipwright", "account"] as const;
export type ActorScope = (typeof ACTOR_SCOPES)[number];

/** Whose actor, by id shape. The Clipwright catalog never uses the `actor_u_` prefix; a test checks it. */
export function actorIdScope(actorId: string): ActorScope {
  return personalActorId.safeParse(actorId).success ? "account" : "clipwright";
}

/** Randomness comes from outside: core does not depend on the runtime's crypto. */
export function newPersonalActorId(random: Uint8Array): string {
  if (random.length !== PERSONAL_ACTOR_ID_BYTES) {
    throw new Error(`personal actor id needs ${PERSONAL_ACTOR_ID_BYTES} random bytes, got ${random.length}`);
  }
  let buffer = 0;
  let bits = 0;
  let encoded = "";
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET.charAt((buffer >> bits) & 31);
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) encoded += BASE32_ALPHABET.charAt((buffer << (5 - bits)) & 31);
  return PERSONAL_ACTOR_ID_PREFIX + encoded;
}

/** The portrait is always 9:16; the other formats are edited from it. */
export const ACTOR_PORTRAIT_ASPECT = "9:16" as const satisfies AspectRatio;

/** Compact generation sizes, measured. */
export const ACTOR_SIZE_SET = {
  "9:16": { width: 1024, height: 1824 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1824, height: 1024 },
} as const satisfies Record<AspectRatio, { width: number; height: number }>;

const includesPortrait = (ratios: readonly string[]) => ratios.includes(ACTOR_PORTRAIT_ASPECT);
const hasNoRepeats = (ratios: readonly string[]) => new Set(ratios).size === ratios.length;

export const ACTOR_VIEW_FRAMINGS = ["wide"] as const;
export const ACTOR_HANDS = ["left", "right"] as const;

/** One held object: words, and optionally a picture of the object itself. */
const holdingItem = z.strictObject({
  description: z.string().min(1).max(ACTOR_HOLDING_DESCRIPTION_MAX_CHARS).describe("The object, e.g. \"a white coffee mug\"."),
  reference: z
    .strictObject({ asset_id: assetId })
    .optional()
    .describe("A PNG or JPEG picture of the object: an image asset of this account (upload, URL import or a found picture, rights_confirmed)."),
  hand: z.enum(ACTOR_HANDS).optional().describe("left | right; omitted lets the edit choose."),
});

/** Strict input fields without quality. Bounds come from actor-bounds.ts; read schemas do not use them. */
/** Words, gender and age are required without `from_actor_id` and refused with it (`checkActorSource`). */
const actorFieldShape = {
  description: z
    .string()
    .min(1)
    .max(ACTOR_DESCRIPTION_MAX_CHARS)
    .optional()
    .describe(
      "Words describing a fictional adult: appearance, clothing, setting. Naming a real person or a likeness " +
        "to one is refused before any charge (actor_prompt_refused). Required unless from_actor_id is given.",
    ),
  gender: z
    .enum(ACTOR_GENDERS_ACCEPTED)
    .optional()
    .describe(
      `${ACTOR_GENDERS_ACCEPTED.join(" | ")}. Fixes the actor's gender and the default voice of videos with this actor. ` +
        "Required unless from_actor_id is given.",
    ),
  approximate_age: z
    .number()
    .int()
    .min(ACTOR_MIN_AGE)
    .max(ACTOR_MAX_AGE)
    .optional()
    .describe(`Approximate age in years, ${ACTOR_MIN_AGE} to ${ACTOR_MAX_AGE}: actors are adults. Required unless from_actor_id is given.`),
  name: z.string().min(1).max(ACTOR_NAME_MAX_CHARS).describe("Name shown in list_actors."),
  aspect_ratios: z
    .array(z.enum(ASPECT_RATIOS))
    .min(1)
    .max(ASPECT_RATIOS.length)
    .refine(includesPortrait, {
      error: `aspect_ratios must include ${ACTOR_PORTRAIT_ASPECT}: every actor starts from a ${ACTOR_PORTRAIT_ASPECT} portrait`,
    })
    .refine(hasNoRepeats, { error: "aspect_ratios must not repeat a format" })
    .default([...ASPECT_RATIOS])
    .describe(
      `Formats to create: ${ASPECT_RATIOS.join(" | ")}, always including ${ACTOR_PORTRAIT_ASPECT}. Omitted means all ` +
        "three. Formats that fail the identity check are not charged and are named in warnings.",
    ),
  from_actor_id: actorId
    .optional()
    .describe(
      "Derive a new personal actor from this one (a library actor or your own): the same face, gender and age, " +
        "with the view changed by framing, holding or setting. Omit description, gender and approximate_age.",
    ),
  framing: z
    .enum(ACTOR_VIEW_FRAMINGS)
    .optional()
    .describe("wide: the camera further back, the head lower with room above; make_ugc then renders it as a wide view."),
  holding: z
    .array(holdingItem)
    .min(1)
    .max(ACTOR_HOLDING_MAX_ITEMS)
    .optional()
    .describe(`Up to ${ACTOR_HOLDING_MAX_ITEMS} objects the presenter holds, one per hand.`),
  setting: z
    .string()
    .min(1)
    .max(ACTOR_SETTING_MAX_CHARS)
    .optional()
    .describe("The room or background to put the presenter in, in words."),
} as const;

/** The fields of a view derived from an actor (#898). */
export const ACTOR_VIEW_FIELDS = ["from_actor_id", "framing", "holding", "setting"] as const;
const ACTOR_VIEW_CHANGES = ["framing", "holding", "setting"] as const;
const ACTOR_SOURCE_FIELDS = ["description", "gender", "approximate_age"] as const;

type ActorSourceInput = Partial<Record<(typeof ACTOR_VIEW_FIELDS | typeof ACTOR_SOURCE_FIELDS)[number], unknown>> & {
  holding?: readonly { hand?: string | undefined }[] | undefined;
};

/** A described actor needs its words, a derived one takes them from the source: neither is silently dropped (rule 3). */
function checkActorSource(input: ActorSourceInput, ctx: z.RefinementCtx): void {
  const refuse = (field: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  if (input.from_actor_id === undefined) {
    for (const field of ACTOR_SOURCE_FIELDS) {
      if (input[field] === undefined) {
        refuse(field, `${field} is required: describe a fictional adult, or pass from_actor_id to derive a view of an existing actor`);
      }
    }
    for (const field of ACTOR_VIEW_CHANGES) {
      if (input[field] !== undefined) {
        refuse(field, `${field} needs from_actor_id: create the actor first, then derive a view of it with from_actor_id`);
      }
    }
    return;
  }
  for (const field of ACTOR_SOURCE_FIELDS) {
    if (input[field] !== undefined) refuse(field, `${field} comes from the source actor with from_actor_id; omit it`);
  }
  if (ACTOR_VIEW_CHANGES.every((field) => input[field] === undefined)) {
    refuse("from_actor_id", "from_actor_id needs a change: framing, holding or setting");
  }
  const hands = (input.holding ?? []).flatMap((item) => (item.hand === undefined ? [] : [item.hand]));
  if (new Set(hands).size !== hands.length) refuse("holding", "holding names the same hand twice: one object per hand");
}

type AcceptedQualities = readonly [ActorQuality, ...ActorQuality[]];

function unknownFieldsRefusal(keys: readonly string[]): string {
  if (keys.includes("image")) {
    return "create_actor takes no image of a person: describe a fictional adult in description, or derive a view of " +
      "an existing actor with from_actor_id; a held object's picture goes in holding[].reference";
  }
  return `unknown field(s) ${keys.join(", ")}: create_actor accepts description, gender, approximate_age, name, quality, ` +
    "aspect_ratios, from_actor_id, framing, holding, setting";
}

/** The input for a given set of accepted qualities. */
export function createActorInputWith<const Q extends AcceptedQualities>(accepted: Q, defaultQuality: Q[number]) {
  return z.strictObject(
    {
      ...actorFieldShape,
      quality: z
        .enum(accepted, {
          error: (issue) =>
            `quality ${JSON.stringify(issue.input)} is not accepted: choose one of ${accepted.join(" | ")}`,
        })
        .default(defaultQuality)
        .describe(
          `Image quality: ${accepted.join(" | ")}. Omitted means ${defaultQuality}. The price per image depends on it; ` +
            "quote shows it before any charge.",
        ),
    },
    {
      error: (issue) => (issue.code === "unrecognized_keys" ? unknownFieldsRefusal(issue.keys) : undefined),
    },
  ).superRefine(checkActorSource);
}

export const createActorInput = createActorInputWith(ACTOR_QUALITIES_ACCEPTED, ACTOR_DEFAULT_QUALITY);
export type CreateActorInput = z.infer<typeof createActorInput>;

/** The input BEFORE defaults, as the caller writes it: `quality` and `aspect_ratios` are optional, */
/** as with `MakeUgcInputArgs`, so callers are not forced to fill defaulted fields. */
export type CreateActorInputArgs = z.input<typeof createActorInput>;

/** Flat shape for MCP: the tool publishes the same schema the server checks. */
export const createActorInputShape = createActorInput.shape;

export const actorUnitCredits = z.object({
  portrait: z.number().int().positive(),
  variant: z.number().int().positive(),
});

/** Unit prices of a personal actor. */
/** Admission copies them into the run's snapshot and settlement reads the snapshot, so a change here leaves old runs alone. */
export const ACTOR_UNIT_CREDITS: Readonly<Record<ActorQualityAccepted, z.infer<typeof actorUnitCredits>>> = {
  medium: { portrait: 4, variant: 8 },
  high: { portrait: 12, variant: 18 },
};

/** Read schemas depend only on what could have been written: the known sets and the DB check. */
/** Intake bounds stay out, so narrowing intake never breaks old runs. */
const storedAspects = z.array(z.enum(ACTOR_ASPECTS_KNOWN)).min(1);

/** Unit prices and requested formats fixed at admission; settlement uses these, not the price table. */
export const actorPricingSnapshot = z.object({
  quality: z.enum(ACTOR_QUALITIES_KNOWN),
  unit_credits: actorUnitCredits,
  requested_aspects: storedAspects,
});
export type ActorPricingSnapshot = z.infer<typeof actorPricingSnapshot>;

/** The snapshot admission creates: accepted formats, portrait required, no repeats. */
export const admittedActorPricingSnapshot = actorPricingSnapshot.extend({
  requested_aspects: z
    .array(z.enum(ASPECT_RATIOS))
    .min(1)
    .refine(includesPortrait, { error: `requested_aspects must include ${ACTOR_PORTRAIT_ASPECT}` })
    .refine(hasNoRepeats, { error: "requested_aspects must not repeat a format" }),
});

function sameFormats(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((ratio) => b.has(ratio));
}

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/** The source image admission resolved for `from_actor_id`: the run reads these bytes, not a payload. */
export const storedActorSource = z.object({
  actor_id: z.string().min(1),
  scope: z.enum(ACTOR_SCOPES),
  key: z.string().min(1),
  sha256: sha256Hex,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  framing: z.enum(["close", "wide"]),
});
export type StoredActorSource = z.infer<typeof storedActorSource>;

/** A held object as admitted: a `reference` carries the asset row admission found. */
export const storedHoldingItem = z.object({
  description: z.string().min(1),
  hand: z.enum(ACTOR_HANDS).optional(),
  reference: z.object({ asset_id: z.string().min(1) }).optional(),
  picture: z.object({ asset_id: z.string().min(1), key: z.string().min(1), mime: z.enum(["image/png", "image/jpeg"]) }).optional(),
});
export type StoredHoldingItem = z.infer<typeof storedHoldingItem>;

/** A stored run input. Quality and formats must match the snapshot, or generation would diverge */
/** from the charge, so such a run does not read (`run_input_unreadable`, zero credits). */
export const storedCreateActorInput = z
  .object({
    description: z.string().min(1),
    gender: z.enum(ACTOR_GENDERS_KNOWN),
    approximate_age: z.number().int().min(ACTOR_AGE_FLOOR),
    name: z.string().min(1),
    aspect_ratios: storedAspects,
    quality: z.enum(ACTOR_QUALITIES_KNOWN),
    pricing_snapshot: actorPricingSnapshot,
    from_actor_id: z.string().min(1).optional(),
    source_actor: storedActorSource.optional(),
    framing: z.enum(ACTOR_VIEW_FRAMINGS).optional(),
    holding: z.array(storedHoldingItem).optional(),
    setting: z.string().min(1).optional(),
  })
  .refine((input) => input.quality === input.pricing_snapshot.quality, {
    error: "stored quality differs from pricing_snapshot.quality",
    path: ["quality"],
  })
  .refine((input) => sameFormats(input.aspect_ratios, input.pricing_snapshot.requested_aspects), {
    error: "stored aspect_ratios differ from pricing_snapshot.requested_aspects",
    path: ["aspect_ratios"],
  })
  .refine((input) => (input.from_actor_id === undefined) === (input.source_actor === undefined)
    && (input.source_actor === undefined || input.source_actor.actor_id === input.from_actor_id), {
    error: "stored from_actor_id and source_actor disagree",
    path: ["source_actor"],
  })
  .refine((input) => (input.holding ?? []).every((item) => (item.reference === undefined) === (item.picture === undefined)
    && (item.picture === undefined || item.picture.asset_id === item.reference?.asset_id)), {
    error: "a stored holding reference has no admitted picture",
    path: ["holding"],
  });
export type StoredCreateActorInput = z.infer<typeof storedCreateActorInput>;

export const createActorQuote = z.object({
  skill: z.literal("create_actor"),
  credits_estimate: z.number().int().nonnegative(),
  pricing_snapshot: actorPricingSnapshot,
  warnings: z.array(z.string()).default([]),
  contract_version: z.string(),
});
export type CreateActorQuote = z.infer<typeof createActorQuote>;

/** The actor a run created, as read. Deleting an actor erases the name and unpublishes formats, */
/** yet `get_run` on an old run must answer, so an empty name and formats read. */
export const createdActor = z.object({
  actor_id: personalActorId,
  name: z.string(),
  gender: z.enum(ACTOR_GENDERS_KNOWN),
  approximate_age: z.number().int().min(ACTOR_AGE_FLOOR),
  version: z.number().int().positive(),
  quality: z.enum(ACTOR_QUALITIES_KNOWN),
  aspect_ratios: z.array(z.enum(ACTOR_ASPECTS_KNOWN)),
});
export type CreatedActor = z.infer<typeof createdActor>;

/** The result a successful run writes: a name and published formats, the 9:16 portrait among them. */
export const producedCreatedActor = createdActor.extend({
  name: z.string().min(1),
  aspect_ratios: storedAspects.refine(includesPortrait, {
    error: `created_actor.aspect_ratios must include ${ACTOR_PORTRAIT_ASPECT}`,
  }),
});

/** Decision for a `create_actor` input field; kinds mean what they do in the `make_ugc` registry. */
export type CreateActorDisposition =
  | { kind: "implemented"; provenBy: "egress" | "listing" }
  | { kind: "warned"; warning: string; triggersWhen: "present" }
  | { kind: "rejected"; message: string };

type CreateActorField = keyof typeof createActorInput.shape;

export const CREATE_ACTOR_FIELD_DISPOSITIONS = {
  description: { kind: "implemented", provenBy: "egress" },
  gender: { kind: "implemented", provenBy: "egress" },
  approximate_age: { kind: "implemented", provenBy: "egress" },
  name: { kind: "implemented", provenBy: "listing" },
  quality: { kind: "implemented", provenBy: "egress" },
  aspect_ratios: { kind: "implemented", provenBy: "egress" },
  from_actor_id: { kind: "implemented", provenBy: "egress" },
  framing: { kind: "implemented", provenBy: "egress" },
  holding: { kind: "implemented", provenBy: "egress" },
  setting: { kind: "implemented", provenBy: "egress" },
} as const satisfies Record<CreateActorField, CreateActorDisposition>;

export const ACTOR_VIEWS_DISABLED_MESSAGE =
  "is not available right now: deriving an actor from an actor is off; create an actor from a description instead";

/** The registry with `CLIPWRIGHT_ACTOR_VIEWS` applied: switched off, the view fields are refused, not ignored. */
export function createActorDispositions(viewsEnabled: boolean): Record<CreateActorField, CreateActorDisposition> {
  if (viewsEnabled) return CREATE_ACTOR_FIELD_DISPOSITIONS;
  const rejected = (field: string): CreateActorDisposition => ({ kind: "rejected", message: `${field} ${ACTOR_VIEWS_DISABLED_MESSAGE}` });
  return { ...CREATE_ACTOR_FIELD_DISPOSITIONS, ...Object.fromEntries(ACTOR_VIEW_FIELDS.map((field) => [field, rejected(field)])) };
}

/** Present fields whose disposition is `rejected`, in registry order, for `rejectedFieldBody`. */
export function createActorRejectedFields(
  input: Readonly<Record<string, unknown>>,
  dispositions: Readonly<Record<string, CreateActorDisposition>>,
): { field: string; message: string }[] {
  return Object.entries(dispositions).flatMap(([field, disposition]) =>
    disposition.kind === "rejected" && input[field] !== undefined ? [{ field, message: disposition.message }] : []);
}

/** Admission warnings come only from the registry; written to `runs.warnings`, not recomputed on read. */
export function createActorAdmissionWarnings(
  input: Readonly<Record<string, unknown>>,
  dispositions: Readonly<Record<string, CreateActorDisposition>> = CREATE_ACTOR_FIELD_DISPOSITIONS,
): string[] {
  return Object.entries(dispositions).flatMap(([field, disposition]) =>
    disposition.kind === "warned" && input[field] !== undefined ? [disposition.warning] : [],
  );
}

/** `create_actor` run failure codes, each charging zero credits. The `error` column reads `code: text`. */
export const CREATE_ACTOR_RUN_ERRORS = {
  actor_portrait_unusable:
    "the generated portrait did not show exactly one face; no actor was created and nothing was charged",
  actor_prompt_refused:
    "the description names or resembles a real person, or moderation refused the portrait; describe a fictional adult. " +
    "No actor was created and nothing was charged",
  face_check_unavailable:
    "the face check is unavailable right now; no actor was created and nothing was charged. Retry later",
  prompt_check_unavailable:
    "the description check is unavailable right now; no actor was created and nothing was charged. Retry later",
  run_input_unreadable: "the stored run input could not be read; no actor was created and nothing was charged",
  actor_portrait_not_delivered:
    "the portrait could not be generated or stored; no actor was created and nothing was charged. Retry later",
  actor_generation_disabled: "actor generation is disabled right now; no actor was created and nothing was charged",
  actor_run_interrupted: "the run stopped before it finished; no actor was created and nothing was charged",
  actor_spend_refused:
    "the portrait could not be started right now; no actor was created and nothing was charged. Retry later",
  actor_identity_not_kept:
    "the edited portrait did not keep the source actor's face; no actor was created and nothing was charged",
  actor_source_unreadable:
    "the source actor or a held object's picture could not be read; no actor was created and nothing was charged",
  actor_views_disabled:
    "deriving an actor from an actor is disabled right now; no actor was created and nothing was charged",
} as const;
export type CreateActorRunErrorCode = keyof typeof CREATE_ACTOR_RUN_ERRORS;
export const CREATE_ACTOR_RUN_ERROR_CODES = Object.keys(CREATE_ACTOR_RUN_ERRORS) as CreateActorRunErrorCode[];

export function createActorRunError(code: CreateActorRunErrorCode): string {
  return `${code}: ${CREATE_ACTOR_RUN_ERRORS[code]}`;
}

/** The `runs.error` format for a code with a detail: alerts read the code up to the colon. */
export function createActorRunErrorWith(code: CreateActorRunErrorCode, detail: string): string {
  return `${createActorRunError(code)} (${detail})`;
}

export const ACTOR_VARIANT_ASPECTS = ASPECT_RATIOS.filter(
  (aspect): aspect is Exclude<AspectRatio, typeof ACTOR_PORTRAIT_ASPECT> => aspect !== ACTOR_PORTRAIT_ASPECT,
);

/** A variant not created for a reason of ours: the successful run carries this line in `warnings`. */
export function actorVariantWarning(aspect: AspectRatio, reason: string): string {
  return `${aspect} was not created: ${reason}; it was not charged`;
}

/** A face check that failed at the variant stage: the run SUCCEEDS, with no failure code. One */
/** definition for the writer (task) and the counter (alert), compared as whole lines. */
export const ACTOR_VARIANT_FACE_CHECK_REASON = "the face check was unavailable";
export const ACTOR_VARIANT_FACE_CHECK_WARNINGS: readonly string[] = ACTOR_VARIANT_ASPECTS.map((aspect) =>
  actorVariantWarning(aspect, ACTOR_VARIANT_FACE_CHECK_REASON),
);

/** What `create_actor` does: one text for the public skill catalog and clients. */
export const CREATE_ACTOR_DESCRIPTION =
  "Create a personal actor for this account from words describing a fictional adult: a 9:16 portrait with exactly " +
  "one face, plus the other requested formats edited from it. Returns a run_id immediately; poll get_run until " +
  "'succeeded' (created_actor.actor_id, then pass it as actor_id to make_ugc) or 'failed'. Each published image is " +
  "charged at the price quote shows; refused descriptions and unusable portraits cost nothing. When generation is " +
  "switched off the call fails with actor_generation_disabled. With from_actor_id it derives a new personal actor " +
  "from a library or own actor: the same face (checked; a mismatch costs nothing), with framing wide, objects in " +
  "holding or a new setting. A held object's picture is an image asset (upload, URL import or a found picture, " +
  "rights_confirmed).";
