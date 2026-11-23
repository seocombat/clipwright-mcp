import type { ReferenceSpeaker } from "./reference-profile.js";

export const REFERENCE_LISTENING_NOTE = { what: "the presenter listens silently while another voice plays (recorded audio)",
  suggested_substitute: "a phone_call template over the presenter, who speaks the line: we do not play recorded audio" } as const;

type Speaker = Pick<ReferenceSpeaker, "id" | "on_screen" | "role" | "word_count">;

export function voiceOverSpeakers(speakers: readonly Speaker[], presenter: string | null | undefined, callHeard: boolean): Set<string> {
  const silent = !callHeard && speakers.some(speaker => speaker.id === presenter && speaker.on_screen && speaker.word_count === 0);
  return new Set(speakers.filter(speaker => !speaker.on_screen && speaker.id !== presenter
    && (speaker.role === "narrator" || (silent && speaker.role !== "interviewer"))).map(speaker => speaker.id));
}

type VoiceOverBeat = { presenter_behaviour: string; speaker?: string | null | undefined; speakers?: readonly { id: string }[] | undefined;
  sounds: readonly { kind: string }[] };
type VoiceOverProfile = { speakers?: readonly Speaker[] | undefined; beats: VoiceOverBeat[];
  unmapped: { what: string; beat_index: number; suggested_substitute: string }[] };

export const callSound = (kind: string): boolean => kind === "ring" || kind === "recorded_audio";

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
