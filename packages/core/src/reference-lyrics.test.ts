import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { referenceProfileInput } from "./reference-profile.js";
import { withoutSungWords, wordsAreLyrics } from "./reference-lyrics.js";

/** #1309: a silent first-try reel set to a song; the analysis took the lyrics for the presenter's speech (ref_1287ec51, 09.11). */

const REEL = JSON.parse(readFileSync(new URL("./fixtures/reference-profile-reel.json", import.meta.url), "utf8"));
type Measured = "moving" | "still" | "not_measured";
type Vision = "moving" | "closed" | "not_visible" | null;
function sungReel(music: string, mouths: [Measured, Vision][]) {
  const profile = structuredClone(REEL);
  profile.music = music;
  const step = 72 / mouths.length;
  profile.speakers = [{ id: "presenter", on_screen: true, role: "presenter", word_count: 12, caption: null, frames_s: [1] }];
  profile.segments = mouths.map(([measured, vision], at) => ({ start_s: at * step, end_s: (at + 1) * step, text: "windows spun right open",
    speaker: "presenter", mouth: { vision, measured, score: 0.4 }, frames_s: [Math.floor(at * step)] }));
  profile.transcript = [{ text: "Windows", start_s: 0.5, end_s: 1 }, { text: "spun", start_s: 1, end_s: 1.4 }];
  profile.transcript_language = "eng";
  profile.hook = { text: "Windows spun right open, autumn air.", end_s: 2.4, caption: "Let's try the viral collagen cream" };
  profile.beats[1].speaker = "presenter";
  profile.beats[1].speakers = [{ id: "presenter", seconds: 3 }];
  profile.voice = { speakers: [] };
  return profile;
}

describe("song words are not the presenter's speech", () => {
  // Mutants: keep the transcript, the voice or a speaking beat; drop the on-screen hook caption; skip the warning.
  it("empties the speech of a reel whose presenter is still under a named song", () => {
    const profile = sungReel("Cornelia Street remix by Taylor Swift, throughout", [["still", "closed"], ["not_measured", "closed"], ["moving", "moving"], ["still", null]]);
    expect(wordsAreLyrics(profile)).toBe(true);
    const out = withoutSungWords(profile);
    expect(out.transcript).toEqual([]);
    expect(out.segments).toEqual([]);
    expect(out.speakers).toEqual([]);
    expect(out.voice).toBeUndefined();
    expect(out.hook).toEqual({ text: "", end_s: 3, caption: "Let's try the viral collagen cream" });
    expect(out.beats.some((beat: { presenter_behaviour: string }) => beat.presenter_behaviour === "speaking")).toBe(false);
    expect(out.beats.every((beat: { spoken_summary: string }) => beat.spoken_summary === "")).toBe(true);
    expect(out.beats[1].presenter_behaviour).toBe("reacting");
    expect(out.beats[0].presenter_behaviour).toBe("absent");
    expect(out.analysis.warnings.at(-1)).toMatch(/^transcript: the words heard are the lyrics of the music \(Cornelia Street/);
    expect(referenceProfileInput.safeParse(out).success).toBe(true);
    expect(withoutSungWords(out)).toBe(out);
  });

  // Mutants: treat "none" as a track, count unmeasured unseen mouths as still, or drop the measured-still witness.
  it("keeps speech under music, a reel without music and one whose mouth was never measured still", () => {
    const speech = sungReel("upbeat pop bed", [["moving", "moving"], ["still", "closed"], ["moving", "moving"], ["not_measured", null]]);
    expect(withoutSungWords(speech)).toBe(speech);
    const silent = sungReel("none", [["still", "closed"], ["still", "closed"]]);
    expect(withoutSungWords(silent)).toBe(silent);
    const unmeasured = sungReel("a remix", [["not_measured", "closed"], ["not_measured", "closed"]]);
    expect(withoutSungWords(unmeasured)).toBe(unmeasured);
    const unseen = sungReel("a remix", [["still", "closed"], ["not_measured", null], ["not_measured", null], ["not_measured", null]]);
    expect(wordsAreLyrics(unseen)).toBe(false);
  });

  // Codex r1. Mutant: count still segments instead of still seconds.
  it("weighs the seconds of speech, not the number of segments", () => {
    const profile = sungReel("a remix", [["still", "closed"], ["still", "closed"], ["moving", "moving"]]);
    profile.segments[0].end_s = profile.segments[0].start_s + 1;
    profile.segments[1].start_s = 30;
    profile.segments[1].end_s = 31;
    profile.segments[2].start_s = 40;
    profile.segments[2].end_s = 50;
    expect(wordsAreLyrics(profile)).toBe(false);
    profile.segments[2].end_s = 41.5;
    expect(wordsAreLyrics(profile)).toBe(true);
  });

  // Codex r3. Mutant: count an unmeasured mouth the picture never shows as moving, or one it shows moving as still.
  it("counts an unmeasured mouth as still when the picture sees it closed or out of view, never when it sees it move", () => {
    const unseen = sungReel("a remix", [["still", "closed"], ["not_measured", "not_visible"], ["moving", "moving"]]);
    unseen.segments[0].end_s = unseen.segments[0].start_s + 2;
    unseen.segments[1].end_s = unseen.segments[1].start_s + 20;
    unseen.segments[2].end_s = unseen.segments[2].start_s + 15;
    expect(wordsAreLyrics(unseen)).toBe(true);
    unseen.segments[1].mouth.vision = "moving";
    expect(wordsAreLyrics(unseen)).toBe(false);
  });

  // Mutant: weigh an off-screen voice's still mouth as the presenter's.
  it("weighs only on-screen speakers", () => {
    const profile = sungReel("a remix", [["still", "closed"], ["moving", "moving"]]);
    profile.speakers.push({ id: "off_screen_1", on_screen: false, role: "narrator", word_count: 30, caption: null, frames_s: [40] });
    profile.segments[0].speaker = "off_screen_1";
    profile.segments.push({ start_s: 0, end_s: 30, text: "more", speaker: "off_screen_1", mouth: { vision: "closed", measured: "still", score: 0.1 }, frames_s: [2] });
    expect(wordsAreLyrics(profile)).toBe(false);
  });
});
