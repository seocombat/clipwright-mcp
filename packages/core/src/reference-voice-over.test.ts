import { describe, expect, it } from "vitest";

import { REFERENCE_LISTENING_NOTE, voiceOverSpeakers, withVoiceOver } from "./reference-voice-over.js";

const presenter = (word_count: number) => ({ id: "presenter", on_screen: true, role: "presenter" as const, word_count });
const offScreen = (role: "narrator" | "interviewer" | "other") => ({ id: "off_screen_1", on_screen: false, role, word_count: 20 });

describe("a voice-over over the presenter (#1422)", () => {
  // Mutants: read a narrator as a voice-over only while the presenter is silent, or let a call or an interviewer turn into one.
  it("takes a narrator always, another off-screen voice only over a silent presenter with no call, and never an interviewer", () => {
    expect([...voiceOverSpeakers([presenter(12), offScreen("narrator")], "presenter", false)]).toEqual(["off_screen_1"]);
    expect([...voiceOverSpeakers([presenter(12), offScreen("narrator")], "presenter", true)]).toEqual(["off_screen_1"]);
    expect([...voiceOverSpeakers([presenter(0), offScreen("other")], "presenter", false)]).toEqual(["off_screen_1"]);
    expect([...voiceOverSpeakers([presenter(3), offScreen("other")], "presenter", false)]).toEqual([]);
    expect([...voiceOverSpeakers([presenter(0), offScreen("other")], "presenter", true)]).toEqual([]);
    expect([...voiceOverSpeakers([presenter(0), offScreen("interviewer")], "presenter", false)]).toEqual([]);
    expect([...voiceOverSpeakers([presenter(0), { ...offScreen("other"), on_screen: true }], "presenter", false)]).toEqual([]);
  });

  const profile = (role: "narrator" | "other", words: number, sound: string) => ({ speakers: [presenter(words), offScreen(role)],
    beats: [0, 1].map(() => ({ presenter_behaviour: "listening", speaker: "off_screen_1", speakers: [{ id: "off_screen_1" }], sounds: [{ kind: sound }] })),
    unmapped: [0, 1].flatMap(beat_index => [{ ...REFERENCE_LISTENING_NOTE, beat_index }, { what: "icon", beat_index, suggested_substitute: "leave it out" }]) });

  // Mutants: count only a recorded call, not a ring, or drop every note of a turned beat, and a call reads as a voice-over or a gap goes unsaid.
  it("turns a stored voice-over's listening beats into reacting and drops only their call note; a ring or a recording keeps the call", () => {
    const turned = withVoiceOver(profile("other", 0, "whoosh"));
    expect(turned.beats.map(beat => beat.presenter_behaviour)).toEqual(["reacting", "reacting"]);
    expect(turned.unmapped.map(entry => entry.what)).toEqual(["icon", "icon"]);
    expect(withVoiceOver(profile("narrator", 7, "ring")).beats.map(beat => beat.presenter_behaviour)).toEqual(["reacting", "reacting"]);
    for (const sound of ["ring", "recorded_audio"]) {
      const kept = profile("other", 0, sound);
      expect(withVoiceOver(kept)).toBe(kept);
    }
  });

  // Codex r2. Mutants: turn a beat where any voice is a voice-over, or drop the call note of every beat, and a caller's beat loses its call.
  it("turns only a beat every voice of which is a voice-over, and keeps the call note of the beats it leaves", () => {
    const caller = { id: "off_screen_2", on_screen: false, role: "other" as const, word_count: 8 };
    const heard = [["off_screen_1"], ["off_screen_2"], ["off_screen_1", "off_screen_2"]];
    const mixed = { speakers: [presenter(5), offScreen("narrator"), caller],
      beats: heard.map(ids => ({ presenter_behaviour: "listening", speaker: ids.at(-1)!, speakers: ids.map(id => ({ id })), sounds: [] })),
      unmapped: heard.map((_, beat_index) => ({ ...REFERENCE_LISTENING_NOTE, beat_index })) };
    const read = withVoiceOver(mixed);
    expect(read.beats.map(beat => beat.presenter_behaviour)).toEqual(["reacting", "listening", "listening"]);
    expect(read.unmapped.map(entry => entry.beat_index)).toEqual([1, 2]);
  });

  // Codex r3. Mutant: read a beat's voices from `speakers` alone, and a profile stored with only `speaker` keeps its call on every beat.
  it("reads a beat's voice from `speaker` when the profile stored no `speakers`, and turns nothing with neither", () => {
    const stored = profile("narrator", 0, "whoosh");
    const bare = { ...stored, beats: stored.beats.map(({ speakers: _speakers, ...beat }) => beat) };
    expect(withVoiceOver(bare).beats.map(beat => beat.presenter_behaviour)).toEqual(["reacting", "reacting"]);
    const unheard = { ...bare, beats: bare.beats.map(beat => ({ ...beat, speaker: null })) };
    expect(withVoiceOver(unheard)).toBe(unheard);
  });
});
