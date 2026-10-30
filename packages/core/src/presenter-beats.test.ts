import { describe, expect, it } from "vitest";

import { findCapabilityRow, generateVideoRequest } from "./generations.js";
import { fitTemplatesAroundBeats, planPresenterBeats, presenterBeatGeneration, presenterBeatInsert, presenterBeatPrompt, presenterBeatSeconds } from "./presenter-beats.js";
import { lexicalTokens } from "./semantic-inserts.js";
import { makeUgcInput, type UgcTemplate } from "./skills.js";

/** Silent presenter beats (#857 S3): which profile beats become clips, their prompts, their length and their words. */

const SCRIPT = "Every missed call is a lost deal. Here's a real one: a customer calls at two in the morning to book a cleaning. " +
  "Small businesses miss a third of their calls. Not anymore.";
const beat = (presenter_behaviour: string) => ({ presenter_behaviour });
const PROFILE = { beats: [beat("absent"), beat("listening"), beat("speaking"), beat("reacting")] } as never;
const SPANS = [{ start: 0, end: 7 }, { start: 7, end: 23 }, { start: 23, end: 31 }, { start: 31, end: 33 }];
const PORTRAIT = `ast_${"a".repeat(32)}`, CLIP = `ast_${"b".repeat(32)}`;

describe("planPresenterBeats", () => {
  // Mutant: also take `absent` or `speaking`, and a talking beat is replaced by a silent clip.
  it("keeps only listening and reacting beats, on their own words", () => {
    const { beats, warnings } = planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: SPANS });
    expect(beats.map(b => [b.id, b.behaviour, b.startWord, b.endWord])).toEqual([["beat-1", "listening", 7, 23], ["beat-3", "reacting", 31, 33]]);
    expect(lexicalTokens(SCRIPT).slice(7, 23).join(" ")).toBe("here's a real one a customer calls at two in the morning to book a cleaning");
    expect(warnings).toEqual([]);
  });

  it("names a silent beat the script gives no words", () => {
    const { beats, warnings } = planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: [SPANS[0]!, null, SPANS[2]!, SPANS[3]!] });
    expect(beats.map(b => b.id)).toEqual(["beat-3"]);
    expect(warnings).toEqual(["beat 1 (listening) has no words in the script, so the presenter does not listen there"]);
  });

  // Mutant: double the ceiling, and a 40-word listening beat gets a 15 s clip without a word of warning (S3 r1, M3).
  it("names a beat whose words outlast the 15 s clip, and only past the slowest speech", () => {
    const script = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const listening = { beats: [beat("listening")] } as never;
    expect(planPresenterBeats({ script, profile: listening, spans: [{ start: 5, end: 45 }] }).warnings)
      .toEqual(["beat 0 (listening) may outlast a 15 s clip; its last frame holds to the end of its words"]);
    expect(planPresenterBeats({ script, profile: listening, spans: [{ start: 5, end: 35 }] }).warnings).toEqual([]);
  });

  it("refuses spans outside the script, overlapping beats and a plan with no speaking shot", () => {
    expect(() => planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: [SPANS[0]!, { start: 7, end: 99 }, null, null] })).toThrow(/outside/);
    const twoListening = { beats: [beat("listening"), beat("listening")] } as never;
    expect(() => planPresenterBeats({ script: SCRIPT, profile: twoListening, spans: [{ start: 0, end: 10 }, { start: 9, end: 12 }] })).toThrow(/overlaps/);
    const all = { beats: [beat("listening")] } as never;
    expect(() => planPresenterBeats({ script: SCRIPT, profile: all, spans: [{ start: 0, end: 33 }] })).toThrow(/no shot/);
    expect(() => planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: [] })).toThrow(/one span per profile beat/);
  });
});

describe("prompt and length", () => {
  // Mutant: drop the closed-mouth line, and a reaction opens the mouth under the narration (24.10 probe, S3).
  it.each(["listening", "reacting"] as const)("asks %s with the mouth closed, frame 0 kept, and no text", behaviour => {
    const prompt = presenterBeatPrompt(behaviour);
    expect(prompt).toContain("mouth stays closed");
    expect(prompt).toContain("Same person, same face");
    expect(prompt).toContain("no text overlays");
    expect(prompt.length).toBeLessThan(1000);
  });

  it("is long enough for the words at the slowest speech, within the model's 4–15 s", () => {
    expect([1, 8, 9, 14, 30, 60].map(presenterBeatSeconds)).toEqual([4, 4, 5, 7, 15, 15]);
  });
});

describe("fitTemplatesAroundBeats", () => {
  const [listening] = planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: SPANS }).beats;
  const call = { id: "call", kind: "phone_call", anchor: { quote: "a customer calls at" }, cover_words: 12,
    data: { caller: "Incoming call", answer_at: "at two" } } as UgcTemplate;
  const input = (templates: unknown[], beats = [listening!]) =>
    makeUgcInput.safeParse({ script: SCRIPT, broll_policy: "anyone", templates, inserts: beats.map(beat => presenterBeatInsert(beat, CLIP)) });

  // The run-1 refusal (#857 S3): a phone card wholly under the listening insert, its answer on covered words.
  it("moves a card under a beat to the free words right before it, with its inner quote on them, and make_ugc accepts it", () => {
    expect(input([call]).success).toBe(false);
    const { templates, warnings } = fitTemplatesAroundBeats(SCRIPT, [call], [listening!]);
    expect(templates).toEqual([{ id: "call", kind: "phone_call", anchor: { startWord: 0, endWord: 7 },
      data: { caller: "Incoming call", answer_at: "is" } }]);
    expect(warnings).toEqual(['template "call" moved to the words right before the listening beat, which covers its own']);
    expect(input(templates).error?.issues ?? []).toEqual([]);
  });

  it("goes after the beat when the words before are taken, and is dropped and named when neither side has room", () => {
    const before = { id: "before", kind: "tag", anchor: { startWord: 0, endWord: 7 }, data: { text: "Lost deal" } } as UgcTemplate;
    const after = fitTemplatesAroundBeats(SCRIPT, [before, call], [listening!]);
    expect(after.templates[1]).toMatchObject({ anchor: { startWord: 23, endWord: 33 } });
    expect(input(after.templates).error?.issues ?? []).toEqual([]);
    const tail = { id: "tail", kind: "tag", anchor: { startWord: 23, endWord: 33 }, data: { text: "Not anymore" } } as UgcTemplate;
    const none = fitTemplatesAroundBeats(SCRIPT, [before, call, tail], [listening!]);
    expect(none.templates.map(t => t.id)).toEqual(["before", "tail"]);
    expect(none.warnings).toEqual(['template "call" lies under the listening beat and has no free words beside it; it is left out']);
  });

  // Mutant: move full-frame templates too, and a title card drawn over the insert is pulled off it for nothing.
  it("leaves full-frame templates and templates away from beats where they are", () => {
    const full = { id: "full", kind: "title_card", placement: "full", anchor: { startWord: 8, endWord: 12 }, data: { title: "A real one" } } as UgcTemplate;
    const away = { id: "away", kind: "tag", anchor: { startWord: 23, endWord: 26 }, data: { text: "Small" } } as UgcTemplate;
    expect(fitTemplatesAroundBeats(SCRIPT, [full, away], [listening!])).toEqual({ templates: [full, away], warnings: [] });
  });
});

describe("generation and insert", () => {
  // Mutant: ask 1080p or another model, and the request falls off the measured row or prices differently.
  it("asks the measured seedance-2.0 720p 9:16 first-frame row from the portrait", () => {
    const [first] = planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: SPANS }).beats;
    const request = presenterBeatGeneration(first!, { asset_id: PORTRAIT });
    expect(generateVideoRequest.parse(request)).toEqual(request);
    expect(findCapabilityRow(request)).toMatchObject({ kind: "video", row: { width: 720, height: 1280 } });
    expect(request).toMatchObject({ mode: "first_frame", first_frame: { asset_id: PORTRAIT }, duration_s: 8 });
    // Mutant: the request drops the beat's prompt, and Seedance opens the mouth under the narration.
    expect(request.prompt).toBe(first!.prompt);
    expect(request.prompt).toContain("mouth stays closed");
  });

  it("places the clip as a video insert on exactly its words, accepted by make_ugc", () => {
    const [first] = planPresenterBeats({ script: SCRIPT, profile: PROFILE, spans: SPANS }).beats;
    const insert = presenterBeatInsert(first!, CLIP);
    expect(insert).toEqual({ id: "beat-1", asset_id: CLIP, media_type: "video", anchor: { startWord: 7, endWord: 23 } });
    const parsed = makeUgcInput.safeParse({ script: SCRIPT, inserts: [insert], broll_policy: "anyone" });
    expect(parsed.error?.issues ?? []).toEqual([]);
  });
});
