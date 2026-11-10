import { describe, expect, it } from "vitest";

import { generationShot, shotIssues, type GenerationShot } from "./generation-shot.js";
import { generateVideoRequest } from "./generations.js";

/** The clip's `shot` (cinematic-prompt S1): every refusal here comes from the schema, before any quote or charge. */

const SHOT: GenerationShot = {
  framing: { size: "close_up", angle: "eye_level" },
  subject: { label: "the woman", fixed: ["dark hair in a low bun"], objects: [{ name: "jar", count: 1, at_start: "open, in her left hand" }] },
  start_state: "She holds the open jar at chest height.",
  beats: [
    { from_s: 0, to_s: 3, action: "She dips a fingertip into the jar once and lifts a small dab", end_state: "A dab sits on her fingertip", objects: ["jar"] },
    { from_s: 3, to_s: 6, action: "She spreads it on her cheek until it sinks in", end_state: "Her cheek glows and her fingertip is clean" },
  ],
  camera: { move: "static" },
  light: { key: "soft window daylight" },
  continuity: { persistent: ["exactly one jar"], end_state: "She smiles, the jar beside her face" },
};
const clip = (overrides: Record<string, unknown> = {}) => ({
  model: "kling-4.0", mode: "text", aspect_ratio: "9:16", resolution: "720p", duration_s: 6, shot: SHOT, ...overrides,
});
const refusals = (body: unknown) => generateVideoRequest.safeParse(body).error?.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) ?? [];

describe("prompt or shot", () => {
  it("takes a shot in place of a prompt", () => {
    expect(generateVideoRequest.parse(clip()).shot).toEqual(SHOT);
  });

  // Mutant: accept both, and the worker must guess which one the client meant.
  it("refuses both and neither, and a camera beside a shot", () => {
    expect(refusals(clip({ prompt: "a jar" }))).toEqual(["prompt: pass exactly one of prompt and shot"]);
    expect(refusals(clip({ shot: undefined }))).toEqual(["prompt: pass exactly one of prompt and shot"]);
    expect(refusals(clip({ camera: "static" }))).toEqual(["camera: a shot names its camera in shot.camera"]);
    expect(generateVideoRequest.safeParse(clip({ shot: undefined, prompt: "a jar", camera: "pan" })).success).toBe(true);
  });

  it("is strict inside the shot: an unknown key or camera move is refused", () => {
    expect(generationShot.safeParse({ ...SHOT, negative: "blur" }).success).toBe(false);
    expect(generationShot.safeParse({ ...SHOT, camera: { move: "dolly_zoom" } }).success).toBe(false);
    expect(generationShot.safeParse({ ...SHOT, subject: { ...SHOT.subject, fixed: [] } }).success).toBe(false);
  });
});

describe("beats", () => {
  const beats = (...pairs: [number, number][]) => ({ ...SHOT, beats: pairs.map(([from_s, to_s]) => ({ from_s, to_s, action: "She smiles", end_state: "She smiles" })) });

  // Mutant: skip the coverage check, and the seconds no beat owns are filled by a repeat of the action.
  it("covers exactly duration_s, contiguous from 0", () => {
    expect(refusals(clip({ shot: beats([0, 3], [3, 5]) }))).toEqual(["shot.beats: end at 5 s; the beats cover exactly duration_s, 6 s"]);
    expect(refusals(clip({ shot: beats([0, 3], [4, 6]) }))).toEqual(["shot.beats.1.from_s: starts at 4 s; beats are contiguous, so this one starts at 3 s"]);
    expect(refusals(clip({ shot: beats([0, 4], [3, 6]) }))).toEqual(["shot.beats.1.from_s: starts at 3 s; beats are contiguous, so this one starts at 4 s"]);
    expect(refusals(clip({ shot: beats([1, 3], [3, 6]) }))).toEqual(["shot.beats.0.from_s: starts at 1 s; beats are contiguous, so this one starts at 0 s"]);
    expect(refusals(clip({ shot: beats([0, 6], [6, 8]), duration_s: 8 }))).toEqual(["shot.beats.0.to_s: lasts 6 s; a beat lasts 1 to 5 seconds"]);
    expect(refusals(clip({ shot: beats([0, 3], [3, 3], [3, 6]) }))).toEqual(["shot.beats.1.to_s: lasts 0 s; a beat lasts 1 to 5 seconds"]);
    expect(refusals(clip({ shot: beats([0, 1], [1, 6]) }))).toEqual([]);
  });

  it("reads the duration of the request, so the same shot fits one length only", () => {
    expect(refusals(clip({ duration_s: 8 }))).toEqual(["shot.beats: end at 6 s; the beats cover exactly duration_s, 8 s"]);
  });
});

describe("objects", () => {
  // Mutant: drop the declaration check, and an object a beat handles may appear from nowhere.
  it("refuses a beat object that is not declared, or that its action does not name", () => {
    const beat = (objects: string[], action = "She dips a fingertip into the jar once") =>
      ({ ...SHOT, beats: [{ ...SHOT.beats[0]!, action, objects }, SHOT.beats[1]!] });
    expect(refusals(clip({ shot: beat(["cream"]) })))
      .toEqual(['shot.beats.0.objects.0: "cream" is not in subject.objects; declare it with its count and where it is at the start']);
    expect(refusals(clip({ shot: beat(["jar"], "She lifts a dab") }))).toEqual(['shot.beats.0.objects.0: "jar" is not named in this beat\'s action']);
    expect(refusals(clip({ shot: beat(["Jar"], "She taps the JAR lid") }))).toEqual([]);
    expect(refusals(clip({ shot: beat(["jar"], "She taps the jars") }))).toEqual(['shot.beats.0.objects.0: "jar" is not named in this beat\'s action']);
  });

  // Mutant: drop either word boundary of the name match, and a word that only contains the name counts as naming the object.
  it("counts the name as a whole word on both sides, punctuation beside it included", () => {
    const named = (action: string) => shotIssues({ ...SHOT, beats: [{ ...SHOT.beats[0]!, action, objects: ["jar"] }, SHOT.beats[1]!] }, 6);
    for (const action of ["She leaves the lid ajar", "She taps the jars", "She lifts the jarful", "She opens the bigjar"]) {
      expect(named(action).map((one) => one.message), action).toEqual(['"jar" is not named in this beat\'s action']);
    }
    for (const action of ["She taps the jar.", "She taps the jar, then smiles", "She lifts (jar) once", "Jar in hand, she smiles", "jar"]) {
      expect(named(action), action).toEqual([]);
    }
  });

  // Mutant: drop the escaping, and a name's "." or "+" matches other letters, so the action names an object it never wrote.
  it("reads a name with regex characters literally", () => {
    const named = (name: string, action: string) => shotIssues({ ...SHOT,
      subject: { ...SHOT.subject, objects: [{ name, count: 1, at_start: "on the shelf" }] },
      beats: [{ ...SHOT.beats[0]!, action, objects: [name] }, SHOT.beats[1]!] }, 6).map((one) => one.path.join("."));
    for (const [name, written, lookalike] of [["jar.box", "She opens the jar.box", "She opens the jarXbox"],
      ["c++ tin", "She taps the c++ tin", "She taps the ccc tin"], ["tube(s)", "She lines up the tube(s)", "She lines up the tubes"],
      ["is?it", "She reads is?it aloud", "She reads iit aloud"], ["tin+", "She lifts the tin+ once", "She lifts the tinnn once"]]) {
      expect(named(name!, written!), `${name} in "${written}"`).toEqual([]);
      expect(named(name!, lookalike!), `${name} in "${lookalike}"`).toEqual(["beats.0.objects.0"]);
    }
  });

  it("names each object once", () => {
    const twice = { ...SHOT, subject: { ...SHOT.subject, objects: [...SHOT.subject.objects!, { name: "JAR", count: 1, at_start: "on the shelf" }] } };
    expect(refusals(clip({ shot: twice }))).toEqual(["shot.subject.objects: names each object once"]);
  });
});

describe("negation lint", () => {
  const fields: [string, (word: string) => GenerationShot][] = [
    ["subject.label", (w) => ({ ...SHOT, subject: { ...SHOT.subject, label: `the woman ${w} glasses` } })],
    ["subject.fixed.0", (w) => ({ ...SHOT, subject: { ...SHOT.subject, fixed: [`${w} jewellery`] } })],
    ["subject.objects.0.name", (w) => ({ ...SHOT, subject: { ...SHOT.subject, objects: [{ name: `${w} jar`, count: 1, at_start: "open" }] }, beats: SHOT.beats.map(({ objects: _o, ...b }) => b) })],
    ["subject.objects.0.at_start", (w) => ({ ...SHOT, subject: { ...SHOT.subject, objects: [{ name: "jar", count: 1, at_start: `${w} lid` }] } })],
    ["start_state", (w) => ({ ...SHOT, start_state: `She holds the jar, ${w} cream on her fingers` })],
    ["beats.1.action", (w) => ({ ...SHOT, beats: [SHOT.beats[0]!, { ...SHOT.beats[1]!, action: `She ${w} touches the jar again` }] })],
    ["beats.1.end_state", (w) => ({ ...SHOT, beats: [SHOT.beats[0]!, { ...SHOT.beats[1]!, end_state: `${w} cream remains` }] })],
    ["light.key", (w) => ({ ...SHOT, light: { key: `daylight, ${w} flicker` } })],
    ["light.direction", (w) => ({ ...SHOT, light: { key: "daylight", direction: `${w} shadows` } })],
    ["continuity.persistent.0", (w) => ({ ...SHOT, continuity: { ...SHOT.continuity, persistent: [`${w} second jar`] } })],
    ["continuity.end_state", (w) => ({ ...SHOT, continuity: { ...SHOT.continuity, end_state: `${w} cream visible` } })],
    ["continuity.continues_from", (w) => ({ ...SHOT, continuity: { ...SHOT.continuity, continues_from: `${w} cream visible` } })],
  ];

  // Mutant: leave one field out of the lint, and its negation reaches the model as a thing to draw.
  it("refuses a negation in every free-text field, saying to describe what is visible", () => {
    for (const [path, shot] of fields) {
      expect(refusals(clip({ shot: shot("no") })), path)
        .toEqual([`shot.${path}: "no" describes what is absent; describe what is visible instead (her fingertips are clean, the counter is bare)`]);
    }
  });

  // Mutant: drop any one word or form from the lint, and that word reaches the model; this list is literal, never read from the lint.
  it("catches each negating word, every form of avoid and both apostrophes, and passes words that only contain one", () => {
    for (const word of ["no", "NO", "not", "Not", "never", "none", "nothing", "nobody", "nowhere", "neither", "nor", "without",
      "avoid", "avoids", "avoided", "avoiding", "Avoided", "don't", "doesn’t", "isn't", "aren’t", "can't", "won't", "shouldn't", "cannot"]) {
      expect(shotIssues({ ...SHOT, start_state: `She ${word} holds it` }, 6).map((one) => one.path.join(".")), word).toEqual(["start_state"]);
    }
    for (const word of ["notebook", "knot", "Nordic", "nose", "snow", "annotated", "known", "nova", "notes"]) {
      expect(shotIssues({ ...SHOT, start_state: `She holds a ${word}` }, 6), word).toEqual([]);
    }
  });
});

describe("text ceiling", () => {
  it("refuses a shot whose words together pass 3000 characters", () => {
    const long = "a".repeat(290);
    const shot = { ...SHOT, beats: Array.from({ length: 6 }, (_, at) => ({ from_s: at, to_s: at + 1, action: long, end_state: "a".repeat(200) })) };
    expect(refusals(clip({ shot }))).toEqual([expect.stringMatching(/^shot: holds \d+ characters of text; a shot holds at most 3000$/)]);
  });
});
