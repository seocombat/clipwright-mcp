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
import { ASPECT_MATCH_THRESHOLD, ASPECT_RATIO_VALUES, aspectDistance } from "./aspect.js";
import { assetId } from "./asset-identity.js";
import { presenterPlace } from "./scene-place.js";
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

/** An imported portrait's shape: within 2% of 9:16 is a match (rule 4); further off is refused, never cropped. */
export function isActorPortraitShape(width: number, height: number): boolean {
  return aspectDistance(ASPECT_RATIO_VALUES[ACTOR_PORTRAIT_ASPECT], width / height) <= ASPECT_MATCH_THRESHOLD;
}

/** The smallest face a portrait may show, as a share of its height. */
export const ACTOR_PORTRAIT_MIN_FACE_HEIGHT = 0.055;

/** A portrait's one face, in shares of the image: inside the frame and within the size bounds; null when it frames. */
export function actorPortraitFramingRefusal(box: { left: number; top: number; width: number; height: number }): string | null {
  if (box.left < 0 || box.top < 0 || box.left + box.width > 1 || box.top + box.height > 1) return "the face is cut off by the frame";
  const min = ACTOR_PORTRAIT_MIN_FACE_HEIGHT, max = presenterPlace.shape.face_height.maxValue;
  if (box.height < min) return `the face is too small: ${box.height.toFixed(2)} of the height, at least ${min}`;
  if (max !== null && box.height > max) return `the face is too large: ${box.height.toFixed(2)} of the height, at most ${max}`;
  return null;
}

/** A portrait whose face is below this share of its height is wider than chest-up. */
export const ACTOR_WIDE_PORTRAIT_FACE_HEIGHT = 0.24;

/** Below this share of the height a portrait's face makes it full height, head to feet (#1175 S7). */
export const ACTOR_FULL_PORTRAIT_FACE_HEIGHT = 0.12;

/** A portrait with a smaller face than a chest-up one is a wide shot (waist-up) or a full one (head to feet): make_ugc renders that view. */
export const actorPortraitFraming = (box: { height: number }): "close" | "wide" | "full" =>
  box.height < ACTOR_FULL_PORTRAIT_FACE_HEIGHT ? "full" : box.height < ACTOR_WIDE_PORTRAIT_FACE_HEIGHT ? "wide" : "close";

const includesPortrait = (ratios: readonly string[]) => ratios.includes(ACTOR_PORTRAIT_ASPECT);
const hasNoRepeats = (ratios: readonly string[]) => new Set(ratios).size === ratios.length;

export const ACTOR_VIEW_FRAMINGS = ["wide", "full"] as const;
/** What create_actor from words may ask for: close keeps the measured batch-001 portrait (#1175 S7). */
export const ACTOR_PORTRAIT_FRAMINGS = ["close", ...ACTOR_VIEW_FRAMINGS] as const;
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
/** Words, gender and age are required without `from_actor_id`; with it gender and age are refused and words describe the view (`checkActorSource`). */
const actorFieldShape = {
  description: z
    .string()
    .min(1)
    .max(ACTOR_DESCRIPTION_MAX_CHARS)
    .optional()
    .describe(
      "Words describing a fictional adult: appearance, clothing, setting. Naming a real person or a likeness " +
        "to one is refused before any charge (actor_prompt_refused). Required unless from_actor_id or portrait is given; " +
        "with from_actor_id, the look, clothing and pose of the view, while gender and age stay the source's.",
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
        "with the view changed by framing, holding, setting, description or style_reference. Omit gender and approximate_age.",
    ),
  framing: z
    .enum(ACTOR_PORTRAIT_FRAMINGS)
    .optional()
    .describe("The shot size: close (default, chest-up), wide (waist-up with hands, room above) or full (standing, head to feet). " +
      "From words it frames the new portrait; with from_actor_id, wide or full moves the camera back. The view is filed by the face size " +
      "drawn, and make_ugc renders it with presenter_framing of that name. Not with style_reference or portrait, whose image sets the shot."),
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
  style_reference: z
    .strictObject({ asset_id: assetId })
    .optional()
    .describe(
      "A PNG or JPEG photo whose set, light, camera angle, shot size and clothing the new portrait follows: chest-up, " +
        "waist-up or full height as in the photo; a portrait wider than chest-up becomes a wide view. An image asset of " +
        "this account (upload, URL import or a found picture, rights_confirmed). Without from_actor_id the face is new, from " +
        "description; with it, the source actor's face. A portrait that looks like a person in the photo is refused at no charge.",
    ),
  portrait: z
    .strictObject({ asset_id: assetId })
    .optional()
    .describe(
      "Make the actor from your own portrait image instead of generating one: a PNG or JPEG image asset of this account " +
        "(rights_confirmed), within 2% of 9:16, showing exactly one face that is neither cut off nor too small or too large. " +
        "It becomes the actor's 9:16 portrait at no charge; the other formats are edited from it and charged as usual. " +
        "With gender and approximate_age; not with description, style_reference or from_actor_id.",
    ),
} as const;

/** The fields of a view derived from an actor (#898). */
export const ACTOR_VIEW_FIELDS = ["from_actor_id", "framing", "holding", "setting"] as const;
/** What a derived view may change (#1192): words of look, clothing and pose, and a style reference's scene, beside framing, holding and setting. */
const ACTOR_VIEW_CHANGES = ["framing", "holding", "setting", "description", "style_reference"] as const;
const ACTOR_SOURCE_FIELDS = ["description", "gender", "approximate_age"] as const;
/** What the source actor alone gives a derived view: who the person is. */
const ACTOR_IDENTITY_FIELDS = ["gender", "approximate_age"] as const;

type ActorSourceInput = Partial<Record<(typeof ACTOR_VIEW_FIELDS | typeof ACTOR_SOURCE_FIELDS)[number] | "style_reference" | "portrait",
  unknown>> & {
  holding?: readonly { hand?: string | undefined }[] | undefined;
};

const PORTRAIT_REQUIRES = {
  gender: "gender is required with portrait: it fixes the actor's gender and default voice",
  approximate_age: "approximate_age is required with portrait: the actor's approximate age in years",
} as const;

/** A described actor needs its words, a derived one takes them from the source, an imported one from its image (#1095): */
/** none is silently dropped (rule 3). */
function checkActorSource(input: ActorSourceInput, ctx: z.RefinementCtx): void {
  const refuse = (field: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  if (input.from_actor_id === undefined && input.portrait !== undefined) {
    if (input.description !== undefined) {
      refuse("description", "description does not combine with portrait: the face and look come from the portrait image; omit it");
    }
    if (input.style_reference !== undefined) {
      refuse("style_reference", "style_reference draws a new face and does not combine with portrait; omit it");
    }
    for (const [field, message] of Object.entries(PORTRAIT_REQUIRES)) {
      if (input[field as keyof typeof PORTRAIT_REQUIRES] === undefined) refuse(field, message);
    }
    // The imported image is the portrait as it is: nothing redraws its room or puts an object in its hands.
    for (const field of ["holding", "setting"] as const) {
      if (input[field] !== undefined) {
        refuse(field, `${field} does not combine with portrait: the image is used as it is; create the actor, then derive a view of it with from_actor_id`);
      }
    }
  } else if (input.from_actor_id === undefined) {
    for (const field of ACTOR_SOURCE_FIELDS) {
      if (input[field] === undefined) {
        refuse(field, `${field} is required: describe a fictional adult, or pass from_actor_id to derive a view of an existing actor`);
      }
    }
  }
  // From words the shot size frames the portrait (#1175 S7); an image source sets its own. Beside from_actor_id a portrait is refused itself.
  const shotFrom = input.portrait !== undefined && input.from_actor_id === undefined ? "portrait"
    : input.style_reference !== undefined ? "style_reference" : undefined;
  if (input.framing !== undefined && shotFrom !== undefined) {
    refuse("framing", `framing does not combine with ${shotFrom}: its image sets the shot size; omit it`);
  }
  const hands = (input.holding ?? []).flatMap((item) => (item.hand === undefined ? [] : [item.hand]));
  if (new Set(hands).size !== hands.length) refuse("holding", "holding names the same hand twice: one object per hand");
  if (input.from_actor_id === undefined) return;
  for (const field of ACTOR_IDENTITY_FIELDS) {
    if (input[field] !== undefined) refuse(field, `${field} comes from the source actor with from_actor_id; omit it`);
  }
  if (input.portrait !== undefined) {
    refuse("portrait", "portrait makes a new actor and does not combine with from_actor_id; create the actor first, then derive a view of it");
  }
  if (input.framing === "close") refuse("framing", "framing close is not a change of view: with from_actor_id, framing is wide or full");
  if (ACTOR_VIEW_CHANGES.every((field) => input[field] === undefined)) {
    refuse("from_actor_id", "from_actor_id needs a change: framing, holding, setting, description or style_reference");
  }
}

type AcceptedQualities = readonly [ActorQuality, ...ActorQuality[]];

function unknownFieldsRefusal(keys: readonly string[]): string {
  if (keys.includes("image")) {
    return "create_actor takes no image link: your own portrait image goes in portrait: { asset_id } as an image asset, " +
      "a held object's picture in holding[].reference, and a photo to copy pose, set and light from (with a new face) " +
      "in style_reference; or describe a fictional adult in description, or derive a view of an actor with from_actor_id";
  }
  return `unknown field(s) ${keys.join(", ")}: create_actor accepts description, gender, approximate_age, name, quality, ` +
    "aspect_ratios, from_actor_id, framing, holding, setting, style_reference, portrait";
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
          `Image quality: ${accepted.join(" | ")}. Omitted means ${defaultQuality}. high draws the most natural portrait. ` +
            "The price per image depends on it; quote shows it before any charge.",
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

/** An imported portrait (#1095) is not generated: its snapshot prices the portrait at 0. */
export const actorUnitCredits = z.object({
  portrait: z.number().int().nonnegative(),
  variant: z.number().int().positive(),
});

/** The words an imported actor (#1095) stores and `list_actors` shows: the look comes from the image, not from text. */
export const ACTOR_PORTRAIT_IMPORT_DESCRIPTION = "An actor from your own portrait image";

/** Unit prices of a personal actor. */
/** Admission copies them into the run's snapshot and settlement reads the snapshot, so a change here leaves old runs alone. */
export const ACTOR_UNIT_CREDITS: Readonly<Record<ActorQualityAccepted, z.infer<typeof actorUnitCredits>>> = {
  medium: { portrait: 4, variant: 8 },
  high: { portrait: 45, variant: 18 },
};

/** A view of an existing actor (`from_actor_id`) is an edit of its portrait and keeps the edit's price (#1101). */
export const ACTOR_VIEW_PORTRAIT_CREDITS: Readonly<Record<ActorQualityAccepted, number>> = { medium: 4, high: 12 };

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
  framing: z.enum(ACTOR_PORTRAIT_FRAMINGS),
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

/** The style reference as admitted (#975): the image asset the run reads. */
export const storedStyleReference = z.object({
  asset_id: z.string().min(1),
  key: z.string().min(1),
  mime: z.enum(["image/png", "image/jpeg"]),
});
export type StoredStyleReference = z.infer<typeof storedStyleReference>;

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
    framing: z.enum(ACTOR_PORTRAIT_FRAMINGS).optional(),
    holding: z.array(storedHoldingItem).optional(),
    setting: z.string().min(1).optional(),
    /** #1192: a derived view's own words of look, clothing and pose; `description` stays the source's. */
    look: z.string().min(1).optional(),
    style_reference: storedStyleReference.optional(),
    /** #1095: the image asset admission found, the same shape as a style reference. */
    portrait: storedStyleReference.optional(),
  })
  .refine((input) => input.look === undefined || input.source_actor !== undefined, {
    error: "a stored look comes only with a source actor",
    path: ["look"],
  })
  .refine((input) => input.portrait === undefined || (input.source_actor === undefined && input.style_reference === undefined), {
    error: "a stored portrait comes with another source",
    path: ["portrait"],
  })
  // One way only: an input whose portrait was erased still reads; a free portrait unit never generates one.
  .refine((input) => input.portrait === undefined || input.pricing_snapshot.unit_credits.portrait === 0, {
    error: "a stored portrait is priced above zero",
    path: ["portrait"],
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
  style_reference: { kind: "implemented", provenBy: "egress" },
  portrait: { kind: "implemented", provenBy: "egress" },
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
    "the source actor, a held object's picture, the style reference or the portrait image could not be read; no actor " +
    "was created and nothing was charged",
  actor_portrait_not_one_face:
    "the portrait image did not show exactly one face; no actor was created and nothing was charged",
  actor_portrait_framing:
    "the face in the portrait image is cut off, too small or too large for a presenter; no actor was created and " +
    "nothing was charged. Use a photo from head-and-shoulders to full height, with the whole face in the frame and the " +
    "person filling the frame's height",
  actor_resembles_reference:
    "the portrait looked too much like a person in style_reference; no actor was created and nothing was charged. " +
    "Retry, or choose another reference photo",
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
  "switched off the call fails with actor_generation_disabled. from_actor_id keeps the face (checked; a mismatch " +
  "costs nothing). With style_reference a portrait that looks like a person in the photo is refused at no charge, and " +
  "the price is the same. portrait (with gender and approximate_age) becomes the 9:16 portrait at no charge, only the " +
  "other formats are charged; an image without exactly one face, or with the face cut off, too small or too large, is " +
  "refused at no charge. A brand mascot drawn with generate_image can be that portrait when its face reads as a human " +
  "face (a cartoon person); an animal or object mascot is refused, so show it in inserts instead.";
