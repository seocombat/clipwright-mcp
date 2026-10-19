import { describe, expect, it } from "vitest";

import { storedRevisionInputFixture } from "./__fixtures__/edit-views.fixture.js";
import {
  AI_DISCLOSURE_TEXT, FACELESS_AI_DISCLOSURE_TEXT, FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT, RUN_STATES, TERMINAL_STATES, aiDisclosureText, isTerminal, run,
  runId, runRead,
} from "./runs.js";

// Mutant: the disclosure of a revision read from scene images, which a revision input never holds.
describe("the disclosure of a revision", () => {
  it("names own images when admission froze them down the chain, and only then", () => {
    expect(aiDisclosureText("make_faceless", storedRevisionInputFixture(true))).toBe(FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("make_faceless", storedRevisionInputFixture(false))).toBe(FACELESS_AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("make_faceless", { ...storedRevisionInputFixture(false), scene_images: [{}] })).toBe(FACELESS_AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("make_faceless", { scene_images: [{}] })).toBe(FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("make_faceless", { scene_images: [] })).toBe(FACELESS_AI_DISCLOSURE_TEXT);
  });
  it("a long-form revision states its root's presenter disclosure, whatever its input holds", () => {
    expect(aiDisclosureText("revise_long_form", storedRevisionInputFixture(true))).toBe(AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("revise_long_form", { scene_images: [{}] })).toBe(AI_DISCLOSURE_TEXT);
  });
  it("a run carries its revision's family, its quoted credits and its billing, which may be redacted", () => {
    const base = { run_id: "run_rev1", skill: "make_faceless", state: "queued", credits_reserved: 18, credits_charged: null, error: null,
      final_output: null, created_at: "2026-10-14T10:00:00.000Z", finished_at: null };
    const billing = storedRevisionInputFixture().resolved_revision.billing;
    const revision = { source_run_id: "run_src1", root_run_id: "run_root1", quoted_credits: 18, billing };
    expect(run.parse({ ...base, revision }).revision).toEqual(revision);
    expect(run.parse({ ...base, revision: { ...revision, billing: null } }).revision?.billing).toBeNull();
    expect(run.safeParse({ ...base, revision: { ...revision, quoted_credits: -1 } }).success).toBe(false);
    expect(run.parse(base).revision).toBeUndefined();
  });
});

// Exactly two terminal states, pinned as a set: a third one turns this red. The second case
// ties both values to the stage list, so the constant cannot hold strings no run reaches.
describe("terminal run states", () => {
  it("the SET is pinned whole: succeeded and failed, nothing else", () => {
    expect([...TERMINAL_STATES]).toEqual(["succeeded", "failed"]);
  });

  it("both terminal states belong to the stage list", () => {
    for (const state of TERMINAL_STATES) {
      expect(RUN_STATES as readonly string[]).toContain(state);
    }
  });
});

/** The `run_id` shape is ONE schema for the response and the MCP `get_run` input: two regex */
/** copies would drift silently, letting garbage reach the network. */
describe("run id shape", () => {
  it("legitimate ids pass", () => {
    for (const id of ["run_1", "run_abc123", `run_${"A".repeat(30)}`]) {
      expect(runId.safeParse(id).success, id).toBe(true);
    }
  });

  it("garbage is refused", () => {
    for (const id of ["", "run_", "run_a-b", "../../etc/passwd", "acc_1", "run 1"]) {
      expect(runId.safeParse(id).success, id).toBe(false);
    }
  });

  it("the response schema takes the shape FROM HERE, not from its own copy", () => {
    expect(run.shape.run_id).toBe(runId);
  });
});

describe("stages of both skills", () => {
  const base = {
    run_id: "run_abc",
    credits_reserved: 30,
    credits_charged: null,
    error: null,
    final_output: null,
    created_at: "2026-09-14T10:00:00.000Z",
    finished_at: null,
  };

  it("`generating` comes right after `queued` and is not terminal", () => {
    expect(RUN_STATES.slice(0, 2)).toEqual(["queued", "generating"]);
    expect(isTerminal("generating")).toBe(false);
  });

  it("run.parse accepts a make_ugc run without `created_actor`", () => {
    const parsed = run.parse({ ...base, skill: "make_ugc", state: "tts" });
    expect(parsed.created_actor).toBeUndefined();
    expect(parsed.state).toBe("tts");
  });

  it("the tolerant projection accepts `generating` and an actor result", () => {
    expect(runRead.parse({ ...base, skill: "create_actor", state: "generating" }).state).toBe("generating");
    const created_actor = {
      actor_id: `actor_u_${"b".repeat(26)}`,
      name: "Mira",
      gender: "female",
      approximate_age: 30,
      version: 1,
      quality: "medium",
      aspect_ratios: ["9:16", "1:1"],
    };
    expect(runRead.parse({ ...base, skill: "create_actor", state: "succeeded", created_actor }).created_actor).toEqual(
      created_actor,
    );
  });
});
