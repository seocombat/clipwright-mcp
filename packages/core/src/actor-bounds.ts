/** Known values only grow and match the DB check: stored runs and responses are read by them. */
export const ACTOR_GENDERS_KNOWN = ["female", "male"] as const;
export type ActorGender = (typeof ACTOR_GENDERS_KNOWN)[number];
export const ACTOR_ASPECTS_KNOWN = ["9:16", "1:1", "16:9"] as const;
export type ActorAspectKnown = (typeof ACTOR_ASPECTS_KNOWN)[number];
/** The `account_actors_adult` floor: nothing younger has ever been written. */
export const ACTOR_AGE_FLOOR = 18;

/** Intake bounds are a product decision and may narrow. A separate module, so a test can */
/** narrow each by mocking and check that no read schema depends on them. */
export const ACTOR_DESCRIPTION_MAX_CHARS = 500;
export const ACTOR_NAME_MAX_CHARS = 100;
export const ACTOR_MIN_AGE = 18;
export const ACTOR_MAX_AGE = 90;
export const ACTOR_GENDERS_ACCEPTED = ["female", "male"] as const satisfies readonly ActorGender[];
