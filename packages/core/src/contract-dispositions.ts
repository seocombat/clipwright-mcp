import { z } from "zod";
import { makeUgcInputShape } from "./skills.js";
import { BROLL_POLICY_DESCRIPTION } from "./broll-policy.js";

/** Disposition registry for `make_ugc` input fields: every field must have a recorded */
/** decision. The type guards completeness; the egress test proves truth. */

/** Public contract version, sent as the `X-Clipwright-Contract` header and as `contract_version` */
/** in the quote response. Every breaking change must bump it. */
export const CONTRACT_VERSION = "2026-10-04";
export const CONTRACT_VERSION_HEADER = "X-Clipwright-Contract";

/** `implemented`: reaches the vendor or the composition tree; `rejected`: 400 before any run or reserve; */
/** `warned`: accepted with a `warnings[]` entry. `triggersWhen` keeps defaulted fields quiet on the happy path. */
export type Disposition =
  | { kind: "stored"; message: string } // Persistence only, without media enforcement.
  | { kind: "implemented"; provenBy: "egress" | "composition" }
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
  captions: {
    kind: "warned",
    warning: "captions requested but not rendered in this prototype (stage-B)",
    triggersWhen: "differs-from-default",
  },
  caption_style: {
    kind: "warned",
    warning:
      "caption_style is not honored: captions are not rendered in this prototype (stage-B)",
    triggersWhen: "differs-from-default",
  },

  // Both reach the vendor from the request; egress tests require three resolutions
  // to produce three different request bodies.
  resolution: { kind: "implemented", provenBy: "egress" },
  aspect_ratio: { kind: "implemented", provenBy: "egress" },

  // Gated by `CLIPWRIGHT_REMOTE_FETCH`: `resolveDispositions` rejects it when the flag is off.
  image: { kind: "implemented", provenBy: "egress" },
  actor_id: { kind: "implemented", provenBy: "egress" },
  actor_gender: { kind: "implemented", provenBy: "egress" },
  broll_policy: { kind: "stored", message: BROLL_POLICY_DESCRIPTION },

  // Offered to clients; deployment qualification gates admission below.
  segments: { kind: "implemented", provenBy: "composition" },
  inserts: { kind: "implemented", provenBy: "composition" },
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
}

/** `create_actor` is open only with the fetch surface: a personal actor cannot render without it. */
export function isActorGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIPWRIGHT_ACTOR_GENERATION === "1" && env.CLIPWRIGHT_REMOTE_FETCH === "1";
}

/** `create_actor` builds a face from words, so with generation on the advice points there. */
const PERSON_WITH_ACTOR_GENERATION: Disposition = {
  kind: "warned",
  warning:
    "person is not honored: this request uses the default actor; create a personal actor from the description with create_actor, then pass its actor_id",
  triggersWhen: "present",
};

/** Flags from the environment, read once per process: a kill switch is set at deploy, */
/** and `tools/list` must not flicker between calls. */
export function contractFlagsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ContractFlags {
  return {
    remoteFetch: env.CLIPWRIGHT_REMOTE_FETCH === "1",
    compose: env.CLIPWRIGHT_COMPOSE === "1",
    longForm: isLongFormQualificationEnabled(env),
  };
}

export function isLongFormQualificationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIPWRIGHT_LONG_FORM_QUALIFICATION === "1" &&
    env.CLIPWRIGHT_COMPOSE === "1" && env.CLIPWRIGHT_REMOTE_FETCH === "1";
}

export const LONG_FORM_DISABLED_MESSAGE =
  "long-form qualification is disabled on this deployment; pass script without segments or inserts";

const REMOTE_FETCH_DISABLED: Disposition = {
  kind: "rejected",
  message:
    "image is temporarily disabled (remote media fetch is off); omit it to render with the default actor",
};

/** Refusal for `background` when the composition stage is off. */
const COMPOSE_DISABLED: Disposition = {
  kind: "rejected",
  message:
    "background is not available: composition is disabled on this deployment. Request an aspect_ratio close to your image instead",
};

/** Long-form prerequisites in ONE expression for all its fields: two copies could */
/** open `segments` while `inserts` stay closed. */
function longFormReady(flags: ContractFlags): boolean {
  return flags.longForm === true && flags.remoteFetch && flags.compose;
}

const LONG_FORM_DISABLED: Disposition = { kind: "rejected", message: LONG_FORM_DISABLED_MESSAGE };

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

/** Offered fields come from the base table, in types and values alike: a kill switch */
/** is a server emergency state, not the shape of the contract. */
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
  if (disposition.kind === "stored") return `STORED ONLY: ${disposition.message}`;
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
    if (disposition.kind === "stored" && input[field] !== undefined) {
      warnings.push(disposition.message);
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
  return warnings;
}

/** Fields with an `implemented` disposition, input to the coverage meta-tests. From the */
/** base table: proof belongs to the code, and a disabled kill switch does not revoke it. */
export const IMPLEMENTED_FIELDS: ContractField[] = CONTRACT_FIELDS.filter(
  (field) => FIELD_DISPOSITIONS[field].kind === "implemented",
);

/** Two kinds of proof, not interchangeable: egress fields are checked against captured */
/** outgoing requests, composition fields (applied after the vendor) against composition tests. */
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
