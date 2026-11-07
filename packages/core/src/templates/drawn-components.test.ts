import { describe, expect, it } from "vitest";
import { lexicalTokens } from "../semantic-inserts.js";
import { ugcTemplate } from "../skills.js";
import { pointerChipsParts } from "./pointer-chips.js";
import { TEMPLATE_KINDS, templateAccentRefusal, templateFootprint, templateKindAt, templateMoments } from "./index.js";
import { videoGridLayout } from "./video-grid.js";

const kind = (name: string) => TEMPLATE_KINDS.find(entry => entry.kind === name)!;
const asset = (digit: number) => ({ asset_id: `ast_${String(digit).repeat(32)}` });

describe("our own look for the drawn kinds (owner 2026-11-04)", () => {
  /** The brand teal, as a run's accent, clears every colour it meets in the light looks the components draw on by default. */
  it("takes the brand teal as an accent in clean_light and paper", () => {
    expect([templateAccentRefusal("clean_light", "#1385A3"), templateAccentRefusal("paper", "#1385A3")]).toEqual([undefined, undefined]);
  });
});

describe("every registered kind is requestable", () => {
  /** Mutant: register a kind but leave it out of the REST union, and the server refuses what the MCP catalog offers. */
  it("parses each kind's sample through the make_ugc template schema", () => {
    const refused = TEMPLATE_KINDS.filter(entry =>
      !ugcTemplate.safeParse({ id: "t1", kind: entry.kind, anchor: { quote: "word" }, data: entry.sample }).success).map(entry => entry.kind);
    expect(refused).toEqual([]);
  });

  /** Mutant: give a union member a looser data schema, and every sample still parses while the kind's limits are gone. */
  it("checks each kind's data with that kind's own schema", () => {
    const members = new Map(ugcTemplate.options.map(option => [option.shape.kind.value, option.shape.data]));
    expect(TEMPLATE_KINDS.filter(entry => members.get(entry.kind as never) !== entry.data).map(entry => entry.kind)).toEqual([]);
  });
});

describe("version 2 of five kinds (#1119)", () => {
  /** A version-1 timeline's data: each sample without the fields version 2 adds. */
  const V1: Record<string, Record<string, unknown>> = {
    chat_window: { app: "Assistant", prompt: "make 3 ads for my app", replies: [{ title: "Scripts written", at: "writes" }], zoom: true },
    notification: { app: "Front Desk", title: "New booking", body: "Tomorrow at 10:30", icon: "chat" },
    terminal: { title: "Terminal", command: "claude mcp add clipwright", status: "clipwright connected", at: "connected" },
    lower_third: { name: "Maya Chen", role: "Founder", side: "left" },
    compare: { before: asset(1), after: asset(2), reveal_at: "in reality" },
  };

  /** Mutant: drop or misnumber a kind's version 1 in the history, and a frozen version-1 timeline has no footprint to draw. */
  it("keeps each kind's version 1 in the history, drawing its data where version 2 draws it", () => {
    for (const [name, data] of Object.entries(V1)) {
      const current = kind(name), placement = current.placements[0]!;
      expect({ name, version: current.kindVersion, v1: templateKindAt(name, 1).kindVersion, parses: current.data.safeParse(data).success,
        same: JSON.stringify(templateFootprint({ kind: name, kindVersion: 1, placement, data }, "9:16")) ===
          JSON.stringify(templateFootprint({ kind: name, kindVersion: 2, placement, data }, "9:16")) })
        .toEqual({ name, version: 2, v1: 1, parses: true, same: true });
    }
  });

  /** Mutant: accept a diff with no line marked, and a diff beat plays with nothing to change. */
  it("refuses a diff that marks no line, and a table row whose cells miss a column", () => {
    const diff = (lines: unknown[]) => kind("terminal").data.safeParse({ command: "x", status: "y", diff: { lines } }).error?.issues.map(issue => issue.path.join("."));
    expect([diff([{ text: "a" }, { text: "b" }]), diff([{ text: "a" }, { text: "b", change: "add" }])]).toEqual([["diff.lines"], undefined]);
    const table = { columns: ["a", "b", "c"], rows: [{ cells: ["1", "2"] }] };
    expect(kind("chat_window").data.safeParse({ prompt: "x", answer: { text: "y" }, table }).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`))
      .toEqual(["table.rows.0.cells: a row takes one cell per column (3)"]);
    expect(kind("chat_window").data.safeParse({ prompt: "x", table: { columns: ["a", "b"], rows: [{ cells: ["1", "2"] }] } }).error?.issues.map(issue => issue.path.join(".")))
      .toEqual(["table"]);
  });
});

describe("the drawn kinds' data (#1104)", () => {
  /** Mutant: drop the refine, and a 3x1 grid with four cells draws three and bills nothing for the fourth's pin silently. */
  it("lays out the grid the cells give, and refuses a layout the cells contradict", () => {
    const three = { cell_1: asset(1), cell_2: asset(2), cell_3: asset(3) }, four = { ...three, cell_4: asset(4) };
    expect([videoGridLayout(three), videoGridLayout(four), videoGridLayout({ ...four, layout: "2x2" })]).toEqual(["3x1", "2x2", "2x2"]);
    expect(kind("video_grid").data.safeParse({ ...four, layout: "3x1" }).error?.issues.map(issue => issue.path.join("."))).toEqual(["cell_4"]);
    expect(kind("video_grid").data.safeParse({ ...three, layout: "2x2" }).error?.issues.map(issue => issue.path.join("."))).toEqual(["cell_4"]);
    expect(kind("video_grid").data.safeParse(three).success).toBe(true);
  });

  it("refuses a phone state it does not draw and a seventh state", () => {
    const phone = kind("phone_screen").data;
    expect(phone.safeParse({ states: [{ state: "explode" }] }).success).toBe(false);
    expect(phone.safeParse({ states: Array.from({ length: 7 }, () => ({ state: "play" })) }).success).toBe(false);
  });

  /** Mutant: freeze one beat per kind instead of one per element, and the renderer refuses the render. */
  it("freezes one beat per reply, word, state and chip on its quote, and one for the terminal, spread evenly without quotes", () => {
    const script = "type the prompt and it writes then renders it all, then connected", tokens = lexicalTokens(script);
    const words = tokens.map((word, index) => ({ word, startSec: (100 + 10 * index) / 25 })), span = { startFrame: 100, endFrame: 250 };
    const range = { startWord: 0, coverWord: tokens.length };
    const beats = (name: string, data: Record<string, unknown>) => templateMoments(kind(name), data, tokens, range, words, 25, span, "t").moments;
    expect(beats("chat_window", { prompt: "make ads", replies: [{ title: "a", at: "writes" }, { title: "b", at: "renders" }] })).toEqual([50, 70]);
    expect(beats("chat_window", { prompt: "make ads", replies: [{ title: "a" }, { title: "b" }, { title: "c" }] })).toHaveLength(3);
    expect(beats("word_title", { words: [{ text: "type", at: "type" }, { text: "prompt", at: "prompt" }] })).toEqual([0, 20]);
    expect(beats("terminal", { command: "x", status: "y", at: "connected" })).toEqual([110]);
    expect(beats("terminal", { command: "x", status: "y" })).toHaveLength(1);
    expect(beats("phone_screen", { states: [{ state: "lock" }, { state: "play" }] })).toHaveLength(2);
    expect(beats("pointer_chips", { items: [{ target: { x: 10, y: 60 }, text: "a" }] })).toHaveLength(1);
  });

  /** Mutant: centre the column in wide frames, and its default place meets the face there. */
  it("keeps the chips' column below the face in every format, on the side asked", () => {
    for (const aspect of ["9:16", "1:1", "16:9"]) for (const side of ["left", "right"] as const) {
      const { chips } = pointerChipsParts({ items: [{ target: { x: 50, y: 50 }, text: "a" }], side }, aspect);
      expect({ aspect, side, below: chips.top >= 0.48, onSide: side === "left" ? chips.left < 0.5 : chips.left + chips.width > 0.5, inside: chips.top + chips.height <= 1 })
        .toEqual({ aspect, side, below: true, onSide: true, inside: true });
    }
  });
});
