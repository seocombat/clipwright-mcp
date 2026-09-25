/** Known qualities only grow: stored runs and responses are read by them. */
export const ACTOR_QUALITIES_KNOWN = ["medium", "high"] as const;
export type ActorQuality = (typeof ACTOR_QUALITIES_KNOWN)[number];

/** Qualities accepted on input, a subset of the known ones. A separate module, so a test can */
/** narrow it by mocking and check that no read schema depends on it. */
export const ACTOR_QUALITIES_ACCEPTED = ["medium", "high"] as const satisfies readonly ActorQuality[];
export type ActorQualityAccepted = (typeof ACTOR_QUALITIES_ACCEPTED)[number];
export const ACTOR_DEFAULT_QUALITY: ActorQualityAccepted = "medium";
