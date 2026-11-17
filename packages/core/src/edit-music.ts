import { z } from "zod";
import { musicRequest } from "./music.js";

// Music under an edit (render_edit): a bed from our library, free, or a track made for the cut, paid on delivery; one of them, never both.

export const EDIT_MUSIC_GENRES = ["fashion", "tech", "food", "beauty", "sport", "lofi", "cinematic", "corporate", "playful", "acoustic", "ambient",
  "hiphop_light"] as const;
export const EDIT_MUSIC_ENERGIES = ["calm", "medium", "driving"] as const;
type Bed = { genre: (typeof EDIT_MUSIC_GENRES)[number]; energy: (typeof EDIT_MUSIC_ENERGIES)[number]; bpm: number; seconds: number };

/** The library's beds: each an instrumental loop of about 30 s, its genre, energy, tempo and length; a longer cut loops it. */
export const EDIT_MUSIC_TRACKS = {
  runway_house: { genre: "fashion", energy: "medium", bpm: 122, seconds: 30.7 },
  fashion_calm: { genre: "fashion", energy: "calm", bpm: 100, seconds: 28.4 },
  fashion_driving: { genre: "fashion", energy: "driving", bpm: 126, seconds: 30.7 },
  fashion_disco: { genre: "fashion", energy: "medium", bpm: 116, seconds: 30.7 },
  fashion_luxe: { genre: "fashion", energy: "calm", bpm: 95, seconds: 30.7 },
  tech_minimal: { genre: "tech", energy: "medium", bpm: 110, seconds: 30.7 },
  tech_calm: { genre: "tech", energy: "calm", bpm: 90, seconds: 29.1 },
  tech_driving: { genre: "tech", energy: "driving", bpm: 128, seconds: 30.7 },
  tech_future: { genre: "tech", energy: "medium", bpm: 115, seconds: 30.7 },
  tech_synthwave: { genre: "tech", energy: "driving", bpm: 118, seconds: 30.7 },
  food_calm: { genre: "food", energy: "calm", bpm: 85, seconds: 30.7 },
  food_medium: { genre: "food", energy: "medium", bpm: 105, seconds: 30.7 },
  food_driving: { genre: "food", energy: "driving", bpm: 124, seconds: 30.7 },
  food_bossa: { genre: "food", energy: "calm", bpm: 95, seconds: 30.7 },
  luxe_cinematic: { genre: "beauty", energy: "calm", bpm: 75, seconds: 30.7 },
  beauty_medium: { genre: "beauty", energy: "medium", bpm: 110, seconds: 30.7 },
  beauty_driving: { genre: "beauty", energy: "driving", bpm: 122, seconds: 30.7 },
  beauty_dreamy: { genre: "beauty", energy: "calm", bpm: 80, seconds: 30.7 },
  sport_drive: { genre: "sport", energy: "driving", bpm: 130, seconds: 30.7 },
  sport_calm: { genre: "sport", energy: "calm", bpm: 95, seconds: 30.7 },
  sport_medium: { genre: "sport", energy: "medium", bpm: 115, seconds: 30.4 },
  sport_epic: { genre: "sport", energy: "driving", bpm: 130, seconds: 30.7 },
  lofi_calm: { genre: "lofi", energy: "calm", bpm: 75, seconds: 30.7 },
  lofi_medium: { genre: "lofi", energy: "medium", bpm: 90, seconds: 30.7 },
  lofi_jazzy: { genre: "lofi", energy: "calm", bpm: 75, seconds: 29 },
  lofi_rainy: { genre: "lofi", energy: "calm", bpm: 70, seconds: 29.3 },
  cinematic_calm: { genre: "cinematic", energy: "calm", bpm: 70, seconds: 30 },
  cinematic_medium: { genre: "cinematic", energy: "medium", bpm: 100, seconds: 30.7 },
  cinematic_driving: { genre: "cinematic", energy: "driving", bpm: 120, seconds: 29.8 },
  cinematic_tension: { genre: "cinematic", energy: "medium", bpm: 90, seconds: 30.7 },
  corporate_calm: { genre: "corporate", energy: "calm", bpm: 90, seconds: 30.6 },
  corporate_medium: { genre: "corporate", energy: "medium", bpm: 110, seconds: 29.1 },
  corporate_driving: { genre: "corporate", energy: "driving", bpm: 124, seconds: 30.7 },
  corporate_bright: { genre: "corporate", energy: "medium", bpm: 105, seconds: 30.7 },
  bright_pop: { genre: "playful", energy: "driving", bpm: 118, seconds: 30.7 },
  playful_quirky: { genre: "playful", energy: "medium", bpm: 110, seconds: 30.7 },
  playful_calm: { genre: "playful", energy: "calm", bpm: 85, seconds: 27.2 },
  playful_cartoon: { genre: "playful", energy: "driving", bpm: 128, seconds: 30.7 },
  warm_acoustic: { genre: "acoustic", energy: "medium", bpm: 100, seconds: 30.7 },
  acoustic_calm: { genre: "acoustic", energy: "calm", bpm: 75, seconds: 30.7 },
  acoustic_driving: { genre: "acoustic", energy: "driving", bpm: 120, seconds: 30.7 },
  acoustic_piano: { genre: "acoustic", energy: "medium", bpm: 95, seconds: 30.7 },
  ambient_calm: { genre: "ambient", energy: "calm", bpm: 60, seconds: 28.3 },
  ambient_medium: { genre: "ambient", energy: "medium", bpm: 90, seconds: 30.7 },
  ambient_driving: { genre: "ambient", energy: "driving", bpm: 118, seconds: 30.7 },
  ambient_shimmer: { genre: "ambient", energy: "calm", bpm: 70, seconds: 28.3 },
  hiphop_calm: { genre: "hiphop_light", energy: "calm", bpm: 80, seconds: 30.7 },
  hiphop_medium: { genre: "hiphop_light", energy: "medium", bpm: 92, seconds: 30.7 },
  hiphop_driving: { genre: "hiphop_light", energy: "driving", bpm: 140, seconds: 30.7 },
  hiphop_funky: { genre: "hiphop_light", energy: "medium", bpm: 98, seconds: 27.6 },
} as const satisfies Record<string, Bed>;
export type EditMusicTrack = keyof typeof EDIT_MUSIC_TRACKS;
export const EDIT_MUSIC_TRACK_NAMES = Object.keys(EDIT_MUSIC_TRACKS) as [EditMusicTrack, ...EditMusicTrack[]];

/** One bed as `list_template_sounds` lists it: its id, genre, energy, tempo and length. */
export const editMusicBed = z.strictObject({ id: z.string().min(1), genre: z.enum(EDIT_MUSIC_GENRES), energy: z.enum(EDIT_MUSIC_ENERGIES),
  bpm: z.number().int().positive(), seconds: z.number().positive() });
export type EditMusicBed = z.infer<typeof editMusicBed>;
export const listEditMusicBeds = (): EditMusicBed[] => EDIT_MUSIC_TRACK_NAMES.map(id => ({ id, ...EDIT_MUSIC_TRACKS[id] }));

/** The level bounds: dB from the music's own level, which a cut without voice plays at and a voice lowers it under. */
export const EDIT_MUSIC_MIN_VOLUME_DB = -24, EDIT_MUSIC_MAX_VOLUME_DB = 3;
/** The shortest stretch the music plays, and the longest fade at its end. */
export const EDIT_MUSIC_MIN_SECONDS = 3, EDIT_MUSIC_LONGEST_FADE_OUT = 5, EDIT_MUSIC_DEFAULT_FADE_OUT = 1.5;

export const editMusic = z.strictObject({
  track: z.enum(EDIT_MUSIC_TRACK_NAMES).optional().describe("A bed from our library, free: its id from list_template_sounds (music_beds, with " +
    "genre, energy, tempo and length)"),
  generate: musicRequest.optional().describe('Instead of track, only when no library bed fits: a track made for this cut by AI, paid on ' +
    'delivery: "auto" takes the mood from the captions and the voice, { mood } says it in your words, such as "moody deep house"; it may ' +
    "carry an invisible watermark"),
  volume: z.number().min(EDIT_MUSIC_MIN_VOLUME_DB).max(EDIT_MUSIC_MAX_VOLUME_DB).default(0)
    .describe("dB from the music's own level: 0 plays it at full level where no voice speaks, -6 half as loud"),
  at: z.number().min(0).max(600).default(0).describe("The second of the edit the music starts at"),
  fade_out: z.number().min(0).max(EDIT_MUSIC_LONGEST_FADE_OUT).default(EDIT_MUSIC_DEFAULT_FADE_OUT)
    .describe("Seconds the music fades out over at the cut's end"),
  duck: z.boolean().optional().describe("With voice: true (the default) lowers the music under each spoken line and lifts it between them; " +
    "false keeps it low under the whole voice"),
}).refine(music => (music.track === undefined) !== (music.generate === undefined), "music takes one source: track or generate");
export type EditMusicInput = z.infer<typeof editMusic>;
