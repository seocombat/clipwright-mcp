import type { ReferenceSpeaker } from "./reference-profile.js";

/** The note a listening beat carries: the presenter hears a recording, which a remake plays as a call. */
export const REFERENCE_LISTENING_NOTE = { what: "the presenter listens silently while another voice plays (recorded audio)",
  suggested_substitute: "a phone_call template over the presenter, who speaks the line: we do not play recorded audio" } as const;

type Speaker = Pick<ReferenceSpeaker, "id" | "on_screen" | "role" | "word_count">;

/** The off-screen voices a reel lays over its presenter (#1422): a narrator's, or any but an interviewer's while the presenter on screen says no */
/** word and no call rings or plays. Such a voice is a voice-over the presenter acts under, not a recording the presenter listens to. */
export function voiceOverSpeakers(speakers: readonly Speaker[], presenter: string | null | undefined, callHeard: boolean): Set<string> {
  const silent = !callHeard && speakers.some(speaker => speaker.id === presenter && speaker.on_screen && speaker.word_count === 0);
  return new Set(speakers.filter(speaker => !speaker.on_screen && speaker.id !== presenter
    && (speaker.role === "narrator" || (silent && speaker.role !== "interviewer"))).map(speaker => speaker.id));
}

type VoiceOverBeat = { presenter_behaviour: string; speaker?: string | null | undefined; speakers?: readonly { id: string }[] | undefined;
  sounds: readonly { kind: string }[] };
type VoiceOverProfile = { speakers?: readonly Speaker[] | undefined; beats: VoiceOverBeat[];
  unmapped: { what: string; beat_index: number; suggested_substitute: string }[] };

/** A sound of a call: a ring, or a recording played in the reel. */
export const callSound = (kind: string): boolean => kind === "ring" || kind === "recorded_audio";

/** The profile with a beat a voice-over plays in read as the presenter reacting, and its call note gone; a profile stored before #1422 read */
/** a narrator over a muted presenter as a call on every beat. A profile with no such beat comes back unchanged. */
export function withVoiceOver<P extends VoiceOverProfile>(profile: P): P {
  const presenter = profile.speakers?.find(speaker => speaker.id === "presenter")?.id
    ?? profile.speakers?.find(speaker => speaker.on_screen && speaker.role === "presenter")?.id;
  const over = voiceOverSpeakers(profile.speakers ?? [], presenter, profile.beats.some(beat => beat.sounds.some(sound => callSound(sound.kind))));
  const heard = (beat: VoiceOverBeat) => (beat.speakers?.length ? beat.speakers.map(entry => entry.id) : beat.speaker ? [beat.speaker] : []);
  const turned = new Set(profile.beats.flatMap((beat, index) => (beat.presenter_behaviour === "listening" && heard(beat).length > 0
    && heard(beat).every(id => over.has(id)) ? [index] : [])));
  if (!turned.size) return profile;
  return { ...profile, beats: profile.beats.map((beat, index) => (turned.has(index) ? { ...beat, presenter_behaviour: "reacting" } : beat)),
    unmapped: profile.unmapped.filter(entry => !(turned.has(entry.beat_index) && entry.what === REFERENCE_LISTENING_NOTE.what)) };
}
