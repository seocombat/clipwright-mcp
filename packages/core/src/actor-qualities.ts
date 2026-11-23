export const ACTOR_QUALITIES_KNOWN = ["medium", "high"] as const;
export type ActorQuality = (typeof ACTOR_QUALITIES_KNOWN)[number];

export const ACTOR_QUALITIES_ACCEPTED = ["medium", "high"] as const satisfies readonly ActorQuality[];
export type ActorQualityAccepted = (typeof ACTOR_QUALITIES_ACCEPTED)[number];
export const ACTOR_DEFAULT_QUALITY: ActorQualityAccepted = "medium";
