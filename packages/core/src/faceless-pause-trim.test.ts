import { describe, expect, it } from "vitest";
import { AD_PAUSE_TRIM, AD_PAUSE_TRIM_WARNING, facelessPauseTrim, facelessPauseTrimWarnings } from "./ad-pause-trim.js";
import { facelessStoredInput, makeFacelessInput, offeredFacelessInput } from "./faceless-public.js";
import { derivedRunWarnings } from "./run-static-warnings.js";

// make_faceless takes make_ugc's pause_trim (#1228): one schema, the same limits and the same ad default.
const SCRIPT = "We tried every tool. Nothing worked, until this one. Now it takes a minute, and the rest of the day is yours.";
const tag = { id: "t1", kind: "tag", anchor: { quote: "Nothing worked" }, data: { text: "Nothing worked" } };
const script = { input_mode: "script" as const, script: SCRIPT, duration_seconds: 30 };
const NO_FACTS = {};
const issue = (input: unknown) => makeFacelessInput.safeParse(input).error?.issues.map(entry => `${entry.path.join(".")}: ${entry.message}`).join("; ");

describe("pause_trim on make_faceless (#1228)", () => {
  /** Mutant: a looser schema of its own, and a faceless call takes what make_ugc refuses (or the other way round). */
  it("takes make_ugc's shape and limits on a script and refuses it on a brief", () => {
    expect(makeFacelessInput.parse({ ...script, pause_trim: { sentence_end_s: 0.15, comma_s: 0.08 } })).toMatchObject({ pause_trim: AD_PAUSE_TRIM });
    expect(makeFacelessInput.parse({ ...script, pause_trim: false })).toMatchObject({ pause_trim: false });
    for (const bad of [true, {}, { sentence_end_s: 0.01 }, { comma_s: 2.5 }, { pause_s: 0.2 }]) {
      expect(issue({ ...script, pause_trim: bad })).toMatch(/^pause_trim/);
    }
    expect(issue({ input_mode: "brief", brief: "A story", duration_seconds: 30, pause_trim: false })).toBe("pause_trim: pause_trim needs input_mode script");
    // The flat MCP form names the field, and the stored run keeps it.
    expect(offeredFacelessInput.safeParse({ ...script, pause_trim: { comma_s: 0.1 } }).success).toBe(true);
    expect(facelessStoredInput.parse({ ...script, pause_trim: { comma_s: 0.1 } })).toMatchObject({ pause_trim: { comma_s: 0.1 } });
  });

  /** Mutant: the default on every script, and a plain narration changes length; on none, and a video with graphics stays slow. */
  it("cuts to the ad default when templates, scenes or shots are asked and pause_trim is not named", () => {
    expect(facelessPauseTrim(makeFacelessInput.parse(script))).toBeUndefined();
    for (const extra of [{ templates: [tag] }, { scenes: [{}] }, { shots: [{}] }]) expect(facelessPauseTrim({ ...script, ...extra })).toEqual(AD_PAUSE_TRIM);
    expect(facelessPauseTrim({ ...script, templates: [tag], pause_trim: false })).toBe(false);
    expect(facelessPauseTrim({ ...script, templates: [tag], pause_trim: { sentence_end_s: 0.4 } })).toEqual({ sentence_end_s: 0.4 });
  });

  /** Mutant: the warning on the quote only, and the run's record stops saying why its narration is shorter (rule 3). */
  it("names the default in warnings on the quote and on the stored run, and only the default", () => {
    const withTemplate = makeFacelessInput.parse({ ...script, templates: [tag] });
    expect(facelessPauseTrimWarnings(withTemplate)).toEqual([AD_PAUSE_TRIM_WARNING]);
    // Each of the three asks on its own, as the run reads its stored input.
    const scene = { id: "s1", anchor: { quote: "Now it takes a minute" }, prompt: "A clock on a desk" };
    const shot = { id: "a1", anchor: { quote: "Nothing worked" }, action: "A hand drops a tool" };
    for (const extra of [{ templates: [tag] }, { scenes: [scene] }, { shots: [shot] }]) {
      const stored = { ...script, captions: true, ...extra };
      expect(facelessPauseTrimWarnings(stored)).toEqual([AD_PAUSE_TRIM_WARNING]);
      expect(derivedRunWarnings(stored, NO_FACTS, "make_faceless", () => undefined), Object.keys(extra)[0]).toContain(AD_PAUSE_TRIM_WARNING);
    }
    for (const own of [false, AD_PAUSE_TRIM]) {
      expect(derivedRunWarnings({ ...withTemplate, pause_trim: own }, NO_FACTS, "make_faceless", () => undefined)).not.toContain(AD_PAUSE_TRIM_WARNING);
    }
    expect(derivedRunWarnings(makeFacelessInput.parse(script), NO_FACTS, "make_faceless", () => undefined)).not.toContain(AD_PAUSE_TRIM_WARNING);
  });

  /** Mutant: leave format explainer out of the default, and its scenes, which land word by word, wait out every long pause unnamed. */
  it("cuts an explainer to the ad default and names it, unless the run names its own pauses", () => {
    const explainer = makeFacelessInput.parse({ ...script, format: "explainer" });
    expect(facelessPauseTrim(explainer)).toEqual(AD_PAUSE_TRIM);
    expect(facelessPauseTrimWarnings(explainer)).toEqual([AD_PAUSE_TRIM_WARNING]);
    expect(derivedRunWarnings({ ...explainer, captions: true }, NO_FACTS, "make_faceless", () => undefined)).toContain(AD_PAUSE_TRIM_WARNING);
    for (const own of [false, { comma_s: 0.2 }] as const) {
      expect(facelessPauseTrim({ ...explainer, pause_trim: own })).toEqual(own);
      expect(facelessPauseTrimWarnings({ ...explainer, pause_trim: own })).toEqual([]);
    }
    expect(facelessPauseTrim(makeFacelessInput.parse({ ...script, format: "standard" }))).toBeUndefined();
  });
});
