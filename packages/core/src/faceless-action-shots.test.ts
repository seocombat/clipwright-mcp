import { describe, expect, it } from "vitest";
import { FACELESS_SHOTS_BRIEF_REFUSAL, facelessStoredInput, makeFacelessInput, offeredFacelessInput, offeredFacelessInputShape } from "./faceless-public.js";
import { FACELESS_MAX_SHOTS, FACELESS_SHOT_CREDITS_PER_SECOND, quoteFaceless } from "./faceless-price.js";
import { facelessShotTransitionLook, resolveFacelessActionShots } from "./faceless-action-shots.js";
import { readFileSync } from "node:fs";
import { parseCutStyle } from "./faceless-cut-style.js";
import { planPublicFacelessStory, type FacelessPublicStory } from "./faceless-public-plan.js";

const style = parseCutStyle(JSON.parse(readFileSync(new URL("./fixtures/cut-style-profile-v1.json", import.meta.url), "utf8")));

// #1113: make_faceless action shots, a moving clip from the picture under the named words.

const SCRIPT = "Most people quit in week two. The ones who stay track one number. Here is that number, and why it works.";
const script = { input_mode: "script", script: SCRIPT, duration_seconds: 30 };
const run = { id: "s1", anchor: { quote: "track one number" }, action: "She writes a number on a sticky note" };
const issues = (input: unknown) => makeFacelessInput.safeParse(input).error?.issues.map(issue => ({ path: issue.path, message: issue.message })) ?? [];

describe("make_faceless shots", () => {
  /** Mutant: drop the field, and a script's shots are refused as an unknown key; drop it from storage, and the worker never sees them. */
  it("takes shots on the script's words and keeps them in the stored input", () => {
    const parsed = makeFacelessInput.parse({ ...script, shots: [{ ...run, transition: "flash" }] });
    expect(parsed).toMatchObject({ shots: [{ ...run, transition: "flash" }] });
    expect(facelessStoredInput.parse(parsed)).toMatchObject({ shots: [run] });
    expect(offeredFacelessInput.safeParse({ ...script, shots: [run] }).success).toBe(true);
    expect(resolveFacelessActionShots(SCRIPT, [run])).toEqual([{ ...run, first: 10, end: 13 }]);
  });

  /** Mutant: accept a brief's shots, and they name words the run has not written yet. */
  it("refuses shots on a brief, by name", () => {
    expect(issues({ input_mode: "brief", brief: "Why habits stick.", duration_seconds: 30, shots: [run] }).map(issue => issue.message))
      .toContain(FACELESS_SHOTS_BRIEF_REFUSAL);
  });

  /** Mutants: a fourth shot admitted past the ceiling the quote prices; an anchor on no word paid for; two shots on one picture paid twice. */
  it("refuses more than ten shots (#1192), an anchor naming no words and overlapping shots, before money", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...run, id: `s${i}`, anchor: { startWord: i, endWord: i + 1 } }));
    expect(issues({ ...script, shots: eleven })).toEqual([{ path: ["shots"], message: "at most 10 shots a video" }]);
    expect(issues({ ...script, shots: [{ ...run, anchor: { quote: "never said" } }] }))
      .toEqual([{ path: ["shots", 0, "anchor"], message: "the anchor names no words of the script" }]);
    expect(issues({ ...script, shots: [{ ...run, anchor: { startWord: 40, endWord: 41 } }] }))
      .toEqual([{ path: ["shots", 0, "anchor"], message: "the anchor names no words of the script" }]);
    expect(issues({ ...script, shots: [run, { ...run, id: "s2", anchor: { quote: "one number" } }] }))
      .toEqual([{ path: ["shots", 1, "anchor"], message: "two shots cover the same words; give each shot its own words" }]);
    expect(issues({ ...script, shots: [run, { ...run, anchor: { quote: "week two" } }] }))
      .toEqual([{ path: ["shots", 1, "id"], message: "each shot needs its own id" }]);
    expect(issues({ ...script, shots: [{ ...run, action: " " }] }).map(issue => issue.path)).toEqual([["shots", 0, "action"]]);
  });

  /** Mutant: a shot on the customer's own scene image is admitted, and the run animates a picture it never drew. */
  it("refuses a shot on the words of a scene image of the customer's", () => {
    const scene_images = [{ image_url: "https://example.com/a.png", anchor: { quote: "one number" } }];
    expect(issues({ ...script, scene_images, shots: [run] }))
      .toEqual([{ path: ["shots", 0, "anchor"], message: "a shot animates a picture the video draws; these words show your scene image" }]);
  });

  /** Mutant: the quote prices no shot, or prices one of them; the reserve then misses the shots' ceiling. */
  it("quotes 30 credits a second, five seconds a shot: 450 for three shots inside the total", () => {
    const plain = quoteFaceless({ outputFrames: 750, captions: true });
    const three = quoteFaceless({ outputFrames: 750, captions: true, shots: 3 });
    expect(FACELESS_SHOT_CREDITS_PER_SECOND).toBe(30);
    expect(three).toMatchObject({ shotSeconds: 15, shotCredits: 450, totalCredits: plain.totalCredits + 450 });
    expect(quoteFaceless({ outputFrames: 750, captions: true, shots: 1 })).toMatchObject({ shotSeconds: 5, shotCredits: 150 });
    expect(plain).not.toHaveProperty("shotCredits");
    expect(quoteFaceless({ outputFrames: 750, captions: true, shots: 10 })).toMatchObject({ shotSeconds: 50, shotCredits: 1500 });
    expect(() => quoteFaceless({ outputFrames: 750, captions: true, shots: 11 })).toThrow();
  });

  /** Mutant: a whoosh draws no look, or a cut draws one; the shot then enters other than asked. */
  it("draws a flash or a light leak on the cut into a shot, and nothing for a plain cut", () => {
    expect([facelessShotTransitionLook("flash"), facelessShotTransitionLook("light_leak"), facelessShotTransitionLook("whoosh"),
      facelessShotTransitionLook("cut"), facelessShotTransitionLook(undefined)]).toEqual(["flash", "light_leak", "light_leak", undefined, undefined]);
  });

  /** Mutant: the planner ignores the cap, and a shot's clip cannot cover the scene its words sit in. */
  it("plans the shot over capped words no longer than the cap", () => {
    // Beats of 20 frames after a 110-frame opener join in twos, and the odd one out makes the closing picture three beats long.
    const beatWords = [11, ...Array.from({ length: 27 }, () => 2)], count = 65;
    const words = Array.from({ length: count }, (_, i) => ({ word: `word${i}`, startSec: i * .4, endSec: (i + 1) * .4 }));
    const starts = beatWords.map((_, i) => beatWords.slice(0, i).reduce((sum, size) => sum + size, 0));
    const story: FacelessPublicStory = { script: words.map(w => w.word).join(" "), narrationStartFrame: 0,
      beats: beatWords.map((size, i) => ({ id: `beat-${i}`, wordStart: starts[i]!, wordEnd: starts[i]! + size,
        mediaType: i === 0 ? "video" as const : "image" as const, reason: "place" as const, phase: "setup" as const, visualPrompt: `Scene ${i}` })) };
    const shotOver = (plan: ReturnType<typeof planPublicFacelessStory>, word: number) =>
      plan.shots.find(shot => plan.narrationStartFrame + Math.round(words[word]!.startSec * 25) < shot.endFrame)!;
    const capped = planPublicFacelessStory(story, words, style, 650, { capFrames: [{ first: 61, end: 63, maxFrames: 40 }] });
    const over = shotOver(capped, 61);
    expect(over.endFrame - over.startFrame).toBeLessThanOrEqual(40);
    const free = planPublicFacelessStory(story, words, style, 650);
    const merged = shotOver(free, 61);
    expect(merged.endFrame - merged.startFrame).toBe(60);
  });

  /** Mutant: give the field a shape, and tools/list grows past its budget; the text is the contract the brief fixed. */
  it("offers the field shape-free in tools/list", () => {
    expect(offeredFacelessInputShape.shots.description).toBe("Script only: 1-10 {id, anchor, action}, 5 s max each.");
    expect(offeredFacelessInputShape.shots.description).toContain(`1-${FACELESS_MAX_SHOTS} `);
    expect(offeredFacelessInputShape.shots.safeParse({ any: "thing" }).success).toBe(true);
  });
});
