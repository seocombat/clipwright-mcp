import { describe, expect, it } from "vitest";
import { lexicalTokens } from "../semantic-inserts.js";
import { makeUgcInput, storedUgcInput } from "../skills.js";
import { TEMPLATE_KINDS, templateCatalogText, templateMoments } from "./index.js";

// #1120: the chart, race and handwriting kinds, from one schema each through REST, MCP and the stored re-parse.
const kind = (name: string) => TEMPLATE_KINDS.find(entry => entry.kind === name)!;
const issues = (name: string, data: unknown) => kind(name).data.safeParse(data).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];

describe("the chart and handwriting kinds' data (#1120)", () => {
  /** Mutant: drop the refine, and a round with a value missing draws a bar of nothing for a name. */
  it("refuses a race round whose values do not match its names", () => {
    const race = kind("race").sample as { names: string[]; rounds: { values: number[] }[] };
    expect(issues("race", { ...race, rounds: [race.rounds[0], { values: [1, 2, 3, 4] }] })).toEqual(["rounds.1.values: a round takes one value per name (3)"]);
    expect(issues("race", race)).toEqual([]);
  });

  /** Mutant: mark words past the title's last, and the marker lands on nothing. */
  it("refuses a marker that runs past the title's words", () => {
    expect(issues("hand_title", { text: "Posted daily for 30 days", mark: { word: 4, words: 2, style: "circle" } }))
      .toEqual(["mark.word: the marked words run past the title's 5 words"]);
    expect([issues("hand_title", { text: "Posted daily for 30 days", mark: { word: 4, style: "highlight" } }),
      issues("hand_title", { text: "Posted daily for 30 days", mark: { word: 0, words: 5, style: "underline" } }).length > 0]).toEqual([[], true]);
  });

  it("refuses a chart with one point, a negative value or a third type", () => {
    const point = { label: "a", value: 1 };
    expect([issues("chart", { type: "bar", points: [point] }).length > 0, issues("chart", { type: "bar", points: [point, { label: "b", value: -1 }] }).length > 0,
      issues("chart", { type: "pie", points: [point, point] }).length > 0]).toEqual([true, true, true]);
  });

  it("names the three kinds in the catalog with their fields", () => {
    const text = templateCatalogText();
    expect(text).toContain("chart (full): ");
    expect(text).toContain("type bar|line");
    expect(text).toContain("race (full): ");
    expect(text).toContain("rounds 2–5 of {label? ≤ 10, values 3–6 of number, at? inner quote}");
    expect(text).toContain("hand_title (full|over): ");
    expect(text).toContain("mark? {word number, words? number, style highlight|underline|circle, at? inner quote}");
  });

  /** Mutant: freeze one beat for the chart, and the renderer refuses the render; start a race on a spoken word, and the full frame is bare. */
  it("freezes one beat per point and per round, the race's first on the template's first frame", () => {
    const script = "so the views went from before to week one to month four", tokens = lexicalTokens(script);
    const words = tokens.map((word, index) => ({ word, startSec: (100 + 10 * index) / 25 })), span = { startFrame: 100, endFrame: 250 };
    const range = { startWord: 0, coverWord: tokens.length };
    const beats = (name: string, data: Record<string, unknown>) => templateMoments(kind(name), data, tokens, range, words, 25, span, "t").moments;
    expect(beats("chart", kind("chart").sample as Record<string, unknown>)).toEqual([50, 70, 100]);
    expect(beats("race", { ...(kind("race").sample as Record<string, unknown>), rounds: [{ values: [1, 2, 3] }, { values: [3, 2, 1], at: "week" }] }))
      .toEqual([0, 70]);
    expect(beats("hand_title", { text: "views went up", mark: { word: 2, style: "underline", at: "month" } })).toEqual([100]);
  });

  /** Mutant: register a kind in the catalog but not in the stored input's schema, and the worker refuses a run the API took. */
  it("re-parses a stored request with each new kind as the worker does", () => {
    // Every sample's inner quote, in order, inside the template's own words.
    const script = "so the views went from before to week one to month four and from may to june the results speak";
    for (const name of ["chart", "race", "hand_title"]) {
      const request = { script, templates: [{ id: "t1", kind: name, anchor: { quote: "so the" }, cover_words: 20, data: kind(name).sample }] };
      const parsed = makeUgcInput.safeParse(request);
      expect({ name, api: parsed.success, worker: parsed.success && storedUgcInput.safeParse(parsed.data).success }).toEqual({ name, api: true, worker: true });
    }
  });
});
