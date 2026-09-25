import { describe, expect, it } from "vitest";
import { countActorShots, coverWordOf, planSemanticInserts, resolveSemanticInserts } from "./semantic-inserts.js";
import type { WordTiming } from "./tts-backend.js";

const SCRIPT = "one two three four five six";

/** Words of 0.4 s with 0.2 s pauses and 0.1 s of leading silence: pauses exist as gaps, */
/** and the window-end rule must give them to someone. */
const words: WordTiming[] = Array.from({ length: 6 }, (_, index) => ({
  word: SCRIPT.split(" ")[index]!,
  startSec: 0.1 + index * 0.6,
  endSec: 0.5 + index * 0.6,
}));
const TOTAL_SEC = 4;
const FPS = 25;

const plan = (instructions: Parameters<typeof planSemanticInserts>[1]) => planSemanticInserts(SCRIPT, instructions);
const resolve = (instructions: Parameters<typeof planSemanticInserts>[1]) =>
  resolveSemanticInserts({ plan: plan(instructions), words, durationSec: TOTAL_SEC, fps: FPS });
const at = (startWord: number, endWord: number, coverWords?: number) => ({
  insertId: `i${startWord}`, mediaId: `m${startWord}`, anchor: { startWord, endWord },
  ...(coverWords === undefined ? {} : { coverWords }),
});

describe("insert coverage in words", () => {
  it("omits coverWord when coverage equals the anchor", () => {
    expect(plan([at(1, 3, 2)]).inserts[0]).toEqual({ insertId: "i1", mediaId: "m1", startWord: 1, endWord: 3 });
    expect(Object.keys(plan([at(1, 3, 2)]).inserts[0]!)).not.toContain("coverWord");
    expect(coverWordOf(plan([at(1, 3)]).inserts[0]!)).toBe(3);
  });

  it("sets coverWord when coverage is wider than the anchor", () => {
    expect(plan([at(1, 3, 4)]).inserts[0]).toMatchObject({ startWord: 1, endWord: 3, coverWord: 5 });
    expect(coverWordOf(plan([at(1, 3, 4)]).inserts[0]!)).toBe(5);
  });

  it("refuses coverage narrower than the anchor, naming both numbers", () => {
    expect(() => plan([at(1, 4, 2)])).toThrow(/covers 2 words, fewer than the 3/);
    expect(() => plan([at(1, 4, 2.5)])).toThrow(/covers/);
  });

  it("a quote anchor carries coverage the same way as a word anchor", () => {
    const quoted = planSemanticInserts(SCRIPT, [{ insertId: "q", mediaId: "m", anchor: { quote: "two" }, coverWords: 3 }]);
    expect(quoted.inserts[0]).toMatchObject({ startWord: 1, endWord: 2, coverWord: 4 });
  });

  it.each([
    { coverWord: 1 },
    { coverWord: 7 },
    { coverWord: 3.5 },
  ])("refuses an invalid coverWord in an external plan %j", patch => {
    const base = plan([at(1, 3)]);
    const tampered = { ...base, inserts: [{ ...base.inserts[0]!, ...patch }] };
    expect(() => resolveSemanticInserts({ plan: tampered, words, durationSec: TOTAL_SEC, fps: FPS }))
      .toThrow(/coverage word is invalid/);
  });

  it("guards overlap by coverage, not by anchor", () => {
    expect(() => plan([at(0, 1, 3), at(2, 3)])).toThrow(/overlap/);
    expect(plan([at(0, 1, 2), at(2, 3)]).inserts).toHaveLength(2);
  });
});

describe("the actor shot count is computable on input", () => {
  it("an empty plan gives one shot, not zero", () => {
    expect(countActorShots(plan([]))).toBe(1);
  });

  it.each([
    { instructions: [at(0, 1, 6)], shots: 0 },
    { instructions: [at(0, 1, 5)], shots: 1 },
    { instructions: [at(1, 2, 5)], shots: 1 },
    { instructions: [at(0, 1, 2), at(2, 3, 4)], shots: 0 },
    { instructions: [at(0, 1, 2), at(2, 3, 3)], shots: 1 },
    { instructions: [at(0, 1), at(2, 3)], shots: 2 },
    { instructions: [at(1, 2), at(3, 4)], shots: 3 },
  ])("counts shots by word indexes %#", ({ instructions, shots }) => {
    expect(countActorShots(plan(instructions))).toBe(shots);
    const actors = resolve(instructions).shots.filter(shot => shot.kind === "actor").length;
    expect(actors).toBe(shots);
  });
});

describe("an insert window ends at the first uncovered word", () => {
  it("gives a pause to the owner of the preceding word", () => {
    const [shot] = resolve([at(1, 2)]).shots.filter(shot => shot.kind === "media");
    expect(shot).toMatchObject({ fromFrame: Math.round(0.7 * FPS), durationInFrames: Math.round(1.3 * FPS) - Math.round(0.7 * FPS) });
  });

  it("takes frame zero at the head and the full tail at the end", () => {
    const shots = resolve([at(0, 1, 6)]).shots;
    expect(shots).toEqual([{ kind: "media", fromFrame: 0, durationInFrames: TOTAL_SEC * FPS, insertId: "i0", mediaId: "m0" }]);
  });

  it("makes adjacent inserts adjacent without propping up the alignment", () => {
    const shots = resolve([at(0, 1, 2), at(2, 3, 4)]).shots;
    expect(shots[0]).toMatchObject({ kind: "media", fromFrame: 0 });
    expect(shots[0]!.fromFrame + shots[0]!.durationInFrames).toBe(shots[1]!.fromFrame);
  });

  it("does not raise the rounding flag with the chosen frames", () => {
    expect(resolve([at(0, 1, 6)]).warnings).toEqual([]);
  });
});
