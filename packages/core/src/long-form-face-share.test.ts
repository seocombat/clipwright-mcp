import { describe, expect, it } from "vitest";
import { countActorShots, planSemanticInserts, resolveSemanticInserts } from "./semantic-inserts.js";
import type { WordTiming } from "./tts-backend.js";

/** Measured "word + pause" durations from a live TTS run (two segments): 86 values, */
/** CV 0.58. This spread is what pulls the time share away from the word share. */
const MEASURED = [0.309, 0.459, 0.219, 0.133, 0.352, 0.181, 0.331, 0.352, 0.784, 0.53, 0.39, 0.109,
  0.584, 0.536, 0.551, 0.46, 0.097, 0.383, 0.2, 0.217, 0.396, 0.227, 0.856, 0.437, 0.329, 0.538,
  0.18, 0.233, 0.307, 0.088, 0.245, 0.32, 0.155, 0.299, 0.64, 0.186, 0.157, 0.377, 0.101, 0.499,
  0.365, 0.168, 0.1, 0.484, 0.496, 0.133, 0.157, 0.382, 0.148, 0.113, 0.336, 0.671, 0.61, 0.51,
  0.127, 0.39, 0.383, 0.104, 0.309, 0.16, 0.176, 0.827, 0.104, 0.107, 0.413, 0.224, 0.296, 0.34,
  0.447, 0.093, 0.08, 0.453, 0.803, 0.464, 0.493, 0.527, 0.84, 0.08, 0.124, 0.296, 0.152, 0.188,
  0.5, 0.36, 0.349, 0.651];

const FPS = 25;
const WORDS = 564;
const BLOCK = 94;
const FACE_WORDS = 18;

/** Layout D: six blocks of "18 face words, then an insert covering 76 words". */
const LAYOUT = Array.from({ length: 6 }, (_, b) => ({
  insertId: `i${b}`, mediaId: `m${b}`,
  anchor: { startWord: b * BLOCK + FACE_WORDS, endWord: b * BLOCK + FACE_WORDS + 1 },
  coverWords: BLOCK - FACE_WORDS,
}));
const SCRIPT = Array.from({ length: WORDS }, (_, i) => `w${i}`).join(" ");

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alignment(seed: number, scale: number) {
  const random = mulberry32(seed);
  const words: WordTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < WORDS; i++) {
    const step = MEASURED[Math.floor(random() * MEASURED.length)]! * scale;
    words.push({ word: `w${i}`, startSec: cursor, endSec: cursor + step * 0.72 });
    cursor += step;
  }
  return { words, durationSec: cursor };
}

function faceShare(seed: number, scale: number) {
  const { words, durationSec } = alignment(seed, scale);
  const plan = planSemanticInserts(SCRIPT, LAYOUT);
  const resolved = resolveSemanticInserts({ plan, words, durationSec, fps: FPS });
  // The planned count must match the resolved count on EVERY draw, or the free shot-count
  // gate would rest on coincidence.
  expect(resolved.shots.filter(shot => shot.kind === "actor")).toHaveLength(countActorShots(plan));
  const face = resolved.shots.reduce((sum, shot) => sum + (shot.kind === "actor" ? shot.durationInFrames : 0), 0);
  return (face / resolved.totalFrames) * 100;
}

describe("the face share stays under the set ceiling", () => {
  it("the WORD share is set by the input and equals 19.15%", () => {
    const covered = LAYOUT.reduce((sum, insert) => sum + insert.coverWords, 0);
    expect(covered).toBe(456);
    expect(((WORDS - covered) / WORDS) * 100).toBeCloseTo(19.149, 3);
    expect(countActorShots(planSemanticInserts(SCRIPT, LAYOUT))).toBe(6);
  });

  it("does not depend on speech pace: three paces give one share", () => {
    for (const seed of [1, 7, 42, 99, 300]) {
      const shares = [1 / 1.96, 1 / 2.3, 1 / 2.6].map(scale => faceShare(seed, scale));
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(0.15);
    }
  });

  it.each([1 / 1.96, 1 / 2.3, 1 / 2.6])("holds the ceiling across three hundred seeds at pace %#", scale => {
    const shares = Array.from({ length: 300 }, (_, i) => faceShare(i + 1, scale)).sort((a, b) => a - b);
    expect(Math.max(...shares)).toBeLessThanOrEqual(23);
    expect(Math.min(...shares)).toBeGreaterThan(14);
    expect(shares[150]).toBeGreaterThan(18);
    expect(shares[150]).toBeLessThan(20.5);
    // Measured over 50,000 draws: above 22% in 0.18%, above 23% in 0.004%. The 23%
    // ceiling holds; 22% is occasionally touched, and the test says so.
    expect(shares.filter(share => share > 22).length).toBeLessThanOrEqual(3);
  });

  it("a layout with UNEQUAL coverage holds the same way", () => {
    // Equal blocks could hide a dependence on shape: here coverage is 80/74/78/72/76/76
    // with the same 456 words and the same word share.
    const uneven = [80, 74, 78, 72, 76, 76];
    const layout = uneven.map((coverWords, b) => ({
      insertId: `u${b}`, mediaId: `n${b}`,
      anchor: { startWord: b * BLOCK + FACE_WORDS, endWord: b * BLOCK + FACE_WORDS + 1 },
      coverWords,
    }));
    expect(uneven.reduce((a, b) => a + b, 0)).toBe(456);
    const plan = planSemanticInserts(SCRIPT, layout);
    expect(countActorShots(plan)).toBe(6);
    const shares = [1 / 1.96, 1 / 2.3, 1 / 2.6].map(scale => {
      const { words, durationSec } = alignment(11, scale);
      const resolved = resolveSemanticInserts({ plan, words, durationSec, fps: FPS });
      const face = resolved.shots.reduce((sum, shot) => sum + (shot.kind === "actor" ? shot.durationInFrames : 0), 0);
      return (face / resolved.totalFrames) * 100;
    });
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(0.15);
    expect(Math.max(...shares)).toBeLessThanOrEqual(23);
  });
});
