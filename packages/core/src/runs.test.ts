import { describe, expect, it } from "vitest";

import { RUN_STATES, TERMINAL_STATES, isTerminal, run, runId, runRead } from "./runs.js";

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
