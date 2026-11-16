import { z } from "zod";
import { DELIVERED_VIDEO_MINIMUM_CREDITS, PRODUCTION_CREDITS_PER_SECOND, SCENE_CREDITS } from "./parts-pricing.js";
import { MUSIC_BED_CREDITS, type MusicRequest } from "./music.js";
import { MAX_SCENES } from "./ugc-scenes.js";
import { namedThings } from "./explainer-fit.js";

/** The tariff new faceless runs are admitted on (#800); runs admitted on `faceless-image-i2v-v1` keep it. */
export const FACELESS_TARIFF_ID = "faceless-parts-v1" as const;
export const FACELESS_LEGACY_TARIFF_ID = "faceless-image-i2v-v1" as const;
/** A directed video's tariff (#1573): its level, live seconds and direction line, frozen at admission. */
export const FACELESS_DIRECTED_TARIFF_ID = "faceless-parts-v2" as const;
export const FACELESS_TARIFF_IDS = [FACELESS_TARIFF_ID, FACELESS_LEGACY_TARIFF_ID, FACELESS_DIRECTED_TARIFF_ID] as const;
/** A picture video ends with its speech and runs at least 25 s. */
export const FACELESS_MIN_OUTPUT_FRAMES = 625;
/** An explainer runs to its last word and 0.8 s past it, however short; one second is the shortest its composition draws (#1216). */
export const FACELESS_EXPLAINER_MIN_OUTPUT_FRAMES = 25;
/** The length a caller selects, in seconds. */
export const FACELESS_MIN_SELECTED_SECONDS = 30;
export const FACELESS_MAX_SELECTED_SECONDS = 90;
/** The pre-speech estimate floor keeps the 4 s offset the 26 s floor had from the former 30 s minimum. */
export const FACELESS_MIN_ESTIMATE_SEC = 21;
/** A script is admitted when its estimate fits the selection plus 5 s; a video longer than that is named in `warnings[]`. */
export const facelessMaxEstimateFrames = (selectedFrames: number) => Math.min(selectedFrames + 125, 2250);
/** A video is planned within a quarter past its selection, at most 90 s; the charge stays within the selection's quote. */
export const facelessMaxOutputFrames = (selectedFrames: number) => Math.min(Math.floor(selectedFrames * 1.25), 2250);
/** The most characters one narration speaks, and a pace below every voice's: the slowest measured one reads 13.87 a second. */
export const FACELESS_SPEECH_MAX_CHARACTERS = 2500;
export const FACELESS_SLOWEST_CHARACTERS_PER_SECOND = 13;
/** A narration longer than its plan is delivered at its length: the longest one at that pace, a 5 s lead, whole seconds. */
export const FACELESS_MAX_OUTPUT_FRAMES = Math.ceil(FACELESS_SPEECH_MAX_CHARACTERS / FACELESS_SLOWEST_CHARACTERS_PER_SECOND + 5) * 25;
/** Pictures a public run may generate, the opener's first frame included. */
export const FACELESS_PUBLIC_MAX_GENERATED_IMAGES = 31;
/** One picture per two selected seconds plus four, never past the runtime's ceiling: the run's beat limit and the admission cap read it. */
export const facelessMaxGeneratedImages = (selectedFrames: number, imageCeiling = Infinity) =>
  Math.min(imageCeiling, Math.floor(selectedFrames / 50) + 4);

export const facelessQuote = z.object({
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250),
  baseCredits: z.number().int().nonnegative(),
  openerCredits: z.number().int().nonnegative(),
  totalCredits: z.number().int().nonnegative(),
  tariffId: z.enum(FACELESS_TARIFF_IDS),
  captions: z.boolean(),
  /** On the parts tariff: the generated pictures priced (at most, on a quote; delivered, on a run) and each one's price. */
  images: z.number().int().nonnegative().optional(),
  imageCredits: z.number().int().nonnegative().optional(),
  /** Asked-for music, inside `totalCredits` (#1063); absent when not asked. */
  musicCredits: z.number().int().positive().optional(),
  /** Action shots (#1113) inside `totalCredits`: on a quote the ceiling, on a run the drawn seconds; absent when none was asked. A directed
   *  video's live seconds: on its quote all of them at the text-in-frame rate, the most it charges; on its run those with no text in frame. */
  shotSeconds: z.number().int().nonnegative().optional(),
  shotCredits: z.number().int().nonnegative().optional(),
  /** A directed video's run: its live seconds whose frame shows readable text, a logo or a sign, inside `totalCredits`; absent elsewhere. */
  textShotSeconds: z.number().int().nonnegative().optional(),
  textShotCredits: z.number().int().nonnegative().optional(),
  /** A directed video's quote: what it is charged when no live second shows readable text, at most `totalCredits`; absent elsewhere. */
  totalCreditsWithoutText: z.number().int().nonnegative().optional(),
  /** Scenes made for the video (#1107 on faceless, #1113), inside `totalCredits`: asked on a quote, drawn on a run; absent when none was asked. */
  scenes: z.number().int().nonnegative().optional(),
  sceneCredits: z.number().int().nonnegative().optional(),
  /** The explainer format: the hero's pose pictures it makes, each a generated picture inside `images`; absent on other runs. */
  posePictures: z.number().int().nonnegative().optional(),
  /** The explainer's scenes drawn for this video, inside `totalCredits`: on a quote the most, on a run the drawn; absent when none are made. */
  authoredScenes: z.number().int().nonnegative().optional(),
  authoredSceneCredits: z.number().int().nonnegative().optional(),
  /** An explainer's pictures of named things (#1277), outside `images`: on a quote the most, on a run the shown; absent when none. */
  objectPictures: z.number().int().nonnegative().optional(),
  objectPictureCredits: z.number().int().nonnegative().optional(),
  /** A drawn explainer film's price, inside `baseCredits` beside its hero's poses: on a quote at the selection, on a run at the delivered length. */
  filmCredits: z.number().int().positive().optional(),
  /** A directed video's direction (its storyboard, look and sound), inside `totalCredits`; absent on other videos. */
  directionCredits: z.number().int().positive().optional(),
}).strict();
export type FacelessQuote = z.infer<typeof facelessQuote>;
/** A run's bill names the delivered frames, which may pass the selection or, on an explainer, fall short of 25 s; its total stays within the quote. */
export const facelessRunBilling = facelessQuote.extend({ outputFrames: z.number().int().min(FACELESS_EXPLAINER_MIN_OUTPUT_FRAMES)
  .max(FACELESS_MAX_OUTPUT_FRAMES) }).strict();

/** The legacy tariff's numbers: base credits per 1500 frames (a minute at 25 fps), the base's floor, and the opening clip. */
export const FACELESS_LEGACY_CREDITS_PER_1500_FRAMES = 180;
export const FACELESS_LEGACY_MIN_BASE_CREDITS = 200;
export const FACELESS_LEGACY_OPENER_CREDITS = 150;

/** The parts tariff: a generated picture, the opening clip, */
/** and every second of the video for story, voice, checks and render, at least 50 for a delivered video. */
export const FACELESS_IMAGE_CREDITS = 7;
export const FACELESS_OPENER_CREDITS = 49;
export const FACELESS_CREDITS_PER_1500_FRAMES = PRODUCTION_CREDITS_PER_SECOND * 60;
export const FACELESS_MIN_BASE_CREDITS = DELIVERED_VIDEO_MINIMUM_CREDITS;

/** An action shot (#1113): its seconds at make_ugc's shot rate, at most ten a run (#1192) and five seconds each. */
export const FACELESS_SHOT_CREDITS_PER_SECOND = 30;
export const FACELESS_MAX_SHOTS = 10;
export const FACELESS_SHOT_MAX_SEC = 5;
/** The largest dollar cap a faceless run may be configured with; a larger env value turns faceless off. Ten 5 s shots on a 90 s run need $8.47. */
export const FACELESS_MAX_CAP_USD_MICROS = 10_000_000;
/** The seconds a run with `shots` action shots may be charged for, every shot at its longest. */
/** Faceless scenes have their own switch beside make_ugc's (#1113): their model calls join the faceless cost journal first. */
export const facelessScenesEnabled = (env: Record<string, string | undefined>): boolean => env.CLIPWRIGHT_FACELESS_SCENES === "1";
export const facelessShotSecondsCeiling =(shots: number) => shots * FACELESS_SHOT_MAX_SEC;

/** The parts price of `images` generated pictures in `outputFrames` frames: the production seconds rounded up once. */
export function facelessPartsBase(images: number, outputFrames: number): number {
  return images * FACELESS_IMAGE_CREDITS + Math.ceil(FACELESS_CREDITS_PER_1500_FRAMES * outputFrames / 1500);
}

/** The explainer format (#1216) is off unless switched on: it draws its scenes and makes no opening clip. */
export const facelessExplainerEnabled = (env: Record<string, string | undefined>): boolean => env.CLIPWRIGHT_FACELESS_EXPLAINER === "1";
/** The explainer hero's pose set: one generated picture a pose, made when the run names a character. */
export const FACELESS_EXPLAINER_POSE_PICTURES = 9;
/** An explainer scene drawn for its video: its price, the most a video draws, and their switch; charged only when the delivered video draws it. */
export const EXPLAINER_BEAT_CREDITS = 65;
export const EXPLAINER_MAX_AUTHORED_BEATS = 8;
export const explainerBeatsEnabled = (env: Record<string, string | undefined>): boolean => env.CLIPWRIGHT_EXPLAINER_BEATS === "1";
/** An explainer's pictures of the things its script names (#1277): one for each sentence naming a thing in a list of things, at most 12, none
 * for steps through software; each a generated picture once shown. */
export const EXPLAINER_MAX_OBJECT_PICTURES = 12;
export const explainerObjectCeiling = (script: string): number => Math.min(EXPLAINER_MAX_OBJECT_PICTURES, namedThings(script));
/** A drawn explainer film (#1291): one price for a film up to 60 s, and each second past it; its hero's poses are priced as pictures. */
export const EXPLAINER_FILM_CREDITS = 500;
export const EXPLAINER_FILM_INCLUDED_SECONDS = 60;
export const EXPLAINER_FILM_CREDITS_PER_EXTRA_SECOND = 8;
/** The drawn-film tariffs and their film price: up to the included seconds, then each second past them. A snapshot names its tariff, so a
 *  price change is a new tariff: a run admitted at the old price settles at it. */
export const SKILL_FILM_TARIFFS = {
  "skill-explainer-v1": { filmCredits: EXPLAINER_FILM_CREDITS, perExtraSecond: EXPLAINER_FILM_CREDITS_PER_EXTRA_SECOND },
  "skill-agent-opus-v1": { filmCredits: 1200, perExtraSecond: 20 },
  "skill-agent-sonnet-v1": { filmCredits: 900, perExtraSecond: 15 },
  "skill-agent-sonnet-v2": { filmCredits: 700, perExtraSecond: 12 },
} as const;
export type SkillFilmTariff = keyof typeof SKILL_FILM_TARIFFS;
export const isSkillFilmTariff = (value: unknown): value is SkillFilmTariff => typeof value === "string" && Object.hasOwn(SKILL_FILM_TARIFFS, value);
export const skillFilmCredits = (tariff: SkillFilmTariff, outputFrames: number): number => SKILL_FILM_TARIFFS[tariff].filmCredits +
  SKILL_FILM_TARIFFS[tariff].perExtraSecond * Math.max(0, Math.ceil(outputFrames / 25) - EXPLAINER_FILM_INCLUDED_SECONDS);
export const explainerFilmCredits = (outputFrames: number): number => skillFilmCredits("skill-explainer-v1", outputFrames);
/** The explainer's two levels a customer picks by name (#1291 F4): each freezes its film tariff at admission; omitted is `standard`. */
export const EXPLAINER_TIERS = ["standard", "pro"] as const;
export type ExplainerTier = (typeof EXPLAINER_TIERS)[number];
export const EXPLAINER_TIER_TARIFFS = { standard: "skill-agent-sonnet-v2", pro: "skill-agent-opus-v1" } as const satisfies Record<ExplainerTier, SkillFilmTariff>;
export const explainerTierTariff = (tier: ExplainerTier | undefined): SkillFilmTariff => EXPLAINER_TIER_TARIFFS[tier ?? "standard"];
/** The explainer's film switch on `api` (#1291 F4): off, every explainer is refused before any reserve. */
export const skillAgentEnabled = (env: Record<string, string | undefined>): boolean => env.CLIPWRIGHT_SKILL_AGENT === "1";

/** The picture counts a parts snapshot's base may hold for `selectedFrames`: a picture video's ceiling, or an explainer's poses with or without a
 * named character. */
export const facelessImageCeilings = (selectedFrames: number): number[] =>
  [facelessMaxGeneratedImages(selectedFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES), FACELESS_EXPLAINER_POSE_PICTURES, 0];

/** The most a selection is charged: every picture the run may generate, every selected second, the opening clip. */
/** An explainer makes no opening clip; its pictures are the hero's poses, charged as generated pictures when delivered. */
export function quoteFaceless(input: { outputFrames: number; captions: boolean; music?: MusicRequest | undefined;
  shots?: number | undefined; scenes?: number | undefined;
  explainer?: { character: boolean; beats?: boolean; objects?: number; film?: SkillFilmTariff } | undefined }): FacelessQuote {
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).parse(input.outputFrames);
  const captions = z.boolean().parse(input.captions);
  const openerCredits = input.explainer ? 0 : FACELESS_OPENER_CREDITS;
  const posePictures = input.explainer ? (input.explainer.character ? FACELESS_EXPLAINER_POSE_PICTURES : 0) : undefined;
  // An explainer generates only its hero's poses; a picture video, one picture per two selected seconds plus four.
  const images = posePictures ?? facelessMaxGeneratedImages(outputFrames, FACELESS_PUBLIC_MAX_GENERATED_IMAGES);
  // A drawn film (#1291) is priced whole: its poses and the film, with no line of the scenes and pictures the film draws itself.
  if (input.explainer?.film) {
    const filmCredits = skillFilmCredits(input.explainer.film, outputFrames), baseCredits = images * FACELESS_IMAGE_CREDITS + filmCredits;
    return { outputFrames, baseCredits, openerCredits, totalCredits: Math.max(FACELESS_MIN_BASE_CREDITS, baseCredits), tariffId: FACELESS_TARIFF_ID,
      captions, images, imageCredits: FACELESS_IMAGE_CREDITS, posePictures: posePictures!, filmCredits };
  }
  const baseCredits = facelessPartsBase(images, outputFrames);
  const musicCredits = input.music === undefined ? 0 : MUSIC_BED_CREDITS;
  const shots = z.number().int().min(0).max(FACELESS_MAX_SHOTS).parse(input.shots ?? 0);
  const shotSeconds = facelessShotSecondsCeiling(shots), shotCredits = shotSeconds * FACELESS_SHOT_CREDITS_PER_SECOND;
  // A scene costs what it costs on make_ugc: one price per scene drawn.
  const scenes = z.number().int().min(0).max(MAX_SCENES).parse(input.scenes ?? 0), sceneCredits = scenes * SCENE_CREDITS;
  const authoredScenes = input.explainer?.beats ? EXPLAINER_MAX_AUTHORED_BEATS : 0, authoredSceneCredits = authoredScenes * EXPLAINER_BEAT_CREDITS;
  const objectPictures = z.number().int().min(0).max(EXPLAINER_MAX_OBJECT_PICTURES).parse(input.explainer?.objects ?? 0);
  const objectPictureCredits = objectPictures * FACELESS_IMAGE_CREDITS;
  // A delivered video costs at least the minimum, and the quote is the most it costs: an explainer with our drawn hero holds the minimum,
  // since its seconds alone may fall under it (a picture video's ceiling is always past it).
  return { outputFrames, baseCredits, openerCredits,
    totalCredits: Math.max(FACELESS_MIN_BASE_CREDITS, baseCredits + openerCredits) + musicCredits + shotCredits + sceneCredits + authoredSceneCredits +
      objectPictureCredits,
    tariffId: FACELESS_TARIFF_ID, captions, images, imageCredits: FACELESS_IMAGE_CREDITS, ...(musicCredits ? { musicCredits } : {}),
    ...(shots ? { shotSeconds, shotCredits } : {}), ...(scenes ? { scenes, sceneCredits } : {}), ...(posePictures === undefined ? {} : { posePictures }),
    ...(authoredScenes ? { authoredScenes, authoredSceneCredits } : {}), ...(objectPictures ? { objectPictures, objectPictureCredits } : {}) };
}

/** A directed video's prices (#1573): a live second, the direction line, and a picture made for the video; production and the minimum are
 *  the parts tariff's, with no opening clip. A video mostly on the caller's own pictures pays the smaller direction line. */
export const FACELESS_DIRECTED_PLAIN_LIVE_CREDITS_PER_SECOND = 12;
// A live second whose frame shows readable text, a logo or a sign costs the text rate; the hold counts every live second at it.
export const FACELESS_DIRECTED_TEXT_LIVE_CREDITS_PER_SECOND = 20;
export const FACELESS_DIRECTED_DIRECTION_CREDITS = 120;
export const FACELESS_DIRECTED_OWN_PICTURES_DIRECTION_CREDITS = 60;
export const FACELESS_DIRECTED_IMAGE_CREDITS = 9;
/** The pictures a directed video may make: one per 2.5 selected seconds, at most 24, less the caller's own pictures. */
export const facelessDirectedPictures = (selectedSeconds: number): number => Math.min(24, Math.ceil(selectedSeconds / 2.5));
/** The share of the selected seconds each level plays live: standard about a third, pro every second. Live shots are made at 720p only,
 *  so a 1080p video has none. */
export const FACELESS_DIRECTED_LIVE_SHARE = { standard: 1 / 3, pro: 1 } as const;

export interface DirectedFacelessAsk {
  outputFrames: number; captions: boolean; music?: MusicRequest | undefined; ownPictures: number; tier: ExplainerTier;
  resolution: "720p" | "1080p"; maxCredits?: number | undefined;
}
/** A directed quote and the terms admission freezes from it: the level's live seconds, those `max_credits` leaves held at the text rate, and
 *  the live seconds that hold pays when none shows text. */
export interface DirectedFacelessTerms { quote: FacelessQuote; liveSecondsCeiling: number; plainLiveSeconds: number; stillsCeiling: number;
  ownPicturesRun: boolean }

/** The most a directed video is charged on its level, which is also the budget it is planned within: every picture it may
 *  make, every selected second, the direction, and the level's live seconds held at the text rate, whole seconds that fit `maxCredits`. */
export function quoteDirectedFaceless(ask: DirectedFacelessAsk): DirectedFacelessTerms {
  // The run is charged what it shows, text seconds at 20 and the rest at 12: `totalCreditsWithoutText` is the charge when none shows text.
  const outputFrames = z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250).multipleOf(25).parse(ask.outputFrames);
  const seconds = outputFrames / 25, pictures = facelessDirectedPictures(seconds);
  const own = z.number().int().nonnegative().parse(ask.ownPictures), stillsCeiling = Math.max(0, pictures - own);
  const ownPicturesRun = own > 0 && own * 2 >= pictures;
  const directionCredits = ownPicturesRun ? FACELESS_DIRECTED_OWN_PICTURES_DIRECTION_CREDITS : FACELESS_DIRECTED_DIRECTION_CREDITS;
  const liveSecondsCeiling = ask.resolution === "1080p" ? 0 : Math.floor(seconds * FACELESS_DIRECTED_LIVE_SHARE[ask.tier]);
  const baseCredits = facelessPartsBaseAt(stillsCeiling, FACELESS_DIRECTED_IMAGE_CREDITS, outputFrames);
  const musicCredits = ask.music === undefined ? 0 : MUSIC_BED_CREDITS;
  const fixed = Math.max(FACELESS_MIN_BASE_CREDITS, baseCredits + directionCredits) + musicCredits;
  const text = FACELESS_DIRECTED_TEXT_LIVE_CREDITS_PER_SECOND, plain = FACELESS_DIRECTED_PLAIN_LIVE_CREDITS_PER_SECOND;
  const fits = ask.maxCredits === undefined ? liveSecondsCeiling : Math.floor((ask.maxCredits - fixed) / text);
  const shotSeconds = Math.max(0, Math.min(liveSecondsCeiling, fits)), shotCredits = shotSeconds * text;
  // A level plays at most its held seconds with or without text: the hold covers them at the text rate.
  const plainLiveSeconds = shotSeconds;
  return { liveSecondsCeiling, plainLiveSeconds, stillsCeiling, ownPicturesRun, quote: { outputFrames, baseCredits, openerCredits: 0,
    totalCredits: fixed + shotCredits, totalCreditsWithoutText: fixed + plainLiveSeconds * plain, tariffId: FACELESS_DIRECTED_TARIFF_ID,
    captions: z.boolean().parse(ask.captions), images: stillsCeiling, imageCredits: FACELESS_DIRECTED_IMAGE_CREDITS, directionCredits, shotSeconds,
    shotCredits, ...(musicCredits ? { musicCredits } : {}) } };
}

/** The parts base at a picture price: `images` pictures and every second of `outputFrames`, the seconds rounded up once. */
export function facelessPartsBaseAt(images: number, imageCredits: number, outputFrames: number): number {
  return images * imageCredits + Math.ceil(FACELESS_CREDITS_PER_1500_FRAMES * outputFrames / 1500);
}
