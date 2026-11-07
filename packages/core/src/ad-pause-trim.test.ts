import { describe, expect, it } from "vitest";
import { AD_PAUSE_TRIM, AD_PAUSE_TRIM_WARNING, isAdStyleUgcInput, withAdPauseTrim } from "./ad-pause-trim.js";
import { dispositionWarnings } from "./contract-dispositions.js";
import { makeUgcInput, storedUgcInput } from "./skills.js";

const SCRIPT = "We tried every tool. Nothing worked, until this one. Now it takes a minute.";
const tag = { id: "t1", kind: "tag", anchor: { quote: "Nothing worked" }, data: { text: "Nothing worked" } };

describe("ad-style runs trim narration pauses by default (#1136)", () => {
  /** Mutant: pin it on every run, and a talking-head script changes length; drop the trigger, and the 05.11 ads stay slow. */
  it("pins 0.15 s and 0.08 s on a run with templates, scenes or shots, and leaves a plain script alone", () => {
    const plain = makeUgcInput.parse({ script: SCRIPT });
    expect(withAdPauseTrim(plain)).toBe(plain);
    for (const extra of [{ templates: [tag] }, { scenes: [{}] }, { shots: [{}] }]) {
      expect(isAdStyleUgcInput(extra)).toBe(true);
      expect(withAdPauseTrim({ script: SCRIPT, ...extra })).toMatchObject({ pause_trim: AD_PAUSE_TRIM, pause_trim_source: "ad_default" });
    }
    expect(AD_PAUSE_TRIM).toEqual({ sentence_end_s: 0.15, comma_s: 0.08 });
  });

  /** Mutant: overwrite the call's own pause_trim, and an explicit request is silently changed (rule 3). */
  it("keeps the call's own pause_trim and an interview's own pauses", () => {
    const own = { script: SCRIPT, templates: [tag], pause_trim: { sentence_end_s: 0.4 } };
    expect(withAdPauseTrim(own)).toBe(own);
    expect(isAdStyleUgcInput({ templates: [tag], interview: {} })).toBe(false);
    // The owner's opt-out (05.11): false keeps every pause, and the schema takes it as REST and MCP send it.
    const off = makeUgcInput.parse({ script: SCRIPT, templates: [tag], pause_trim: false });
    expect(off.pause_trim).toBe(false);
    expect(withAdPauseTrim(off)).toBe(off);
    expect(dispositionWarnings(off)).not.toContain(AD_PAUSE_TRIM_WARNING);
    expect(makeUgcInput.safeParse({ script: SCRIPT, pause_trim: true }).success).toBe(false);
  });

  /** Mutant: drop the marker from the stored schema, and the run's record stops naming the default the quote named. */
  it("names the default in warnings on the quote and on the stored run alike", () => {
    const pinned = withAdPauseTrim(makeUgcInput.parse({ script: SCRIPT, templates: [tag] }));
    expect(dispositionWarnings(pinned)).toContain(AD_PAUSE_TRIM_WARNING);
    expect(dispositionWarnings(storedUgcInput.parse(pinned))).toContain(AD_PAUSE_TRIM_WARNING);
    expect(dispositionWarnings(makeUgcInput.parse({ script: SCRIPT, templates: [tag], pause_trim: AD_PAUSE_TRIM }))).not.toContain(AD_PAUSE_TRIM_WARNING);
    expect(makeUgcInput.parse({ script: SCRIPT, pause_trim_source: "ad_default" })).not.toHaveProperty("pause_trim_source");
  });
});
