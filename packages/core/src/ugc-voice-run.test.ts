import { describe, expect, it } from "vitest";

import { ACCEPTED_UGC_FIELDS } from "./contract-dispositions.js";
import { calculateDurationPartsCharge, PARTS_DURATION_TARIFF, PRODUCTION_LINE, PRODUCTION_RENDER_LINE } from "./parts-pricing.js";
import { makeUgcInput, storedUgcInput } from "./skills.js";

// #1773 C5: make_ugc.voice_run_id plays a delivered make_voice under the one take of the short path, refused before money otherwise.

const refusal = (body: object) => {
  const parsed = makeUgcInput.safeParse(body);
  return parsed.success ? null : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
};

describe("make_ugc.voice_run_id", () => {
  it("is an offered field and parses with a script on the short path", () => {
    expect(ACCEPTED_UGC_FIELDS).toContain("voice_run_id");
    expect(refusal({ script: "Hello there.", voice_run_id: "run_abc123" })).toBeNull();
    expect(refusal({ script: "Hello there.", voice_run_id: "run_abc123", templates: undefined, actor_id: "actor_anna" })).toBeNull();
  });

  it.each([
    ["inserts", { inserts: [{ id: "i1", media_url: "https://example.com/a.png", media_type: "image", anchor: { startWord: 0, endWord: 1 } }] }],
    ["end_hold_s", { end_hold_s: 1 }],
    ["shots", { shots: [{ id: "s1", kind: "talking", anchor: { quote: "Hello there." } }] }],
  ])("refuses the narrated path (%s)", (_name, extra) => {
    expect(refusal({ script: "Hello there.", voice_run_id: "run_abc123", ...extra })).toContainEqual(expect.stringMatching(/^voice_run_id: voice_run_id plays under one take/));
  });

  it("refuses segments", () => {
    expect(refusal({ segments: [{ kind: "actor", script: "Hello there." }], voice_run_id: "run_abc123" }))
      .toContainEqual(expect.stringMatching(/^voice_run_id: /));
  });

  it.each([["voice", "george"], ["voice_id", "a".repeat(20)], ["tts_model", "eleven_v4"], ["voice_pace", 1.1],
    ["pause_trim", { sentence_end_s: 0.15, comma_s: 0.08 }], ["pause_trim", false]])("refuses %s beside it", (field, value) => {
    expect(refusal({ script: "Hello there.", voice_run_id: "run_abc123", [field]: value }))
      .toContainEqual(`${field}: ${field} is not combined with voice_run_id: that voice is already made`);
  });

  it("refuses a value that is not a run id", () => {
    expect(refusal({ script: "Hello there.", voice_run_id: "voice_1" })).toEqual(["voice_run_id: voice_run_id is not a run id: pass the run_id make_voice returned"]);
  });

  it("keeps the pinned voice and tempo in a stored run", () => {
    const voice_run = { run_id: "run_v1", key: "runs/run_v1/faceless/media/x.wav", sha256: "b".repeat(64), bytes: 10, duration_sec: 2,
      words: [{ text: "Hello", start: 0, end: 1 }] };
    expect(storedUgcInput.parse({ script: "Hello", voice_run_id: "run_v1", voice_run, voice_tempo: 1.12 })).toMatchObject({ voice_run, voice_tempo: 1.12 });
  });
});

describe("the production line of a run that speaks a delivered voice", () => {
  it("says render only and keeps the price", () => {
    const own = calculateDurationPartsCharge(35, "heygen", PARTS_DURATION_TARIFF, true, 0, true);
    const synthesized = calculateDurationPartsCharge(35, "heygen", PARTS_DURATION_TARIFF, true);
    expect(own.lines.map(line => line.label)).toContain(PRODUCTION_RENDER_LINE);
    expect(synthesized.lines.map(line => line.label)).toContain(PRODUCTION_LINE);
    expect(own.credits).toBe(synthesized.credits);
    expect(own.lines.at(-1)).toMatchObject({ quantity: 35, unit_credits: 1, credits: 35 });
  });
});
