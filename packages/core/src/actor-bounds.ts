export const ACTOR_GENDERS_KNOWN = ["female", "male"] as const;
export type ActorGender = (typeof ACTOR_GENDERS_KNOWN)[number];
export const ACTOR_ASPECTS_KNOWN = ["9:16", "1:1", "16:9"] as const;
export type ActorAspectKnown = (typeof ACTOR_ASPECTS_KNOWN)[number];
export const ACTOR_AGE_FLOOR = 18;

export const ACTOR_DESCRIPTION_MAX_CHARS = 2000;
export const ACTOR_NAME_MAX_CHARS = 100;
export const ACTOR_MIN_AGE = 18;
export const ACTOR_MAX_AGE = 90;
export const ACTOR_GENDERS_ACCEPTED = ["female", "male"] as const satisfies readonly ActorGender[];
export const ACTOR_HOLDING_MAX_ITEMS = 2;
export const ACTOR_HOLDING_DESCRIPTION_MAX_CHARS = 1000;
export const ACTOR_SETTING_MAX_CHARS = 2000;
