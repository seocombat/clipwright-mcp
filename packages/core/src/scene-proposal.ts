import { z } from "zod";
import { sceneBible } from "./scene-bible.js";

/** The quote's scene proposal (#1491 S6): one scene for the video, the free devices it adds, and paid options each with its price. */
/** Shared by every quote that proposes: the person picks, and the paid call takes `proposal: { id, accept }`. */

export const SCENE_PROPOSAL_ID = /^sp_[a-z0-9]{20}$/;
export const MAX_PROPOSAL_OPTIONS = 12;
export const SCENE_PROPOSAL_OPTION_FIELDS = ["shots", "scenes", "music", "moves"] as const;
export type SceneProposalOptionField = (typeof SCENE_PROPOSAL_OPTION_FIELDS)[number];

const optionId = z.string().regex(/^o[1-9][0-9]?$/);

export const sceneProposalOption = z.strictObject({
  id: optionId,
  /** One line a person reads: what the option adds and where. */
  what: z.string().max(300),
  field: z.enum(SCENE_PROPOSAL_OPTION_FIELDS),
  /** What accepting it adds: the quote of the body with it, minus the quote of the body without it. */
  credits: z.number().int().nonnegative(),
  /** Exactly what goes into the body; read it, do not edit it. */
  item: z.unknown(),
});
export type SceneProposalOption = z.infer<typeof sceneProposalOption>;

export const sceneProposal = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("writing"), retry_after_s: z.number().int().positive() }),
  z.strictObject({
    state: z.literal("ready"),
    id: z.string().regex(SCENE_PROPOSAL_ID),
    expires_at: z.string(),
    scene: sceneBible.optional(),
    /** Free devices that come with the scene: number cards, the template look. */
    free: z.array(z.strictObject({ what: z.string().max(300) })).max(40),
    options: z.array(sceneProposalOption).max(MAX_PROPOSAL_OPTIONS),
    /** The body with the scene and the free devices, no options. */
    base_credits: z.number().int().nonnegative(),
    notes: z.array(z.string().max(300)).max(10),
  }),
  z.strictObject({ state: z.literal("unavailable"), reason: z.string().max(200) }),
]);
export type SceneProposal = z.infer<typeof sceneProposal>;

export const SCENE_PROPOSAL_DESCRIPTION = "An accepted scene proposal from quote_ugc: its id and the option ids the person picked. The " +
  "server adds the proposed scene, its free devices and the picked options to this body, and the quote with it is the reserve. The rest " +
  "of the body stays as quoted; a changed body is refused, so quote again.";
export const sceneProposalAccept = z.strictObject({
  id: z.string().regex(SCENE_PROPOSAL_ID),
  accept: z.array(optionId).max(MAX_PROPOSAL_OPTIONS)
    .refine(ids => new Set(ids).size === ids.length, { message: "each option id once" }).default([]),
}).describe(SCENE_PROPOSAL_DESCRIPTION);
export type SceneProposalAccept = z.infer<typeof sceneProposalAccept>;

export const PROPOSE_DESCRIPTION = "false: quote_ugc proposes no scene, and make_ugc adds no free move of its own; the live shots still share " +
  "one scene. Omitted, a quote with no scene proposes one, free, and make_ugc may add free moves, each named in warnings.";
export const proposeField = z.literal(false).optional().describe(PROPOSE_DESCRIPTION);

/** make_faceless takes the same block from quote_faceless (#1491). */
export const FACELESS_SCENE_PROPOSAL_DESCRIPTION = "An accepted scene proposal from quote_faceless: its id and the option ids the person " +
  "picked. The server adds the proposed scene, its free devices and the picked options to this body, and the quote with it is the " +
  "reserve. The rest of the body stays as quoted; a changed body is refused, so quote again.";
export const facelessSceneProposalAccept = sceneProposalAccept.describe(FACELESS_SCENE_PROPOSAL_DESCRIPTION);
export const FACELESS_PROPOSE_DESCRIPTION = "quote_faceless only: false asks for no scene proposal. Omitted, a quote with no scene proposes one, free.";
export const facelessProposeField = z.literal(false).optional().describe(FACELESS_PROPOSE_DESCRIPTION);

export const SCENE_PROPOSAL_DISABLED_MESSAGE = "proposal is not available right now; omit proposal";
export const SCENE_PROPOSAL_NOT_FOUND_MESSAGE = "no such scene proposal on this account; quote again";
export const SCENE_PROPOSAL_EXPIRED_MESSAGE = "the scene proposal has expired; quote again";
export const SCENE_PROPOSAL_STALE_MESSAGE = "the body changed since the quote that made this proposal; quote again";
export const SCENE_PROPOSAL_NOT_READY_MESSAGE = "the scene proposal is still being written; quote again";
export const SCENE_PROPOSAL_WITH_SCENE_MESSAGE = "pass scene or proposal, not both: the proposal brings its own scene";
