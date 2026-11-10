import { z } from "zod";

// The drawn styles a film draft may name (#1338): each draws the whole film from the draft's beats, in the draft's brand colours, instead of
// the draft's scene code. A test holds these names equal to the styles and subjects the render site carries.

export const FILM_STYLES = ["pixel", "ps2", "comic", "bricks", "clay", "paper", "anime", "lowpoly", "riso", "diorama",
  "popup", "claymation", "watercolor", "isle", "cel80s"] as const;
export type FilmStyle = (typeof FILM_STYLES)[number];

/** What a style can draw: one subject a beat. */
export const FILM_STYLE_SUBJECTS = ["seed", "plant-seed", "water", "sun", "sprout", "transplant", "stake", "green-fruit", "tomato", "salad",
  "hook_cold", "hook_heat", "hook_how", "loop", "low", "coil_in", "coil_soak", "fan_blow", "fan_cool", "comp_travel", "comp_squeeze", "out_coil",
  "heat_away", "to_liquid", "valve", "pressure", "ice", "same_loop", "finale"] as const;

/** A styled film's bounds: beats, a beat's length and the film's, as the style runtime takes them. */
export const FILM_MAX_BEATS = 40, FILM_BEAT_MIN_SEC = 0.5, FILM_BEAT_MAX_SEC = 20, FILM_STYLED_MAX_SEC = 90, FILM_BEAT_LINE_MAX_CHARS = 160;

const ANCHOR = z.string().regex(/^[A-Za-z_]\w{0,40}$/, "an anchor is an identifier");
/** One beat: the subject drawn, the line shown, and when it starts (an anchor of the draft's cues, or seconds); it lasts until the next. */
export const filmBeat = z.strictObject({
  subject: z.enum(FILM_STYLE_SUBJECTS).describe("What the style draws on this beat"),
  line: z.string().trim().min(1).max(FILM_BEAT_LINE_MAX_CHARS).describe("The words shown on this beat"),
  at: z.union([ANCHOR, z.number().min(0).max(600)]).describe("When the beat starts: an anchor of the draft's cues or seconds; the first starts the film"),
});
export type FilmBeat = z.infer<typeof filmBeat>;

const ROLE = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** What a styled draft keeps beside its theme: the style, the brand roles the brand or the call chose (none: the style's own colours), the
 *  account's seed for the style's variation, and the beats. */
export const filmDraftCanvas = z.strictObject({
  style: z.enum(FILM_STYLES),
  roles: z.strictObject({ background: ROLE.optional(), surface: ROLE.optional(), ink: ROLE.optional(), accent: ROLE.optional(),
    accent_ink: ROLE.optional() }),
  seed: z.number().int().min(0).max(2 ** 31 - 1),
  beats: z.array(filmBeat).max(FILM_MAX_BEATS),
});
export type FilmDraftCanvas = z.infer<typeof filmDraftCanvas>;
