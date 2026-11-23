import { REFERENCE_HOOK_SECONDS, type ReferenceSegment } from "./reference-profile.js";


type Mouth = NonNullable<ReferenceSegment["mouth"]>;
type LyricBeat = { spoken_summary: string; presenter_behaviour: string; speaker?: string | null | undefined; speakers?: unknown[] | undefined };
type LyricProfile = {
  music: string;
  source: { duration_s: number };
  beats: LyricBeat[];
  analysis: { warnings?: string[] | undefined };
  transcript?: unknown[] | undefined;
  transcript_language?: string | null | undefined;
  hook?: { text: string; end_s: number; caption?: string | undefined } | undefined;
  speakers?: { id: string; on_screen: boolean }[] | undefined;
  segments?: { start_s: number; end_s: number; speaker: string; mouth?: Mouth | undefined }[] | undefined;
  spellings?: unknown[] | undefined;
  voice?: unknown;
};

const MAX_WARNINGS = 8;
export const SUNG_WORDS_PREFIX = "transcript: the words heard are the lyrics";
const NO_MUSIC = /^\s*(?:none|no music|n\/a|-)?\s*$/i;

export function wordsAreLyrics(profile: Pick<LyricProfile, "music" | "speakers" | "segments">): boolean {
  if (NO_MUSIC.test(profile.music)) return false;
  const onScreen = profile.speakers ? new Set(profile.speakers.filter(speaker => speaker.on_screen).map(speaker => speaker.id)) : undefined;
  const presenter = (profile.segments ?? []).filter(segment => !onScreen || onScreen.has(segment.speaker));
  if (!presenter.some(segment => segment.mouth?.measured === "still")) return false;
  const length = (segment: { start_s: number; end_s: number }) => Math.max(0, segment.end_s - segment.start_s);
  const still = presenter.filter(({ mouth }) => mouth?.measured === "still"
    || (mouth?.measured === "not_measured" && (mouth.vision === "closed" || mouth.vision === "not_visible")));
  const total = presenter.reduce((sum, segment) => sum + length(segment), 0);
  return total > 0 && still.reduce((sum, segment) => sum + length(segment), 0) > total / 2;
}

export function withoutSungWords<P extends LyricProfile>(profile: P): P {
  if (!wordsAreLyrics(profile)) return profile;
  const { voice: _voice, spellings: _spellings, ...rest } = profile;
  const said = `${SUNG_WORDS_PREFIX} of the music (${profile.music.trim().slice(0, 60)}); the presenter does not speak, ` +
    "so transcript, hook text and voice are empty";
  const warnings = [...profile.analysis.warnings ?? []].slice(0, MAX_WARNINGS - 1);
  return { ...rest,
    transcript: [], transcript_language: null, speakers: [], segments: [],
    ...(profile.hook ? { hook: { text: "", end_s: Math.min(profile.source.duration_s, REFERENCE_HOOK_SECONDS),
      ...(profile.hook.caption ? { caption: profile.hook.caption } : {}) } } : {}),
    beats: profile.beats.map(beat => ({ ...beat, spoken_summary: "", presenter_behaviour: beat.presenter_behaviour === "speaking" ? "reacting" : beat.presenter_behaviour,
      ...(beat.speaker !== undefined ? { speaker: null } : {}), ...(beat.speakers !== undefined ? { speakers: [] } : {}) })),
    analysis: { ...profile.analysis, warnings: [...warnings, said.slice(0, 200)] },
  } as unknown as P;
}
